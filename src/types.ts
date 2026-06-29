export interface WatchedEvent {
  slug: string;
  name: string;
  date: string;
  venue: string;
  city: string;
  ticketmasterEventId?: string;
  ticketsWanted: number;
  maxPrice: number;
  alertsEnabled: boolean;
  url: string;
}

export interface PriceSnapshot {
  timestamp: number;
  source: string;
  matchSlug: string;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string;
  url: string;
}

export interface UserSettings {
  alertMethod: "ntfy" | "sms" | "both";
  ntfyTopic: string;
  smsGatewayEmail?: string;
}

export interface Env {
  PRICE_DATA: KVNamespace;
  TICKETMASTER_API_KEY: string;
  NTFY_TOPIC: string;
  NTFY_TOKEN?: string;
  DRY_RUN: string;
}
