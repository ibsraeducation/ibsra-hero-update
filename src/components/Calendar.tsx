/* ==========================================================================
   One calendar, hand-rolled: a month grid is a Date loop and a CSS grid,
   nothing a library earns its weight for here. Every event carries an
   absolute instant; this component only buckets and renders — the timezone
   work already happened server-side (see src/lib/time.ts's header).
   ========================================================================== */

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Segmented } from '@/components/ui'
import { dayIn, dayKey, timeIn, viewerTz, WEEKDAY_SHORT } from '@/lib/time'
import './calendar.css'

export interface CalEvent {
  id: string
  startsAt: string
  durationMin: number
  title: string
  sub?: string
  tone?: string
  href?: string
  /** An offer rather than a booking — published availability nobody has
   *  taken yet. Drawn as an outline so a full month reads as "these are the
   *  sittings, and these are the gaps still open". */
  open?: boolean
}

type View = 'month' | 'week'

const startOfWeek = (d: Date) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay())
  return x
}
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const sameMonth = (a: Date, b: Date) => a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()

export function Calendar({ events, view: viewProp, onPick, onPickDay, addLabel }: {
  events: CalEvent[]
  /** Default view; the toggle still lets the viewer switch either way. */
  view?: View
  onPick?: (e: CalEvent) => void
  /** Given, every day cell grows an add button carrying that day's weekday
   *  (0 = Sunday), so availability can be published from the calendar it
   *  will appear on rather than from a form somewhere else. */
  onPickDay?: (weekday: number, date: Date) => void
  addLabel?: string
}) {
  const tz = viewerTz()
  const [view, setView] = useState<View>(viewProp ?? 'week')
  const [anchor, setAnchor] = useState(() => new Date())

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>()
    for (const e of events) {
      const k = dayKey(e.startsAt, tz)
      const list = m.get(k) ?? []
      list.push(e)
      m.set(k, list)
    }
    for (const list of m.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    return m
  }, [events, tz])

  const step = (dir: 1 | -1) => {
    const next = new Date(anchor)
    if (view === 'month') next.setMonth(next.getMonth() + dir)
    else next.setDate(next.getDate() + dir * 7)
    setAnchor(next)
  }

  const label = view === 'month'
    ? anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : (() => {
        const s = startOfWeek(anchor)
        const e = addDays(s, 6)
        return `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
      })()

  const cells = useMemo(() => {
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const start = startOfWeek(first)
    const weeks = Math.ceil((first.getDay() + new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()) / 7)
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  }, [anchor, view])

  const today = dayKey(new Date().toISOString(), tz)

  return (
    <div className="cal">
      <div className="cal-bar">
        <div className="row g8">
          <button className="btn ghost icon sm" onClick={() => step(-1)} aria-label="Earlier"><ChevronLeft /></button>
          <span className="t-md w-sb" style={{ minWidth: 140, textAlign: 'center' }}>{label}</span>
          <button className="btn ghost icon sm" onClick={() => step(1)} aria-label="Later"><ChevronRight /></button>
          <button className="btn ghost sm" onClick={() => setAnchor(new Date())}>Today</button>
        </div>
        <Segmented value={view} onChange={setView}
          options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      </div>

      <p className="t-xs c-muted2 mb8">Times shown in {tz.replace('_', ' ')} · set by the admin in Africa/Cairo</p>

      <div className="cal-grid" data-view={view}>
        {WEEKDAY_SHORT.map(d => <div key={d} className="cal-head">{d}</div>)}
        {cells.map((d, i) => {
          const k = dayKey(d.toISOString(), tz)
          const dim = view === 'month' && !sameMonth(d, anchor)
          const list = byDay.get(k) ?? []
          return (
            <div key={i} className="cal-cell" data-dim={dim || undefined} data-today={k === today || undefined}>
              <span className="cal-daynum">{d.getDate()}</span>
              <div className="cal-events">
                {list.map(e => (
                  <button key={e.id} type="button" className="cal-event"
                    data-tone={e.tone || 'brand'} data-open={e.open || undefined}
                    onClick={() => onPick?.(e)} title={`${dayIn(e.startsAt, tz)} · ${timeIn(e.startsAt, tz)}`}>
                    <span className="cal-event-time">{timeIn(e.startsAt, tz)}</span>
                    <span className="cal-event-title">{e.title}{e.sub ? ` · ${e.sub}` : ''}</span>
                  </button>
                ))}
              </div>
              {onPickDay && (
                <button type="button" className="cal-add" onClick={() => onPickDay(d.getDay(), d)}
                  aria-label={`${addLabel ?? 'Add'} on ${d.toLocaleDateString('en-GB', { weekday: 'long' })}`}>
                  +
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
