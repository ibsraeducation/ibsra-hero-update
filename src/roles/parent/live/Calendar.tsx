/* ==========================================================================
   Parent · Calendar — a picked hero's session times, read-only. The times
   are set by the admin after the payment is accepted; this is where the
   family comes back to see what was confirmed.

   One hero and one program at a time. A hero on two programs has two
   weeks, not one grid holding both — see src/lib/calendarPrograms.ts.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Calendar, type CalEvent } from '@/components/Calendar'
import { Empty } from '@/components/ui'
import { fetchBookings } from '@/lib/api/schedule'
import { JoinSitting, sittingsOf, type Sitting as OpenSitting } from '@/components/JoinSitting'
import { toMessage } from '@/lib/api/errors'
import { useStore } from '@/lib/store'
import { pickProgram, programsOf, trackOfLoop } from '@/lib/calendarPrograms'
import { useFamily } from './useFamily'
import { ChildPicker } from './ChildPicker'
import { CalendarClock } from 'lucide-react'

const RANGE_DAYS_BACK = 14
const RANGE_DAYS_FWD = 120

/** A sitting on the grid, keeping the course it came from so the program
 *  picker can slice by it. */
type Sitting = CalEvent & { loop_id: string }

export function ParentCalendar() {
  const { children, child, pick } = useFamily()
  const [events, setEvents] = useState<Sitting[] | null>(null)
  const [sittings, setSittings] = useState<OpenSitting[]>([])
  const [program, setProgram] = useState('')
  const [error, setError] = useState<string | null>(null)
  const db = useStore(s => s.db)

  const studentId = child?.profile.id ?? ''

  const load = useCallback(async () => {
    if (!studentId) { setEvents([]); setSittings([]); return }
    try {
      const from = new Date(Date.now() - RANGE_DAYS_BACK * 86_400_000).toISOString()
      const to = new Date(Date.now() + RANGE_DAYS_FWD * 86_400_000).toISOString()
      const rows = await fetchBookings({ from, to }, studentId)
      setSittings(sittingsOf(rows, id => db.loops.find(l => l.id === id)?.name ?? 'Session'))
      setEvents(rows.map(b => {
        const loop = db.loops.find(l => l.id === b.loop_id)
        return {
          id: b.id,
          startsAt: b.starts_at,
          durationMin: b.duration_min,
          title: `${b.kind === 'section' ? 'Section' : 'Lecture'} · ${loop?.name ?? 'Session'}`,
          tone: b.kind === 'section' ? 'section' : 'brand',
          loop_id: b.loop_id,
        } as Sitting
      }))
      setError(null)
    } catch (e) {
      setError(toMessage(e))
      setEvents([])
    }
  }, [studentId, db])

  useEffect(() => { void load() }, [load])

  const programs = useMemo(() => programsOf(events ?? [], db), [events, db])
  const shown = pickProgram(programs, program)
  const week = (events ?? []).filter(e => (trackOfLoop(db, e.loop_id) ?? '') === shown)
  const firstName = child?.profile.name?.split(' ')[0] || 'your hero'

  return (
    <div className="page">
      <PageHeader title="Calendar" />

      {children && children.length > 1 && <ChildPicker kids={children} child={child} onPick={pick} />}

      {programs.length > 1 && (
        <div className="row g8 wrap mb16">
          {programs.map(p => (
            <button key={p.id} type="button" className="role-pill" data-on={p.id === shown}
              onClick={() => setProgram(p.id)}>
              {p.name}<span className="tail tnum">{p.count}</span>
            </button>
          ))}
        </div>
      )}

      <JoinSitting sittings={sittings} />

      {error && <div className="auth-alert mb12" role="alert"><span>{error}</span></div>}

      {!studentId ? (
        <div className="card"><Empty icon={<CalendarClock />} title="Add a hero first" /></div>
      ) : events === null ? (
        <div className="skel" style={{ height: 400 }} />
      ) : programs.length === 0 ? (
        <div className="card">
          <Empty icon={<CalendarClock />}
            title={`Nothing booked for ${firstName} yet`} />
        </div>
      ) : (
        <Calendar events={week} view="week" />
      )}
    </div>
  )
}

export default ParentCalendar
