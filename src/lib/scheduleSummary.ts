/* ==========================================================================
   The calendar, read as a timetable instead of a month.

   A month grid answers "what is on this Tuesday". It is the wrong shape for
   the other question an admin asks constantly — "when does Robotics · Loop 2
   actually meet, and until when" — because the answer is spread across
   twelve cells that all look the same. Weekly teaching repeats, so the grid
   draws the same sitting over and over and never once names the pattern.

   So this collapses the sittings back into the series they came from. One
   row is one recurring hour: a course, a kind, a weekday and a clock time,
   with the run of dates it covers and how many heroes sit in it. Two rows
   appear for a course taught twice a week, which is the truth about it.

   Everything here is pure, and every clock reading goes through the viewer's
   own timezone — the same instants the grid buckets, bucketed differently.
   ========================================================================== */

import { formatInTz, timeIn } from '@/lib/time'
import { trackOfLoop } from '@/lib/calendarPrograms'
import type { SlotKind } from '@/lib/api/rows'
import type { DB } from '@/lib/types'

/** One sitting, as either calendar tab already holds it. A booked sitting
 *  carries the hero in it; an open window carries the seats still free. */
export interface SummaryItem {
  startsAt: string
  durationMin: number
  kind: SlotKind
  loopId: string
  /** Published availability nobody has taken, rather than a real booking. */
  open?: boolean
  /** Booked only — who is in it, for the distinct head count. */
  studentId?: string
  /** Open only — the window these occurrences were expanded from, so two
   *  windows at the same hour stay two rows. */
  windowId?: string
  /** Open only — seats left in this one occurrence. */
  free?: number
}

/** One recurring hour: a course, a kind, a weekday and a time. */
export interface SeriesRow {
  key: string
  kind: SlotKind
  open: boolean
  /** 0 = Sunday, in the viewer's zone — which is the zone the grid buckets
   *  into too, so a row and a cell never disagree about the day. */
  weekday: number
  /** "16:00" and "18:00", the viewer's clock. */
  from: string
  to: string
  durationMin: number
  /** Real occurrences in the loaded range, not rows — five heroes in one
   *  Tuesday is one sitting. */
  sittings: number
  firstAt: string
  lastAt: string
  /** Distinct heroes across the run. 0 on an open row. */
  heroes: number
  /** Seats still free across the run. 0 on a booked row. */
  free: number
}

export interface CourseSummary {
  loopId: string
  name: string
  code: string
  rows: SeriesRow[]
  sittings: number
}

export interface ProgramSummary {
  id: string
  name: string
  courses: CourseSummary[]
  sittings: number
}

/** A row under construction — the sets are what make "distinct" cheap. */
interface Bucket {
  row: Omit<SeriesRow, 'sittings' | 'heroes'>
  loopId: string
  at: Set<string>
  heroes: Set<string>
}

const endOf = (startsAt: string, durationMin: number): string =>
  new Date(Date.parse(startsAt) + durationMin * 60_000).toISOString()

/** 0–6, Sunday first, as the date reads in that zone. */
export function weekdayIn(iso: string, tz: string): number {
  const short = formatInTz(iso, tz, { weekday: 'short' })
  const i = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short.slice(0, 3))
  return i < 0 ? new Date(iso).getDay() : i
}

/** The sittings, folded into the series they repeat on, grouped program then
 *  course. Programs come busiest first — the same order the grid's own
 *  program pills use — and courses, then rows, read in timetable order. */
export function summarize(items: SummaryItem[], db: DB, tz: string): ProgramSummary[] {
  const buckets = new Map<string, Bucket>()

  for (const it of items) {
    const weekday = weekdayIn(it.startsAt, tz)
    const from = timeIn(it.startsAt, tz)
    const open = !!it.open
    /* An open row keys on its window: two windows offering the same hour on
       the same day are two separate offers, and merging them would invent a
       capacity neither one has. */
    const key = [
      open ? `w:${it.windowId ?? ''}` : `b:${it.loopId}`,
      it.kind, weekday, from, it.durationMin,
    ].join('|')

    let b = buckets.get(key)
    if (!b) {
      b = {
        loopId: it.loopId,
        at: new Set(),
        heroes: new Set(),
        row: {
          key, kind: it.kind, open, weekday, from,
          to: timeIn(endOf(it.startsAt, it.durationMin), tz),
          durationMin: it.durationMin,
          firstAt: it.startsAt,
          lastAt: it.startsAt,
          free: 0,
        },
      }
      buckets.set(key, b)
    }

    /* Only count the seats of an occurrence once, however many rows carried
       it in — the same guard the sitting count needs. */
    if (!b.at.has(it.startsAt)) b.row.free += it.free ?? 0
    b.at.add(it.startsAt)
    if (it.studentId) b.heroes.add(it.studentId)
    if (it.startsAt < b.row.firstAt) b.row.firstAt = it.startsAt
    if (it.startsAt > b.row.lastAt) b.row.lastAt = it.startsAt
  }

  /* Rows to courses, courses to programs. A course the admin has since
     deleted keeps its sittings under "Other sittings" rather than losing
     them — they are still hours in somebody's week. */
  const byProgram = new Map<string, Map<string, CourseSummary>>()
  for (const b of buckets.values()) {
    const row: SeriesRow = { ...b.row, sittings: b.at.size, heroes: b.heroes.size }
    const pid = trackOfLoop(db, b.loopId) ?? ''
    let courses = byProgram.get(pid)
    if (!courses) byProgram.set(pid, courses = new Map())

    let course = courses.get(b.loopId)
    if (!course) {
      const l = db.loops.find(x => x.id === b.loopId)
      courses.set(b.loopId, course = {
        loopId: b.loopId,
        name: l?.name ?? 'Other sittings',
        code: l?.code ?? '',
        rows: [],
        sittings: 0,
      })
    }
    course.rows.push(row)
    course.sittings += row.open ? 0 : row.sittings
  }

  const out: ProgramSummary[] = [...byProgram].map(([id, courses]) => {
    const list = [...courses.values()]
    for (const c of list) {
      c.rows.sort((a, z) =>
        a.weekday - z.weekday || a.from.localeCompare(z.from) ||
        Number(a.open) - Number(z.open) || a.kind.localeCompare(z.kind))
    }
    list.sort((a, z) => z.sittings - a.sittings || a.name.localeCompare(z.name))
    return {
      id,
      name: db.tracks.find(t => t.id === id)?.name ?? 'Other sittings',
      courses: list,
      sittings: list.reduce((n, c) => n + c.sittings, 0),
    }
  })

  return out.sort((a, z) => z.sittings - a.sittings || a.name.localeCompare(z.name))
}
