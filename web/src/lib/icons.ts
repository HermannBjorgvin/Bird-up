/**
 * A handful of lucide icons as inline SVG. The Leaflet popup is built as vanilla DOM (createElementNS —
 * never innerHTML, since campsite names come from OSM; see MapView.buildPopup), so lucide-react's React
 * components don't fit there. The path data below is copied verbatim from lucide-react@1.17.0 so the
 * popup glyphs (facilities + the daily weather strip) match the rest of the UI's icon language.
 */
const SVG_NS = 'http://www.w3.org/2000/svg'

type IconNode = Array<[string, Record<string, string>]>

// Facility keys double as icon names so a `keyof Facilities` maps straight to its glyph.
const ICONS = {
  toilets: [
    ['path', { d: 'M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18' }],
    ['path', { d: 'M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8' }],
  ],
  showers: [
    ['path', { d: 'm4 4 2.5 2.5' }],
    ['path', { d: 'M13.5 6.5a4.95 4.95 0 0 0-7 7' }],
    ['path', { d: 'M15 5 5 15' }],
    ['path', { d: 'M14 17v.01' }],
    ['path', { d: 'M10 16v.01' }],
    ['path', { d: 'M13 13v.01' }],
    ['path', { d: 'M16 10v.01' }],
    ['path', { d: 'M11 20v.01' }],
    ['path', { d: 'M17 14v.01' }],
    ['path', { d: 'M20 11v.01' }],
  ],
  water: [['path', { d: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z' }]],
  power: [['path', { d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z' }]],
  kitchen: [
    ['path', { d: 'M2 12h20' }],
    ['path', { d: 'M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8' }],
    ['path', { d: 'm4 8 16-4' }],
    ['path', { d: 'm8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8' }],
  ],
  thermometer: [['path', { d: 'M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z' }]],
  rain: [
    ['path', { d: 'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242' }],
    ['path', { d: 'M16 14v6' }],
    ['path', { d: 'M8 14v6' }],
    ['path', { d: 'M12 16v6' }],
  ],
  wind: [
    ['path', { d: 'M12.8 19.6A2 2 0 1 0 14 16H2' }],
    ['path', { d: 'M17.5 8a2.5 2.5 0 1 1 2 4H2' }],
    ['path', { d: 'M9.8 4.4A2 2 0 1 1 11 8H2' }],
  ],
} satisfies Record<string, IconNode>

export type IconName = keyof typeof ICONS

/** Build an SVG element for a lucide glyph (lucide's shared 24×24 stroke attributes). */
export function svgIcon(name: IconName, size = 16): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  const root: Record<string, string> = {
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }
  for (const [k, v] of Object.entries(root)) svg.setAttribute(k, v)
  for (const [tag, attrs] of ICONS[name]) {
    const el = document.createElementNS(SVG_NS, tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    svg.appendChild(el)
  }
  return svg
}
