import type { Recommendation, Region, Window, WindowCampsite } from '../../../src/core/types'
import { REGIONS } from '../../../src/core/regions'

/** Peak-temp estimate for a window: the range of daily highs (tMaxC), e.g. "13–18°C" or "18°C". */
export function peakTempRange(window: Window): string {
  if (window.daily.length === 0) return ''
  let lo = Infinity
  let hi = -Infinity
  for (const d of window.daily) {
    if (d.tMaxC < lo) lo = d.tMaxC
    if (d.tMaxC > hi) hi = d.tMaxC
  }
  const loR = Math.round(lo)
  const hiR = Math.round(hi)
  return loR === hiR ? `${hiR}°C` : `${loR}–${hiR}°C`
}

/**
 * The side panel groups recommended campsites under their placename (the `region` anchor), with each
 * site shown once at its single best window. The `Recommendation` already carries everything: every
 * `Window` has a `region` and a `campsites[]` whose members each hold their own `score`. This is the
 * same per-site best-window fold as `buildMarkers`, bucketed by placename instead of left flat.
 */

export interface SiteRow {
  campsite: WindowCampsite
  score: number
  window: Window
}

export interface PlaceGroup {
  region: Region
  name: string // UTF-8 display name (regions.ts), e.g. "Vesturland (Borgarnes)"
  bestScore: number
  sites: SiteRow[]
}

const REGION_NAME = new Map<Region, string>(REGIONS.map((r) => [r.slug, r.name]))

export function groupByPlace(rec: Recommendation | null): PlaceGroup[] {
  if (!rec) return []

  // Each campsite appears once, at its best-scoring window; the placename is that window's region.
  const best = new Map<string, SiteRow>()
  for (const w of rec.windows) {
    for (const c of w.campsites) {
      const prev = best.get(c.id)
      if (!prev || c.score > prev.score) best.set(c.id, { campsite: c, score: c.score, window: w })
    }
  }

  const groups = new Map<Region, SiteRow[]>()
  for (const row of best.values()) {
    const region = row.window.region
    const list = groups.get(region)
    if (list) list.push(row)
    else groups.set(region, [row])
  }

  const out: PlaceGroup[] = []
  for (const [region, sites] of groups) {
    sites.sort((a, b) => b.score - a.score)
    out.push({ region, name: REGION_NAME.get(region) ?? region, bestScore: sites[0]!.score, sites })
  }
  out.sort((a, b) => b.bestScore - a.bestScore)
  return out
}
