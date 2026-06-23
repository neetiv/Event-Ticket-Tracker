// FIFA resale runs ~20-25% cheaper than third-party aggregate prices.
// We use 22.5% (midpoint) to estimate what FIFA's price likely is.
export const FIFA_DISCOUNT_FACTOR = 0.775;

export const FIFA_TICKETS_URL = "https://www.fifa.com/en/tournaments/mens/worldcup/usa-mexico-canada-2026/tickets";

// Don't re-alert for the same match+source within this window (ms)
export const ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

// Cron fires every 5 min. Before this date, skip 2 of 3 runs (effective 15 min).
export const FAST_MODE_START = new Date("2026-06-21T00:00:00Z");
