import { Env, WatchedMatch, PriceSnapshot, UserSettings } from "./types";
import { ALERT_COOLDOWN_MS, FIFA_DISCOUNT_FACTOR, FIFA_TICKETS_URL } from "./config";
import { getLastAlertTime, setLastAlertTime, getSettings } from "./storage";

export async function checkAndAlert(
  env: Env,
  match: WatchedMatch,
  snapshot: PriceSnapshot
): Promise<void> {
  if (!match.alertsEnabled) return;
  if (snapshot.minPrice === null) return;

  const settings = await getSettings(env);
  if (!settings.ntfyTopic) return;

  const estimatedFifaPrice = Math.round(snapshot.minPrice * FIFA_DISCOUNT_FACTOR);
  const fifaCouldHitTarget = estimatedFifaPrice <= match.maxPrice;
  const sourceHitsTarget = snapshot.minPrice <= match.maxPrice;

  if (!sourceHitsTarget && !fifaCouldHitTarget) return;

  const alertKey = fifaCouldHitTarget && !sourceHitsTarget
    ? `${snapshot.source}-fifa`
    : snapshot.source;

  const lastAlert = await getLastAlertTime(env, match.slug, alertKey);
  if (lastAlert && Date.now() - lastAlert < ALERT_COOLDOWN_MS) {
    console.log(`Skipping alert for ${match.slug}/${alertKey} — cooldown active`);
    return;
  }

  const matchDate = new Date(match.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  let title: string;
  let body: string;
  let clickUrl: string;
  let priority: string;

  if (sourceHitsTarget) {
    title = `${match.name} — $${snapshot.minPrice}!`;
    body = [
      `${snapshot.source} has tickets at $${snapshot.minPrice}`,
      match.ticketsWanted > 1 ? `(looking for ${match.ticketsWanted} together)` : "",
      `Target: ≤$${match.maxPrice}`,
      "",
      `FIFA est. ~$${estimatedFifaPrice} (typically 20-25% lower)`,
      `Check FIFA resale too: ${FIFA_TICKETS_URL}`,
      "",
      `${matchDate} · ${match.venue}`,
    ].filter(Boolean).join("\n");
    clickUrl = snapshot.url;
    priority = snapshot.minPrice <= match.maxPrice * 0.85 ? "urgent" : "high";
  } else {
    title = `CHECK FIFA: ${match.name} est. ~$${estimatedFifaPrice}`;
    body = [
      `${snapshot.source} is at $${snapshot.minPrice} (above your $${match.maxPrice} target)`,
      `But FIFA resale is typically 20-25% lower`,
      `Estimated FIFA price: ~$${estimatedFifaPrice}`,
      match.ticketsWanted > 1 ? `(looking for ${match.ticketsWanted} together)` : "",
      "",
      `Check FIFA resale now!`,
      "",
      `${matchDate} · ${match.venue}`,
    ].filter(Boolean).join("\n");
    clickUrl = FIFA_TICKETS_URL;
    priority = "high";
  }

  if (env.DRY_RUN === "true") {
    console.log(`[DRY RUN] Would send alert:\n  Title: ${title}\n  Body: ${body}\n  URL: ${clickUrl}`);
    return;
  }

  const sourceName = sourceHitsTarget
    ? (snapshot.url.includes("seatgeek") ? "SeatGeek" : "Ticketmaster")
    : "FIFA Tickets";

  await Promise.all([
    sendNtfy(settings.ntfyTopic, env.NTFY_TOKEN, title, body, clickUrl, priority, sourceName),
    settings.smsGatewayEmail
      ? sendSmsGateway(settings.smsGatewayEmail, title, clickUrl)
      : Promise.resolve(),
  ]);

  await setLastAlertTime(env, match.slug, alertKey);
  console.log(`Alert sent for ${match.slug}/${alertKey} at $${snapshot.minPrice} (FIFA est. ~$${estimatedFifaPrice})`);
}

async function sendNtfy(
  topic: string,
  token: string | undefined,
  title: string,
  body: string,
  url: string,
  priority: string,
  sourceName: string
): Promise<void> {
  const headers: Record<string, string> = {
    Title: title,
    Priority: priority,
    Tags: "soccer,ticket",
    Click: url,
    Actions: `view, Open ${sourceName}, ${url}`,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`https://ntfy.sh/${topic}`, {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok) {
    console.error(`ntfy error: ${res.status} ${await res.text()}`);
  }
}

async function sendSmsGateway(
  gatewayEmail: string,
  subject: string,
  url: string
): Promise<void> {
  console.log(
    `[SMS] Would email ${gatewayEmail}: "${subject}" — ${url}`
  );
}
