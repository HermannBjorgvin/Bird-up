import type { Confidence, DailyDigest, DailyScore, Tier } from "../types";
import type { ScoringPolicy } from "./policy";
import { computeBaseline, scoreDay } from "./score";

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

/** Lead-time confidence for a forecast day by its position. Days 15–16 are always low (spec 02). */
function dayConfidence(index: number, policy: ScoringPolicy): Confidence {
  const lead = index + 1; // 1-indexed forecast day; day 1 = today
  if (lead >= 15) return "low";
  if (lead <= policy.confidence.highMaxLeadDays) return "high";
  if (lead <= policy.confidence.mediumMaxLeadDays) return "medium";
  return "low";
}

/**
 * Find camping windows for one site's ordered 16-day digest (spec 02 "Window detection").
 * Existence is temperature-only (a warm-but-windy window exists but scores badly); rain/wind rank it.
 */
export function findWindows(digests: DailyDigest[], policy: ScoringPolicy): CoreWindow[] {
  const baseline = computeBaseline(digests, policy);
  const dayScores = digests.map((d) => scoreDay(d, baseline, policy));
  const windows: CoreWindow[] = [];

  let runStart = -1;
  for (let i = 0; i <= digests.length; i++) {
    const warm = i < digests.length && digests[i]!.tMaxC >= policy.hardFloor.minPeakTempC;
    if (warm && runStart === -1) {
      runStart = i;
    } else if (!warm && runStart !== -1) {
      maybeEmit(runStart, i - 1);
      runStart = -1;
    }
  }

  function maybeEmit(lo: number, hi: number): void {
    const len = hi - lo + 1;
    if (len < policy.hardFloor.minDays) return;

    const members = digests.slice(lo, hi + 1);
    const memberScores = dayScores.slice(lo, hi + 1);
    const score = memberScores.reduce((s, v) => s + v, 0) / len;

    const hasExcellentDay = members.some((d) => d.tMaxC >= policy.excellentPeakTempC);
    const tier: Tier =
      hasExcellentDay && score >= policy.tiers.excellentMinScore
        ? "excellent"
        : score >= policy.tiers.goodMinScore
          ? "good"
          : "marginal";

    let confidence: Confidence = "high";
    for (let i = lo; i <= hi; i++) {
      const c = dayConfidence(i, policy);
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
