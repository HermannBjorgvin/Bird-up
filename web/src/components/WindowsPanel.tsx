import type { Region, Window } from '../../../src/core/types'
import { formatRange } from '../lib/dates'
import { groupByPlace, peakTempRange, type PlaceGroup } from '../lib/grouping'
import type { Recommendation } from '../../../src/core/types'

const TIER_COLOR: Record<Window['tier'], string> = {
  excellent: '#15803d',
  good: '#65a30d',
  marginal: '#9ca3af',
}

export type Selection = { kind: 'place'; region: Region } | { kind: 'site'; id: string }

interface Props {
  rec: Recommendation | null
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
}

/**
 * The side panel (spec 05): recommended campsites grouped under their placename anchor, each site
 * shown once at its single best window. Clicking a placename focuses the map on that area; clicking a
 * site focuses that one marker. Best-scoring area first; best-scoring site first within an area.
 */
export function WindowsPanel({ rec, selection, onSelect }: Props) {
  const groups = groupByPlace(rec)
  const siteCount = groups.reduce((n, g) => n + g.sites.length, 0)

  return (
    <section className="windows">
      <h2>Recommended campsites ({siteCount})</h2>
      {groups.length === 0 && (
        <p className="status">No camping windows in this range: try widening the dates or lowering the minimum trip length.</p>
      )}
      {groups.map((g) => (
        <PlaceGroupBlock key={g.region} group={g} selection={selection} onSelect={onSelect} />
      ))}
    </section>
  )
}

function PlaceGroupBlock({ group, selection, onSelect }: { group: PlaceGroup } & Pick<Props, 'selection' | 'onSelect'>) {
  const placeSelected = selection?.kind === 'place' && selection.region === group.region
  const headerTier = group.sites[0]!.window.tier

  return (
    <div className="place-group">
      <button
        type="button"
        className="place-group__header"
        aria-pressed={placeSelected}
        onClick={() => onSelect(placeSelected ? null : { kind: 'place', region: group.region })}
      >
        <span className="tier-dot" style={{ background: TIER_COLOR[headerTier] }} />
        <span className="place-group__name">{group.name}</span>
        <span className="place-group__score">{Math.round(group.bestScore)}</span>
      </button>
      <ul className="place-group__sites">
        {group.sites.map((s) => {
          const siteSelected = selection?.kind === 'site' && selection.id === s.campsite.id
          return (
            <li key={s.campsite.id}>
              <button
                type="button"
                className="site-row"
                aria-pressed={siteSelected}
                onClick={() => onSelect(siteSelected ? null : { kind: 'site', id: s.campsite.id })}
              >
                <span className="site-row__name">{s.campsite.name}</span>
                <span className="site-row__meta">
                  {formatRange(s.window.start, s.window.end)} · {peakTempRange(s.window)} · {Math.round(s.score)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
