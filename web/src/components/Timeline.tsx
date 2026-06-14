import { GripVertical } from 'lucide-react'
import type { Window } from '../../../src/core/types'
import { heatColor } from '../lib/color'
import { formatDay, formatRange } from '../lib/dates'
import { dailyHeat, enumerateDays } from '../lib/timeline'

interface Range {
  start: string
  end: string
}

interface Props {
  windows: Window[] // the full-horizon set (the bar always paints all of it)
  horizon: Range
  selected: Range
  onSelect: (range: Range) => void
}

/**
 * The date control below the map (spec 05): a white bar painting the whole forecast horizon as a
 * white→green heatmap (each day's intensity = its best score across all windows, faded between days),
 * with date ticks beneath and two day-snapped brush handles that filter the map + sidebar client-side.
 * Vanilla SVG + pointer drag — no slider dependency. (The min-trip-length slider now lives with the
 * other campsite filters in the side panel, `Filters.tsx`.)
 */
export function Timeline({ windows, horizon, selected, onSelect }: Props) {
  const days = enumerateDays(horizon.start, horizon.end)
  const n = days.length
  const heat = dailyHeat(windows, horizon.start, horizon.end)

  const startIdx = Math.max(0, days.indexOf(selected.start))
  const endIdx = selected.end >= horizon.end ? n - 1 : Math.max(startIdx, days.indexOf(selected.end))
  const startFrac = startIdx / n
  const endFrac = (endIdx + 1) / n

  // Snap the dragged handle to a whole-day index from the pointer's x within the bar (the handle's
  // parent element). Reading the rect from the event keeps it out of render — and off any ref.
  const drag = (handle: 'start' | 'end') => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.buttons === 0) return
    const bar = e.currentTarget.parentElement
    if (bar === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = bar.getBoundingClientRect()
    const f = rect.width === 0 ? 0 : Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const idx = Math.max(0, Math.min(n - 1, Math.round(f * n - 0.5)))
    if (handle === 'start') onSelect({ start: days[Math.min(idx, endIdx)]!, end: selected.end })
    else onSelect({ start: selected.start, end: days[Math.max(idx, startIdx)]! })
  }

  // Heatmap: horizontal stops at each day's centre (fades between days), padded at 0/1 so edges hold.
  const stops = [
    { offset: 0, color: heatColor(heat[0]!.score) },
    ...heat.map((h, i) => ({ offset: (i + 0.5) / n, color: heatColor(h.score) })),
    { offset: 1, color: heatColor(heat[n - 1]!.score) },
  ]

  // Label roughly every n/6 days plus the last day, so ~6–7 date labels fit without crowding.
  const labelStep = Math.max(1, Math.ceil(n / 6))

  return (
    <div className="timeline">
      <div className="timeline__head">
        <span className="timeline__label">{formatRange(selected.start, selected.end)}</span>
      </div>

      <div className="timeline__track">
        <div className="timeline__bar">
          <svg className="timeline__heat" viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="tl-heat" x1="0" y1="0" x2="1" y2="0">
                {stops.map((s, i) => (
                  <stop key={i} offset={s.offset} stopColor={s.color} />
                ))}
              </linearGradient>
            </defs>
            <rect x="0" y="0" width={n} height="100" fill="url(#tl-heat)" />
          </svg>

          <div className="timeline__dim" style={{ left: 0, width: `${startFrac * 100}%` }} />
          <div className="timeline__dim" style={{ left: `${endFrac * 100}%`, right: 0 }} />
        </div>

        <button
          type="button"
          className="timeline__handle"
          aria-label="Range start"
          style={{ left: `${startFrac * 100}%` }}
          onPointerDown={drag('start')}
          onPointerMove={drag('start')}
        >
          <GripVertical className="timeline__grip" size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="timeline__handle"
          aria-label="Range end"
          style={{ left: `${endFrac * 100}%` }}
          onPointerDown={drag('end')}
          onPointerMove={drag('end')}
        >
          <GripVertical className="timeline__grip" size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="timeline__ticks" aria-hidden="true">
        {days.map((d, i) => {
          // Anchor the edge labels (first left, last right) so they don't clip past the bar.
          const edge = i === 0 ? ' timeline__ticklabel--first' : i === n - 1 ? ' timeline__ticklabel--last' : ''
          return (
            <span key={d} className="timeline__tick" style={{ left: `${(i / n) * 100}%` }}>
              {(i % labelStep === 0 || i === n - 1) && <span className={`timeline__ticklabel${edge}`}>{formatDay(d)}</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}
