import { WatchedMatch, PriceSnapshot } from "../types";

const BASE_URL = "https://seatgeek.com/api/event_listings";

export async function fetchSeatGeekPrice(
  match: WatchedMatch
): Promise<PriceSnapshot> {
  const slug = match.seatgeekEventSlug;
  if (!slug) {
    return emptySnapshot(match);
  }

  // SeatGeek's internal listing API — returns JSON with pricing data.
  // This is the same endpoint their frontend JS calls.
  const url = `${BASE_URL}?slug=${slug}&client_id=MTY2MnwxNjc0MDUzMjE2`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "FIFA-Ticket-Tracker/1.0",
    },
  });

  if (!res.ok) {
    console.error(`SeatGeek API error: ${res.status} for ${match.slug}`);
    return emptySnapshot(match);
  }

  const data: any = await res.json();

  let minPrice: number | null = null;
  let maxPrice: number | null = null;

  // SeatGeek's response shape: event.stats.lowest_price, event.stats.highest_price
  const stats = data?.event?.stats;
  if (stats) {
    minPrice = stats.lowest_price ?? stats.lowest_sg_base_price ?? null;
    maxPrice = stats.highest_price ?? null;
  }

  // Fallback: check listings array
  if (minPrice === null && data?.listings?.length > 0) {
    const prices = data.listings
      .map((l: any) => l.price?.amount || l.seatgeek_price)
      .filter((p: any) => typeof p === "number");
    if (prices.length > 0) {
      minPrice = Math.min(...prices);
      maxPrice = Math.max(...prices);
    }
  }

  const eventUrl = `https://seatgeek.com/${slug}`;

  return {
    timestamp: Date.now(),
    source: "seatgeek",
    matchSlug: match.slug,
    minPrice,
    maxPrice,
    currency: "USD",
    url: eventUrl,
  };
}

function emptySnapshot(match: WatchedMatch): PriceSnapshot {
  return {
    timestamp: Date.now(),
    source: "seatgeek",
    matchSlug: match.slug,
    minPrice: null,
    maxPrice: null,
    currency: "USD",
    url: "",
  };
}
