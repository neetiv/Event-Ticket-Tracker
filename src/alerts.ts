import { Env, WatchedEvent, PriceSnapshot, UserSettings } from "./types";
import { getLastAlertTime, setLastAlertTime, getSettings } from "./storage";

export async function checkAndAlert(
  env: Env,
  event: WatchedEvent,
  snapshot: PriceSnapshot,
  bypassCooldown = false
): Promise<void> {
  if (!event.alertsEnabled) return;
  if (snapshot.minPrice === null) return;
  if (snapshot.minPrice > event.maxPrice) return;

  const settings = await getSettings(env);
  if (!settings.ntfyTopic && settings.alertMethod !== "sms") return;

  // 0/unset = notify on every qualifying scrape. Only suppress repeats if
  // the user has explicitly set a cooldown window, and never suppress a
  // manually-triggered scrape — the user is actively checking right now.
  const cooldownMs = (settings.alertCooldownMinutes ?? 0) * 60 * 1000;
  if (cooldownMs > 0 && !bypassCooldown) {
    const lastAlert = await getLastAlertTime(env, event.slug, snapshot.source);
    if (lastAlert && Date.now() - lastAlert < cooldownMs) return;
  }

  const eventDate = new Date(event.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const title = `${event.name} — $${snapshot.minPrice}!`;
  const body = [
    `${snapshot.source} has tickets at $${snapshot.minPrice}`,
    event.ticketsWanted > 1 ? `(looking for ${event.ticketsWanted} together)` : "",
    `Target: ≤$${event.maxPrice}`,
    "",
    `${eventDate}`,
    `${event.venue}, ${event.city}`,
  ].filter(Boolean).join("\n");

  if (env.DRY_RUN === "true") {
    console.log(`[DRY RUN] Alert: ${title}\n${body}`);
    return;
  }

  const method = settings.alertMethod || "ntfy";
  await Promise.all([
    (method === "ntfy" || method === "both") && settings.ntfyTopic
      ? sendNtfy(settings.ntfyTopic, env.NTFY_TOKEN, title, body, snapshot.url, snapshot.minPrice <= event.maxPrice * 0.85 ? "urgent" : "high")
      : Promise.resolve(),
    (method === "sms" || method === "both") && settings.smsGatewayEmail
      ? sendSms(settings.smsGatewayEmail, title, snapshot.url)
      : Promise.resolve(),
  ]);

  await setLastAlertTime(env, event.slug, snapshot.source);
  console.log(`Alert sent: ${event.slug} at $${snapshot.minPrice}`);
}

export async function notifyNewEvents(
  env: Env,
  settings: UserSettings,
  city: string,
  category: string,
  events: { name: string; venue: string; date: string; url: string }[]
): Promise<void> {
  if (events.length === 0) return;

  const title = `${events.length} new ${category} event${events.length > 1 ? "s" : ""} in ${city}!`;
  const body = events
    .slice(0, 5)
    .map((e) => {
      const d = e.date ? new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
      return `${e.name}${d ? " — " + d : ""}`;
    })
    .join("\n") + (events.length > 5 ? `\n...and ${events.length - 5} more` : "");

  const clickUrl = events[0].url || `https://www.ticketmaster.com/search?q=${encodeURIComponent(category + " " + city)}`;

  if (env.DRY_RUN === "true") {
    console.log(`[DRY RUN] New events: ${title}\n${body}`);
    return;
  }

  const method = settings.alertMethod || "ntfy";
  await Promise.all([
    (method === "ntfy" || method === "both") && settings.ntfyTopic
      ? sendNtfy(settings.ntfyTopic, env.NTFY_TOKEN, title, body, clickUrl, "default")
      : Promise.resolve(),
    (method === "sms" || method === "both") && settings.smsGatewayEmail
      ? sendSms(settings.smsGatewayEmail, title, clickUrl)
      : Promise.resolve(),
  ]);

  console.log(`New events alert: ${city}/${category} — ${events.length} events`);
}

export async function notifyScrapeIssue(
  env: Env,
  settings: UserSettings,
  event: WatchedEvent,
  recovered: boolean
): Promise<void> {
  const title = recovered
    ? `${event.name} — resale scraping is back`
    : `${event.name} — resale scraping is stuck`;
  const body = recovered
    ? "We're able to fetch resale get-in prices again."
    : "We couldn't get a resale get-in price for this event, likely blocked by the source site's bot check. You won't get another alert about this until it recovers.";

  if (env.DRY_RUN === "true") {
    console.log(`[DRY RUN] Scrape status: ${title}\n${body}`);
    return;
  }

  const method = settings.alertMethod || "ntfy";
  await Promise.all([
    (method === "ntfy" || method === "both") && settings.ntfyTopic
      ? sendNtfy(settings.ntfyTopic, env.NTFY_TOKEN, title, body, event.url, "default")
      : Promise.resolve(),
    (method === "sms" || method === "both") && settings.smsGatewayEmail
      ? sendSms(settings.smsGatewayEmail, title, event.url)
      : Promise.resolve(),
  ]);
}

async function sendNtfy(topic: string, token: string | undefined, title: string, body: string, url: string, priority: string): Promise<void> {
  const headers: Record<string, string> = {
    Title: title,
    Priority: priority,
    Tags: "ticket",
    Click: url,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // ntfy.sh's public server rate-limits bursts of requests (429). When
  // several tracked events qualify for an alert in the same scrape run,
  // the requests land close together and can trip it — retry with backoff
  // rather than silently dropping the notification.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`https://ntfy.sh/${topic}`, { method: "POST", headers, body });
    if (res.ok) return;
    console.error(`ntfy error: ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`);
    if (res.status !== 429 || attempt === MAX_ATTEMPTS) return;
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

async function sendSms(email: string, subject: string, url: string): Promise<void> {
  console.log(`[SMS] ${email}: "${subject}" — ${url}`);
}
