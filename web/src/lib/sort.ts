import type { Window } from '../../../src/core/types'

/**
 * The "Next windows" side panel lists best-first, ties broken by soonest start (spec 05). Dates are
 * zero-padded UTC YYYY-MM-DD, so lexical comparison is chronological. Returns a new array.
 */
export function sortWindows(windows: readonly Window[]): Window[] {
  // toSorted() would be cleaner but isn't in the worker/test ES2022 lib these helpers are also
  // type-checked under; the spread already makes this immutable.
  // eslint-disable-next-line react-doctor/js-tosorted-immutable
  return [...windows].sort((a, b) => b.score - a.score || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}
