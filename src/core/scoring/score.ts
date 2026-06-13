import type { DailyDigest } from "../types";
import type { ScoringPolicy } from "./policy";

/**
 * Score one forecast day against the policy (spec 02 "Day score"). Every factor is **soft** — none
 * is a hard gate. Warmth is purely absolute (no baseline): 0 at/below `warmth.zeroC`, 1 at
 * `warmth.oneC`, and uncapped above (a hotter-than-ideal day scores > 1, so a hot calm dry day can
 * exceed 100). Wind and rain are exponential decays that discount warmth but never reach 0, so a
 * gale or a soaking lowers a day without disqualifying it.
 *
 *   warmth     = max(0, (tMaxC − zeroC) / (oneC − zeroC))           // 0 at zeroC, 1 at oneC, uncapped
 *   windFactor = exp(−max(0, gustMaxKmh − calmKmh) / wind.scaleKmh) // 1 at/below calm, → 0 asymptote
 *   rainFactor = exp(−precipSumMm / rain.scaleMm)                   // 1 at 0 mm, → 0 asymptote
 *   dayScore   = 100 · warmth · windFactor · rainFactor
 */
export function warmth(tMaxC: number, policy: ScoringPolicy): number {
  const { zeroC, oneC } = policy.warmth;
  return Math.max(0, (tMaxC - zeroC) / (oneC - zeroC));
}

export function windFactor(gustMaxKmh: number, policy: ScoringPolicy): number {
  return Math.exp(-Math.max(0, gustMaxKmh - policy.wind.calmKmh) / policy.wind.scaleKmh);
}

export function rainFactor(precipSumMm: number, policy: ScoringPolicy): number {
  return Math.exp(-Math.max(0, precipSumMm) / policy.rain.scaleMm);
}

export function scoreDay(digest: DailyDigest, policy: ScoringPolicy): number {
  return 100 * warmth(digest.tMaxC, policy) * windFactor(digest.gustMaxKmh, policy) * rainFactor(digest.precipSumMm, policy);
}
