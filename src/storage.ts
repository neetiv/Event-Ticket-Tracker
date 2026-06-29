import { Env, PriceSnapshot, WatchedEvent, UserSettings } from "./types";

const TTL_SECONDS = 90 * 24 * 60 * 60;

export async function getWatches(env: Env): Promise<WatchedEvent[]> {
  const val = await env.PRICE_DATA.get("watches");
  return val ? JSON.parse(val) : [];
}

export async function saveWatches(env: Env, watches: WatchedEvent[]): Promise<void> {
  await env.PRICE_DATA.put("watches", JSON.stringify(watches));
}

export async function addWatch(env: Env, event: WatchedEvent): Promise<void> {
  const watches = await getWatches(env);
  const idx = watches.findIndex((w) => w.slug === event.slug);
  if (idx >= 0) watches[idx] = event;
  else watches.push(event);
  await saveWatches(env, watches);
}

export async function removeWatch(env: Env, slug: string): Promise<void> {
  const watches = await getWatches(env);
  await saveWatches(env, watches.filter((w) => w.slug !== slug));
}

export async function getSettings(env: Env): Promise<UserSettings> {
  const val = await env.PRICE_DATA.get("settings");
  if (val) {
    const parsed = JSON.parse(val);
    if (!parsed.alertMethod) parsed.alertMethod = "ntfy";
    return parsed;
  }
  return { alertMethod: "ntfy", ntfyTopic: env.NTFY_TOPIC || "ticket-tracker" };
}

export async function saveSettings(env: Env, settings: UserSettings): Promise<void> {
  await env.PRICE_DATA.put("settings", JSON.stringify(settings));
}

export async function savePrice(env: Env, snapshot: PriceSnapshot): Promise<void> {
  if (snapshot.minPrice === null) return;
  const kv = env.PRICE_DATA;
  const { matchSlug, source, timestamp } = snapshot;
  const json = JSON.stringify(snapshot);

  await Promise.all([
    kv.put(`prices:${matchSlug}:${source}:${timestamp}`, json, { expirationTtl: TTL_SECONDS }),
    kv.put(`latest:${matchSlug}:${source}`, json, { expirationTtl: TTL_SECONDS }),
    kv.put(`meta:lastCheck:${matchSlug}:${source}`, new Date(timestamp).toISOString(), { expirationTtl: TTL_SECONDS }),
    appendTimestamp(kv, matchSlug, source, timestamp),
  ]);
}

async function appendTimestamp(kv: KVNamespace, slug: string, source: string, ts: number): Promise<void> {
  const key = `index:timestamps:${slug}:${source}`;
  const existing = await kv.get(key);
  const arr: number[] = existing ? JSON.parse(existing) : [];
  arr.push(ts);
  const trimmed = arr.length > 2000 ? arr.slice(-2000) : arr;
  await kv.put(key, JSON.stringify(trimmed), { expirationTtl: TTL_SECONDS });
}

export async function getLatestPrice(env: Env, slug: string, source: string): Promise<PriceSnapshot | null> {
  const val = await env.PRICE_DATA.get(`latest:${slug}:${source}`);
  return val ? JSON.parse(val) : null;
}

export async function getLastCheck(env: Env, slug: string, source: string): Promise<string | null> {
  return env.PRICE_DATA.get(`meta:lastCheck:${slug}:${source}`);
}

export async function getLastAlertTime(env: Env, slug: string, key: string): Promise<number | null> {
  const val = await env.PRICE_DATA.get(`meta:lastAlert:${slug}:${key}`);
  return val ? new Date(val).getTime() : null;
}

export async function setLastAlertTime(env: Env, slug: string, key: string): Promise<void> {
  await env.PRICE_DATA.put(`meta:lastAlert:${slug}:${key}`, new Date().toISOString(), { expirationTtl: TTL_SECONDS });
}

export async function getPriceHistory(env: Env, slug: string, source: string): Promise<PriceSnapshot[]> {
  const kv = env.PRICE_DATA;
  const indexVal = await kv.get(`index:timestamps:${slug}:${source}`);
  if (!indexVal) return [];
  const timestamps: number[] = JSON.parse(indexVal);
  const snapshots: PriceSnapshot[] = [];
  const keys = timestamps.map((ts) => `prices:${slug}:${source}:${ts}`);
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50);
    const results = await Promise.all(batch.map((k) => kv.get(k)));
    for (const val of results) {
      if (val) snapshots.push(JSON.parse(val));
    }
  }
  return snapshots;
}
