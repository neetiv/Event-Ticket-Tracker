import { WatchedEvent, PriceSnapshot } from "../types";

const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events";

export interface SearchResult {
  name: string;
  eventId: string;
  date: string;
  venue: string;
  city: string;
  url: string;
  minPrice: number | null;
  maxPrice: number | null;
  imageUrl: string | null;
  genre: string | null;
}

export async function searchEvents(
  query: string,
  apiKey: string,
  city?: string,
  category?: string
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    apikey: apiKey,
    keyword: query,
    size: "40",
    sort: "date,asc",
  });
  if (city) params.set("city", city);
  if (category && category !== "all") {
    params.set("classificationName", category);
  }

  const res = await fetch(`${BASE_URL}.json?${params}`);
  if (!res.ok) return [];

  const data: any = await res.json();
  const events = data?._embedded?.events || [];

  return events.map((e: any) => {
    const venue = e._embedded?.venues?.[0];
    const ranges = e.priceRanges;
    const img = e.images?.find((i: any) => i.width > 300 && i.ratio === "16_9");
    const classification = e.classifications?.[0];
    return {
      name: e.name,
      eventId: e.id,
      date: e.dates?.start?.dateTime || e.dates?.start?.localDate || "",
      venue: venue ? venue.name : "Unknown",
      city: venue?.city?.name || "",
      url: e.url || "",
      minPrice: ranges?.length > 0 ? Math.min(...ranges.map((r: any) => r.min)) : null,
      maxPrice: ranges?.length > 0 ? Math.max(...ranges.map((r: any) => r.max)) : null,
      imageUrl: img?.url || e.images?.[0]?.url || null,
      genre: classification?.genre?.name || classification?.segment?.name || null,
    };
  });
}

export async function fetchEventPrice(
  event: WatchedEvent,
  apiKey: string
): Promise<PriceSnapshot> {
  if (!event.ticketmasterEventId) return emptySnapshot(event);

  const url = `${BASE_URL}/${event.ticketmasterEventId}.json?apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return emptySnapshot(event);

  const data: any = await res.json();
  const ranges = data.priceRanges;

  return {
    timestamp: Date.now(),
    source: "ticketmaster",
    matchSlug: event.slug,
    minPrice: ranges?.length > 0 ? Math.min(...ranges.map((r: any) => r.min)) : null,
    maxPrice: ranges?.length > 0 ? Math.max(...ranges.map((r: any) => r.max)) : null,
    currency: ranges?.[0]?.currency || "USD",
    url: data.url || event.url,
  };
}

function emptySnapshot(event: WatchedEvent): PriceSnapshot {
  return {
    timestamp: Date.now(),
    source: "ticketmaster",
    matchSlug: event.slug,
    minPrice: null,
    maxPrice: null,
    currency: "USD",
    url: "",
  };
}
