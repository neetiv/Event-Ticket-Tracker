# Event Ticket Tracker

**Live dashboard:** https://event-ticket-tracker.neeti-tickets.workers.dev

Cloudflare Worker that tracks ticket prices across Ticketmaster and resale markets, stores price history, and sends push notifications when prices drop below your target.

## Features

- Search and track any event on Ticketmaster
- Monitors both official (Ticketmaster) and resale get-in prices
- Price history charts per event
- Alerts via ntfy.sh push notifications or SMS
- City-level watch for newly announced events
- Cron-triggered price checks every 15 minutes

## Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- Free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Free [Ticketmaster API key](https://developer.ticketmaster.com/)
- [ntfy app](https://ntfy.sh/) on your phone(s)

### 2. Install dependencies
```bash
npm install
```

### 3. Create a KV namespace
```bash
npx wrangler kv namespace create PRICE_DATA
```
Copy the `id` from the output into `wrangler.toml`.

### 4. Set secrets
```bash
npx wrangler secret put TICKETMASTER_API_KEY
npx wrangler secret put NTFY_TOKEN        # optional, for protected ntfy topics
npx wrangler secret put GITHUB_PAT        # optional, to trigger the resale scraper
```

### 5. Subscribe to alerts
Open the ntfy app and subscribe to your topic (default: `ticket-tracker`).

### 6. Deploy
```bash
npm run deploy
```

## Usage

Open the dashboard and use the **Explore Events** tab to search for events on Ticketmaster. Click **Track** to start monitoring a specific event — set your max price and the number of tickets you need.

You'll get an alert when any tracked source drops to or below your target price.

### Resale prices (get-in scraper)

Resale "get-in" prices are fetched by a Playwright scraper that runs via GitHub Actions. From the dashboard, click **Scrape Prices** on any tracked event to trigger it. Requires a `GITHUB_PAT` secret with `repo` scope.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Dashboard |
| `GET` | `/api/watches` | List tracked events |
| `POST` | `/api/watches` | Add or update a tracked event |
| `DELETE` | `/api/watches/:slug` | Remove a tracked event |
| `GET` | `/api/prices/:slug` | Price history for an event |
| `GET` | `/api/settings` | Get alert settings |
| `POST` | `/api/settings` | Save alert settings |
| `POST` | `/api/ingest` | Ingest price snapshots (used by scraper) |
| `POST` | `/api/scrape` | Trigger the GitHub Actions scraper |
| `POST` | `/api/check` | Manually trigger a price check |
| `GET` | `/api/status` | Health check |

## Local development
```bash
npm run dev
```
Opens `http://localhost:8787`.

## Architecture
- **Runtime:** Cloudflare Workers (TypeScript)
- **Storage:** Cloudflare KV — price history, watched events, settings
- **Price sources:** Ticketmaster Discovery API + Playwright scraper (ticketdata.com)
- **Alerts:** ntfy.sh push notifications and/or SMS carrier gateway
- **Dashboard:** Server-rendered HTML + Chart.js, no separate static hosting needed
