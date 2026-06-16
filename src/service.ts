import { z } from "zod";
import { attachBirds } from "./core/birds";
import { InvalidParamsError, StaleDataUnavailableError } from "./core/errors";
import { assembleRecommendation, EBIRD_ATTRIBUTION, type SiteWindows } from "./core/recommend";
import { DEFAULT_POLICY, mergePolicy } from "./core/scoring/policy";
import { clipWindowToRange, findWindows, type CoreWindow } from "./core/scoring/windows";
import type { Campsite, DataAge, Recommendation } from "./core/types";
import type { BirdSource } from "./ports/birds";
import type { WeatherSource } from "./ports/weather";

/**
 * The single orchestrator behind REST and MCP (spec 01): validate params → read the digest →
 * score in `core` → assemble a `Recommendation`. S04 serves the KV-backed digest for the ten
 * seed campsites; the real campsite list and birds arrive in later slices without changing callers.
 */
export interface WindowsParams {
  start_date: string | undefined;
  end_date: string | undefined;
  thresholds?: unknown;
  include_birds?: boolean; // MVP: attach notable (rare) eBird sightings near the windows' campsites
}

export interface ServiceDeps {
  weather: WeatherSource;
  campsites: Campsite[];
  campsitesFetchedAt: string; // the campsite source's own age (the seed list's authoring date in S04)
  baseUrl: string;
  birds?: BirdSource; // present only when an eBird key is configured; omitted → birds silently skipped
}

const DateStr = z.iso.date();

/** Staleness thresholds + warnings (spec 03): stale data is served with flags, never refused. */
const STALE_AFTER_MS = 6 * 3_600_000;
const VERY_STALE_AFTER_MS = 24 * 3_600_000;
const WARN_STALE = "forecast data is more than 6 hours old";
const WARN_VERY_STALE = "forecast data is over a day old; treat windows as indicative";

export async function getWindows(params: WindowsParams, deps: ServiceDeps): Promise<Recommendation> {
  const start = validateDate(params.start_date, "start_date");
  const end = validateDate(params.end_date, "end_date");
  if (start > end) throw new InvalidParamsError("start_date must be on or before end_date");

  const { policy, version } = mergePolicy(DEFAULT_POLICY, params.thresholds);

  const blob = await deps.weather.getDigest();
  if (!blob) throw new StaleDataUnavailableError("no weather data available yet — try again in a few minutes");

  // Sites missing from the blob (mid-deploy list drift) are skipped, not fatal.
  const withDigest = deps.campsites
    .map((campsite) => ({ campsite, digest: blob.sites[campsite.id] }))
    .filter((s): s is { campsite: Campsite; digest: NonNullable<typeof s.digest> } => !!s.digest?.length);
  if (withDigest.length === 0) {
    throw new StaleDataUnavailableError("the weather digest covers none of the known campsites");
  }

  // Dates are zero-padded YYYY-MM-DD, so lexical comparison is chronological (Iceland is UTC).
  // Sites can disagree on horizon length (per-site null-dropping), so derive the bounds across every
  // site that has data — not whichever happens to be first in the seed list. A request valid for at
  // least one site is accepted; sites without data for a given day simply contribute no windows.
  const starts = withDigest.map((s) => s.digest[0]!.date);
  const ends = withDigest.map((s) => s.digest[s.digest.length - 1]!.date);
  const horizonStart = starts.reduce((a, b) => (a < b ? a : b));
  const horizonEnd = ends.reduce((a, b) => (a > b ? a : b));
  if (end > horizonEnd) throw new InvalidParamsError(`end_date is beyond the forecast horizon (through ${horizonEnd})`);
  if (start < horizonStart) throw new InvalidParamsError(`start_date is before the forecast horizon (from ${horizonStart})`);

  // Score each site over the full horizon (baseline = the surrounding ~2 weeks), then clip each
  // window to the requested range so it fits the caller's dates instead of spilling past them —
  // rescored per-site over only the days in range (spec 02). A full-horizon request clips to a
  // no-op. recommend.ts then groups the survivors by region.
  const sites: SiteWindows[] = withDigest.map(({ campsite, digest }) => ({
    campsite,
    windows: findWindows(digest, policy)
      .map((w) => clipWindowToRange(w, start, end, horizonStart, policy))
      .filter((w): w is CoreWindow => w !== null),
  }));

  const now = new Date();
  const ageMs = now.getTime() - Date.parse(blob.fetchedAt);
  const warnings: string[] = [];
  if (ageMs > VERY_STALE_AFTER_MS) warnings.push(WARN_VERY_STALE);
  else if (ageMs > STALE_AFTER_MS) warnings.push(WARN_STALE);

  const dataAge: DataAge = {
    weatherFetchedAt: blob.fetchedAt,
    model: blob.model,
    stale: ageMs > STALE_AFTER_MS,
    campsitesFetchedAt: deps.campsitesFetchedAt,
  };

  const rec = assembleRecommendation({
    sites,
    policyVersion: version,
    dataAge,
    warnings,
    mapUrl: `${deps.baseUrl}/api/map?start=${start}&end=${end}`,
    generatedAt: now.toISOString(),
  });

  // Bird overlay (opt-in): attach notable (rare) sightings near each window's campsites. Degrades —
  // an eBird failure never fails the weather answer (it just omits birds + adds a warning, spec 03).
  if (params.include_birds === true && deps.birds !== undefined) {
    const regions = [...new Set(rec.windows.map((w) => w.region))];
    const { byRegion, fetchedAt, degraded } = await deps.birds.notableByRegion(regions);
    rec.windows = attachBirds(rec.windows, byRegion, new Set());
    rec.attribution = [...rec.attribution, EBIRD_ATTRIBUTION];
    rec.dataAge = { ...rec.dataAge, birdObsFetchedAt: fetchedAt };
    if (degraded) rec.warnings = [...rec.warnings, "some bird sightings were temporarily unavailable"];
  }

  return rec;
}

function validateDate(value: string | undefined, field: string): string {
  if (value === undefined || value === "") throw new InvalidParamsError(`${field} is required`);
  const parsed = DateStr.safeParse(value);
  if (!parsed.success) throw new InvalidParamsError(`${field} must be a YYYY-MM-DD date`);
  return parsed.data;
}
