import type { Window } from '../../../src/core/types'

/**
 * The shared quality string for a campsite/window: the core-derived tier word plus the anchored score,
 * e.g. "marginal 26/100". Used in the sidebar rows, the group headers and the map popup so the same
 * figure reads identically everywhere. The tier is always the core `Window['tier']` — never re-bucketed
 * from the score in the web layer (that would duplicate a policy judgment; CLAUDE.md hard rule 2).
 */
export function tierScore(tier: Window['tier'], score: number): string {
  return `${tier} ${Math.round(score)}/100`
}

/** A drive duration in minutes as a compact "4h 30m" / "45m" / "3h" string (for the drive-time filter). */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
