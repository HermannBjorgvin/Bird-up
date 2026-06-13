import type { DailyDigest } from "../core/types";

/**
 * The digested weather blob the read path consumes — mirrors the KV `wx:digest:v1` value
 * (spec 01), written by the refresh-weather workflow and served by the KV adapter.
 */
export interface WeatherDigest {
  fetchedAt: string; // ISO instant
  model: string;
  sites: Record<string, DailyDigest[]>; // keyed by campsite id, ordered 16-day forecast
}

export interface WeatherSource {
  /** `null` = no digest exists at all (pre-first-refresh) → 503 STALE_DATA_UNAVAILABLE (spec 03). */
  getDigest(): Promise<WeatherDigest | null>;
}
