import { formatDuration } from '../lib/format'
import type { FilterCapabilities, FilterState } from '../lib/filters'

interface Props {
  filters: FilterState
  onChange: (next: FilterState) => void
  capabilities: FilterCapabilities
}

/**
 * Campsite filters above the recommended list (spec 05): a family-car toggle (hide F-road/4x4-only
 * highland sites) and a max-drive-from-Reykjavík slider. Each control only renders when the data
 * actually carries that attribute, so neither is a dead no-op before the enriched refresh lands. The
 * filtering itself is client-side (lib/filters.ts) — these inputs just drive the FilterState.
 */
export function Filters({ filters, onChange, capabilities }: Props) {
  if (!capabilities.hasOffroad && !capabilities.hasDriveTimes) return null

  // Round the upper bound up to a whole 30-min step; the rightmost position means "no limit".
  const sliderMax = Math.max(30, Math.ceil(capabilities.maxDriveMinutes / 30) * 30)
  const sliderValue = filters.maxDriveMinutes ?? sliderMax
  const noLimit = filters.maxDriveMinutes === null

  return (
    <div className="filters">
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

      {capabilities.hasDriveTimes && (
        <label className="filters__drive">
          <span className="filters__drive-head">
            <span>Max drive from Reykjavík</span>
            <span className="filters__drive-val">{noLimit ? 'No limit' : `≤ ${formatDuration(sliderValue)}`}</span>
          </span>
          <input
            type="range"
            aria-label="Maximum drive time from Reykjavík"
            min={30}
            max={sliderMax}
            step={30}
            value={sliderValue}
            onChange={(e) => {
              const v = Number(e.target.value)
              onChange({ ...filters, maxDriveMinutes: v >= sliderMax ? null : v })
            }}
          />
        </label>
      )}
    </div>
  )
}
