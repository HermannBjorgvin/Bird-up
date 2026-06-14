import { useEffect, useRef } from 'react'
// Default import (not `* as L`): leaflet is CJS, and leaflet.markercluster patches that mutable module
// object. With a namespace import the bundler hands us a frozen copy the plugin's patch never reaches,
// so `L.markerClusterGroup` is missing in the production build (it works in dev only by pre-bundling).
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import type { Facilities } from '../../../src/core/types'
import { scoreToColor } from '../lib/color'
import { formatDay, formatRange } from '../lib/dates'
import { tierScore } from '../lib/format'
import { svgIcon, type IconName } from '../lib/icons'
import type { CampsiteMarker } from '../lib/markers'

// Iceland fits comfortably at zoom 6 around this center.
const ICELAND_CENTER: L.LatLngTuple = [64.96, -19.0]

/** A panel selection projected onto the map: which markers to highlight, and the points to fit. */
export interface MapFocus {
  ids: Set<string>
  points: L.LatLngTuple[]
}

interface Props {
  markers: CampsiteMarker[]
  focus: MapFocus | null
}

/**
 * Vanilla Leaflet driven imperatively through refs (react-leaflet is not a dependency — spec 08 keeps
 * the stack small). One effect builds the map once; a second rebuilds the circle-marker layer whenever
 * the data or the focus changes, dimming non-focused markers and fitting bounds to the focused points.
 */
export function MapView({ markers, focus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.MarkerClusterGroup | null>(null)
  // The single-site id whose popup we last auto-opened, so a marker rebuild (brush/filter) doesn't
  // re-zoom for the same selection — it just re-opens the popup that clearLayers() closed.
  const openedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return
    const map = L.map(containerRef.current).setView(ICELAND_CENTER, 6)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)
    // Cluster the 244 sites into per-area counts (the bubble tints to the best camping score inside it);
    // they break apart on zoom-in, and overlapping/duplicate sites spiderfy at the deepest zoom.
    layerRef.current = L.markerClusterGroup({
      maxClusterRadius: 50,
      disableClusteringAtZoom: 11,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: clusterIcon,
    }).addTo(map)
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  // Imperative Leaflet sync — rebuild the marker layer when data/selection changes. Not an event
  // handler (it owns no user interaction), so the no-event-handler heuristic is a false positive here.
  /* eslint-disable react-doctor/no-event-handler */
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (map === null || layer === null) return
    layer.clearLayers()

    const built: L.Marker[] = []
    const byId = new Map<string, L.Marker>()
    for (const m of markers) {
      const inFocus = focus === null || focus.ids.has(m.campsite.id)
      const marker = L.marker([m.campsite.lat, m.campsite.lng], {
        icon: campsiteIcon(m.bestScore, inFocus),
      }) as ScoredMarker
      marker.campsiteScore = m.bestScore // read by clusterIcon to tint the bubble
      marker.bindPopup(() => buildPopup(m))
      built.push(marker)
      byId.set(m.campsite.id, marker)
    }
    layer.addLayers(built)

    // A single-site selection (clicking a campsite row) reveals that marker and opens its popup — the
    // sidebar and map agree on what you picked. A placename selection (many sites) just frames them.
    const onlyId = focus && focus.ids.size === 1 ? focus.ids.values().next().value! : null
    const target = onlyId !== null ? byId.get(onlyId) : undefined
    if (onlyId !== null && target) {
      if (openedIdRef.current === onlyId) {
        target.openPopup() // same selection, layer was rebuilt — reopen without disturbing the zoom
      } else {
        // New pick: un-cluster + zoom so the marker is actually on screen, then open its popup.
        layer.zoomToShowLayer(target, () => target.openPopup())
        openedIdRef.current = onlyId
      }
    } else {
      openedIdRef.current = null
      if (focus && focus.points.length > 0) {
        const bounds = L.latLngBounds(focus.points)
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
      }
    }
  }, [markers, focus])
  /* eslint-enable react-doctor/no-event-handler */

  return <div className="map" ref={containerRef} />
}

/** A campsite marker carrying its best score, so a cluster can tint itself to the best site inside it. */
type ScoredMarker = L.Marker & { campsiteScore: number | null }

/** A campsite dot: filled + score-coloured when it has a window, a small hollow ring when it has none. */
function campsiteIcon(score: number | null, inFocus: boolean): L.DivIcon {
  const hasWindow = score !== null
  const size = hasWindow ? (inFocus ? 16 : 12) : 9
  const classes = ['cmark', hasWindow ? 'cmark--scored' : 'cmark--empty']
  if (!inFocus) classes.push('cmark--dim')
  const bg = hasWindow ? `background:${scoreToColor(score)};` : ''
  const html = `<span class="${classes.join(' ')}" style="${bg}width:${size}px;height:${size}px"></span>`
  return L.divIcon({ html, className: 'cmark-wrap', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

/** A cluster bubble: count, tinted to the best child score (grey when nothing inside has a window). */
function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  let best: number | null = null
  for (const c of cluster.getAllChildMarkers()) {
    const s = (c as ScoredMarker).campsiteScore
    if (s !== null && (best === null || s > best)) best = s
  }
  const color = best === null ? '#9ca3af' : scoreToColor(best)
  const html = `<div class="ccluster" style="background:${color}"><span>${cluster.getChildCount()}</span></div>`
  return L.divIcon({ html, className: 'ccluster-wrap', iconSize: [34, 34] })
}

const FACILITY_KEYS: Array<keyof Facilities & IconName> = ['toilets', 'showers', 'water', 'power', 'kitchen']
const FACILITY_LABEL: Record<keyof Facilities & IconName, string> = {
  toilets: 'Toilets',
  showers: 'Showers',
  water: 'Drinking water',
  power: 'Power',
  kitchen: 'Kitchen',
}

/** A weather metric for the daily strip: a lucide glyph + its value (e.g. thermometer + "15°"). */
function metric(icon: IconName, text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'popup__metric'
  span.appendChild(svgIcon(icon, 13))
  const t = document.createElement('span')
  t.textContent = text
  span.appendChild(t)
  return span
}

/** Build the popup as DOM nodes (textContent — never innerHTML — since names come from OSM data). */
function buildPopup(m: CampsiteMarker): HTMLElement {
  const el = document.createElement('div')
  el.className = 'popup'

  const name = document.createElement('div')
  name.className = 'popup__name'
  name.textContent = m.campsite.name
  el.appendChild(name)

  const facs = FACILITY_KEYS.filter((k) => m.campsite.facilities[k] === true)
  if (facs.length > 0) {
    const fac = document.createElement('div')
    fac.className = 'popup__facilities'
    for (const k of facs) {
      const icon = svgIcon(k, 16)
      icon.classList.add('popup__fac')
      const label = FACILITY_LABEL[k]
      icon.setAttribute('aria-label', label)
      const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title')
      titleEl.textContent = label
      icon.insertBefore(titleEl, icon.firstChild)
      fac.appendChild(icon)
    }
    el.appendChild(fac)
  }

  if (m.bestWindow && m.bestScore !== null) {
    const head = document.createElement('div')
    head.className = 'popup__window'
    head.textContent = `${formatRange(m.bestWindow.start, m.bestWindow.end)} · ${tierScore(m.bestWindow.tier, m.bestScore)}`
    el.appendChild(head)

    const strip = document.createElement('div')
    strip.className = 'popup__daily'
    for (const d of m.bestWindow.daily) {
      const day = document.createElement('div')
      day.className = 'popup__day'
      const date = document.createElement('span')
      date.className = 'popup__day-date'
      date.textContent = formatDay(d.date)
      day.appendChild(date)
      day.appendChild(metric('thermometer', `${Math.round(d.tMaxC)}°`))
      day.appendChild(metric('rain', `${d.precipSumMm.toFixed(1)} mm`))
      day.appendChild(metric('wind', `${Math.round(d.gustMaxKmh)} km/h`))
      strip.appendChild(day)
    }
    el.appendChild(strip)
  } else {
    const none = document.createElement('div')
    none.style.cssText = 'font-size:0.78rem;opacity:0.7'
    none.textContent = 'No qualifying window in this range'
    el.appendChild(none)
  }

  if (m.campsite.campingCard === true) {
    const badge = document.createElement('span')
    badge.className = 'popup__badge'
    badge.textContent = 'Accepts Camping Card'
    el.appendChild(badge)
  }

  const link = m.campsite.bookingUrl ?? m.campsite.website
  if (link !== undefined && link !== '') {
    const wrap = document.createElement('div')
    const a = document.createElement('a')
    a.href = link
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.textContent = m.campsite.bookingUrl !== undefined ? 'Book / info ↗' : 'Website ↗'
    wrap.appendChild(a)
    el.appendChild(wrap)
  }

  return el
}
