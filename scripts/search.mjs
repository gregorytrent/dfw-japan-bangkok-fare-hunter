import fs from "node:fs/promises";

const token = process.env.DUFFEL_ACCESS_TOKEN;
if (!token) throw new Error("Missing DUFFEL_ACCESS_TOKEN GitHub Actions secret.");

const config = JSON.parse(await fs.readFile("config.json", "utf8"));
const state = JSON.parse(await fs.readFile("data/state.json", "utf8").catch(() => '{"cursor":0}'));
const previous = JSON.parse(await fs.readFile("data/results.json", "utf8").catch(() => '{"results":[]}'));
const history = JSON.parse(await fs.readFile("data/history.json", "utf8").catch(() => "{}"));
const today = new Date(); today.setUTCHours(12, 0, 0, 0);
const iso = d => d.toISOString().slice(0, 10);
const plusDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const startOffset = Math.max(1, Math.min(90, Number(process.env.START_OFFSET || 1)));
const span = Math.max(1, Math.min(90 - startOffset + 1, Number(process.env.SPAN_DAYS || config.windowDays)));

const jobs = [];
for (let day = startOffset; day < startOffset + span; day++) {
  for (const gateway of config.japanGateways) for (const nights of config.stopoverNights) {
    for (const partySize of config.partySizes) jobs.push({ day, gateway, nights, partySize });
  }
}
// Scheduled scans rotate through the full matrix; manual scans prioritize their chosen window.
const limit = Math.min(config.maxQueriesPerRun, jobs.length);
const cursor = Number(state.cursor || 0) % Math.max(1, jobs.length);
const selected = Array.from({length: limit}, (_, i) => jobs[(cursor + i) % jobs.length]);

function minutes(isoDuration = "PT0M") {
  const m = isoDuration.match(/P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?/);
  return m ? (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}
function localHour(value) { return Number(value?.slice(11, 13) || 0); }
function normalize(offer, job) {
  const slices = offer.slices || [];
  const segments = slices.flatMap(s => s.segments || []);
  const connections = slices.reduce((n, s) => n + Math.max(0, (s.segments?.length || 1) - 1), 0);
  const firstDeparture = slices[0]?.segments?.[0]?.departing_at;
  const lateDfw = localHour(firstDeparture) >= 16;
  const longHaulAtNight = segments.some(s => minutes(s.duration) >= 480 && (localHour(s.departing_at) >= 18 || localHour(s.departing_at) <= 2));
  const totalMinutes = slices.reduce((n, s) => n + minutes(s.duration), 0);
  const selfTransfer = slices.some(s => s.conditions?.change_before_departure?.allowed === false) || offer.payment_requirements?.requires_instant_payment;
  const total = Number(offer.total_amount);
  const id = [job.gateway, job.nights, job.partySize, iso(plusDays(today, job.day)), offer.owner?.iata_code, segments.map(s => s.marketing_carrier?.iata_code + s.marketing_carrier_flight_number).join("-")].join("|");
  return {
    id, offerId: offer.id, total, perPerson: total / job.partySize, currency: offer.total_currency,
    partySize: job.partySize, gateway: job.gateway, stopoverNights: job.nights,
    departDate: iso(plusDays(today, job.day)), onwardDate: iso(plusDays(today, job.day + job.nights)),
    owner: offer.owner?.name || "Airline", ownerCode: offer.owner?.iata_code || "",
    connections, lateDfw, longHaulAtNight, totalMinutes, selfTransfer,
    expiresAt: offer.expires_at, slices: slices.map(s => ({
      origin: s.origin?.iata_code, destination: s.destination?.iata_code, duration: s.duration,
      segments: (s.segments || []).map(x => ({
        from: x.origin?.iata_code, to: x.destination?.iata_code,
        depart: x.departing_at, arrive: x.arriving_at, duration: x.duration,
        airline: x.marketing_carrier?.name, flight: `${x.marketing_carrier?.iata_code || ""}${x.marketing_carrier_flight_number || ""}`
      }))
    }))
  };
}
async function search(job) {
  const departure = plusDays(today, job.day);
  const onward = plusDays(departure, job.nights);
  const body = { data: {
    slices: [
      { origin: config.origin, destination: job.gateway, departure_date: iso(departure) },
      { origin: job.gateway, destination: config.destination, departure_date: iso(onward) }
    ],
    passengers: Array.from({length: job.partySize}, () => ({ type: "adult" })),
    cabin_class: config.cabinClass,
    max_connections: config.maxConnectionsPerSlice,
    return_offers: true
  }};
  const response = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Duffel-Version": "v2", "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Duffel ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const json = await response.json();
  return (json.data?.offers || []).map(o => normalize(o, job));
}

const fresh = [];
for (const job of selected) {
  try { fresh.push(...await search(job)); }
  catch (error) { console.error(JSON.stringify(job), error.message); }
  await new Promise(resolve => setTimeout(resolve, 350));
}

const now = Date.now();
const merged = new Map();
for (const item of [...(previous.results || []), ...fresh]) {
  if (item.expiresAt && Date.parse(item.expiresAt) <= now) continue;
  const old = merged.get(item.id);
  if (!old || item.total < old.total) merged.set(item.id, item);
}
const all = [...merged.values()];
const minPrice = Math.min(...all.map(x => x.perPerson), 1);
const maxPrice = Math.max(...all.map(x => x.perPerson), minPrice + 1);
for (const x of all) {
  const price = (x.perPerson - minPrice) / (maxPrice - minPrice);
  const connections = Math.min(x.connections / 4, 1);
  const night = (x.lateDfw ? 0 : .6) + (x.longHaulAtNight ? 0 : .4);
  const duration = Math.min(x.totalMinutes / 2400, 1);
  const risk = x.selfTransfer ? 1 : 0;
  x.score = 100 * (1 - (config.weights.price * price + config.weights.connections * connections + config.weights.nightAlignment * night + config.weights.duration * duration + config.weights.risk * risk));
  const key = `${x.departDate}|${x.gateway}|${x.stopoverNights}|${x.partySize}`;
  const priorLow = history[key]?.low;
  x.isNewLow = priorLow == null || x.total < priorLow;
  history[key] = { low: Math.min(priorLow ?? Infinity, x.total), currency: x.currency, lastSeen: new Date().toISOString() };
}
all.sort((a, b) => b.score - a.score || a.total - b.total);
const results = all.slice(0, config.resultLimit);
await fs.writeFile("data/results.json", JSON.stringify({
  generatedAt: new Date().toISOString(), mode: "live", message: null,
  coverage: { queriesThisRun: selected.length, matrixSize: jobs.length, cursor, nextCursor: (cursor + selected.length) % Math.max(1, jobs.length) },
  results
}, null, 2) + "\n");
await fs.writeFile("data/history.json", JSON.stringify(history, null, 2) + "\n");
await fs.writeFile("data/state.json", JSON.stringify({cursor: (cursor + selected.length) % Math.max(1, jobs.length)}, null, 2) + "\n");
console.log(`Saved ${results.length} ranked offers from ${selected.length} searches.`);

