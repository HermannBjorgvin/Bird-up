import { z } from "zod";
import { InvalidParamsError } from "../errors";

/**
 * The scoring policy lives in one config object (spec 02). The author has low confidence in the
 * defaults by design — everything tunable is here, the functions are pure, and behavior is pinned
 * by the canonical table. Changing behavior = editing spec 02's table + the tests + `version`, in
 * one commit (CLAUDE.md hard rule 2).
 */
export interface ScoringPolicy {
  version: string;
  hardFloor: { minDays: number; minPeakTempC: number };
  excellentPeakTempC: number;
  weights: { tempAnomaly: number; tempAbsolute: number }; // warmth blend; ratio sets anomaly-vs-absolute
  tempAbsolute: { fullPenaltyC: number; noPenaltyC: number }; // ramp
  precip: { idealMaxMmDay: number; hardMaxMmDay: number }; // multiplicative gate
  gusts: { idealMaxKmh: number; hardMaxKmh: number }; // multiplicative gate
  anomaly: { baselineDays: number; zClamp: number };
  tiers: { excellentMinScore: number; goodMinScore: number };
  confidence: { highMaxLeadDays: number; mediumMaxLeadDays: number };
}

export const DEFAULT_POLICY: ScoringPolicy = {
  version: "2026-06.2",
  hardFloor: { minDays: 2, minPeakTempC: 18 },
  excellentPeakTempC: 20,
  weights: { tempAnomaly: 0.4, tempAbsolute: 0.2 },
  tempAbsolute: { fullPenaltyC: 12, noPenaltyC: 22 },
  precip: { idealMaxMmDay: 1, hardMaxMmDay: 8 },
  gusts: { idealMaxKmh: 35, hardMaxKmh: 65 },
  anomaly: { baselineDays: 16, zClamp: 2 },
  tiers: { excellentMinScore: 70, goodMinScore: 50 },
  confidence: { highMaxLeadDays: 4, mediumMaxLeadDays: 9 },
};

/**
 * Bounded subset callers may override (MCP `thresholds` / website sliders), bounds per spec 02.
 * `.strict()` so unknown keys are rejected rather than silently ignored. Cross-field rules
 * (ideal < hard, excellent ≥ floor) are checked in `mergePolicy` against the merged values.
 */
export const ThresholdOverrides = z.strictObject({
  hardFloor: z
    .strictObject({
      minDays: z.number().int().min(1).max(7).optional(),
      minPeakTempC: z.number().min(5).max(30).optional(),
    })
    .optional(),
  excellentPeakTempC: z.number().max(35).optional(),
  precip: z
    .strictObject({
      idealMaxMmDay: z.number().min(0).max(50).optional(),
      hardMaxMmDay: z.number().min(0).max(50).optional(),
    })
    .optional(),
  gusts: z
    .strictObject({
      idealMaxKmh: z.number().min(0).max(150).optional(),
      hardMaxKmh: z.number().min(0).max(150).optional(),
    })
    .optional(),
  weights: z
    .strictObject({
      tempAnomaly: z.number().min(0).max(1).optional(),
      tempAbsolute: z.number().min(0).max(1).optional(),
    })
    .optional(),
});
export type ThresholdOverrides = z.infer<typeof ThresholdOverrides>;

/**
 * Merge a (possibly undefined) override onto the base policy. Returns the effective policy and the
 * `policyVersion` to report — `<base>+custom` when any override was supplied. Out-of-bounds or
 * contradictory overrides throw `InvalidParamsError` (never silently clamped — spec 02).
 */
export function mergePolicy(base: ScoringPolicy, raw?: unknown): { policy: ScoringPolicy; version: string } {
  if (raw === undefined || raw === null) return { policy: base, version: base.version };

  const parsed = ThresholdOverrides.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidParamsError(`invalid thresholds override: ${firstIssue(parsed.error)}`);
  }
  const o = parsed.data;
  if (!hasOverride(o)) return { policy: base, version: base.version };

  const policy: ScoringPolicy = {
    ...base,
    hardFloor: { ...base.hardFloor, ...o.hardFloor },
    excellentPeakTempC: o.excellentPeakTempC ?? base.excellentPeakTempC,
    precip: { ...base.precip, ...o.precip },
    gusts: { ...base.gusts, ...o.gusts },
    weights: { ...base.weights, ...o.weights },
  };

  if (policy.excellentPeakTempC < policy.hardFloor.minPeakTempC) {
    throw new InvalidParamsError("excellentPeakTempC must be ≥ hardFloor.minPeakTempC");
  }
  if (policy.precip.idealMaxMmDay >= policy.precip.hardMaxMmDay) {
    throw new InvalidParamsError("precip.idealMaxMmDay must be < precip.hardMaxMmDay");
  }
  if (policy.gusts.idealMaxKmh >= policy.gusts.hardMaxKmh) {
    throw new InvalidParamsError("gusts.idealMaxKmh must be < gusts.hardMaxKmh");
  }
  // Warmth blend divides by the weight sum (score.ts), so the two are a ratio — only their
  // positivity matters; no renormalization needed.
  if (policy.weights.tempAnomaly + policy.weights.tempAbsolute <= 0) {
    throw new InvalidParamsError("weights.tempAnomaly + weights.tempAbsolute must be > 0");
  }

  return { policy, version: `${base.version}+custom` };
}

/** True if any leaf value was actually supplied — so `{}` or `{ precip: {} }` stays a no-op. */
function hasOverride(o: ThresholdOverrides): boolean {
  const hasLeaf = (group?: Record<string, number | undefined>): boolean =>
    group !== undefined && Object.values(group).some((v) => v !== undefined);
  return (
    o.excellentPeakTempC !== undefined ||
    hasLeaf(o.hardFloor) ||
    hasLeaf(o.precip) ||
    hasLeaf(o.gusts) ||
    hasLeaf(o.weights)
  );
}

function firstIssue(error: z.ZodError): string {
  const i = error.issues[0];
  if (!i) return "unknown validation error";
  const path = i.path.join(".");
  return path ? `${path}: ${i.message}` : i.message;
}
