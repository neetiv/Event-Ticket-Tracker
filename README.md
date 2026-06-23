# FIFA Ticket Tracker

Cloudflare Worker that monitors World Cup ticket prices on Ticketmaster and SeatGeek, stores price history, sends push notifications when prices drop below your target, and serves a live dashboard with trend charts.

## Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- Free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Free [Ticketmaster API key](https://developer.ticketmaster.com/) (takes ~2 min to get)
- [ntfy app](https://ntfy.sh/) on your phone(s)

### 2. Install dependencies
```bash
npm install
```

### 3. Create a KV namespace
```bash
npx wrangler kv namespace create PRICE_DATA
```
Copy the `id` from the output and paste it into `wrangler.toml` replacing `REPLACE_WITH_KV_NAMESPACE_ID`.

### 4. Set secrets
```bash
npx wrangler secret put TICKETMASTER_API_KEY
# Paste your Ticketmaster API key when prompted
```

Optional:
```bash
npx wrangler secret put NTFY_TOKEN        # if using a password-protected ntfy topic
npx wrangler secret put SMS_GATEWAY_EMAIL  # e.g. 2065551234@tmomail.net
```

### 5. Subscribe to alerts on your phone
Open the ntfy app → subscribe to the topic in `wrangler.toml` (default: `fifa-egypt-iran-tickets`). Do this on every device you want alerts on.

### 6. Deploy
```bash
npm run deploy
```

Your tracker is now live at `https://fifa-ticket-tracker.<your-subdomain>.workers.dev`.

## Usage

| URL | What it does |
|-----|-------------|
| `/` | Dashboard with price charts and current prices |
| `/api/prices/egypt-vs-iran` | JSON price history for a match |
| `/api/status` | Health check: configured matches, fast mode status |
| `POST /api/check` | Manually trigger a price check (same as cron) |

## Configuration

### Adding matches
Edit `src/config.ts` and add entries to the `MATCHES` array:
```ts
{
  slug: "usa-vs-australia",
  name: "USA vs Australia",
  date: "2026-06-...",
  venue: "...",
  ticketmasterEventId: "...",    // from Ticketmaster event URL
  seatgeekEventSlug: "...",      // from SeatGeek event URL
  ticketsWanted: 2,
  alerts: { enabled: false, maxPrice: 500 },
}
```
Then redeploy: `npm run deploy`.

### Check frequency
The cron runs every 5 minutes. Before June 21, the worker skips 2 of 3 runs (effective: every 15 min). From June 21 onward, it runs every 5 min. This is controlled by `FAST_MODE_START` in `src/config.ts`.

### Alert threshold
Set `alerts.maxPrice` per match in `src/config.ts`. Alerts have a 2-hour cooldown per source to avoid spam. The cooldown is configured via `ALERT_COOLDOWN_MS` in `src/config.ts`.

### Dry run mode
Set `DRY_RUN = "true"` in `wrangler.toml` to log alerts to the console instead of sending them. Useful for testing.

## Local development
```bash
npm run dev
```
Opens `http://localhost:8787`. Trigger a manual price check:
```bash
curl -X POST http://localhost:8787/api/check
```
Then refresh the dashboard to see results.

## Architecture
- **Runtime:** Cloudflare Workers (free tier: 100K req/day)
- **Storage:** Cloudflare KV (price history, keyed per match + source)
- **Alerts:** ntfy.sh push notifications
- **Dashboard:** Server-rendered HTML + Chart.js (no build step, no static hosting needed)
- **Sources:** Ticketmaster Discovery API (official) + SeatGeek JSON endpoint
- **Not automated:** FIFA.com (manual only — see project notes)
