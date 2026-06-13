import { useEffect, useReducer, useState } from 'react'
import { ApiError, fetchCampsites, fetchWindows } from './api/client'
import type { Campsite, Recommendation } from '../../src/core/types'
import { MapView, type MapFocus } from './components/MapView'
import { WindowsPanel, type Selection } from './components/WindowsPanel'
import { Timeline } from './components/Timeline'
import { Footer } from './components/Footer'
import { defaultRange } from './lib/dates'
import { groupByPlace, type PlaceGroup } from './lib/grouping'
import { buildMarkers } from './lib/markers'
import { windowsInRange } from './lib/timeline'
import { THRESHOLD_DEFAULTS, type ThresholdValues, toOverrides } from './lib/overrides'

/** Project the panel selection onto the map: markers to highlight + the points to fit bounds to. */
function deriveFocus(groups: PlaceGroup[], selection: Selection | null): MapFocus | null {
  if (selection === null) return null
  if (selection.kind === 'place') {
    const group = groups.find((g) => g.region === selection.region)
    if (!group) return null
    return {
      ids: new Set(group.sites.map((s) => s.campsite.id)),
      points: group.sites.map((s) => [s.campsite.lat, s.campsite.lng] as [number, number]),
    }
  }
  const row = groups.flatMap((g) => g.sites).find((s) => s.campsite.id === selection.id)
  if (row) return { ids: new Set([row.campsite.id]), points: [[row.campsite.lat, row.campsite.lng]] }
  return null
}

type Range = { start: string; end: string }
type Status = 'loading' | 'ready' | 'error'
type Data = { rec: Recommendation | null; status: Status; error: string | null }
type DataAction = { type: 'loading' } | { type: 'ready'; rec: Recommendation } | { type: 'error'; error: string }

function dataReducer(state: Data, action: DataAction): Data {
  switch (action.type) {
    case 'loading':
      return { ...state, status: 'loading' }
    case 'ready':
      return { rec: action.rec, status: 'ready', error: null }
    case 'error':
      return { ...state, status: 'error', error: action.error }
  }
}

function App() {
  // `horizon` is the full forecast look-ahead we always fetch; `selected` is the brush sub-range the
  // timeline handles set. Held together so `horizon`'s identity stays stable across brush moves (the
  // fetch effect keys off it). The brush filters map + sidebar client-side — it never re-queries.
  const [dates, setDates] = useState<{ horizon: Range; selected: Range }>(() => {
    const full = defaultRange(new Date())
    return { horizon: full, selected: full }
  })
  const { horizon, selected } = dates
  const setSelected = (next: Range) => setDates((d) => ({ horizon: d.horizon, selected: next }))

  const [thresholds, setThresholds] = useState<ThresholdValues>(THRESHOLD_DEFAULTS)
  const [campsites, setCampsites] = useState<Campsite[]>([])
  const [data, dispatch] = useReducer(dataReducer, { rec: null, status: 'loading', error: null })
  const [selection, setSelection] = useState<Selection | null>(null)

  const { rec } = data
  // The brush narrows map + sidebar together; the timeline bar still gets the full window set.
  const visible = rec ? { ...rec, windows: windowsInRange(rec.windows, selected) } : null
  const markers = buildMarkers(campsites, visible)
  const groups = groupByPlace(visible)
  const focus = deriveFocus(groups, selection)

  // Load the campsite base layer once (every site shows; window scores color it).
  useEffect(() => {
    let cancelled = false
    fetchCampsites()
      .then((list) => {
        if (!cancelled) setCampsites(list.sites)
      })
      .catch(() => {
        /* campsites unavailable (pre-first-refresh): the map still renders window campsites */
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Fetch the whole horizon (debounced); the brush filters client-side, so this re-queries only when
  // `thresholds` (minDays) changes — `horizon`'s identity is stable across brush moves. Depend on the
  // stable state, not the derived `overrides` (its fresh identity each render would loop); recompute
  // `overrides` inside the timer. setState happens only in the async timer/promise callbacks.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      dispatch({ type: 'loading' })
      fetchWindows({ start_date: horizon.start, end_date: horizon.end, thresholds: toOverrides(thresholds) })
        .then((r) => {
          if (!cancelled) dispatch({ type: 'ready', rec: r })
        })
        .catch((err: unknown) => {
          if (!cancelled) dispatch({ type: 'error', error: err instanceof ApiError ? err.message : 'network error' })
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [horizon, thresholds])

  return (
    <>
      <header className="app__header">
        <h1>Tjaldur</h1>
        <p className="pitch">
          Warm, calm and dry camping windows in Iceland’s 16-day forecast, and the campsites inside them.
        </p>
      </header>

      {(rec?.warnings ?? []).map((w) => (
        <div className="banner" key={w}>
          ⚠ {w}
        </div>
      ))}

      <div className="app__body">
        <MapView markers={markers} focus={focus} />
        <aside className="panel">
          {data.status === 'loading' && <p className="status">Loading…</p>}
          {data.status === 'error' && <p className="status error">Couldn’t load windows: {data.error}</p>}
          <WindowsPanel rec={visible} selection={selection} onSelect={setSelection} />
        </aside>
      </div>

      <Timeline
        windows={rec?.windows ?? []}
        horizon={horizon}
        selected={selected}
        onSelect={setSelected}
        minDays={thresholds.minDays}
        onMinDays={(minDays) => setThresholds({ minDays })}
      />

      <Footer attribution={rec?.attribution ?? []} policyVersion={rec?.policyVersion ?? null} />
    </>
  )
}

export default App
