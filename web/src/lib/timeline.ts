import type { Window } from '../../../src/core/types'
import { addDays } from './dates'

/**
 * Pure helpers for the timeline bar (the heatmap + brush below the map). The bar always paints the
 * full forecast horizon; the brush filters the map and sidebar client-side. Iceland is UTC, so every
 * date is a plain YYYY-MM-DD and day enumeration is timezone-free.
 */

export interface DayHeat {
  date: string
  score: number // best (max) daily score across all windows covering this day; 0 if none
}

/** Inclusive list of UTC days from `start` to `end`. */
export function enumerateDays(start: string, end: string): string[] {
  const days: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return days
}

/**
 * Per-day heat for the whole horizon: each day's score is the max `DailyScore.score` over every
 * window that covers it (a day-level high-water mark of "how good is camping that day"). Days in no
 * window get 0 (rendered white). Uses the windows' own daily breakdown, not the window mean.
 */
export function dailyHeat(windows: readonly Window[], start: string, end: string): DayHeat[] {
  const best = new Map<string, number>()
  for (const w of windows) {
    for (const d of w.daily) {
      const prev = best.get(d.date)
      if (prev === undefined || d.score > prev) best.set(d.date, d.score)
    }
  }
  return enumerateDays(start, end).map((date) => ({ date, score: best.get(date) ?? 0 }))
}

/** Windows overlapping the selected range (same semantics the server used): start ≤ end && end ≥ start. */
export function windowsInRange(windows: readonly Window[], range: { start: string; end: string }): Window[] {
  return windows.filter((w) => w.start <= range.end && w.end >= range.start)
}
