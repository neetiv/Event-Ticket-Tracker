import { WatchedMatch, PriceSnapshot } from "../types";

const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events";

export async function fetchTicketmasterPrice(
  match: WatchedMatch,
  apiKey: string
): Promise<PriceSnapshot> {
  const eventId = match.ticketmasterEventId;
  if (!eventId) {
    return emptySnapshot(match);
  }

  const url = `${BASE_URL}/${eventId}.json?apikey=${apiKey}`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error(`Ticketmaster API error: ${res.status} for ${match.slug}`);
    return emptySnapshot(match);
  }

  const data: any = await res.json();
  const ranges = data.priceRanges;

  let minPrice: number | null = null;
  let maxPrice: number | null = null;
  let currency = "USD";

  if (ranges && ranges.length > 0) {
    minPrice = Math.min(...ranges.map((r: any) => r.min));
    maxPrice = Math.max(...ranges.map((r: any) => r.max));
    currency = ranges[0].currency || "USD";
  }

  const eventUrl = data.url || `https://www.ticketmaster.com/event/${eventId}`;

  return {
    timestamp: Date.now(),
    source: "ticketmaster",
    matchSlug: match.slug,
    minPrice,
    maxPrice,
    currency,
    url: eventUrl,
  };
}

export interface SearchResult {
  name: string;
  eventId: string;
  date: string;
  venue: string;
  url: string;
  minPrice: number | null;
  maxPrice: number | null;
}

export async function searchTicketmasterEvents(
  query: string,
  apiKey: string
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    keyword: query,
    classificationName: "Soccer",
    size: "50",
    sort: "date,asc",
  });

  const res = await fetch(`${BASE_URL}.json?${params}`);
  if (!res.ok) {
    console.error(`Ticketmaster search error: ${res.status}`);
    return [];
  }

  const data: any = await res.json();
  const events = data?._embedded?.events || [];

  return events.map((e: any) => {
    const venue = e._embedded?.venues?.[0];
    const ranges = e.priceRanges;
    return {
      name: e.name,
      eventId: e.id,
      date: e.dates?.start?.dateTime || e.dates?.start?.localDate || "",
      venue: venue
        ? `${venue.name}, ${venue.city?.name || ""}`
        : "Unknown venue",
      url: e.url || "",
      minPrice: ranges?.length > 0 ? Math.min(...ranges.map((r: any) => r.min)) : null,
      maxPrice: ranges?.length > 0 ? Math.max(...ranges.map((r: any) => r.max)) : null,
    };
  });
}

function emptySnapshot(match: WatchedMatch): PriceSnapshot {
  return {
    timestamp: Date.now(),
    source: "ticketmaster",
    matchSlug: match.slug,
    minPrice: null,
    maxPrice: null,
    currency: "USD",
    url: "",
  };
}
