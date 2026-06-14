# 02 — Scoring policy: what counts as a camping weather window

Status: accepted (defaults are provisional by design) · Last updated: 2026-06-13

> **This module is designed to be replaced.** The author has explicitly low confidence in the definition below. Everything tunable lives in one config object; the functions are pure; behavior is pinned by a table of canonical cases. Changing the definition = editing the config and the table in one diff, bumping the version. Nothing else in the system may hardcode weather judgments.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Shape | Pure functions `scoreDay` + `findWindows`, config passed explicitly | Swappable, trivially testable, no I/O |
| Warmth | **Purely absolute** temperature ramp (no baseline/anomaly) | Owner (2026-06-13): hard limits "defeat the purpose"; a clean "23 °C is ideal, 12 °C is nothing" reads predictably |
| Hard caps | **None.** Every factor is soft — wind and rain discount a day but never zero it | Owner: dislikes hard caps on anything; a single stormy day shouldn't disqualify a trip |
| Window existence | A run of days *warm enough to score* (warmth > 0, i.e. above the warmth-zero point), ≥ `minDays` long | With no floor, the warmth-zero point (12 °C) is what segments the forecast into windows |
| Only filter | `minDays` — the single per-request override | Owner: min-days is the only knob worth exposing |
| Confidence | By forecast lead time, not by score | Icelandic forecasts: days 1–4 actionable, 5–9 tentative, 10+ trend |
| Units | °C, mm/day, km/h (Open-Meteo native), dates YYYY-MM-DD UTC | Iceland is UTC year-round; no conversions to get wrong |

## The config object

```ts
export interface ScoringPolicy {
  version: string;
  minDays: number;                         // the only filter: minimum window length in days
  warmth: { zeroC: number; oneC: number }; // absolute warmth ramp; uncapped above oneC
  wind:   { calmKmh: number; scaleKmh: number }; // exp decay: 1 at/below calm, never 0
  rain:   { scaleMm: number };             // exp decay: 1 at 0 mm, never 0
  tiers: { excellentMinScore: number; goodMinScore: number };
  confidence: { highMaxLeadDays: number; mediumMaxLeadDays: number };
}

export const DEFAULT_POLICY: ScoringPolicy = {
  version: "2026-06.3",
  minDays: 3,
  warmth: { zeroC: 12, oneC: 23 },
  wind:   { calmKmh: 25, scaleKmh: 30 },
  rain:   { scaleMm: 6 },
  tiers:  { excellentMinScore: 70, goodMinScore: 40 },
  confidence: { highMaxLeadDays: 4, mediumMaxLeadDays: 9 },
};
```

Default rationale: 23 °C is an Icelandic ideal-camping day (warmth = 1); 12 °C is where warmth bottoms out (and below it there's nothing camp-worthy, so it also marks where a window ends). Wind below ~25 km/h is unremarkable; rain scales so ~6 mm cuts a day's score to ~37 %. `minDays` 3 is the owner's default trip length. Tiers are calibrated so a calm dry ~20 °C day reads `excellent`, a calm dry ~15 °C day `marginal`.

## Day score

For one site and one forecast day, given its `DailyDigest`. No baseline — every factor depends only on that day's numbers:

```
warmth     = max(0, (tMaxC − warmth.zeroC) / (warmth.oneC − warmth.zeroC))   // 0 at zeroC, 1 at oneC, UNCAPPED above
windFactor = exp(−max(0, gustMaxKmh − wind.calmKmh) / wind.scaleKmh)         // 1 at/below calm, decays toward 0, never reaches it
rainFactor = exp(−precipSumMm / rain.scaleMm)                                 // 1 at 0 mm, decays toward 0, never reaches it

dayScore = 100 · warmth · windFactor · rainFactor
```

**Warmth sets the ceiling; wind and rain only discount it — softly.** Warmth is purely absolute and **uncapped above `oneC`**, so a hotter-than-ideal day scores over 1 and a hot calm dry day scores **over 100**. Wind and rain are exponential decays: they shrink the score as conditions worsen but **never reach 0**, so a gale or a soaking lowers a day without disqualifying it (no hard caps — the deliberate reversal of the original gate model). A day at/below `warmth.zeroC` has warmth 0 → dayScore 0, and is the only thing that ends a window.

## Window detection

Per site:

1. **Existence:** candidate windows are maximal runs of consecutive days *warm enough to score* — `tMaxC > warmth.zeroC` (warmth > 0) — at least `minDays` long. There is no separate temperature floor: the warmth-zero point both contributes nothing and segments the forecast. *Consecutive* is calendar-consecutive: a gap in the digest (a forecast day the adapter dropped because upstream returned null) ends the run, so a window never spans a day with no forecast.
2. **Score:** window score = mean of its members' `dayScore`s (can exceed 100).
3. **Tier:** `excellent` if score ≥ `tiers.excellentMinScore`; else `good` if score ≥ `tiers.goodMinScore`; else `marginal`. (Score-only — there is no special-case temperature test.)
4. **Confidence** = the *worst* member day's lead-time tier: lead ≤ `highMaxLeadDays` → `high`; ≤ `mediumMaxLeadDays` → `medium`; else `low`. Days 15–16 are always `low`. Lead is the calendar distance from the first forecast day (day 1 = today), not the array index, so a dropped day never inflates a later day's confidence.
5. **Horizon edge:** a window whose last day is the final forecast day gets `mayExtend: true`.

Regional windows (what the API returns) merge per-site windows within one camping area (nearest-anchor grouping, [04-data-sources.md](04-data-sources.md)): the window's date range is the union of overlapping site windows; its score is the best site's; campsites within it are ranked by their own window scores.

## Per-request date range (clipping)

`findWindows` always runs over the **whole digest** (so lead-time confidence is measured from the true first forecast day, never from the request). The caller's `start_date`/`end_date` then **clip** each window to that range so a window fits the request instead of spilling past it — the website's date brush is exactly this. Clipping is a pure post-pass (`clipWindowToRange`), so the scoring config and the canonical table above are unchanged, and `policyVersion` is **not** bumped (only request-range handling changed, not the policy).

Per window, given the request range `[from, to]`:

1. **Keep** only the member days within `[from, to]`. A window with no overlap drops out.
2. **Effective minimum:** the surviving run must be at least `min(minDays, rangeLength)` days, where `rangeLength` is the number of days in `[from, to]`. A range **shorter** than `minDays` relaxes the floor to the range length, so a 2-day brush still surfaces its best 2-day run rather than going empty. A range **at least** `minDays` long keeps the normal `minDays` floor (a partial overlap shorter than `minDays` is dropped).
3. **Rescore** over the surviving days: `start`/`end`/`days` from the kept run, `score` = their mean `dayScore`, `tier` from that score, `confidence` = the worst surviving day's lead tier (still measured from the horizon start). `mayExtend` stays true only if the clip didn't trim the original final day.

A **full-horizon** request (`[from, to]` covering the whole digest) clips to a no-op — every window survives unchanged — so existing full-range callers (MCP agents, the website's timeline-bar fetch) see no behavior change.

| # | Case | Input sketch (defaults; warm = 18 °C dry calm fortnight from day 1) | Expected |
|---|---|---|---|
| TC1 | Sub-range clip | one horizon-spanning window, request days 4–7 | window clipped to days 4–7; `days: 4`; rescored over those 4 days |
| TC2 | Full range | same window, request = whole horizon | unchanged (no-op) |
| TC3 | Short range relaxes the floor | same window, request a 2-day range (`minDays` 3) | a 2-day window is returned (`min(3, 2) = 2`) |
| TC4 | Partial overlap below floor in a long range | a 2-day run, request a 5-day range covering it | dropped (range ≥ `minDays`, so the 3-day floor applies) |
| TC5 | Clip trims the final day | window reaching the horizon edge, request ends earlier | `mayExtend: false` |

## Per-request overrides

Callers may override a single field (MCP `thresholds` argument / the website's min-days slider). zod-validated, `.strict()` (unknown keys rejected):

| Field | Bounds |
|---|---|
| `minDays` | integer 1–7 |

Out-of-bounds → `INVALID_PARAMS` (never silently clamped). Any override sets `policyVersion: "<base>+custom"` in the response. At the default `minDays` (3) the website sends no override, so the default page load is a plain cacheable GET on the base `policyVersion`.

## Canonical behavior table

Tests transcribe this table verbatim (see [07-testing.md](07-testing.md)). Changing policy behavior means changing this table in the same commit and bumping `version`. Inputs are 16-day single-site digests, described compactly; defaults apply (dry/calm unless stated; "cold" filler = 10 °C, below the warmth-zero point, to segment windows).

| # | Case | Input sketch | Expected |
|---|---|---|---|
| T1 | Flat mild fortnight | tMax 15 °C all days, dry, calm | 1 window spanning the horizon (15 > 12); `marginal`; **score 27.27** |
| T2 | Flat cold | tMax 11 °C all days (≤ zeroC) | **no windows** (warmth 0) |
| T3 | Short warm spell | 2 days 21 °C among 10 °C neighbors | no windows (`minDays` unmet) |
| T4 | Excellent | 4 days 21 °C, dry, gusts ≤ 25, among 10 °C | 1 window, `excellent`; **score 81.82** |
| T5 | Warm but stormy | 4 days 21 °C with gusts 70 km/h, dry, among 10 °C | window exists and is **not** zeroed; windFactor ≈ 0.22 → **score 18.26**; `marginal` |
| T6 | Warm but soaked | 4 days 19 °C with 10 mm/day, calm, among 10 °C | window exists and is **not** zeroed; rainFactor ≈ 0.19 → **score 12.02**; `marginal` |
| T7 | Uniformly hot | all 16 days 28 °C, dry, calm | 1 window spanning the horizon; warmth ≈ 1.45 → **score 145.45** (over 100); `excellent`; `mayExtend: true`; confidence `low` |
| T8 | Lead-time confidence | 3-day warm runs at days 2–4 / 5–7 / 10–12 | `high` / `medium` / `low` |
| T9 | Edge of horizon | 3 days 19 °C at days 14–16 | window exists, `confidence: low`, `mayExtend: true` |
| T10 | Override `minDays: 2` | T3 input | the 2-day warm run now qualifies → 1 window; `policyVersion` ends `+custom` |
| T11 | Invalid override | `minDays: 50` | `INVALID_PARAMS` error |

Exact scores for T1/T4/T5/T6/T7 were frozen from the implementation when the soft-factor model (`2026-06.3`) was written: **T1 = 27.27, T4 = 81.82, T5 = 18.26, T6 = 12.02, T7 = 145.45** (window means; uniform-day windows so the day score equals the window score). These numbers are now part of the contract — changing them is a policy change (edit table + tests + `version` in one commit).

## Doors held open (explicitly not v1)

- **Ensemble spread** (Open-Meteo ensemble API) replacing lead-time-only confidence.
- Wind-direction/shelter awareness per campsite.
- A relative-warmth term (anomaly vs the surrounding fortnight) blended back in, if pure-absolute proves too blunt.
- Multiple named policies (e.g. "hardy camper") selected per request — the config-object design already permits this.
- Learned weights from the owner's accept/reject feedback.
