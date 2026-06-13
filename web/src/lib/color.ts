/**
 * Campsite markers are colored by their best window score in the selected range (spec 05): a
 * continuous scale from grey (no/low score) to green (excellent). The tier label lives in the popup;
 * this is purely the marker hue. A null score (a site in no qualifying window) is grey.
 */
type Rgb = { r: number; g: number; b: number }

const GREY: Rgb = { r: 0x9c, g: 0xa3, b: 0xaf } // slate-400: "no good window here"
const GREEN: Rgb = { r: 0x15, g: 0x80, b: 0x3d } // green-700: "excellent"

export function scoreToColor(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return toHex(GREY)
  const t = Math.max(0, Math.min(1, score / 100))
  return toHex({
    r: lerp(GREY.r, GREEN.r, t),
    g: lerp(GREY.g, GREEN.g, t),
    b: lerp(GREY.b, GREEN.b, t),
  })
}

/** Timeline-bar heat tops out at 40 (mid-June scores ~25); the bar saturates green at that score. */
export const HEAT_FULL_SCORE = 40

/**
 * Timeline-bar heat: GREEN at a variable alpha (0→1 over score 0→40) so the bar's own theme-aware
 * background shows through the gaps — white in light mode, dark in dark mode — rather than baking white
 * into the gradient (which would leave bright patches on the dark-mode bar).
 */
export function heatColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / HEAT_FULL_SCORE))
  return `rgba(${GREEN.r}, ${GREEN.g}, ${GREEN.b}, ${t})`
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}
