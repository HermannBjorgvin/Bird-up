/**
 * Campsite markers are colored by their best window score in the selected range (spec 05): a
 * continuous scale from warm khaki (low score) to moss green (excellent) — `khaki-beige` and a derived
 * `moss-green` that harmonizes with the brown-red/gold/slate palette (a green of similar muted
 * saturation, so the map reads on-brand rather than with a stock bright green). The tier label lives in
 * the popup; this is purely the marker hue. A null score (a site in no qualifying window) is muted
 * slate — "no window here", not "bad weather". (The timeline heat bar uses gold instead — see heatColor.)
 */
type Rgb = { r: number; g: number; b: number }

const KHAKI: Rgb = { r: 0xbe, g: 0xa0, b: 0x8c } // khaki-beige: low-scoring window
const MOSS: Rgb = { r: 0x5d, g: 0x7d, b: 0x3a } // moss-green (derived): "excellent"
const SLATE: Rgb = { r: 0x6e, g: 0x7c, b: 0x84 } // muted blue-slate: "no qualifying window"
const GOLD: Rgb = { r: 0xf1, g: 0xcc, b: 0x5b } // royal-gold: the timeline heat bar only (heatColor)

export function scoreToColor(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return toHex(SLATE)
  const t = Math.max(0, Math.min(1, score / 100))
  return toHex({
    r: lerp(KHAKI.r, MOSS.r, t),
    g: lerp(KHAKI.g, MOSS.g, t),
    b: lerp(KHAKI.b, MOSS.b, t),
  })
}

/** Timeline-bar heat tops out at 40 (mid-June scores ~25); the bar saturates royal-gold at that score. */
export const HEAT_FULL_SCORE = 40

/**
 * Timeline-bar heat: royal-GOLD at a variable alpha (0→1 over score 0→40) so the bar's own theme-aware
 * background shows through the gaps — warm paper in light mode, dark wood in dark mode — rather than
 * baking a surface color into the gradient (which would leave bright patches on the dark-mode bar).
 */
export function heatColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / HEAT_FULL_SCORE))
  return `rgba(${GOLD.r}, ${GOLD.g}, ${GOLD.b}, ${t})`
}

/**
 * Readable text color for a filled swatch (the cluster-count bubble): dark espresso on light fills
 * (khaki / low score), cream on dark fills (moss / slate). Uses perceived luminance so a tan bubble
 * doesn't end up with unreadable white digits.
 */
export function textOn(hexBg: string): string {
  const { r, g, b } = fromHex(hexBg)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#2a2017' : '#faf7f0'
}

function fromHex(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
