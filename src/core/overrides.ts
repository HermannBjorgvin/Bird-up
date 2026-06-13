import type { Campsite } from "./types";

/**
 * Hand-curated per-site corrections, merged onto adapter output by id after the refresh-campsites
 * adapter runs (spec 04): camping-card flags, booking deep links, the odd manual fix. A bounded
 * field set — overrides can't invent ids, coordinates or regions, only enrich known sites. Pure.
 */
export type CampsiteOverride = Partial<
  Pick<Campsite, "name" | "website" | "fee" | "openingHours" | "bookingUrl" | "campingCard">
>;
export type CampsiteOverrides = Record<string, CampsiteOverride>;

/** Apply overrides by id (override wins). An override for an unknown id is a warning, never a throw. */
export function mergeOverrides(
  sites: Campsite[],
  overrides: CampsiteOverrides,
): { sites: Campsite[]; warnings: string[] } {
  const ids = new Set(sites.map((s) => s.id));
  const warnings = Object.keys(overrides)
    .filter((id) => !ids.has(id))
    .map((id) => `campsite-overrides.json: unknown id "${id}" — no matching campsite, override ignored`);

  const merged = sites.map((s) => {
    const o = overrides[s.id];
    return o ? { ...s, ...o } : s;
  });
  return { sites: merged, warnings };
}
