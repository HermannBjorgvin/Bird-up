import type { Campsite } from '../../../src/core/types'

/**
 * Campsite-level filters (spec 05) layered on top of the weather windows: hide sites a normal family
 * car can't reach (`offroad`), and cap the drive from Reykjavík (`driveMinutesFromReykjavik`).
 * Both are static per-site attributes, so filtering is client-side — no re-query, instant like the
 * date brush. The website invents no scoring; it only narrows the set the API already returned.
 */
export interface FilterState {
  familyCarOnly: boolean // exclude sites flagged offroad
  maxDriveMinutes: number | null // null = no limit
}

export const FILTER_DEFAULTS: FilterState = { familyCarOnly: true, maxDriveMinutes: null }

export function isFilterActive(f: FilterState): boolean {
  return f.familyCarOnly || f.maxDriveMinutes !== null
}

/** Does a campsite pass the active filters? Unknown attributes are treated conservatively (see below). */
export function passesFilters(c: Campsite, f: FilterState): boolean {
  // offroad is only set on flagged highland sites; absent ⇒ family-car accessible (passes).
  if (f.familyCarOnly && c.offroad) return false
  // Under a drive cap, a site with no baked time is "unknown distance" — excluded rather than guessed.
  if (f.maxDriveMinutes !== null) {
    if (c.driveMinutesFromReykjavik === undefined) return false
    if (c.driveMinutesFromReykjavik > f.maxDriveMinutes) return false
  }
  return true
}

/**
 * Ids of campsites passing the filters, or `null` when no filter is active so the caller can skip the
 * narrowing entirely (every site shows). Built from the full `/api/campsites` list, which is the only
 * place the new attributes live — window campsites are then narrowed by id membership.
 */
export function passingIds(campsites: readonly Campsite[], f: FilterState): Set<string> | null {
  if (!isFilterActive(f)) return null
  const ids = new Set<string>()
  for (const c of campsites) if (passesFilters(c, f)) ids.add(c.id)
  return ids
}

/** Whether the data carries each attribute at all — gates the controls so neither is a dead no-op. */
export interface FilterCapabilities {
  hasDriveTimes: boolean
  hasOffroad: boolean
  maxDriveMinutes: number // longest known drive, the drive slider's upper bound
}

export function filterCapabilities(campsites: readonly Campsite[]): FilterCapabilities {
  let hasDriveTimes = false
  let hasOffroad = false
  let maxDriveMinutes = 0
  for (const c of campsites) {
    if (c.driveMinutesFromReykjavik !== undefined) {
      hasDriveTimes = true
      if (c.driveMinutesFromReykjavik > maxDriveMinutes) maxDriveMinutes = c.driveMinutesFromReykjavik
    }
    if (c.offroad) hasOffroad = true
  }
  return { hasDriveTimes, hasOffroad, maxDriveMinutes }
}
