import type { Window } from '../../../src/core/types'
import { formatRange } from '../lib/dates'
import { sortWindows } from '../lib/sort'

const TIER_COLOR: Record<Window['tier'], string> = {
  excellent: '#15803d',
  good: '#65a30d',
  marginal: '#9ca3af',
}

interface Props {
  windows: Window[]
  selectedId: string | null
  onSelect: (window: Window | null) => void
}

/** The "Next windows" side panel (spec 05): best-first list; clicking a card zooms/filters the map. */
export function WindowsPanel({ windows, selectedId, onSelect }: Props) {
  const sorted = sortWindows(windows)
  return (
    <section className="windows">
      <h2>Next windows ({sorted.length})</h2>
      {sorted.length === 0 && (
        <p className="status">No camping windows in this range: try widening the dates or loosening the thresholds.</p>
      )}
      {sorted.map((w) => {
        const selected = w.id === selectedId
        return (
          <button
            key={w.id}
            type="button"
            className="window-card"
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : w)}
          >
            <span className="window-card__top">
              <span className="window-card__region">{w.region}</span>
              <span className="window-card__score">{Math.round(w.score)}</span>
            </span>
            <span className="window-card__meta">
              <span className="tier-dot" style={{ background: TIER_COLOR[w.tier] }} />
              {formatRange(w.start, w.end)} · {w.days}d · {w.tier} · {w.confidence} confidence · {w.campsites.length} sites
            </span>
          </button>
        )
      })}
    </section>
  )
}
