import { Env, WatchedEvent } from "./types";
import { searchEvents, fetchEventPrice } from "./sources/ticketmaster";
import { savePrice, getWatches, addWatch, removeWatch, getSettings, saveSettings } from "./storage";
import { checkAndAlert, notifyNewEvents } from "./alerts";
import { renderDashboard, handleApiPrices } from "./dashboard";
import BG_BASE64 from "./bg";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function checkNewEvents(env: Env): Promise<void> {
  const settings = await getSettings(env);
  if (!settings.cityWatches?.length) return;

  for (const cw of settings.cityWatches) {
    if (!cw.enabled) continue;

    for (const category of cw.categories) {
      const results = await searchEvents("", env.TICKETMASTER_API_KEY, cw.city, category);
      const seenKey = `seen:${cw.city.toLowerCase()}:${category.toLowerCase()}`;
      const seenVal = await env.PRICE_DATA.get(seenKey);
      const seenIds: string[] = seenVal ? JSON.parse(seenVal) : [];
      const seenSet = new Set(seenIds);

      const newEvents = results.filter((r) => !seenSet.has(r.eventId));
      if (newEvents.length > 0) {
        await notifyNewEvents(env, settings, cw.city, category, newEvents);
        const updatedSeen = [...seenIds, ...newEvents.map((e) => e.eventId)].slice(-500);
        await env.PRICE_DATA.put(seenKey, JSON.stringify(updatedSeen), { expirationTtl: 90 * 24 * 60 * 60 });
      }
    }
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const watches = await getWatches(env);

    for (const event of watches) {
      if (new Date(event.date) < new Date()) continue;
      if (!event.ticketmasterEventId) continue;

      const snapshot = await fetchEventPrice(event, env.TICKETMASTER_API_KEY);
      if (snapshot.minPrice !== null) {
        await savePrice(env, snapshot);
        await checkAndAlert(env, event, snapshot);
      }
    }

    await checkNewEvents(env);
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "") return renderDashboard(env);

    if (path === "/bg.png") {
      const bytes = Uint8Array.from(atob(BG_BASE64), c => c.charCodeAt(0));
      return new Response(bytes, {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
      });
    }

    if (path === "/api/search" && request.method === "GET") {
      const q = url.searchParams.get("q") || "";
      const city = url.searchParams.get("city") || undefined;
      const category = url.searchParams.get("category") || undefined;
      if (!env.TICKETMASTER_API_KEY) return json({ error: "API key not set" }, 500);
      return json({ results: await searchEvents(q, env.TICKETMASTER_API_KEY, city, category) });
    }

    if (path === "/api/watches" && request.method === "GET") return json({ watches: await getWatches(env) });
    if (path === "/api/watches" && request.method === "POST") {
      const body = (await request.json()) as WatchedEvent;
      if (!body.slug || !body.name) return json({ error: "slug and name required" }, 400);
      await addWatch(env, body);
      return json({ ok: true });
    }
    const del = path.match(/^\/api\/watches\/([a-z0-9-]+)$/);
    if (del && request.method === "DELETE") { await removeWatch(env, del[1]); return json({ ok: true }); }

    if (path === "/api/settings" && request.method === "GET") return json(await getSettings(env));
    if (path === "/api/settings" && request.method === "POST") { await saveSettings(env, await request.json()); return json({ ok: true }); }

    const pm = path.match(/^\/api\/prices\/([a-z0-9-]+)$/);
    if (pm) return handleApiPrices(env, pm[1]);

    if (path === "/api/ingest" && request.method === "POST") {
      const body = await request.json() as any;
      const watches = await getWatches(env);
      let saved = 0;
      for (const snap of body.prices || []) {
        await savePrice(env, snap);
        const w = watches.find((e) => e.slug === snap.matchSlug);
        if (w) await checkAndAlert(env, w, snap);
        saved++;
      }
      return json({ ok: true, saved });
    }

    if (path === "/api/status") return json({ ok: true, timestamp: new Date().toISOString() });

    if (path === "/api/check" && request.method === "POST") {
      const slug = url.searchParams.get("slug");
      if (slug) {
        const watches = await getWatches(env);
        const event = watches.find((w) => w.slug === slug);
        if (event && event.ticketmasterEventId) {
          const snapshot = await fetchEventPrice(event, env.TICKETMASTER_API_KEY);
          if (snapshot.minPrice !== null) {
            await savePrice(env, snapshot);
            await checkAndAlert(env, event, snapshot);
          }
          return json({ ok: true, slug, price: snapshot.minPrice });
        }
        return json({ error: "Event not found" }, 404);
      }
      await this.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);
      return json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  },
};
