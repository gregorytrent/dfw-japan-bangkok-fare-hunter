const money=(n,c="USD")=>new Intl.NumberFormat("en-US",{style:"currency",currency:c,minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const shortMoney=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
const date=s=>new Date(s+"T12:00:00Z").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
const time=s=>new Date(s).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
const names={TYO:"Tokyo",OSA:"Osaka",NGO:"Nagoya",FUK:"Fukuoka"};
let data={results:[]},trip=null;
const ids=["party","nights","gateway","connections","night","lowest","sort","results","coverage","bestFare","scanTime","countdown","paidTotal","rogerShare","bookingFacts","timeline","travelerCards","costTotals","copySummary","checklist"];
const els=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
function verifyLink(x){const q=new URLSearchParams({hl:"en",curr:x.currency||"USD",tfs:`DFW-${x.gateway}-${x.departDate}_${x.gateway}-BKK-${x.onwardDate}`});return `https://www.google.com/travel/flights?${q}`}
function daysUntil(s){return Math.max(0,Math.ceil((new Date(s+"T12:00:00")-new Date())/86400000))}
function renderTrip(){
 if(!trip)return;
 els.countdown.textContent=daysUntil(trip.segments[0].date);
 els.paidTotal.textContent=money(trip.totals.tripPaidSoFar);
 els.rogerShare.textContent=money(trip.totals.rogerShare);
 els.bookingFacts.innerHTML=`<div><small>AA CONFIRMATION</small><strong>${trip.booking.americanRecordLocator}</strong></div><div><small>JAL REFERENCE</small><strong>${trip.booking.jalRecordLocator}</strong></div><div><small>JAPAN STOPOVER</small><strong>${date(trip.japanStopover.arrival)} → ${date(trip.japanStopover.onward)}</strong></div><div><small>BANGKOK ARRIVAL</small><strong>Fri, Nov 6 · 4:25 PM</strong></div>`;
 els.timeline.innerHTML=trip.segments.map((s,i)=>`<article><div class="dot">${i+1}</div><div><small>${date(s.date)}</small><h3>${s.from} → ${s.to}</h3><p><b>${s.carrier} ${s.flight}</b> · ${s.depart} → ${s.arrive}</p><p>${s.cabin}</p><span>${s.notes}</span></div></article>`).join("");
 els.travelerCards.innerHTML=trip.travelers.map(t=>`<article><h3>${t.name}</h3><div class="seat">${t.aaSeat}<small>${t.aaSeatType}</small></div><p>Airfare <b>${money(t.airfare)}</b></p><p>AA seat <b>${money(t.aaSeatCost)}</b></p><strong class="personTotal">${money(t.airfare+t.aaSeatCost)}</strong><small>TOTAL PAID / PERSON</small></article>`).join("");
 els.costTotals.innerHTML=`<div><span>Airfare total</span><b>${money(trip.totals.airfare)}</b></div><div><span>AA seats</span><b>${money(trip.totals.aaSeats)}</b></div><div><span>Gregory + Edwina</span><b>${money(trip.totals.gregoryEdwinaShare)}</b></div><div class="grand"><span>All travelers paid so far</span><b>${money(trip.totals.tripPaidSoFar)}</b></div>`;
 const items=[["AA Main Cabin Extra seats","done"],["JAL seats","open"],["JAL-side booking reference","open"],["Japan lodging","open"],["Bangkok/Thailand lodging","open"],["Baggage plan & fees","open"],["Airport transfers","open"]];
 els.checklist.innerHTML=items.map(([x,s])=>`<div class="check ${s}"><span>${s==="done"?"✓":"○"}</span><b>${x}</b><small>${s==="done"?"Confirmed":"To complete"}</small></div>`).join("");
}
function renderFares(){
 let rows=data.results.filter(x=>(els.party.value==="all"||x.partySize==els.party.value)&&(els.nights.value==="all"||x.stopoverNights==els.nights.value)&&(els.gateway.value==="all"||x.gateway===els.gateway.value)&&(els.connections.value==="all"||x.connections<=+els.connections.value)&&(!els.night.checked||x.lateDfw)&&(!els.lowest.checked||x.isNewLow));
 if(els.sort.value==="price")rows.sort((a,b)=>a.total-b.total);else if(els.sort.value==="stops")rows.sort((a,b)=>a.connections-b.connections||a.total-b.total);else rows.sort((a,b)=>b.score-a.score);
 els.coverage.textContent=`${rows.length} matching offers · ${data.coverage?.queriesThisRun||0} searches in latest run`;
 els.results.innerHTML=rows.length?rows.slice(0,30).map((x,i)=>{const a=x.slices[0]?.segments||[],b=x.slices[1]?.segments||[];return `<article class="card ${i===0?"best":""}"><div class="price"><strong>${shortMoney(x.perPerson)}</strong><small>per person · ${shortMoney(x.total)} for ${x.partySize}</small>${x.isNewLow?'<span class="badge">NEW LOW</span>':""}</div><div class="legs"><div class="leg"><b>${date(x.departDate)} · DFW → ${names[x.gateway]}</b><p>${a[0]?time(a[0].depart):"—"} departure · ${Math.max(0,a.length-1)} connection(s)</p></div><div class="leg"><b>${date(x.onwardDate)} · ${names[x.gateway]} → Bangkok</b><p>${x.stopoverNights} nights Japan · ${Math.max(0,b.length-1)} connection(s)</p></div></div><div class="actions"><span class="score">${Math.round(x.score)} fit</span><a href="${verifyLink(x)}" target="_blank" rel="noopener">VERIFY ↗</a></div></article>`}).join(""):'<div class="empty">No current offers match these filters.</div>';
}
function summary(){if(!trip)return"";return `THAILAND TRIP QUICK REFERENCE\nDFW → Tokyo → Bangkok\nAA confirmation: ${trip.booking.americanRecordLocator}\nNov 1: AA 281 DFW → HND, 10:35 AM; seats Gregory 26L, Edwina 26K, Roger 26J\nNov 6: JL 31 HND → BKK, 11:20 AM → 4:25 PM; JAL seats pending\nRoger total: ${money(trip.totals.rogerShare)}\nAll 3 paid so far: ${money(trip.totals.tripPaidSoFar)}`}
try{const [tr,fr]=await Promise.all([fetch(`data/trip.json?v=${Date.now()}`),fetch(`data/results.json?v=${Date.now()}`)]);trip=await tr.json();data=await fr.json();renderTrip();const all=data.results||[];if(all.length)els.bestFare.textContent=shortMoney(Math.min(...all.map(x=>x.perPerson)));els.scanTime.textContent=data.generatedAt?new Date(data.generatedAt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"Awaiting scan";renderFares()}catch(e){els.coverage.textContent="Could not load dashboard data."}
for(const id of ["party","nights","gateway","connections","night","lowest","sort"])els[id].addEventListener("change",renderFares);
els.copySummary?.addEventListener("click",async()=>{await navigator.clipboard.writeText(summary());const old=els.copySummary.textContent;els.copySummary.textContent="Copied ✓";setTimeout(()=>els.copySummary.textContent=old,1500)});
