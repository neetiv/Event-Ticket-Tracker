import { Env, WatchedEvent, PriceSnapshot, UserSettings } from "./types";
import { ALERT_COOLDOWN_MS } from "./config";
import { getLastAlertTime, setLastAlertTime, getSettings } from "./storage";

export async function checkAndAlert(
  env: Env,
  event: WatchedEvent,
  snapshot: PriceSnapshot
): Promise<void> {
  if (!event.alertsEnabled) return;
  if (snapshot.minPrice === null) return;
  if (snapshot.minPrice > event.maxPrice) return;

  const settings = await getSettings(env);
  if (!settings.ntfyTopic && settings.alertMethod !== "sms") return;

  const lastAlert = await getLastAlertTime(env, event.slug, snapshot.source);
  if (lastAlert && Date.now() - lastAlert < ALERT_COOLDOWN_MS) return;

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

async function sendNtfy(topic: string, token: string | undefined, title: string, body: string, url: string, priority: string): Promise<void> {
  const headers: Record<string, string> = {
    Title: title,
    Priority: priority,
    Tags: "ticket",
    Click: url,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`https://ntfy.sh/${topic}`, { method: "POST", headers, body });
  if (!res.ok) console.error(`ntfy error: ${res.status}`);
}

async function sendSms(email: string, subject: string, url: string): Promise<void> {
  console.log(`[SMS] ${email}: "${subject}" — ${url}`);
}
