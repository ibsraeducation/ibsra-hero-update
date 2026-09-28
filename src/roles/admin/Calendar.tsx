/* ==========================================================================
   Admin · Calendar — the students' booked sittings, intake by intake, and
   where the availability they were booked out of gets published. A tab of
   Students & payments (see StudentsAndPayments), next to the button that
   books onto it.

   A batch is the unit the place is actually run in, so it is the unit this
   page is read in: one card an intake, headed by its name and where it is
   run, holding that intake's own month and its own timetable. "Batch 1 ·
   Canada meets Sundays at five" is a question about one card, not about a
   grid with a filter on it.

   Inside a card the grid holds the hour itself: which kind of sitting it
   is, how long it runs and who is in it — a name when one hero is, a head
   count when several share it. Published availability nobody has taken is
   a different question: it is read in the Timetable and edited in the
   Weekly availability tab.

   The + on a day cell publishes availability onto that day directly, and
   the page reloads around it — the calendar is the editor, rather than a
   read-only view of a form kept somewhere else.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock, Layers } from 'lucide-react'
import { Empty, Segmented, Tabs } from '@/components/ui'
import { Calendar, type CalEvent } from '@/components/Calendar'
import { fetchBatches, fetchBookings, fetchStudentNames, windowGrid } from '@/lib/api/schedule'
import { pickProgram, programsOf, trackOfLoop } from '@/lib/calendarPrograms'
import { toMessage } from '@/lib/api/errors'
import { mins } from '@/lib/format'
import { regionLabel } from '@/lib/region'
import { useStore } from '@/lib/store'
import { AvailabilityEditor, WindowForm } from './AvailabilityEditor'
import { ScheduleTable } from './ScheduleTable'
import { AttendancePanel, type AttendanceRow } from './Attendance'
import type { SummaryItem } from '@/lib/scheduleSummary'
import type { CourseBatchRow, SessionBookingRow, SlotKind } from '@/lib/api/rows'

const RANGE_DAYS_BACK = 21
const RANGE_DAYS_FWD = 120

/** The card everything without an intake falls into. */
const NO_BATCH = 'none'

type KindFilter = SlotKind | 'all'
/** What the slicers read off an event: its kind, its intake, and the
 *  course it belongs to — which is how the program picker finds it. */
type Tagged = CalEvent & {
  _kind: SlotKind; _batch: string; _loop: string
  /** Booked only — who is in it, so the timetable counts heads and not rows. */
  _student?: string
  /** Open only — the window it was expanded from, and the seats left in
   *  this one occurrence. */
  _window?: string
  _free?: number
}
/** '' is every batch; 'none' is the sittings that belong to no batch. */
type BatchFilter = string
type Tab = 'schedule' | 'availability'
/** The same sittings, read two ways: as the month they fall in, or as the
 *  weekly hours they repeat on. A switch rather than a tab, because it is
 *  one thing seen twice and both readings take the same slicers. */
type Shape = 'calendar' | 'timetable' | 'attendance'

/** One intake, with everything of its own on it. */
interface BatchCard {
  id: string
  name: string
  region: string | null
  meta: string
  /** The hours themselves, already grouped so a shared hour is one block. */
  blocks: Tagged[]
  rows: AttendanceRow[]
  /** The same sittings plus the intake's untaken hours, for the timetable. */
  items: SummaryItem[]
  heroes: number
}

export function CalendarPanel() {
  const [tab, setTab] = useState<Tab>('schedule')
  const [shape, setShape] = useState<Shape>('calendar')
  const [booked, setBooked] = useState<Tagged[] | null>(null)
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [open, setOpen] = useState<Tagged[]>([])
  const [batches, setBatches] = useState<CourseBatchRow[]>([])
  const [kind, setKind] = useState<KindFilter>('all')
  const [program, setProgram] = useState('')
  const [batch, setBatch] = useState<BatchFilter>('')
  const [showOpen, setShowOpen] = useState(true)
  const [adding, setAdding] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const db = useStore(s => s.db)

  const courseLabel = useCallback((loopId: string) => {
    const l = db.loops.find(x => x.id === loopId)
    if (!l) return 'Session'
    return `${l.name}`
  }, [db.loops])

  const load = useCallback(async () => {
    try {
      const fromMs = Date.now() - RANGE_DAYS_BACK * 86_400_000
      const toMs = Date.now() + RANGE_DAYS_FWD * 86_400_000
      const iso = (ms: number) => new Date(ms).toISOString()
      const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

      const [rows, grid, bs] = await Promise.all([
        fetchBookings({ from: iso(fromMs), to: iso(toMs) }),
        windowGrid(day(Date.now()), day(toMs)),
        fetchBatches(),
      ])
      setBatches(bs)

      const names = await fetchStudentNames(rows.map(b => b.student_id))
      setRows(rows.map(b => ({ ...b, hero: names[b.student_id] ?? 'Hero' })))
      setBooked(rows.map(b => ({
        id: b.id,
        startsAt: b.starts_at,
        durationMin: b.duration_min,
        title: `${b.kind === 'section' ? 'Section' : 'Lecture'} · ${mins(b.duration_min)}`,
        sub: names[b.student_id],
        tone: b.kind === 'section' ? 'section' : 'brand',
        // carried for the slicers below
        ...{ _kind: b.kind, _batch: b.batch_id ?? NO_BATCH, _loop: b.loop_id, _student: b.student_id },
      } as Tagged)))

      setOpen(grid.map(g => ({
        id: `${g.window_id}-${g.starts_at}`,
        startsAt: g.starts_at,
        durationMin: g.duration_min,
        title: `Open · ${courseLabel(g.loop_id)}`,
        sub: `${Math.max(0, g.capacity - g.taken)} of ${g.capacity} free`,
        tone: g.kind === 'section' ? 'section' : 'brand',
        open: true,
        ...{
          _kind: g.kind, _batch: g.batch_id ?? NO_BATCH, _loop: g.loop_id,
          _window: g.window_id, _free: Math.max(0, g.capacity - g.taken),
        },
      } as Tagged)))
      setError(null)
    } catch (e) {
      setError(toMessage(e))
      setBooked([])
      setOpen([])
    }
  }, [courseLabel])

  useEffect(() => { void load() }, [load])

  /* The programs on the grid, and the one being read. Open windows count
     too: "where is there still room on this program" is the question. */
  const programs = useMemo(
    () => programsOf([...(booked ?? []), ...open].map(e => ({ loop_id: e._loop })), db),
    [booked, open, db])
  /* 'all' is the admin's deliberate step back out to every program; any
     other value is a program that has to still be on the grid. */
  const shown = program === 'all' ? 'all' : pickProgram(programs, program)

  /* Kind, intake and program narrow every card the same way, so the two
     readings never disagree about what is being looked at. */
  const slice = useCallback((list: Tagged[]) => list.filter(e => {
    if (kind !== 'all' && e._kind !== kind) return false
    if (batch && e._batch !== batch) return false
    if (shown !== 'all' && (trackOfLoop(db, e._loop) ?? '') !== shown) return false
    return true
  }), [kind, batch, shown, db])

  /* The grid draws the heroes' own sittings and nothing else. An open
     window is an offer, not somebody's hour; it is read in the Timetable
     and edited in Weekly availability. */
  const sittings = useMemo(() => slice(booked ?? []), [slice, booked])
  const offers = useMemo(() => (showOpen ? slice(open) : []), [slice, open, showOpen])

  /* One card an intake: the order the batch list is in, then whatever
     belongs to no intake yet. */
  const cards = useMemo((): BatchCard[] => {
    const order = [...batches.map(b => b.id), NO_BATCH]
    const seen = new Set([...sittings, ...offers].map(e => e._batch))
    const meta = new Map(batches.map(b => [b.id, b]))

    return order.filter(id => seen.has(id)).map(id => {
      const mine = sittings.filter(e => e._batch === id)
      const theirs = offers.filter(e => e._batch === id)
      const b = meta.get(id)
      const course = b ? db.loops.find(l => l.id === b.loop_id) : null
      return {
        id,
        name: b?.name ?? 'No batch yet',
        region: b?.region ?? null,
        meta: [
          course?.name,
          b ? regionLabel(b.region) : 'Sittings booked before intakes, or by hand',
          b?.status,
          b ? `${b.seats} seats` : null,
        ].filter(Boolean).join(' · '),
        blocks: groupHours(mine),
        rows: rows.filter(r => (r.batch_id ?? NO_BATCH) === id
          && (kind === 'all' || r.kind === kind)
          && (shown === 'all' || (trackOfLoop(db, r.loop_id) ?? '') === shown)),
        items: [...mine, ...theirs].map(summaryOf),
        heroes: new Set(mine.map(e => e._student).filter(Boolean)).size,
      }
    })
  }, [batches, sittings, offers, rows, kind, shown, db, db.loops])

  const patchRow = (id: string, patch: Partial<SessionBookingRow>) =>
    setRows(all => all.map(r => (r.id === id ? { ...r, ...patch } : r)))

  const batchName = (b: CourseBatchRow) => {
    const l = db.loops.find(x => x.id === b.loop_id)
    return l ? `${b.name} · ${l.name}` : b.name
  }

  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'schedule', label: 'Schedule', icon: <CalendarDays className="ico-xs" /> },
        { value: 'availability', label: 'Weekly availability', icon: <Clock className="ico-xs" /> },
      ]} />

      <div className="mt16">
        {tab === 'availability' ? <AvailabilityEditor /> : (
          <>
            {error && <div className="auth-alert mb12" role="alert"><span>{error}</span></div>}

            <div className="row g10 wrap mb12">
              <Segmented value={shape} onChange={setShape} options={[
                { value: 'calendar', label: 'Calendar' },
                { value: 'timetable', label: 'Timetable' },
                { value: 'attendance', label: 'Attendance' },
              ]} />
            </div>

            {programs.length > 0 && (
              <div className="row g8 wrap mb12">
                {programs.map(p => (
                  <button key={p.id} type="button" className="role-pill" data-on={p.id === shown}
                    onClick={() => setProgram(p.id)}>
                    {p.name}<span className="tail tnum">{p.count}</span>
                  </button>
                ))}
                {programs.length > 1 && (
                  <button type="button" className="role-pill" data-on={shown === 'all'}
                    onClick={() => setProgram('all')}>Every program</button>
                )}
              </div>
            )}

            <div className="row g10 wrap mb12" style={{ justifyContent: 'space-between' }}>
              <div className="row g10 wrap">
                <Segmented value={kind} onChange={setKind} options={[
                  { value: 'all', label: 'All' },
                  { value: 'lecture', label: 'Lectures' },
                  { value: 'section', label: 'Sections' },
                ]} />
                <select className="sel" value={batch} onChange={e => setBatch(e.target.value)}
                  style={{ maxWidth: 260 }} aria-label="Batch">
                  <option value="">Every batch</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{batchName(b)}</option>)}
                  <option value={NO_BATCH}>No batch yet</option>
                </select>
              </div>
              {shape === 'timetable' && (
                <label className="row g6 t-sm" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={showOpen} onChange={e => setShowOpen(e.target.checked)} />
                  Show open slots
                </label>
              )}
            </div>

            {booked === null ? <div className="skel" style={{ height: 400 }} /> : cards.length === 0 ? (
              <div className="card">
                <Empty icon={<CalendarDays />} title="Nothing on the calendar here" />
              </div>
            ) : (
              <div className="stack g16">
                {cards.map(c => (
                  <section key={c.id} className="card" style={{ overflow: 'hidden' }}>
                    <div className="card-head">
                      <h3 className="t-md w-sb row g8">
                        <Layers className="ico-xs" style={{ color: 'var(--muted-2)' }} />
                        {c.name}
                      </h3>
                      <span className="t-xs c-muted2">{c.meta}</span>
                    </div>

                    <div className="stack g8" style={{ padding: 14 }}>
                      <span className="t-xs c-muted2 tnum">
                        {c.blocks.length} hour{c.blocks.length === 1 ? '' : 's'} on the calendar
                        {' · '}{c.heroes} hero{c.heroes === 1 ? '' : 'es'}
                      </span>
                      {shape === 'calendar' ? (
                        c.blocks.length === 0
                          ? <Empty icon={<CalendarDays />} title="Nothing booked into this intake yet" />
                          : <Calendar events={c.blocks} view="month" addLabel="Publish a window"
                              onPickDay={weekday => setAdding(weekday)} />
                      ) : shape === 'attendance' ? (
                        <AttendancePanel rows={c.rows} onChange={patchRow} />
                      ) : (
                        <ScheduleTable items={c.items} bare />
                      )}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {adding !== null && (
        <WindowForm rows={null} presetWeekday={adding}
          onClose={() => setAdding(null)} onSaved={() => void load()} />
      )}
    </>
  )
}

/* Four heroes in the same hour are one sitting, not four blocks: the grid
   draws the hour once and counts the heads in it. */
function groupHours(events: Tagged[]): Tagged[] {
  const groups = new Map<string, { e: Tagged; heroes: Set<string> }>()
  for (const e of events) {
    const key = `${e._kind}|${e._loop}|${e._batch}|${e.startsAt}|${e.durationMin}`
    const at = groups.get(key)
    if (at) at.heroes.add(e._student ?? at.e.id)
    else groups.set(key, { e: { ...e, id: key }, heroes: new Set([e._student ?? e.id]) })
  }
  return [...groups.values()].map(({ e, heroes }) => (heroes.size > 1
    ? { ...e, sub: `${heroes.size} heroes` }
    : e))
}

const summaryOf = (e: Tagged): SummaryItem => ({
  startsAt: e.startsAt,
  durationMin: e.durationMin,
  kind: e._kind,
  loopId: e._loop,
  open: e.open,
  studentId: e._student,
  windowId: e._window,
  free: e._free,
})
