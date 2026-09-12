# DFW → Japan → Bangkok Fare Hunter

A GitHub Pages dashboard plus a scheduled GitHub Actions search engine. It scans departures in the next 90 days, inserts a 3–5-night Japan stopover, compares 2 and 3 adults, and ranks itineraries with price first and fewer connections second.

## What it searches

- Origin: DFW
- Japan gateways: Tokyo (`TYO`), Osaka (`OSA`), Nagoya (`NGO`), Fukuoka (`FUK`)
- Final destination: Bangkok (`BKK`)
- Departure window: tomorrow through 90 days
- Japan stay: 3, 4, or 5 nights
- Party: 2 and 3 adults
- Cabin: economy
- Maximum connections: 1 per slice by default
- Preferred DFW departure: 4:00 PM–11:59 PM
- Primary objective: lowest total party price

## Deployment

1. Create an account at Duffel and obtain a live API token.
2. Create a new **private** GitHub repository and upload this entire folder.
3. In the repository, open **Settings → Secrets and variables → Actions → New repository secret**.
4. Name the secret `DUFFEL_ACCESS_TOKEN` and paste the token.
5. Open **Settings → Pages** and choose **GitHub Actions** as the source.
6. Open **Actions → Fare scan → Run workflow** for the first live search.
7. The workflow updates `data/results.json`; GitHub Pages deploys the dashboard.

The scheduled scan runs four times daily and examines a rotating portion of the 90-day matrix. Use the workflow's manual inputs to target a narrower date range immediately.

## Price-reduction methods built into the app

- Compares 2-person and 3-person fare buckets.
- Compares Tokyo, Osaka, Nagoya, and Fukuoka.
- Tests 3-, 4-, and 5-night Japan stays.
- Rewards late DFW departures and overnight long-haul flying.
- Penalizes extra connections, self-transfers, airport changes, missing baggage data, and very long journeys.
- Shows per-person and whole-party prices.
- Keeps a price history and flags new lows.
- Provides deep links for independent verification before purchase.

## Important operating note

Airfare offers expire quickly. Always click **Verify fare** and confirm baggage, airport, dates, traveler count, change rules, and final price before buying.

## Local preview

```bash
python3 -m http.server 8080 --directory .
```

Then open `http://localhost:8080`.

