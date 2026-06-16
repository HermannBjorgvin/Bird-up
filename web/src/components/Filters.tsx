import type { CSSProperties } from 'react'
import { formatDuration } from '../lib/format'
import type { FilterCapabilities, FilterState } from '../lib/filters'

interface Props {
  filters: FilterState
  onChange: (next: FilterState) => void
  capabilities: FilterCapabilities
  minDays: number
  onMinDays: (days: number) => void
  includeBirds: boolean
  onIncludeBirds: (next: boolean) => void
}

/** The filled fraction of a range slider as a `--pct` CSS var, read by the gold-fill gradient (index.css). */
function fillPct(value: number, min: number, max: number): CSSProperties {
  const denom = max - min
  const pct = denom <= 0 ? 100 : ((value - min) / denom) * 100
  return { '--pct': `${pct}%` } as CSSProperties
}

/**
 * Filters above the recommended list (spec 05), in order: minimum trip length (the one scoring
 * override — re-queries the API), max-drive-from-Reykjavík, then a family-car toggle (both of those
 * client-side). The drive/family controls only render when the loaded campsite data carries that
 * attribute, so they're never a dead no-op before the enriched refresh lands; min trip length is
 * always available. The filtering itself is in lib/filters.ts / the App fetch — these only drive state.
 */
export function Filters({ filters, onChange, capabilities, minDays, onMinDays, includeBirds, onIncludeBirds }: Props) {
  // Round the upper bound up to a whole 30-min step; the rightmost position means "no limit".
  const sliderMax = Math.max(30, Math.ceil(capabilities.maxDriveMinutes / 30) * 30)
  const sliderValue = filters.maxDriveMinutes ?? sliderMax
  const noLimit = filters.maxDriveMinutes === null

  return (
    <div className="filters">
      <label className="filters__range">
        <span className="filters__range-head">
          <span>Min trip length</span>
          <span className="filters__range-val">{minDays}d</span>
        </span>
        <input
          type="range"
          aria-label="Minimum trip length in days"
          min={1}
          max={7}
          step={1}
          value={minDays}
          style={fillPct(minDays, 1, 7)}
          onChange={(e) => onMinDays(Number(e.target.value))}
        />
      </label>

      {capabilities.hasDriveTimes && (
        <label className="filters__range">
          <span className="filters__range-head">
            <span>Max drive from Reykjavík</span>
            <span className="filters__range-val">{noLimit ? 'No limit' : `≤ ${formatDuration(sliderValue)}`}</span>
          </span>
          <input
            type="range"
            aria-label="Maximum drive time from Reykjavík"
            min={30}
            max={sliderMax}
            step={30}
            value={sliderValue}
            style={fillPct(sliderValue, 30, sliderMax)}
            onChange={(e) => {
              const v = Number(e.target.value)
              onChange({ ...filters, maxDriveMinutes: v >= sliderMax ? null : v })
            }}
          />
        </label>
      )}

      {capabilities.hasOffroad && (
        <label className="filters__toggle">
          <input
            type="checkbox"
            checked={filters.familyCarOnly}
            onChange={(e) => onChange({ ...filters, familyCarOnly: e.target.checked })}
          />
          <span>Family-car accessible only</span>
        </label>
      )}

      {/* The notable-birds overlay (eBird). On by default; toggling re-queries with/without include_birds. */}
      <label className="filters__toggle">
        <input type="checkbox" checked={includeBirds} onChange={(e) => onIncludeBirds(e.target.checked)} />
        <span>Notable bird sightings nearby</span>
      </label>
    </div>
  )
}
