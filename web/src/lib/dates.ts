/**
 * Date helpers for the range control (spec 05). Iceland is UTC year-round, so every date is a plain
 * UTC YYYY-MM-DD with no timezone math anywhere (CLAUDE.md). The live forecast horizon is ~14 days;
 * the default range targets it (the timeline bar paints this whole span).
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The whole forecast look-ahead in days; the default end is `today + this` (matches the API horizon). */
export const DEFAULT_RANGE_DAYS = 14

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toIsoDate(d)
}

export function defaultRange(now: Date): { start: string; end: string } {
  const start = toIsoDate(now)
  return { start, end: addDays(start, DEFAULT_RANGE_DAYS) }
}

/** "Jun 13" — a single UTC day, for timeline tick labels. */
export function formatDay(iso: string): string {
  const p = parts(iso)
  return `${p.mon} ${p.day}`
}

/** "Jun 18–21" (same month), "Jun 28 – Jul 2" (across months), "Jun 18" (single day). */
export function formatRange(start: string, end: string): string {
  const s = parts(start)
  const e = parts(end)
  if (start === end) return `${s.mon} ${s.day}`
  if (s.mon === e.mon) return `${s.mon} ${s.day}–${e.day}`
  return `${s.mon} ${s.day} – ${e.mon} ${e.day}`
}

function parts(iso: string): { mon: string; day: number } {
  const seg = iso.split('-')
  return { mon: MONTHS[Number(seg[1]) - 1]!, day: Number(seg[2]) }
}
