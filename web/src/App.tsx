import { useEffect, useReducer, useState } from 'react'
import { ApiError, fetchCampsites, fetchWindows } from './api/client'
import type { Campsite, Recommendation, Window } from '../../src/core/types'
import { MapView } from './components/MapView'
import { WindowsPanel } from './components/WindowsPanel'
import { DateControls } from './components/DateControls'
import { ThresholdSliders } from './components/ThresholdSliders'
import { Footer } from './components/Footer'
import { defaultRange } from './lib/dates'
import { buildMarkers } from './lib/markers'
import { THRESHOLD_DEFAULTS, type ThresholdValues, toOverrides } from './lib/overrides'

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
  const [range, setRange] = useState<Range>(() => defaultRange(new Date()))
  const [thresholds, setThresholds] = useState<ThresholdValues>(THRESHOLD_DEFAULTS)
  const [campsites, setCampsites] = useState<Campsite[]>([])
  const [data, dispatch] = useReducer(dataReducer, { rec: null, status: 'loading', error: null })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { rec } = data
  const overrides = toOverrides(thresholds)
  const dirty = overrides !== undefined
  const markers = buildMarkers(campsites, rec)
  const selectedWindow: Window | null = rec?.windows.find((w) => w.id === selectedId) ?? null
  const isCustomResponse = rec?.policyVersion.endsWith('+custom') ?? false

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

  // Re-query windows whenever the range or thresholds change (debounced). Depend on the stable state
  // objects (range, thresholds) — not the derived `overrides`, whose fresh identity each render would
  // otherwise re-arm the timer on every loading/ready render and loop. `overrides` is recomputed
  // inside the timer. setState happens only in the async timer/promise callbacks.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      dispatch({ type: 'loading' })
      fetchWindows({ start_date: range.start, end_date: range.end, thresholds: toOverrides(thresholds) })
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
  }, [range, thresholds])

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
        <MapView markers={markers} selectedWindow={selectedWindow} />
        <aside className="panel">
          {data.status === 'loading' && <p className="status">Loading…</p>}
          {data.status === 'error' && <p className="status error">Couldn’t load windows: {data.error}</p>}
          <WindowsPanel
            windows={rec?.windows ?? []}
            selectedId={selectedId}
            onSelect={(w) => setSelectedId(w?.id ?? null)}
          />
        </aside>
      </div>

      <div className="controls">
        <DateControls start={range.start} end={range.end} onChange={setRange} />
        <ThresholdSliders
          values={thresholds}
          dirty={dirty}
          onChange={setThresholds}
          onReset={() => setThresholds(THRESHOLD_DEFAULTS)}
        />
        {isCustomResponse && <span className="custom-badge">custom policy</span>}
      </div>

      <Footer attribution={rec?.attribution ?? []} policyVersion={rec?.policyVersion ?? null} />
    </>
  )
}

export default App
