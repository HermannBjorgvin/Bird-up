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
  weights: { tempAnomaly: number; tempAbsolute: number };  // warmth blend; only the ratio matters
  tempAbsolute: { fullPenaltyC: number; noPenaltyC: number };  // ramp
  precip: { idealMaxMmDay: number; hardMaxMmDay: number };     // multiplicative gate
  gusts:  { idealMaxKmh: number; hardMaxKmh: number };         // multiplicative gate
  anomaly: { baselineDays: number; zClamp: number };
  tiers: { excellentMinScore: number; goodMinScore: number };
  confidence: { highMaxLeadDays: number; mediumMaxLeadDays: number };
}

export const DEFAULT_POLICY: ScoringPolicy = {
  version: "2026-06.2",
  hardFloor: { minDays: 2, minPeakTempC: 18 },
  excellentPeakTempC: 20,
  weights: { tempAnomaly: 0.40, tempAbsolute: 0.20 },
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
baseline      = { mean, sd } of tMaxC over the horizon (population sd, ÷n; floored at 1 °C)
zAnomaly      = clamp((tMaxC − mean) / sd, ±zClamp)
anomalyScore  = (zAnomaly + zClamp) / (2·zClamp)                     // 0–1
absScore      = ramp01(tMaxC, fullPenaltyC → noPenaltyC)             // 0–1
warmth        = (w.tempAnomaly·anomalyScore + w.tempAbsolute·absScore)
                / (w.tempAnomaly + w.tempAbsolute)                   // 0–1
gustFactor    = 1 − ramp01(gustMaxKmh,  idealMaxKmh  → hardMaxKmh)   // 1→0 gate
precipFactor  = 1 − ramp01(precipSumMm, idealMaxMmDay → hardMaxMmDay) // 1→0 gate

dayScore = 100 · warmth · gustFactor · precipFactor
```

`ramp01(x, a → b)` = 0 below `a`, 1 above `b`, linear between. All components are 0–1; the result is 0–100.

**Warmth sets the ceiling; wind and rain are multiplicative gates** (decided at S03, replacing the original all-additive weighted sum). Warmth blends relative anomaly with absolute temperature (anomaly weighted higher — only the two weights' *ratio* matters, since `warmth` divides by their sum). Gusts and precipitation then *discount* that ceiling: each factor ramps 1→0 from its ideal to its hard limit, so a day at or beyond `hardMaxKmh`/`hardMaxMmDay` scores **0 regardless of warmth** — a tent-flattening gale or a soaking is disqualifying, not merely down-weighted. This is why the canonical T5/T6 cases land at `marginal`; an additive sum with the same weights could not reach them.

## Window detection

Per site:

1. **Existence (hard floor):** candidate windows are maximal runs of consecutive days with `tMaxC ≥ hardFloor.minPeakTempC`, at least `hardFloor.minDays` long. The floor is temperature-only by design — a warm-but-windy window *exists* but scores badly. *Consecutive* is calendar-consecutive: a gap in the digest (a forecast day the adapter dropped because upstream returned null) ends the run, so a window never spans a day with no forecast.
2. **Score:** window score = mean of its members' `dayScore`s.
3. **Tier:** `excellent` if any member day has `tMaxC ≥ excellentPeakTempC` **and** score ≥ `tiers.excellentMinScore`; else `good` if score ≥ `tiers.goodMinScore`; else `marginal`.
4. **Confidence** = the *worst* member day's lead-time tier: lead ≤ `highMaxLeadDays` → `high`; ≤ `mediumMaxLeadDays` → `medium`; else `low`. Days 15–16 are always `low`. Lead is the calendar distance from the first forecast day (day 1 = today), not the array index, so a dropped day never inflates a later day's confidence.
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
| `weights.tempAnomaly` / `weights.tempAbsolute` | each 0–1; only their ratio matters (warmth blend) |

Out-of-bounds → `INVALID_PARAMS` (never silently clamped). Any override sets `policyVersion: "<base>+custom"` in the response.

## Canonical behavior table

Tests transcribe this table verbatim (see [07-testing.md](07-testing.md)). Changing policy behavior means changing this table in the same commit and bumping `version`. Inputs are 16-day single-site digests, described compactly; defaults apply.

| # | Case | Input sketch | Expected |
|---|---|---|---|
| T1 | Flat cool fortnight | tMax 15 °C all days, dry, calm | no windows |
| T2 | Owner's floor case | 2 consecutive days tMax 18 °C, rest 13 °C; dry, calm | exactly 1 window, 2 days, exists; tier ≥ `good`; high anomaly component; **score 86.67** |
| T3 | One hot day only | 1 day 21 °C, rest 14 °C | no windows (`minDays` unmet) |
| T4 | Excellent | 3 days 20–21 °C, dry, gusts ≤ 25 km/h, rest 14 °C | 1 window, tier `excellent`; **score 93.78** |
| T5 | Warm but stormy | 3 days 21 °C with gusts 70 km/h, dry | window **exists** (floor is temp-only); gust gate 0 → **score 0**; tier `marginal` |
| T6 | Warm but soaked | 2 days 19 °C with 10 mm/day, calm | window exists; precip gate 0 → **score 0**; tier `marginal` |
| T7 | Uniformly warm | all 16 days 19 °C, dry, calm | 1 window spanning the horizon; anomalyScore ≈ 0.5 (no spike) but warmth/gate components strong; `mayExtend: true`; window confidence `low` |
| T8 | Relative spike, modest absolute | 3 days 18 °C among 10 °C neighbors, dry, calm | 1 window; anomaly component near max; tier `good`; **score 86.67** |
| T9 | Edge of horizon | days 15–16 at 19 °C | window exists, `confidence: low`, `mayExtend: true` |
| T10 | Lead-time confidence | days 2–3 at 19 °C → `high`; days 5–6 → `medium`; days 10–11 → `low` | as stated |
| T11 | Override floor | T1 input, override `minPeakTempC: 14` | 1 window spanning horizon; `policyVersion` ends `+custom` |
| T12 | Invalid override | `minPeakTempC: 50` | `INVALID_PARAMS` error |

Exact scores for T2/T4/T8 were frozen when the tests were first written (S03, model version `2026-06.2`): **T2 = 86.67, T4 = 93.78, T8 = 86.67** (window means; T2/T8 are anomaly-maxed dry/calm days so they coincide). The table commits to tiers and orderings up front; these numbers are now part of the contract — changing them is a policy change (edit table + tests + `version` in one commit).

## Doors held open (explicitly not v1)

- **Ensemble spread** (Open-Meteo ensemble API) replacing lead-time-only confidence.
- Wind-direction/shelter awareness per campsite.
- Multiple named policies (e.g. "hardy camper") selected per request — the config-object design already permits this.
- Learned weights from the owner's accept/reject feedback.
