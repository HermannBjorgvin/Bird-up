import { Fragment } from 'react'
import type { ThresholdValues } from '../lib/overrides'

interface Field {
  key: keyof ThresholdValues
  label: string
  min: number
  max: number
  step: number
  unit: string
}

// 1:1 with the overridable policy fields and bounds in spec 02 (the only four the website exposes).
const FIELDS: Field[] = [
  { key: 'minPeakTempC', label: 'Min peak temp', min: 5, max: 30, step: 1, unit: '°C' },
  { key: 'minDays', label: 'Min days', min: 1, max: 7, step: 1, unit: 'd' },
  { key: 'maxRainMm', label: 'Max rain', min: 0, max: 50, step: 1, unit: 'mm' },
  { key: 'maxGustsKmh', label: 'Max gusts', min: 0, max: 150, step: 5, unit: 'km/h' },
]

interface Props {
  values: ThresholdValues
  dirty: boolean
  onChange: (values: ThresholdValues) => void
  onReset: () => void
}

/** Collapsible threshold sliders bound to the spec-02 override fields, plus reset-to-defaults (spec 05). */
export function ThresholdSliders({ values, dirty, onChange, onReset }: Props) {
  return (
    <details className="thresholds" open={dirty}>
      <summary>⚙ Thresholds{dirty ? ' (custom)' : ''}</summary>
      <div className="thresholds__grid">
        {FIELDS.map((f) => (
          <Fragment key={f.key}>
            <label htmlFor={`th-${f.key}`}>{f.label}</label>
            <input
              id={`th-${f.key}`}
              type="range"
              aria-label={f.label}
              min={f.min}
              max={f.max}
              step={f.step}
              value={values[f.key]}
              onChange={(e) => onChange({ ...values, [f.key]: Number(e.target.value) })}
            />
            <span className="val">
              {values[f.key]}
              {f.unit}
            </span>
          </Fragment>
        ))}
      </div>
      <button type="button" onClick={onReset} disabled={!dirty}>
        Reset to defaults
      </button>
    </details>
  )
}
