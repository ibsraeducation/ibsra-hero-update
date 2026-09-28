import { offeredFrom } from '@/lib/api/schedule'
import { sectionDays, type DaySlot, type WeekAsk } from '@/lib/programLength'
import { sessionRange, slotsOf } from '@/lib/slots'
import type { PlanSlot } from '@/lib/api/schedule'
import type { AvailabilityWindowRow, SlotKind } from '@/lib/api/rows'
import type { DB, Loop, Track } from '@/lib/types'

export type Catalogue = Pick<DB, 'tracks' | 'loops'>

export interface TimeGap {
  loopId: string
  course: string
  program: string
  missing: SlotKind[]
}

const trackOnSale = (t: Track): boolean => t.area !== 'work' && (t.listed ?? true)
const loopOnSale = (l: Loop): boolean => l.listed ?? true

export function timeGaps(db: Catalogue, windows: AvailabilityWindowRow[]): TimeGap[] {
  const gaps: TimeGap[] = []

  for (const t of db.tracks) {
    if (!trackOnSale(t)) continue
    const courses = db.loops
      .filter(l => l.trackId === t.id && loopOnSale(l))
      .sort((a, b) => a.index - b.index)

    for (const l of courses) {
      const offered = offeredFrom(windows, { loopId: l.id, trackId: t.id })
      const missing = (['lecture', 'section'] as const)
        .filter(k => !offered.some(w => w.kind === k))
      if (missing.length) {
        gaps.push({ loopId: l.id, course: l.name, program: t.name, missing })
      }
    }
  }

  return gaps
}

export function gapLine(missing: SlotKind[]): string {
  const words = missing.map(k => (k === 'lecture' ? 'lecture' : 'section'))
  return `no ${words.join(' or ')} times`
}

export interface OfferedWindow {
  id: string
  kind: SlotKind
  weekday: number | null
  start_min: number
  end_min: number
  slot_min?: number | null
  slot_max_min?: number | null
}

export interface LengthRange { min: number; max: number }

export const HOUR_MIN = 60
export const HALF_HOUR_MIN = 30

export function snapRange(range: LengthRange | null, step: number): LengthRange | null {
  if (!range) return null
  const min = Math.ceil(range.min / step) * step
  const max = Math.floor(range.max / step) * step
  return min <= max ? { min, max } : null
}

/** The lengths that work on every day picked — the ends of the family's
 *  slider. A day offers the union of what its own openings offer; one
 *  length has to suit them all, so the days intersect.
 *
 *  Null when they cannot: Sunday offering 90–120 and Tuesday 30–60 leaves
 *  no single lecture that runs on both. */
export function lengthRange(
  offered: OfferedWindow[], kind: SlotKind, days?: number[] | null,
): LengthRange | null {
  const wanted = days && days.length ? days : [null]
  const perDay = wanted.map(d => {
    const on = offered.filter(w => w.kind === kind
      && (d === null || w.weekday === null || w.weekday === d))
    if (!on.length) return null
    const ranges = on.map(sessionRange)
    return {
      min: Math.min(...ranges.map(r => r.min)),
      max: Math.max(...ranges.map(r => r.max)),
    }
  })
  if (perDay.some(r => r === null)) return null

  const found = perDay as LengthRange[]
  const min = Math.max(...found.map(r => r.min))
  const max = Math.min(...found.map(r => r.max))
  return min <= max ? { min, max } : null
}

export interface OfferedSlot {
  key: string
  windowId: string
  kind: SlotKind
  weekday: number | null
  startMin: number
  endMin: number
  mentor?: string
}

export const slotKey = (windowId: string, startMin: number) => `${windowId}@${startMin}`

export function slotsOffered(
  windows: Array<OfferedWindow & { mentor?: string }>, kind: SlotKind,
  lenMin?: number | null,
): OfferedSlot[] {
  return windows
    .filter(w => w.kind === kind)
    .flatMap(w => slotsOf(w, lenMin).map(s => ({
      key: slotKey(w.id, s.startMin),
      windowId: w.id,
      kind: w.kind,
      weekday: w.weekday,
      startMin: s.startMin,
      endMin: s.endMin,
      mentor: w.mentor,
    })))
    .sort((a, b) => (a.weekday ?? 7) - (b.weekday ?? 7)
      || a.startMin - b.startMin
      || a.key.localeCompare(b.key))
}

export interface Picks {
  lectureKeys: string[]
  sectionByDay: Record<number, string>
  lectureMin?: number | null
  sectionMin?: number | null
  sectionMinByDay?: Record<number, number>
}

export const sectionMinOn = (picks: Picks, day: number): number | null =>
  picks.sectionMinByDay?.[day] ?? picks.sectionMin ?? null

const daySlot = (s: OfferedSlot, day: number): DaySlot =>
  ({ day, start: s.startMin, min: s.endMin - s.startMin })

export function sectionsOn(
  offered: OfferedWindow[], day: number, lenMin?: number | null,
): OfferedSlot[] {
  return slotsOffered(offered, 'section', lenMin)
    .filter(s => s.weekday === null || s.weekday === day)
}

export function sectionDaysOffered(
  offered: OfferedWindow[], lectures: DaySlot[], lenMin?: number | null,
): number[] {
  return sectionDays(lectures).filter(d => sectionsOn(offered, d, lenMin).length > 0)
}

export function sectionOn(
  offered: OfferedWindow[], picks: Picks, day: number,
): OfferedSlot | null {
  const on = sectionsOn(offered, day, sectionMinOn(picks, day))
  return on.find(s => s.key === picks.sectionByDay[day]) ?? on[0] ?? null
}

const takenDays = (
  offered: OfferedWindow[], picks: Picks, lectures: DaySlot[],
): number[] =>
  sectionDays(lectures).filter(d => !!picks.sectionByDay[d]
    && sectionsOn(offered, d, sectionMinOn(picks, d)).length > 0)

export function weekFromPicks(offered: OfferedWindow[], picks: Picks): WeekAsk {
  const lectures = slotsOffered(offered, 'lecture', picks.lectureMin)
    .filter(s => s.weekday !== null && picks.lectureKeys.includes(s.key))
    .map(s => daySlot(s, s.weekday as number))

  if (!lectures.length) return { lectures: [], sections: [] }

  const sections = takenDays(offered, picks, lectures).flatMap(d => {
    const s = sectionOn(offered, picks, d)
    return s ? [daySlot(s, d)] : []
  })

  return { lectures, sections }
}

export function planFromPicks(offered: OfferedWindow[], picks: Picks): PlanSlot[] {
  const week = weekFromPicks(offered, picks)
  if (!week.lectures.length) return []

  const lectures = slotsOffered(offered, 'lecture', picks.lectureMin)
    .filter(s => s.weekday !== null && picks.lectureKeys.includes(s.key))
    .map(s => ({ w: s.windowId, d: null, s: s.startMin, m: s.endMin - s.startMin }))

  const sections = takenDays(offered, picks, week.lectures).flatMap(d => {
    const s = sectionOn(offered, picks, d)
    return s ? [{ w: s.windowId, d, s: s.startMin, m: s.endMin - s.startMin }] : []
  })

  return [...lectures, ...sections]
}

export function sharedGap(gaps: TimeGap[], db: Catalogue): SlotKind[] | null {
  if (!gaps.length) return null
  const reachable = db.tracks
    .filter(trackOnSale)
    .flatMap(t => db.loops.filter(l => l.trackId === t.id && loopOnSale(l)))
  if (gaps.length !== reachable.length) return null

  const first = gaps[0].missing.join('|')
  return gaps.every(g => g.missing.join('|') === first) ? gaps[0].missing : null
}
