export interface WatchedMatch {
  slug: string;
  name: string;
  date: string; // ISO 8601
  venue: string;
  ticketmasterEventId?: string;
  seatgeekEventSlug?: string;
  ticketsWanted: number;
  maxPrice: number;
  alertsEnabled: boolean;
  links: { label: string; url: string }[];
}

export interface PriceSnapshot {
  timestamp: number; // Unix ms
  source: string;
  matchSlug: string;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string;
  url: string;
}

export interface UserSettings {
  ntfyTopic: string;
  smsGatewayEmail?: string;
}

export interface Env {
  PRICE_DATA: KVNamespace;
  TICKETMASTER_API_KEY: string;
  NTFY_TOPIC: string;
  NTFY_TOKEN?: string;
  SMS_GATEWAY_EMAIL?: string;
  DRY_RUN: string;
}
