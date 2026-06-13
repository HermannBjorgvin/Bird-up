import type { ThresholdOverrides } from '../api/client'

/**
 * The four slider-backed policy fields the website exposes (spec 05 → spec 02 bounds): min peak °C,
 * min days, max rain mm/day, max gusts km/h. Defaults mirror `DEFAULT_POLICY` (the API re-validates
 * and remains the source of truth). Only fields that differ from the defaults are sent as overrides,
 * so an untouched panel stays a plain GET and the response keeps the base `policyVersion`.
 */
export interface ThresholdValues {
  minPeakTempC: number
  minDays: number
  maxRainMm: number
  maxGustsKmh: number
}

export const THRESHOLD_DEFAULTS: ThresholdValues = {
  minPeakTempC: 18,
  minDays: 2,
  maxRainMm: 8,
  maxGustsKmh: 65,
}

/** Map slider values to the API `thresholds` shape, omitting any field still at its default. */
export function toOverrides(v: ThresholdValues): ThresholdOverrides | undefined {
  const hardFloor: { minDays?: number; minPeakTempC?: number } = {}
  if (v.minPeakTempC !== THRESHOLD_DEFAULTS.minPeakTempC) hardFloor.minPeakTempC = v.minPeakTempC
  if (v.minDays !== THRESHOLD_DEFAULTS.minDays) hardFloor.minDays = v.minDays

  const o: ThresholdOverrides = {}
  if (Object.keys(hardFloor).length > 0) o.hardFloor = hardFloor
  if (v.maxRainMm !== THRESHOLD_DEFAULTS.maxRainMm) o.precip = { hardMaxMmDay: v.maxRainMm }
  if (v.maxGustsKmh !== THRESHOLD_DEFAULTS.maxGustsKmh) o.gusts = { hardMaxKmh: v.maxGustsKmh }

  return Object.keys(o).length > 0 ? o : undefined
}
