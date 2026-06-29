import { Env, WatchedEvent } from "./types";
import { searchEvents, fetchEventPrice } from "./sources/ticketmaster";
import { savePrice, getWatches, addWatch, removeWatch, getSettings, saveSettings } from "./storage";
import { checkAndAlert } from "./alerts";
import { renderDashboard, handleApiPrices } from "./dashboard";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    const watches = await getWatches(env);
    if (watches.length === 0) return;

    for (const event of watches) {
      if (new Date(event.date) < new Date()) continue;
      if (!event.ticketmasterEventId) continue;

      const snapshot = await fetchEventPrice(event, env.TICKETMASTER_API_KEY);
      if (snapshot.minPrice !== null) {
        await savePrice(env, snapshot);
        await checkAndAlert(env, event, snapshot);
      }
    }
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "") return renderDashboard(env);

    // Search events
    if (path === "/api/search" && request.method === "GET") {
      const q = url.searchParams.get("q") || "";
      const city = url.searchParams.get("city") || undefined;
      const category = url.searchParams.get("category") || undefined;
      if (!env.TICKETMASTER_API_KEY) return json({ error: "API key not set" }, 500);
      const results = await searchEvents(q, env.TICKETMASTER_API_KEY, city, category);
      return json({ results });
    }

    // Watches
    if (path === "/api/watches" && request.method === "GET") {
      return json({ watches: await getWatches(env) });
    }
    if (path === "/api/watches" && request.method === "POST") {
      const body = (await request.json()) as WatchedEvent;
      if (!body.slug || !body.name) return json({ error: "slug and name required" }, 400);
      await addWatch(env, body);
      return json({ ok: true });
    }
    const del = path.match(/^\/api\/watches\/([a-z0-9-]+)$/);
    if (del && request.method === "DELETE") {
      await removeWatch(env, del[1]);
      return json({ ok: true });
    }

    // Settings
    if (path === "/api/settings" && request.method === "GET") return json(await getSettings(env));
    if (path === "/api/settings" && request.method === "POST") {
      await saveSettings(env, await request.json());
      return json({ ok: true });
    }

    // Price history
    const pm = path.match(/^\/api\/prices\/([a-z0-9-]+)$/);
    if (pm) return handleApiPrices(env, pm[1]);

    // Ingest from scraper
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

    // Health
    if (path === "/api/status") {
      return json({ ok: true, timestamp: new Date().toISOString() });
    }

    // Manual check
    if (path === "/api/check" && request.method === "POST") {
      await this.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);
      return json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  },
};
