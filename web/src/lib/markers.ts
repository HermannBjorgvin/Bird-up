import type { Campsite, Recommendation, Window } from '../../../src/core/types'

/**
 * The map shows every campsite (spec 05); a site's marker color comes from its best window score in
 * the current range (grey when it falls in no qualifying window). This folds the windows response
 * into a per-campsite best score + window so the marker layer and popups can render in one pass.
 */
export interface CampsiteMarker {
  campsite: Campsite
  bestScore: number | null
  bestWindow: Window | null
}

export function buildMarkers(campsites: readonly Campsite[], rec: Recommendation | null): CampsiteMarker[] {
  const best = new Map<string, { score: number; window: Window }>()
  if (rec) {
    for (const w of rec.windows) {
      for (const c of w.campsites) {
        const prev = best.get(c.id)
        if (!prev || c.score > prev.score) best.set(c.id, { score: c.score, window: w })
      }
    }
  }
  return campsites.map((campsite) => {
    const b = best.get(campsite.id)
    return { campsite, bestScore: b?.score ?? null, bestWindow: b?.window ?? null }
  })
}
