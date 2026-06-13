import { z } from "zod";
import { InvalidParamsError } from "../errors";

/**
 * The scoring policy lives in one config object (spec 02). The author has low confidence in the
 * defaults by design — everything tunable is here, the functions are pure, and behavior is pinned
 * by the canonical table. Changing behavior = editing spec 02's table + the tests + `version`, in
 * one commit (CLAUDE.md hard rule 2).
 *
 * Model (`2026-06.3`): every factor is **soft** — no hard caps. Warmth is purely absolute (no
 * baseline), ramping 0 at `warmth.zeroC` to 1 at `warmth.oneC` and uncapped above. Wind and rain
 * are exponential decays that discount warmth but never reach 0. `minDays` is the only filter and
 * the only per-request override; window existence is "a run of days warm enough to score" (warmth
 * > 0, i.e. tMaxC above `warmth.zeroC`).
 */
export interface ScoringPolicy {
  version: string;
  minDays: number; // the only filter: minimum window length in days
  warmth: { zeroC: number; oneC: number }; // absolute warmth ramp; uncapped above oneC
  wind: { calmKmh: number; scaleKmh: number }; // exp decay: 1 at/below calm, never 0
  rain: { scaleMm: number }; // exp decay: 1 at 0 mm, never 0
  tiers: { excellentMinScore: number; goodMinScore: number };
  confidence: { highMaxLeadDays: number; mediumMaxLeadDays: number };
}

export const DEFAULT_POLICY: ScoringPolicy = {
  version: "2026-06.3",
  minDays: 3,
  warmth: { zeroC: 12, oneC: 23 },
  wind: { calmKmh: 25, scaleKmh: 30 },
  rain: { scaleMm: 6 },
  tiers: { excellentMinScore: 70, goodMinScore: 40 },
  confidence: { highMaxLeadDays: 4, mediumMaxLeadDays: 9 },
};

/**
 * The only field callers may override (MCP `thresholds` / the website's min-days slider), bounds per
 * spec 02. `.strict()` so unknown keys are rejected rather than silently ignored.
 */
export const ThresholdOverrides = z.strictObject({
  minDays: z.number().int().min(1).max(7).optional(),
});
export type ThresholdOverrides = z.infer<typeof ThresholdOverrides>;

/**
 * Merge a (possibly undefined) override onto the base policy. Returns the effective policy and the
 * `policyVersion` to report — `<base>+custom` when an override was actually supplied. Out-of-bounds
 * overrides throw `InvalidParamsError` (never silently clamped — spec 02).
 */
export function mergePolicy(base: ScoringPolicy, raw?: unknown): { policy: ScoringPolicy; version: string } {
  if (raw === undefined || raw === null) return { policy: base, version: base.version };

  const parsed = ThresholdOverrides.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidParamsError(`invalid thresholds override: ${firstIssue(parsed.error)}`);
  }
  if (parsed.data.minDays === undefined) return { policy: base, version: base.version };

  return { policy: { ...base, minDays: parsed.data.minDays }, version: `${base.version}+custom` };
}

function firstIssue(error: z.ZodError): string {
  const i = error.issues[0];
  if (!i) return "unknown validation error";
  const path = i.path.join(".");
  return path ? `${path}: ${i.message}` : i.message;
}
