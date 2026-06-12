import { z } from "zod";
import { InvalidParamsError } from "./core/errors";
import { assembleRecommendation } from "./core/recommend";
import { DEFAULT_POLICY, mergePolicy } from "./core/scoring/policy";
import { findWindows } from "./core/scoring/windows";
import type { Campsite, DataAge, Recommendation } from "./core/types";
import type { WeatherSource } from "./ports/weather";

/**
 * The single orchestrator behind REST and MCP (spec 01): validate params → read the digest →
 * score in `core` → assemble a `Recommendation`. S03 reads from a fixture `WeatherSource` and a
 * single hardcoded campsite; KV, regions and birds arrive in later slices without changing callers.
 */
export interface WindowsParams {
  start_date: string | undefined;
  end_date: string | undefined;
  thresholds?: unknown;
}

export interface ServiceDeps {
  weather: WeatherSource;
  campsite: Campsite;
  baseUrl: string;
}

const DateStr = z.iso.date();

export async function getWindows(params: WindowsParams, deps: ServiceDeps): Promise<Recommendation> {
  const start = validateDate(params.start_date, "start_date");
  const end = validateDate(params.end_date, "end_date");
  if (start > end) throw new InvalidParamsError("start_date must be on or before end_date");

  const { policy, version } = mergePolicy(DEFAULT_POLICY, params.thresholds);

  const blob = await deps.weather.getDigest();
  const digest = blob.sites[deps.campsite.id];
  if (!digest || digest.length === 0) {
    throw new InvalidParamsError("no forecast available for the requested campsite");
  }

  // Dates are zero-padded YYYY-MM-DD, so lexical comparison is chronological (Iceland is UTC).
  const horizonStart = digest[0]!.date;
  const horizonEnd = digest[digest.length - 1]!.date;
  if (end > horizonEnd) throw new InvalidParamsError("end_date is beyond the 16-day forecast horizon");
  if (start < horizonStart) throw new InvalidParamsError("start_date is before the forecast horizon");

  // Score over the full horizon (baseline = the surrounding ~2 weeks), then keep windows that
  // overlap the requested range.
  const windows = findWindows(digest, policy).filter((w) => w.start <= end && w.end >= start);

  const dataAge: DataAge = {
    weatherFetchedAt: blob.fetchedAt,
    model: blob.model,
    stale: false, // staleness logic lands with the KV read path (Slice 2)
    campsitesFetchedAt: blob.fetchedAt,
  };

  return assembleRecommendation({
    windows,
    region: deps.campsite.region,
    campsites: [deps.campsite],
    policyVersion: version,
    dataAge,
    mapUrl: `${deps.baseUrl}/api/map?start=${start}&end=${end}&region=${deps.campsite.region}`,
    generatedAt: new Date().toISOString(),
  });
}

function validateDate(value: string | undefined, field: string): string {
  if (value === undefined || value === "") throw new InvalidParamsError(`${field} is required`);
  const parsed = DateStr.safeParse(value);
  if (!parsed.success) throw new InvalidParamsError(`${field} must be a YYYY-MM-DD date`);
  return parsed.data;
}
