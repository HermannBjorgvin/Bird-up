import type { ThresholdValues } from '../lib/overrides'

interface Props {
  values: ThresholdValues
  dirty: boolean
  onChange: (values: ThresholdValues) => void
  onReset: () => void
}

/** The single filter (spec 05/02): minimum trip length in days (1–7), collapsible, with reset. */
export function ThresholdSliders({ values, dirty, onChange, onReset }: Props) {
  return (
    <details className="thresholds" open={dirty}>
      <summary>⚙ Filter{dirty ? ' (custom)' : ''}</summary>
      <div className="thresholds__grid">
        <label htmlFor="th-minDays">Min trip length</label>
        <input
          id="th-minDays"
          type="range"
          aria-label="Minimum trip length in days"
          min={1}
          max={7}
          step={1}
          value={values.minDays}
          onChange={(e) => onChange({ minDays: Number(e.target.value) })}
        />
        <span className="val">{values.minDays}d</span>
      </div>
      <button type="button" onClick={onReset} disabled={!dirty}>
        Reset to default
      </button>
    </details>
  )
}
