import { Env, WatchedMatch } from "./types";
import { FAST_MODE_START } from "./config";
import { fetchTicketmasterPrice, searchTicketmasterEvents, searchLocalEvents } from "./sources/ticketmaster";
import { fetchSeatGeekPrice } from "./sources/seatgeek";
import { savePrice, getWatches, addWatch, removeWatch, getSettings, saveSettings } from "./storage";
import { checkAndAlert } from "./alerts";
import { renderDashboard, handleApiPrices } from "./dashboard";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readJson(request: Request): Promise<any> {
  return request.json();
}

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    const now = new Date();

    if (now < FAST_MODE_START && now.getMinutes() % 15 !== 0) {
      console.log("Slow mode — skipping this 5-min tick");
      return;
    }

    const watches = await getWatches(env);
    if (watches.length === 0) {
      console.log("No watches configured — skipping");
      return;
    }

    console.log(`Price check started at ${now.toISOString()} — ${watches.length} match(es)`);

    for (const match of watches) {
      if (new Date(match.date) < now) continue;

      const results = await Promise.allSettled([
        match.ticketmasterEventId
          ? fetchTicketmasterPrice(match, env.TICKETMASTER_API_KEY)
          : Promise.resolve(null),
        match.seatgeekEventSlug
          ? fetchSeatGeekPrice(match)
          : Promise.resolve(null),
      ]);

      for (const result of results) {
        if (result.status === "rejected") {
          console.error(`Fetch failed for ${match.slug}:`, result.reason);
          continue;
        }

        const snapshot = result.value;
        if (!snapshot) continue;

        console.log(
          `${match.slug}/${snapshot.source}: ` +
            (snapshot.minPrice !== null
              ? `$${snapshot.minPrice}–$${snapshot.maxPrice}`
              : "no price data")
        );

        await savePrice(env, snapshot);
        await checkAndAlert(env, match, snapshot);
      }
    }

    console.log("Price check complete");
  },

  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- Dashboard ---
    if (path === "/" || path === "") {
      return renderDashboard(env);
    }

    // --- Search Ticketmaster for matches ---
    // GET /api/search?q=world+cup
    if (path === "/api/search" && request.method === "GET") {
      const query = url.searchParams.get("q") || "FIFA World Cup 2026";
      const city = url.searchParams.get("city") || undefined;
      if (!env.TICKETMASTER_API_KEY) {
        return jsonResponse({ error: "Ticketmaster API key not configured" }, 500);
      }
      const results = await searchTicketmasterEvents(query, env.TICKETMASTER_API_KEY, city);
      return jsonResponse({ results });
    }

    // --- Local events search ---
    // GET /api/events?city=Seattle&radius=50
    if (path === "/api/events" && request.method === "GET") {
      const city = url.searchParams.get("city") || undefined;
      const radius = url.searchParams.get("radius") || "50";
      if (!env.TICKETMASTER_API_KEY) {
        return jsonResponse({ error: "Ticketmaster API key not configured" }, 500);
      }
      const results = await searchLocalEvents(env.TICKETMASTER_API_KEY, city, radius);
      return jsonResponse({ results });
    }

    // --- Watch management ---
    // GET /api/watches
    if (path === "/api/watches" && request.method === "GET") {
      return jsonResponse({ watches: await getWatches(env) });
    }

    // POST /api/watches — add or update a watch
    if (path === "/api/watches" && request.method === "POST") {
      const body = await readJson(request) as WatchedMatch;
      if (!body.slug || !body.name) {
        return jsonResponse({ error: "slug and name are required" }, 400);
      }
      await addWatch(env, body);
      return jsonResponse({ ok: true, watch: body });
    }

    // DELETE /api/watches/:slug
    const deleteMatch = path.match(/^\/api\/watches\/([a-z0-9-]+)$/);
    if (deleteMatch && request.method === "DELETE") {
      await removeWatch(env, deleteMatch[1]);
      return jsonResponse({ ok: true });
    }

    // --- Settings ---
    // GET /api/settings
    if (path === "/api/settings" && request.method === "GET") {
      return jsonResponse(await getSettings(env));
    }

    // POST /api/settings
    if (path === "/api/settings" && request.method === "POST") {
      const settings = await readJson(request);
      await saveSettings(env, settings);
      return jsonResponse({ ok: true });
    }

    // --- Price ingestion from scraper ---
    // POST /api/ingest { prices: PriceSnapshot[] }
    if (path === "/api/ingest" && request.method === "POST") {
      const body = await readJson(request);
      const prices = body.prices || [];
      const watches = await getWatches(env);
      let saved = 0;
      for (const snapshot of prices) {
        await savePrice(env, snapshot);
        const match = watches.find((w) => w.slug === snapshot.matchSlug);
        if (match) {
          await checkAndAlert(env, match, snapshot);
        }
        saved++;
      }
      return jsonResponse({ ok: true, saved });
    }

    // --- Price history ---
    // GET /api/prices/:matchSlug
    const priceMatch = path.match(/^\/api\/prices\/([a-z0-9-]+)$/);
    if (priceMatch) {
      return handleApiPrices(env, priceMatch[1]);
    }

    // --- Health check ---
    if (path === "/api/status") {
      const watches = await getWatches(env);
      return jsonResponse({
        ok: true,
        watches: watches.map((m) => m.slug),
        fastMode: new Date() >= FAST_MODE_START,
        timestamp: new Date().toISOString(),
      });
    }

    // --- Manual trigger ---
    if (path === "/api/check" && request.method === "POST") {
      await this.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);
      return jsonResponse({ ok: true, ran: "manual check" });
    }

    return new Response("Not found", { status: 404 });
  },
};
