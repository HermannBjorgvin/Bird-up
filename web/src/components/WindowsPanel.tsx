import type { Region, Window } from '../../../src/core/types'
import { formatRange } from '../lib/dates'
import { tierScore } from '../lib/format'
import { peakTempRange, type PlaceGroup } from '../lib/grouping'

// Categorical tier dots in the design-system palette: moss-green (excellent) → olive (good) →
// warm khaki-brown (marginal). Distinct from the slate "no qualifying window" cue.
const TIER_COLOR: Record<Window['tier'], string> = {
  excellent: '#5d7d3a',
  good: '#8b9b45',
  marginal: '#a98f6f',
}

export type Selection = { kind: 'place'; region: Region } | { kind: 'site'; id: string }

interface Props {
  groups: PlaceGroup[]
  shown: number
  total: number
  hasHidden: boolean
  showAll: boolean
  onToggleShowAll: () => void
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
}

/**
 * The side panel (spec 05): recommended campsites grouped under their placename anchor, each site shown
 * once at its single best window with its tier word + score (e.g. "marginal 26/100"). The weak tail is
 * hidden by default; a toggle reveals every site. Clicking a placename focuses the map on that area;
 * clicking a site focuses that one marker. Best-scoring area first; best-scoring site first within an area.
 */
export function WindowsPanel({ groups, shown, total, hasHidden, showAll, onToggleShowAll, selection, onSelect }: Props) {
  return (
    <section className="windows">
      <h2>Recommended campsites ({shown === total ? total : `${shown} of ${total}`})</h2>
      {groups.length === 0 && (
        <p className="status">No camping windows in this range: try widening the dates or lowering the minimum trip length.</p>
      )}
      {groups.map((g) => (
        <PlaceGroupBlock key={g.region} group={g} selection={selection} onSelect={onSelect} />
      ))}
      {hasHidden && (
        <button type="button" className="windows__toggle" onClick={onToggleShowAll}>
          {showAll ? 'Show top windows' : `Show all ${total}, incl. weaker windows`}
        </button>
      )}
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
        <span className="place-group__score">{tierScore(headerTier, group.bestScore)}</span>
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
                  {formatRange(s.window.start, s.window.end)} · {peakTempRange(s.window)} · {tierScore(s.window.tier, s.score)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
