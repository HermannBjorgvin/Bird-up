import { z } from "zod";
import type { DailyDigest } from "../core/types";

/**
 * Open-Meteo forecast adapter (spec 04): one batched multi-point call per ≤100-coordinate chunk,
 * digested into per-site `DailyDigest[]`. Pure transformation apart from the injected `fetch` —
 * the refresh-weather workflow gives each chunk its own step (and CPU budget).
 */

export interface SiteCoord {
  id: string;
  lat: number;
  lng: number;
}

export const OPEN_METEO_CHUNK_SIZE = 100;

/** The upstream fields we consume; extra fields pass through unvalidated. Nulls (data gaps) drop the day. */
const Location = z.object({
  daily: z.object({
    time: z.array(z.iso.date()),
    temperature_2m_max: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    precipitation_sum: z.array(z.number().nullable()),
    wind_gusts_10m_max: z.array(z.number().nullable()),
    wind_speed_10m_max: z.array(z.number().nullable()),
  }),
  hourly: z.object({
    time: z.array(z.string()), // "YYYY-MM-DDTHH:00"
    cloud_cover: z.array(z.number().nullable()),
  }),
});

/** Spec 04 call shape, batched: one URL for up to ~100 coordinate pairs. */
export function buildForecastUrl(sites: SiteCoord[]): string {
  return (
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${sites.map((s) => s.lat).join(",")}` +
    `&longitude=${sites.map((s) => s.lng).join(",")}` +
    "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,wind_speed_10m_max" +
    "&hourly=cloud_cover" +
    "&forecast_days=16&wind_speed_unit=kmh&timezone=UTC&models=best_match"
  );
}

export function chunkSites<T>(sites: T[], size = OPEN_METEO_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < sites.length; i += size) chunks.push(sites.slice(i, i + size));
  return chunks;
}

/**
 * Digest a (parsed) multi-point response body for `sites`, in input order. Open-Meteo returns an
 * array for >1 location and a bare object for exactly 1 — both are accepted.
 */
export function digestLocations(sites: SiteCoord[], payload: unknown): Record<string, DailyDigest[]> {
  const locations = z.array(Location).parse(Array.isArray(payload) ? payload : [payload]);
  if (locations.length !== sites.length) {
    throw new Error(`Open-Meteo returned ${locations.length} locations for ${sites.length} requested sites`);
  }

  const digests: Record<string, DailyDigest[]> = {};
  sites.forEach((site, i) => {
    digests[site.id] = digestOne(locations[i]!);
  });
  return digests;
}

function digestOne(loc: z.infer<typeof Location>): DailyDigest[] {
  // "Daytime" cloud = mean of the 12 hourly samples 09:00…20:00 UTC (the 09–21 window, spec 04).
  const cloud = new Map<string, { sum: number; n: number }>();
  loc.hourly.time.forEach((t, i) => {
    const value = loc.hourly.cloud_cover[i];
    const hour = Number(t.slice(11, 13));
    if (value === null || value === undefined || hour < 9 || hour >= 21) return;
    const date = t.slice(0, 10);
    const acc = cloud.get(date) ?? { sum: 0, n: 0 };
    acc.sum += value;
    acc.n += 1;
    cloud.set(date, acc);
  });

  const days: DailyDigest[] = [];
  loc.daily.time.forEach((date, i) => {
    const tMaxC = loc.daily.temperature_2m_max[i];
    const tMinC = loc.daily.temperature_2m_min[i];
    const precipSumMm = loc.daily.precipitation_sum[i];
    const gustMaxKmh = loc.daily.wind_gusts_10m_max[i];
    const windMaxKmh = loc.daily.wind_speed_10m_max[i];
    if (tMaxC == null || tMinC == null || precipSumMm == null || gustMaxKmh == null || windMaxKmh == null) return;

    const c = cloud.get(date);
    days.push({
      date,
      tMaxC,
      tMinC,
      precipSumMm,
      gustMaxKmh,
      windMaxKmh,
      ...(c ? { cloudMeanDaytimePct: Math.round(c.sum / c.n) } : {}),
    });
  });
  return days;
}

/** Fetch + digest forecasts for any number of sites, chunking at ≤100 coordinates per upstream call. */
export async function fetchDigests(
  sites: SiteCoord[],
  fetchFn: typeof fetch = fetch,
): Promise<Record<string, DailyDigest[]>> {
  const digests: Record<string, DailyDigest[]> = {};
  for (const chunk of chunkSites(sites)) {
    const res = await fetchFn(buildForecastUrl(chunk));
    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
    Object.assign(digests, digestLocations(chunk, await res.json()));
  }
  return digests;
}
