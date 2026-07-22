const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events";

const CITY_COORDS: Record<string, string> = {
  "los angeles": "34.0522,-118.2437", la: "34.0522,-118.2437",
  "new york": "40.7128,-74.0060", nyc: "40.7128,-74.0060", ny: "40.7128,-74.0060",
  "san francisco": "37.7749,-122.4194", sf: "37.7749,-122.4194",
  seattle: "47.6062,-122.3321", sea: "47.6062,-122.3321",
  portland: "45.5152,-122.6784", pdx: "45.5152,-122.6784",
  chicago: "41.8781,-87.6298", chi: "41.8781,-87.6298",
  atlanta: "33.7490,-84.3880", atl: "33.7490,-84.3880",
  washington: "38.9072,-77.0369", dc: "38.9072,-77.0369",
  philadelphia: "39.9526,-75.1652", philly: "39.9526,-75.1652", phila: "39.9526,-75.1652", phl: "39.9526,-75.1652",
  boston: "42.3601,-71.0589", bos: "42.3601,-71.0589",
  denver: "39.7392,-104.9903", den: "39.7392,-104.9903",
  houston: "29.7604,-95.3698", hou: "29.7604,-95.3698",
  dallas: "32.7767,-96.7970", dal: "32.7767,-96.7970", dfw: "32.7767,-96.7970",
  miami: "25.7617,-80.1918", mia: "25.7617,-80.1918",
  detroit: "42.3314,-83.0458", det: "42.3314,-83.0458", dtw: "42.3314,-83.0458",
  minneapolis: "44.9778,-93.2650", mpls: "44.9778,-93.2650",
  "st. louis": "38.6270,-90.1994", stl: "38.6270,-90.1994",
  "kansas city": "39.0997,-94.5786", kc: "39.0997,-94.5786",
  "san diego": "32.7157,-117.1611", sd: "32.7157,-117.1611",
  "san jose": "37.3382,-121.8863", sj: "37.3382,-121.8863",
  "las vegas": "36.1699,-115.1398", lv: "36.1699,-115.1398", vegas: "36.1699,-115.1398",
  "new orleans": "29.9511,-90.0715", nola: "29.9511,-90.0715",
  pittsburgh: "40.4406,-79.9959", pit: "40.4406,-79.9959",
  cleveland: "41.4993,-81.6944", cle: "41.4993,-81.6944",
  cincinnati: "39.1031,-84.5120", cin: "39.1031,-84.5120",
  indianapolis: "39.7684,-86.1581", ind: "39.7684,-86.1581",
  "salt lake city": "40.7608,-111.8910", slc: "40.7608,-111.8910",
  jacksonville: "30.3322,-81.6557", jax: "30.3322,-81.6557",
  tampa: "27.9506,-82.4572", tb: "27.9506,-82.4572",
  orlando: "28.5383,-81.3792", orl: "28.5383,-81.3792",
  sacramento: "38.5816,-121.4944", sac: "38.5816,-121.4944",
  austin: "30.2672,-97.7431", aus: "30.2672,-97.7431",
  "san antonio": "29.4241,-98.4936", sa: "29.4241,-98.4936",
  madison: "43.0731,-89.4012", msn: "43.0731,-89.4012",
  raleigh: "35.7796,-78.6382", rdu: "35.7796,-78.6382",
  charlotte: "35.2271,-80.8431", clt: "35.2271,-80.8431",
  milwaukee: "43.0389,-87.9065", mke: "43.0389,-87.9065",
  toronto: "43.6532,-79.3832", tor: "43.6532,-79.3832",
  vancouver: "49.2827,-123.1207", van: "49.2827,-123.1207",
  montreal: "45.5017,-73.5673", mtl: "45.5017,-73.5673",
  "mexico city": "19.4326,-99.1332", cdmx: "19.4326,-99.1332",
  guadalajara: "20.6597,-103.3496", gdl: "20.6597,-103.3496",
  monterrey: "25.6866,-100.3161", mty: "25.6866,-100.3161",
  london: "51.5074,-0.1278", lon: "51.5074,-0.1278", ldn: "51.5074,-0.1278",
};

function resolveGeo(input: string): { latlong?: string; city?: string } {
  const lower = input.toLowerCase().trim();
  const coords = CITY_COORDS[lower];
  if (coords) return { latlong: coords };
  return { city: input };
}

export interface SearchResult {
  name: string;
  eventId: string;
  date: string;
  venue: string;
  city: string;
  state: string;
  url: string;
  minPrice: number | null;
  maxPrice: number | null;
  imageUrl: string | null;
  genre: string | null;
  segment: string | null;
  info: string | null;
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
  if (city) {
    const geo = resolveGeo(city);
    if (geo.latlong) {
      params.set("latlong", geo.latlong);
      params.set("radius", "50");
      params.set("unit", "miles");
    } else {
      params.set("city", geo.city!);
    }
  }
  if (category && category !== "all") {
    params.set("classificationName", category);
  }

  const res = await fetch(`${BASE_URL}.json?${params}`);
  if (!res.ok) return [];

  const data: any = await res.json();
  const allEvents = data?._embedded?.events || [];
  const seen = new Set<string>();
  const events = allEvents.filter((e: any) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

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
      state: venue?.state?.stateCode || "",
      url: e.url || "",
      minPrice: ranges?.length > 0 ? Math.min(...ranges.map((r: any) => r.min)) : null,
      maxPrice: ranges?.length > 0 ? Math.max(...ranges.map((r: any) => r.max)) : null,
      imageUrl: img?.url || e.images?.[0]?.url || null,
      genre: classification?.genre?.name || null,
      segment: classification?.segment?.name || null,
      info: e.info || e.pleaseNote || e.description || null,
    };
  });
}
