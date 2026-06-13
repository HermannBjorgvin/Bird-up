import { useEffect, useRef } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Facilities, Window } from '../../../src/core/types'
import { scoreToColor } from '../lib/color'
import { formatRange } from '../lib/dates'
import type { CampsiteMarker } from '../lib/markers'

// Iceland fits comfortably at zoom 6 around this center.
const ICELAND_CENTER: L.LatLngTuple = [64.96, -19.0]

interface Props {
  markers: CampsiteMarker[]
  selectedWindow: Window | null
}

/**
 * Vanilla Leaflet driven imperatively through refs (react-leaflet is not a dependency — spec 08 keeps
 * the stack small). One effect builds the map once; a second rebuilds the circle-marker layer whenever
 * the data or the selected window changes, fitting bounds to a selected window's campsites.
 */
export function MapView({ markers, selectedWindow }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return
    const map = L.map(containerRef.current).setView(ICELAND_CENTER, 6)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
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

    const selectedIds = selectedWindow ? new Set(selectedWindow.campsites.map((c) => c.id)) : null

    for (const m of markers) {
      const inFocus = selectedIds === null || selectedIds.has(m.campsite.id)
      const marker = L.circleMarker([m.campsite.lat, m.campsite.lng], {
        radius: inFocus ? 7 : 4,
        color: '#00000055',
        weight: 1,
        fillColor: scoreToColor(m.bestScore),
        fillOpacity: inFocus ? 0.9 : 0.15,
      })
      marker.bindPopup(() => buildPopup(m))
      layer.addLayer(marker)
    }

    if (selectedWindow && selectedWindow.campsites.length > 0) {
      const bounds = L.latLngBounds(selectedWindow.campsites.map((c) => [c.lat, c.lng] as L.LatLngTuple))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 })
    }
  }, [markers, selectedWindow])
  /* eslint-enable react-doctor/no-event-handler */

  return <div className="map" ref={containerRef} />
}

const FACILITY_ICONS: Array<[keyof Facilities, string]> = [
  ['toilets', '🚻'],
  ['showers', '🚿'],
  ['water', '🚰'],
  ['power', '🔌'],
  ['kitchen', '🍳'],
]

function facilityIcons(f: Facilities): string {
  const icons: string[] = []
  for (const [k, icon] of FACILITY_ICONS) if (f[k] === true) icons.push(icon)
  return icons.join(' ')
}

/** Build the popup as DOM nodes (textContent — never innerHTML — since names come from OSM data). */
function buildPopup(m: CampsiteMarker): HTMLElement {
  const el = document.createElement('div')
  el.className = 'popup'

  const name = document.createElement('div')
  name.className = 'popup__name'
  name.textContent = m.campsite.name
  el.appendChild(name)

  const icons = facilityIcons(m.campsite.facilities)
  if (icons) {
    const fac = document.createElement('div')
    fac.className = 'popup__facilities'
    fac.textContent = icons
    el.appendChild(fac)
  }

  if (m.bestWindow && m.bestScore !== null) {
    const head = document.createElement('div')
    head.style.fontSize = '0.8rem'
    head.textContent = `${formatRange(m.bestWindow.start, m.bestWindow.end)} · ${m.bestWindow.tier} · score ${Math.round(m.bestScore)}`
    el.appendChild(head)

    const strip = document.createElement('div')
    strip.className = 'popup__daily'
    for (const d of m.bestWindow.daily) {
      const day = document.createElement('span')
      day.textContent = `${d.date.slice(5)}  ${Math.round(d.tMaxC)}°  ${d.precipSumMm.toFixed(1)}mm  ${Math.round(d.gustMaxKmh)}km/h`
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
