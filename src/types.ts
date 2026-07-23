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

export interface CityWatch {
  city: string;
  categories: string[];
  enabled: boolean;
}

export interface UserSettings {
  alertMethod: "ntfy" | "sms" | "both";
  ntfyTopic: string;
  smsGatewayEmail?: string;
  cityWatches?: CityWatch[];
  scrapeIntervalMinutes?: number;
  alertCooldownMinutes?: number;
}

export interface NtfyLogEntry {
  time: string; // MM/DD/YY HH:MM:SS
  slug: string;
  attempt: number;
  maxAttempts: number;
  httpStatus: number;
  success: boolean;
  reason?: string;
}

export interface Env {
  PRICE_DATA: KVNamespace;
  TICKETMASTER_API_KEY: string;
  NTFY_TOPIC: string;
  NTFY_TOKEN?: string;
  GITHUB_PAT?: string;
  DRY_RUN: string;
}
