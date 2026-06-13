import type { ThresholdOverrides } from '../api/client'

/**
 * The website's single filter (spec 05 → spec 02): the minimum window length in days. The default
 * mirrors `DEFAULT_POLICY.minDays` (the API re-validates and stays the source of truth), so an
 * untouched panel sends no override and the response keeps the base `policyVersion`.
 */
export interface ThresholdValues {
  minDays: number
}

export const THRESHOLD_DEFAULTS: ThresholdValues = {
  minDays: 3,
}

/** Map the slider value to the API `thresholds` shape, omitting it when still at the default. */
export function toOverrides(v: ThresholdValues): ThresholdOverrides | undefined {
  return v.minDays === THRESHOLD_DEFAULTS.minDays ? undefined : { minDays: v.minDays }
}
