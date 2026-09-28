/* ==========================================================================
   Admin · Calendar · Timetable — the same sittings the grid draws, read as
   the weekly pattern they actually are.

   One card per program, one group per course, one row per recurring hour:
   the day, the clock, the run of dates it covers, and who is in it. The
   month grid can say "there is something on Tuesday"; only this can say
   "Robotics · Loop 1 meets Sundays 16:00–18:00, 4 Oct through 14 Dec".

   It reads the page's own slicers, so the two readings never disagree
   about what is being looked at. Inside an intake's card it is drawn bare:
   the card already says whose hours these are, so the program is a heading
   and not a second card around it.
   ========================================================================== */

import { Fragment, useMemo } from 'react'
import { CalendarDays } from 'lucide-react'
import { Badge, Empty } from '@/components/ui'
import { dayIn, viewerTz, WEEKDAY_SHORT } from '@/lib/time'
import { mins } from '@/lib/format'
import { summarize, type SummaryItem } from '@/lib/scheduleSummary'
import { useStore } from '@/lib/store'

export function ScheduleTable({ items, bare }: {
  items: SummaryItem[]
  /** Drawn inside a card that already frames it — no card of its own, and
   *  no preamble the page above has said already. */
  bare?: boolean
}) {
  const db = useStore(s => s.db)
  const tz = viewerTz()
  const programs = useMemo(() => summarize(items, db, tz), [items, db, tz])

  if (programs.length === 0) {
    const empty = <Empty icon={<CalendarDays />} title="Nothing scheduled in this range" />
    return bare ? empty : <div className="card">{empty}</div>
  }

  return (
    <div className="stack g12">
      {!bare && (
        <p className="t-sm c-muted2" style={{ maxWidth: 640 }}>
          Every repeating hour on the calendar, folded back into the series it belongs to.
          Times are in {tz.replace('_', ' ')} · set by the admin in Africa/Cairo.
        </p>
      )}

      {programs.map(p => (
        <div key={p.id || 'other'} className={bare ? 'stack g8' : 'card'}
          style={bare ? undefined : { overflow: 'hidden' }}>
          <div className={bare ? 'row g8 wrap' : 'card-head'}
            style={bare ? { justifyContent: 'space-between', alignItems: 'baseline' } : undefined}>
            <h3 className="t-md w-sb">{p.name}</h3>
            <span className="t-xs c-muted2 tnum">
              {p.courses.length} course{p.courses.length === 1 ? '' : 's'}
              {' · '}{p.sittings} sitting{p.sittings === 1 ? '' : 's'}
            </span>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Day &amp; time</th>
                  <th style={{ width: 104 }}>Kind</th>
                  <th style={{ width: 92 }}>Length</th>
                  <th style={{ width: 168 }}>Runs</th>
                  <th className="num" style={{ width: 90 }}>Sittings</th>
                  <th className="num" style={{ width: 90 }}>Heroes</th>
                </tr>
              </thead>
              <tbody>
                {p.courses.map(c => (
                  <Fragment key={c.loopId}>
                    <tr className="grp">
                      <td colSpan={6}>
                        <div className="row g8">
                          <span className="t-sm w-sb truncate">{c.name}</span>
                          {c.code && <span className="mono t-xs c-muted2">{c.code}</span>}
                          <span className="auto-s t-xs c-muted2 tnum" style={{ flex: 'none' }}>
                            {c.rows.length} weekly hour{c.rows.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {c.rows.map(r => (
                      <tr key={r.key}>
                        <td>
                          <span className="t-sm tnum">
                            {WEEKDAY_SHORT[r.weekday]} · {r.from}–{r.to}
                          </span>
                        </td>
                        <td>
                          {r.open
                            ? <Badge tone="line">Open</Badge>
                            : <Badge tone={r.kind === 'section' ? 'gold' : 'brand'}>
                                {r.kind === 'section' ? 'Section' : 'Lecture'}
                              </Badge>}
                        </td>
                        <td><span className="t-xs c-muted tnum">{mins(r.durationMin)}</span></td>
                        <td>
                          <span className="t-xs c-muted tnum">
                            {dayIn(r.firstAt, tz)}
                            {r.firstAt !== r.lastAt && ` → ${dayIn(r.lastAt, tz)}`}
                          </span>
                        </td>
                        <td className="num"><span className="t-sm tnum">{r.sittings}</span></td>
                        <td className="num">
                          {r.open
                            ? <span className="t-xs c-muted2 tnum">{r.free} free</span>
                            : <span className="t-sm tnum">{r.heroes}</span>}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
