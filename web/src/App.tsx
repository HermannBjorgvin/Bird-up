import { useEffect, useReducer, useState } from 'react'
import { ApiError, fetchCampsites, fetchWindows } from './api/client'
import type { Campsite, Recommendation } from '../../src/core/types'
import { MapView, type MapFocus } from './components/MapView'
import { WindowsPanel, type Selection } from './components/WindowsPanel'
import { Filters } from './components/Filters'
import { Timeline } from './components/Timeline'
import { Footer } from './components/Footer'
import { ThemeToggle } from './components/ThemeToggle'
import { Tent } from 'lucide-react'
import { defaultRange } from './lib/dates'
import { curateGroups, groupByPlace, type PlaceGroup } from './lib/grouping'
import { buildMarkers } from './lib/markers'
import { filterCapabilities, FILTER_DEFAULTS, passingIds, type FilterState } from './lib/filters'
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
// Two window sets (spec 05 fetch model): `horizon` is the full forecast — it always feeds the bar.
// `range` is the brushed sub-range, re-queried server-side so windows are clipped to the brush with
// per-site-accurate scores; it feeds the sidebar + map. `range` is null when the brush spans the whole
// horizon (then the sidebar reuses `horizon`, so no redundant fetch).
type Data = { horizon: Recommendation | null; range: Recommendation | null; error: string | null }
type DataAction =
  | { type: 'horizonReady'; rec: Recommendation }
  | { type: 'rangeReady'; rec: Recommendation }
  | { type: 'rangeCleared' }
  | { type: 'error'; error: string }

function dataReducer(state: Data, action: DataAction): Data {
  switch (action.type) {
    case 'horizonReady':
      return { ...state, horizon: action.rec, error: null }
    case 'rangeReady':
      return { ...state, range: action.rec, error: null }
    case 'rangeCleared':
      return { ...state, range: null }
    case 'error':
      return { ...state, error: action.error }
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
  const [data, dispatch] = useReducer(dataReducer, { horizon: null, range: null, error: null })
  // Panel view state grab-bag — selection, the "show all" curation toggle and the campsite filters —
  // held in one object to keep the useState count under the prefer-useReducer threshold.
  const [view, setView] = useState<{ selection: Selection | null; showAll: boolean; filters: FilterState }>({
    selection: null,
    showAll: false,
    filters: FILTER_DEFAULTS,
  })
  const { selection, showAll, filters } = view
  // On mobile the results sit below the map, so scroll the highlighted map back into view on select.
  const handleSelect = (selection: Selection | null) => {
    setView((v) => ({ ...v, selection }))
    if (selection !== null && window.matchMedia('(max-width: 720px)').matches) {
      document.querySelector('.map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
  const toggleShowAll = () => setView((v) => ({ ...v, showAll: !v.showAll }))
  const setFilters = (next: FilterState) => setView((v) => ({ ...v, filters: next }))

  // Sidebar + map read the brushed set (server-clipped to the brush); the bar reads the full horizon.
  // Before the first brush they're the same fetch, so `range` is null and the sidebar reuses `horizon`.
  const sidebarRec = data.range ?? data.horizon
  const keepIds = passingIds(campsites, filters)
  const baseCampsites = keepIds ? campsites.filter((c) => keepIds.has(c.id)) : campsites
  // Campsite filters (family-car / drive cap) narrow both the base layer and each window's campsites;
  // a window left with no passing site drops out (so the map + sidebar agree on what's reachable).
  const filtered = sidebarRec
    ? {
        ...sidebarRec,
        windows: (keepIds
          ? sidebarRec.windows.map((w) => ({ ...w, campsites: w.campsites.filter((c) => keepIds.has(c.id)) }))
          : sidebarRec.windows
        ).filter((w) => w.campsites.length > 0),
      }
    : null
  const markers = buildMarkers(baseCampsites, filtered)
  const allGroups = groupByPlace(filtered)
  const curated = curateGroups(allGroups, showAll) // default hides the weak tail; toggle reveals all
  const focus = deriveFocus(allGroups, selection) // focus over the full set, not just the curated view
  const capabilities = filterCapabilities(campsites)
  // The bar always paints the whole forecast (never clipped to the brush), but reacts to the campsite
  // filters: a window whose sites are all filtered out stops contributing heat, so days only good at
  // far-away/offroad sites cool down on the bar too.
  const barWindows = data.horizon
    ? keepIds
      ? data.horizon.windows.filter((w) => w.campsites.some((c) => keepIds.has(c.id)))
      : data.horizon.windows
    : []

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

  // Full-horizon fetch — the bar's source. Re-queries only when `minDays` changes (the horizon range
  // is otherwise fixed). Depend on the stable primitives, not the derived `overrides` object (its fresh
  // identity each render would loop); recompute `overrides` inside the effect.
  useEffect(() => {
    let cancelled = false
    fetchWindows({ start_date: horizon.start, end_date: horizon.end, thresholds: toOverrides(thresholds) })
      .then((r) => {
        if (!cancelled) dispatch({ type: 'horizonReady', rec: r })
      })
      .catch((err: unknown) => {
        if (!cancelled) dispatch({ type: 'error', error: err instanceof ApiError ? err.message : 'network error' })
      })
    return () => {
      cancelled = true
    }
  }, [horizon.start, horizon.end, thresholds])

  // Brushed fetch — the sidebar/map source, server-clipped to the selected sub-range with per-site
  // scores. Debounced so a drag doesn't fire per pixel. When the brush spans the whole horizon there's
  // nothing extra to fetch — clear `range` and let the sidebar reuse the horizon result.
  useEffect(() => {
    if (selected.start === horizon.start && selected.end === horizon.end) {
      dispatch({ type: 'rangeCleared' })
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      fetchWindows({ start_date: selected.start, end_date: selected.end, thresholds: toOverrides(thresholds) })
        .then((r) => {
          if (!cancelled) dispatch({ type: 'rangeReady', rec: r })
        })
        .catch((err: unknown) => {
          if (!cancelled) dispatch({ type: 'error', error: err instanceof ApiError ? err.message : 'network error' })
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [selected.start, selected.end, horizon.start, horizon.end, thresholds])

  return (
    <>
      <header className="app__header">
        <div className="app__titles">
          <h1>
            <Tent className="app__logo" size={20} aria-hidden="true" /> Tjaldur
          </h1>
          <p className="pitch">
            Warm, calm and dry camping windows in Iceland’s two-week forecast, and the campsites inside them.
          </p>
        </div>
        <ThemeToggle />
      </header>

      {(data.horizon?.warnings ?? []).map((w) => (
        <div className="banner" key={w}>
          ⚠ {w}
        </div>
      ))}

      <div className="app__body">
        <MapView markers={markers} focus={focus} />
        <aside className="panel">
          {sidebarRec === null && data.error === null && <p className="status">Loading…</p>}
          {data.error !== null && <p className="status error">Couldn’t load windows: {data.error}</p>}
          <Filters
            filters={filters}
            onChange={setFilters}
            capabilities={capabilities}
            minDays={thresholds.minDays}
            onMinDays={(minDays) => setThresholds({ minDays })}
          />
          <WindowsPanel
            groups={curated.groups}
            shown={curated.shown}
            total={curated.total}
            hasHidden={curated.hasHidden}
            showAll={showAll}
            onToggleShowAll={toggleShowAll}
            selection={selection}
            onSelect={handleSelect}
          />
        </aside>
      </div>

      <Timeline windows={barWindows} horizon={horizon} selected={selected} onSelect={setSelected} />

      <Footer attribution={data.horizon?.attribution ?? []} />
    </>
  )
}

export default App
