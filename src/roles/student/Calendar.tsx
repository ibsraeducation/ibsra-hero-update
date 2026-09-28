/* ==========================================================================
   Student · Calendar — the sittings booked from a request the parent sent
   and the admin confirmed. Own record only: RLS on `session_bookings`
   limits a student to their own rows, so nothing here has to filter.

   One program at a time: a hero on two of them reads two weeks, not one
   grid holding both (see src/lib/calendarPrograms.ts).
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Calendar, type CalEvent } from '@/components/Calendar'
import { fetchBookings } from '@/lib/api/schedule'
import { JoinSitting, sittingsOf, type Sitting as OpenSitting } from '@/components/JoinSitting'
import { toMessage } from '@/lib/api/errors'
import { useStore } from '@/lib/store'
import { pickProgram, programsOf, trackOfLoop } from '@/lib/calendarPrograms'
import { Empty } from '@/components/ui'
import { CalendarClock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const RANGE_DAYS_BACK = 14
const RANGE_DAYS_FWD = 120

/** A sitting on the grid, keeping the course it came from so the program
 *  picker can slice by it. */
type Sitting = CalEvent & { loop_id: string }

export default function StudentCalendar() {
  const [events, setEvents] = useState<Sitting[] | null>(null)
  const [sittings, setSittings] = useState<OpenSitting[]>([])
  const [program, setProgram] = useState('')
  const [error, setError] = useState<string | null>(null)
  const db = useStore(s => s.db)
  const nav = useNavigate()

  const load = useCallback(async () => {
    try {
      const from = new Date(Date.now() - RANGE_DAYS_BACK * 86_400_000).toISOString()
      const to = new Date(Date.now() + RANGE_DAYS_FWD * 86_400_000).toISOString()
      const rows = await fetchBookings({ from, to })
      setSittings(sittingsOf(rows, id => db.loops.find(l => l.id === id)?.name ?? 'Session'))
      setEvents(rows.map(b => {
        const loop = db.loops.find(l => l.id === b.loop_id)
        return {
          id: b.id, startsAt: b.starts_at, durationMin: b.duration_min,
          title: `${b.kind === 'section' ? 'Section' : 'Lecture'} · ${loop?.name ?? 'Session'}`,
          href: b.session_id ? `/student/session/${b.session_id}` : undefined,
          tone: b.kind === 'section' ? 'section' : 'brand',
          loop_id: b.loop_id,
        } as Sitting
      }))
      setError(null)
    } catch (e) {
      setError(toMessage(e))
      setEvents([])
    }
  }, [db])

  useEffect(() => { void load() }, [load])

  const programs = useMemo(() => programsOf(events ?? [], db), [events, db])
  const shown = pickProgram(programs, program)
  const week = (events ?? []).filter(e => (trackOfLoop(db, e.loop_id) ?? '') === shown)

  return (
    <div className="page">
      <PageHeader title="Calendar" />

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

      {events === null ? <div className="skel" style={{ height: 400 }} />
        : programs.length === 0 ? (
          <div className="card">
            <Empty icon={<CalendarClock />} title="No sessions booked yet" />
          </div>
        ) : (
          <Calendar events={week} view="week" onPick={e => { if (e.href) nav(e.href) }} />
        )}
    </div>
  )
}
