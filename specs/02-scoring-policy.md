# 02 — Scoring policy: what counts as a camping weather window

Status: accepted (defaults are provisional by design) · Last updated: 2026-06-12

> **This module is designed to be replaced.** The author has explicitly low confidence in the definition below. Everything tunable lives in one config object; the functions are pure; behavior is pinned by a table of canonical cases. Changing the definition = editing the config and the table in one diff, bumping the version. Nothing else in the system may hardcode weather judgments.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Shape | Pure functions `scoreDay` + `findWindows`, config passed explicitly | Swappable, trivially testable, no I/O |
| Anomaly vs absolute | Relative warmth (vs the surrounding ~2 weeks) weighted highest | Owner: "comparison to the weather around the window is more important" |
| Hard floor | Temperature-only window *existence* test, separate from scoring | A window either exists or it doesn't; rain/wind then rank it |
| Confidence | By forecast lead time, not by score | Icelandic forecasts: days 1–4 actionable, 5–9 tentative, 10+ trend |
| Units | °C, mm/day, km/h (Open-Meteo native), dates YYYY-MM-DD UTC | Iceland is UTC year-round; no conversions to get wrong |

## The config object

```ts
export interface ScoringPolicy {
  version: string;
  hardFloor: { minDays: number; minPeakTempC: number };
  excellentPeakTempC: number;
  weights: { tempAnomaly: number; tempAbsolute: number;
             precipitation: number; gusts: number };       // sum to 1
  tempAbsolute: { fullPenaltyC: number; noPenaltyC: number };  // ramp
  precip: { idealMaxMmDay: number; hardMaxMmDay: number };     // ramp
  gusts:  { idealMaxKmh: number; hardMaxKmh: number };         // ramp
  anomaly: { baselineDays: number; zClamp: number };
  tiers: { excellentMinScore: number; goodMinScore: number };
  confidence: { highMaxLeadDays: number; mediumMaxLeadDays: number };
}

export const DEFAULT_POLICY: ScoringPolicy = {
  version: "2026-06.1",
  hardFloor: { minDays: 2, minPeakTempC: 18 },
  excellentPeakTempC: 20,
  weights: { tempAnomaly: 0.40, tempAbsolute: 0.20, precipitation: 0.25, gusts: 0.15 },
  tempAbsolute: { fullPenaltyC: 12, noPenaltyC: 22 },
  precip: { idealMaxMmDay: 1, hardMaxMmDay: 8 },
  gusts:  { idealMaxKmh: 35, hardMaxKmh: 65 },
  anomaly: { baselineDays: 16, zClamp: 2 },
  tiers: { excellentMinScore: 70, goodMinScore: 50 },
  confidence: { highMaxLeadDays: 4, mediumMaxLeadDays: 9 },
};
```

Default rationale: 18 °C peaks on ≥2 days is the owner's floor; 20 °C is an Icelandic heat event; gusts ≥ ~65 km/h flatten tents regardless of warmth; 8 mm is a genuinely wet day.

## Day score

For one site and one forecast day, given the site's `DailyDigest` and a per-site baseline computed over the whole fetched horizon (`anomaly.baselineDays` = 16 days: "the surrounding ~2 weeks"):

```
baseline      = { mean, sd } of tMaxC over the horizon (sd floored at 1 °C)
zAnomaly      = clamp((tMaxC − mean) / sd, ±zClamp)
anomalyScore  = (zAnomaly + zClamp) / (2·zClamp)                     // 0–1
absScore      = ramp01(tMaxC, fullPenaltyC → noPenaltyC)             // 0–1
precipScore   = 1 − ramp01(precipSumMm, idealMaxMmDay → hardMaxMmDay)
gustScore     = 1 − ramp01(gustMaxKmh,  idealMaxKmh  → hardMaxKmh)

dayScore = 100 · ( w.tempAnomaly·anomalyScore + w.tempAbsolute·absScore
                 + w.precipitation·precipScore + w.gusts·gustScore )
```

`ramp01(x, a → b)` = 0 below `a`, 1 above `b`, linear between. All components are 0–1; the result is 0–100.

## Window detection

Per site:

1. **Existence (hard floor):** candidate windows are maximal runs of consecutive days with `tMaxC ≥ hardFloor.minPeakTempC`, at least `hardFloor.minDays` long. The floor is temperature-only by design — a warm-but-windy window *exists* but scores badly.
2. **Score:** window score = mean of its members' `dayScore`s.
3. **Tier:** `excellent` if any member day has `tMaxC ≥ excellentPeakTempC` **and** score ≥ `tiers.excellentMinScore`; else `good` if score ≥ `tiers.goodMinScore`; else `marginal`.
4. **Confidence** = the *worst* member day's lead-time tier: lead ≤ `highMaxLeadDays` → `high`; ≤ `mediumMaxLeadDays` → `medium`; else `low`. Days 15–16 are always `low`.
5. **Horizon edge:** a window whose last day is the final forecast day gets `mayExtend: true`.

Regional windows (what the API returns) merge per-site windows within one of the 8 regions: the window's date range is the union of overlapping site windows; its score is the best site's; campsites within it are ranked by their own window scores.

## Per-request overrides

Callers may override a bounded subset (MCP `thresholds` argument / website sliders). zod-validated:

| Field | Bounds |
|---|---|
| `hardFloor.minDays` | 1–7 |
| `hardFloor.minPeakTempC` | 5–30 |
| `excellentPeakTempC` | ≥ `minPeakTempC`, ≤ 35 |
| `precip.idealMaxMmDay` / `hardMaxMmDay` | 0–50, ideal < hard |
| `gusts.idealMaxKmh` / `hardMaxKmh` | 0–150, ideal < hard |
| `weights.*` | each 0–1; renormalized to sum 1 |

Out-of-bounds → `INVALID_PARAMS` (never silently clamped). Any override sets `policyVersion: "<base>+custom"` in the response.

## Canonical behavior table

Tests transcribe this table verbatim (see [07-testing.md](07-testing.md)). Changing policy behavior means changing this table in the same commit and bumping `version`. Inputs are 16-day single-site digests, described compactly; defaults apply.

| # | Case | Input sketch | Expected |
|---|---|---|---|
| T1 | Flat cool fortnight | tMax 15 °C all days, dry, calm | no windows |
| T2 | Owner's floor case | 2 consecutive days tMax 18 °C, rest 13 °C; dry, calm | exactly 1 window, 2 days, exists; tier ≥ `good`; high anomaly component |
| T3 | One hot day only | 1 day 21 °C, rest 14 °C | no windows (`minDays` unmet) |
| T4 | Excellent | 3 days 20–21 °C, dry, gusts ≤ 25 km/h, rest 14 °C | 1 window, tier `excellent` |
| T5 | Warm but stormy | 3 days 21 °C with gusts 70 km/h, dry | window **exists** (floor is temp-only); gustScore 0; tier `marginal` |
| T6 | Warm but soaked | 2 days 19 °C with 10 mm/day, calm | window exists; precipScore 0; tier `marginal` |
| T7 | Uniformly warm | all 16 days 19 °C, dry, calm | 1 window spanning the horizon; anomalyScore ≈ 0.5 (no spike) but absolute/precip/gust components strong; `mayExtend: true`; window confidence `low` |
| T8 | Relative spike, modest absolute | 3 days 18 °C among 10 °C neighbors, dry, calm | 1 window; anomaly component near max; score > T7's per-day score is NOT required — table pins exact tier `good` |
| T9 | Edge of horizon | days 15–16 at 19 °C | window exists, `confidence: low`, `mayExtend: true` |
| T10 | Lead-time confidence | days 2–3 at 19 °C → `high`; days 5–6 → `medium`; days 10–11 → `low` | as stated |
| T11 | Override floor | T1 input, override `minPeakTempC: 14` | 1 window spanning horizon; `policyVersion` ends `+custom` |
| T12 | Invalid override | `minPeakTempC: 50` | `INVALID_PARAMS` error |

(Exact expected scores for T2/T4/T8 are pinned numerically when tests are first written — the table commits to tiers and orderings up front, numbers are frozen at implementation time and become part of this table.)

## Doors held open (explicitly not v1)

- **Ensemble spread** (Open-Meteo ensemble API) replacing lead-time-only confidence.
- Wind-direction/shelter awareness per campsite.
- Multiple named policies (e.g. "hardy camper") selected per request — the config-object design already permits this.
- Learned weights from the owner's accept/reject feedback.
