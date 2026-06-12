import type { DailyDigest } from "../core/types";

/**
 * The digested weather blob the read path consumes — mirrors the KV `wx:digest:v1` value
 * (spec 01). In S03 a fixture adapter supplies it; from Slice 2 the KV store does.
 */
export interface WeatherDigest {
  fetchedAt: string; // ISO instant
  model: string;
  sites: Record<string, DailyDigest[]>; // keyed by campsite id, ordered 16-day forecast
}

export interface WeatherSource {
  getDigest(): Promise<WeatherDigest>;
}
