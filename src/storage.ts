import { Env, PriceSnapshot, WatchedMatch, UserSettings } from "./types";

// KV key patterns:
//   watches                                → JSON array of WatchedMatch
//   settings                               → JSON UserSettings
//   prices:{matchSlug}:{source}:{timestamp} → PriceSnapshot
//   latest:{matchSlug}:{source}            → PriceSnapshot (most recent)
//   meta:lastCheck:{matchSlug}:{source}    → ISO timestamp string
//   meta:lastAlert:{matchSlug}:{alertKey}  → ISO timestamp string (for cooldown)
//   index:timestamps:{matchSlug}:{source}  → JSON array of timestamp numbers

const TTL_SECONDS = 90 * 24 * 60 * 60;

// --- Watch management ---

export async function getWatches(env: Env): Promise<WatchedMatch[]> {
  const val = await env.PRICE_DATA.get("watches");
  return val ? JSON.parse(val) : [];
}

export async function saveWatches(
  env: Env,
  watches: WatchedMatch[]
): Promise<void> {
  await env.PRICE_DATA.put("watches", JSON.stringify(watches));
}

export async function addWatch(
  env: Env,
  match: WatchedMatch
): Promise<void> {
  const watches = await getWatches(env);
  const existing = watches.findIndex((w) => w.slug === match.slug);
  if (existing >= 0) {
    watches[existing] = match;
  } else {
    watches.push(match);
  }
  await saveWatches(env, watches);
}

export async function removeWatch(
  env: Env,
  slug: string
): Promise<void> {
  const watches = await getWatches(env);
  await saveWatches(env, watches.filter((w) => w.slug !== slug));
}

// --- User settings ---

export async function getSettings(env: Env): Promise<UserSettings> {
  const val = await env.PRICE_DATA.get("settings");
  if (val) {
    const parsed = JSON.parse(val);
    if (!parsed.alertMethod) parsed.alertMethod = "ntfy";
    return parsed;
  }
  return { alertMethod: "ntfy", ntfyTopic: env.NTFY_TOPIC || "fifa-ticket-tracker" };
}

export async function saveSettings(
  env: Env,
  settings: UserSettings
): Promise<void> {
  await env.PRICE_DATA.put("settings", JSON.stringify(settings));
}

// --- Price data ---

export async function savePrice(
  env: Env,
  snapshot: PriceSnapshot
): Promise<void> {
  if (snapshot.minPrice === null) return;

  const kv = env.PRICE_DATA;
  const { matchSlug, source, timestamp } = snapshot;
  const json = JSON.stringify(snapshot);

  await Promise.all([
    kv.put(`prices:${matchSlug}:${source}:${timestamp}`, json, {
      expirationTtl: TTL_SECONDS,
    }),
    kv.put(`latest:${matchSlug}:${source}`, json, {
      expirationTtl: TTL_SECONDS,
    }),
    kv.put(
      `meta:lastCheck:${matchSlug}:${source}`,
      new Date(timestamp).toISOString(),
      { expirationTtl: TTL_SECONDS }
    ),
    appendTimestamp(kv, matchSlug, source, timestamp),
  ]);
}

async function appendTimestamp(
  kv: KVNamespace,
  matchSlug: string,
  source: string,
  timestamp: number
): Promise<void> {
  const key = `index:timestamps:${matchSlug}:${source}`;
  const existing = await kv.get(key);
  const timestamps: number[] = existing ? JSON.parse(existing) : [];
  timestamps.push(timestamp);

  const trimmed = timestamps.length > 2000 ? timestamps.slice(-2000) : timestamps;

  await kv.put(key, JSON.stringify(trimmed), {
    expirationTtl: TTL_SECONDS,
  });
}

export async function getLatestPrice(
  env: Env,
  matchSlug: string,
  source: string
): Promise<PriceSnapshot | null> {
  const val = await env.PRICE_DATA.get(`latest:${matchSlug}:${source}`);
  return val ? JSON.parse(val) : null;
}

export async function getLastCheck(
  env: Env,
  matchSlug: string,
  source: string
): Promise<string | null> {
  return env.PRICE_DATA.get(`meta:lastCheck:${matchSlug}:${source}`);
}

export async function getLastAlertTime(
  env: Env,
  matchSlug: string,
  alertKey: string
): Promise<number | null> {
  const val = await env.PRICE_DATA.get(`meta:lastAlert:${matchSlug}:${alertKey}`);
  return val ? new Date(val).getTime() : null;
}

export async function setLastAlertTime(
  env: Env,
  matchSlug: string,
  alertKey: string
): Promise<void> {
  await env.PRICE_DATA.put(
    `meta:lastAlert:${matchSlug}:${alertKey}`,
    new Date().toISOString(),
    { expirationTtl: TTL_SECONDS }
  );
}

export async function getPriceHistory(
  env: Env,
  matchSlug: string,
  source: string
): Promise<PriceSnapshot[]> {
  const kv = env.PRICE_DATA;
  const indexKey = `index:timestamps:${matchSlug}:${source}`;
  const indexVal = await kv.get(indexKey);

  if (!indexVal) return [];

  const timestamps: number[] = JSON.parse(indexVal);
  const snapshots: PriceSnapshot[] = [];

  const keys = timestamps.map((ts) => `prices:${matchSlug}:${source}:${ts}`);
  const batchSize = 50;

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((k) => kv.get(k)));
    for (const val of results) {
      if (val) snapshots.push(JSON.parse(val));
    }
  }

  return snapshots;
}
