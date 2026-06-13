import type { RangePreset } from '../lib/dates'
import { presetRange } from '../lib/dates'

interface Props {
  start: string
  end: string
  onChange: (range: { start: string; end: string }) => void
}

/** Date-range control with "next week" / "next 2 weeks" presets (spec 05). All dates are UTC YYYY-MM-DD. */
export function DateControls({ start, end, onChange }: Props) {
  // Reading the clock in a click handler (not during render) — no hydration concern in this SPA.
  const selectPreset = (preset: RangePreset) => onChange(presetRange(preset, new Date()))

  return (
    <div className="controls__dates">
      <label>
        From
        <input type="date" value={start} max={end} onChange={(e) => onChange({ start: e.target.value, end })} />
      </label>
      <label>
        To
        <input type="date" value={end} min={start} onChange={(e) => onChange({ start, end: e.target.value })} />
      </label>
      <span className="presets">
        <button type="button" onClick={() => selectPreset('week')}>
          Next week
        </button>
        <button type="button" onClick={() => selectPreset('two-weeks')}>
          Next 2 weeks
        </button>
      </span>
    </div>
  )
}
