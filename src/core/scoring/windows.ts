import type { Confidence, DailyDigest, DailyScore, Tier } from "../types";
import { addDays, daysBetween } from "../dates";
import type { ScoringPolicy } from "./policy";
import { scoreDay } from "./score";

/**
 * A scored window for a single site, before region grouping and campsite attachment.
 * `service.ts`/`recommend.ts` turn this into the public `Window` shape.
 */
export interface CoreWindow {
  start: string;
  end: string;
  days: number;
  score: number;
  tier: Tier;
  confidence: Confidence;
  mayExtend: boolean;
  daily: DailyScore[];
}

const RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };

/** Lead-time confidence by calendar lead (days from the first forecast day, 1-indexed: day 1 =
 *  today). Calendar-based so a dropped day never inflates confidence for later days. Days 15–16
 *  are always low (spec 02). */
function leadConfidence(lead: number, policy: ScoringPolicy): Confidence {
  if (lead >= 15) return "low";
  if (lead <= policy.confidence.highMaxLeadDays) return "high";
  if (lead <= policy.confidence.mediumMaxLeadDays) return "medium";
  return "low";
}

/**
 * Find camping windows for one site's ordered 16-day digest (spec 02 "Window detection").
 * Existence is "warm enough to score": a window is a maximal run of consecutive days with warmth > 0
 * (tMaxC above `warmth.zeroC`), at least `minDays` long. Wind and rain only rank it — they never
 * disqualify a day (no hard caps), so a stormy day stays inside its window with a low score.
 */
export function findWindows(digests: DailyDigest[], policy: ScoringPolicy): CoreWindow[] {
  const dayScores = digests.map((d) => scoreDay(d, policy));
  const windows: CoreWindow[] = [];

  let runStart = -1;
  for (let i = 0; i <= digests.length; i++) {
    // "Warm enough to score" = warmth > 0 = tMaxC above the warmth-zero point. A day at or below it
    // contributes nothing and breaks the run (it's the segmentation boundary, replacing the old floor).
    const warm = i < digests.length && digests[i]!.tMaxC > policy.warmth.zeroC;
    // A calendar gap (a forecast day the adapter dropped because upstream returned null) ends the
    // run: spec 02 windows are runs of *consecutive* days, so one must never span a day with no
    // forecast.
    const gapBreak = warm && runStart !== -1 && digests[i]!.date !== addDays(digests[i - 1]!.date, 1);
    if (runStart !== -1 && (!warm || gapBreak)) {
      maybeEmit(runStart, i - 1);
      runStart = -1;
    }
    if (warm && runStart === -1) {
      runStart = i;
    }
  }

  function maybeEmit(lo: number, hi: number): void {
    const len = hi - lo + 1;
    if (len < policy.minDays) return;

    const members = digests.slice(lo, hi + 1);
    const memberScores = dayScores.slice(lo, hi + 1);
    const score = memberScores.reduce((s, v) => s + v, 0) / len;

    const tier: Tier =
      score >= policy.tiers.excellentMinScore ? "excellent" : score >= policy.tiers.goodMinScore ? "good" : "marginal";

    let confidence: Confidence = "high";
    for (let i = lo; i <= hi; i++) {
      const lead = daysBetween(digests[0]!.date, digests[i]!.date) + 1;
      const c = leadConfidence(lead, policy);
      if (RANK[c] < RANK[confidence]) confidence = c;
    }

    const daily: DailyScore[] = members.map((d, k) => ({
      date: d.date,
      tMaxC: d.tMaxC,
      precipSumMm: d.precipSumMm,
      gustMaxKmh: d.gustMaxKmh,
      score: memberScores[k]!,
    }));

    windows.push({
      start: members[0]!.date,
      end: members[len - 1]!.date,
      days: len,
      score,
      tier,
      confidence,
      mayExtend: hi === digests.length - 1,
      daily,
    });
  }

  return windows;
}

/**
 * Clip one window to a requested date range `[from, to]` (inclusive), rescoring it over only the days
 * that survive — used when the caller asks for a sub-range so windows fit the request instead of
 * spilling past it (spec 02 "Per-request date range"). `findWindows` still runs over the whole digest
 * (so lead-time confidence is measured from the true first forecast day, `horizonStart`, not the clip);
 * this trims the result afterwards. The minimum length relaxes to `min(minDays, range length)` so a
 * range shorter than `minDays` still surfaces its best run rather than going empty. Returns `null` when
 * the surviving run is shorter than that effective minimum (including no overlap at all).
 */
export function clipWindowToRange(
  window: CoreWindow,
  from: string,
  to: string,
  horizonStart: string,
  policy: ScoringPolicy,
): CoreWindow | null {
  const daily = window.daily.filter((d) => d.date >= from && d.date <= to);
  const rangeDays = daysBetween(from, to) + 1;
  const effectiveMinDays = Math.min(policy.minDays, rangeDays);
  if (daily.length < effectiveMinDays) return null;

  const score = daily.reduce((s, d) => s + d.score, 0) / daily.length;
  const tier: Tier =
    score >= policy.tiers.excellentMinScore ? "excellent" : score >= policy.tiers.goodMinScore ? "good" : "marginal";

  let confidence: Confidence = "high";
  for (const d of daily) {
    const lead = daysBetween(horizonStart, d.date) + 1;
    const c = leadConfidence(lead, policy);
    if (RANK[c] < RANK[confidence]) confidence = c;
  }

  const end = daily[daily.length - 1]!.date;
  return {
    start: daily[0]!.date,
    end,
    days: daily.length,
    score,
    tier,
    confidence,
    // Only still "may extend past the forecast" if the clip didn't trim the original final day.
    mayExtend: window.mayExtend && end === window.end,
    daily,
  };
}
