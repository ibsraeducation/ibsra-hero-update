export const LECTURE_HOURS = 2
export const MAX_LECTURE_DAYS = 2

export interface ProgramLength {
  sectionsPerWeek: number
  learnHours: number
  buildHours: number
  weeklyHours: number
  weeks: number | null
  months: number | null
}

export function hoursLabel(h: number): string {
  if (h > 0 && h < 1) return `${Math.round(h * 60)} min`
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace(/\.0$/, '')} h`
}

export function minutesLabel(m: number): string {
  return m < 60 ? `${m} min` : hoursLabel(m / 60)
}

export function hoursWords(m: number): string {
  if (m < 60) return `${m} minutes`
  const h = m / 60
  const n = Number.isInteger(h) ? String(h) : h.toFixed(1).replace(/.0$/, '')
  return `${n} ${h === 1 ? 'hour' : 'hours'}`
}

export function availabilityLine(
  r: {
    lectures_per_week?: number | null
    section_minutes?: number | null
    schedule_ask?: unknown
  },
  opts?: {
    short?: boolean
  },
): string | null {
  const said = askLine(parseAsk(r.schedule_ask), opts)
  if (said) return said
  const n = r.lectures_per_week
  if (!n) return null
  const each = hoursLabel(LECTURE_HOURS)
  const lectures = opts?.short
    ? `${n} × ${each} a week`
    : `${n} × ${each} lecture${n === 1 ? '' : 's'} a week`
  if (!r.section_minutes) return lectures
  const stand = minutesLabel(r.section_minutes)
  return opts?.short
    ? `${lectures} · ${stand} stand-up`
    : `${lectures} · ${stand} stand-up on the other days`
}

export interface DaySlot {
  day: number
  start: number
  min: number
}

export interface WeekAsk {
  lectures: DaySlot[]
  sections: DaySlot[]
}

export const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6] as const

export const EMPTY_ASK: WeekAsk = { lectures: [], sections: [] }

const sumMin = (xs: DaySlot[]) => xs.reduce((a, s) => a + Math.max(0, s.min), 0)

export function sectionDays(lectures: DaySlot[]): number[] {
  const taken = new Set(lectures.map(l => l.day))
  return WEEK_DAYS.filter(d => !taken.has(d))
}

export function lengthOfAsk(totalHours: number | null | undefined, ask: WeekAsk): ProgramLength {
  const learnHours = sumMin(ask.lectures) / 60
  const buildHours = sumMin(ask.sections) / 60
  const weeklyHours = learnHours + buildHours

  const total = totalHours && totalHours > 0 ? totalHours : null
  const weeks = total && weeklyHours > 0 ? Math.ceil(total / weeklyHours) : null
  const months = weeks === null ? null : Math.max(0.5, Math.round((weeks / 4.35) * 2) / 2)

  return { sectionsPerWeek: ask.sections.length, learnHours, buildHours, weeklyHours, weeks, months }
}

export function askProblem(ask: WeekAsk): string | null {
  if (ask.lectures.length === 0) return 'Pick at least one lecture time.'
  const days = new Set(ask.lectures.map(l => l.day))
  if (days.size !== ask.lectures.length) return 'Two lectures cannot be on the same day.'
  if (ask.lectures.length > MAX_LECTURE_DAYS) return 'A week holds one lecture or two.'

  const sections = ask.sections.filter(s => s.min > 0)
  if (sections.length === 0) return 'Pick at least one section time.'

  const clash = [...new Set(sections.filter(s => days.has(s.day)).map(s => s.day))]
  if (clash.length) {
    return `No section on a lecture day — drop the one on ${clash.map(d => DAY_SHORT[d]).join(', ')}.`
  }
  const twice = [...new Set(sections.map(s => s.day))]
    .filter(d => sections.filter(s => s.day === d).length > 1)
  if (twice.length) {
    return `One section a day — ${twice.map(d => DAY_SHORT[d]).join(', ')} has more than one.`
  }

  const late = [...ask.lectures, ...sections].find(s => s.start + s.min > 24 * 60)
  if (late) return 'A sitting has to finish before midnight.'
  return null
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const clock = (m: number): string =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export const slotLine = (s: DaySlot): string =>
  `${DAY_SHORT[s.day]} ${clock(s.start)}–${clock(s.start + s.min)}`

export function askLine(ask: WeekAsk | null | undefined, opts?: { short?: boolean }): string | null {
  if (!ask?.lectures.length) return null
  const lectures = ask.lectures.map(slotLine).join(', ')
  if (!ask.sections.length) return lectures
  const first = ask.sections[0]
  const same = ask.sections.every(s => s.start === first.start && s.min === first.min)
  const when = same
    ? `${clock(first.start)}–${clock(first.start + first.min)}`
    : ask.sections.map(slotLine).join(', ')
  return opts?.short
    ? `${lectures} · sections ${when}`
    : `${lectures} · sections ${when} on the other ${ask.sections.length} days`
}

export function parseAsk(v: unknown): WeekAsk | null {
  if (!v || typeof v !== 'object') return null
  const o = v as { lectures?: unknown; sections?: unknown }
  const slots = (x: unknown): DaySlot[] => (Array.isArray(x) ? x : []).flatMap(s => {
    const r = s as { day?: unknown; start?: unknown; min?: unknown }
    const day = Number(r.day); const start = Number(r.start); const min = Number(r.min)
    if (!Number.isFinite(day) || day < 0 || day > 6) return []
    if (!Number.isFinite(start) || start < 0 || start > 1440) return []
    if (!Number.isFinite(min) || min <= 0 || min > 600) return []
    return [{ day, start, min }]
  })
  const ask = { lectures: slots(o.lectures), sections: slots(o.sections) }
  return ask.lectures.length ? ask : null
}

/** One session's share of a course: which course it is in, and how long
 *  it runs. Both a lecture and a section are sessions. */
export interface SessionLength {
  loopId: string
  durationMin: number
  type?: string
  titles?: Array<{ estimatedMin?: number; video?: { durationSec?: number; state?: string } | null }>
}

/** Minutes one session runs. A live session is as long as it was set to; a
 *  recorded one is the sum of its videos, and its topics' estimates stand in
 *  for a video that is not uploaded yet. Nobody types this in. */
export function sessionLength(s: SessionLength): number {
  if (s.type !== 'live' && s.titles?.length) {
    const video = s.titles.reduce((a, t) => a + (t.video?.durationSec ? t.video.durationSec / 60 : 0), 0)
    if (video > 0) return Math.round(video)
    const est = s.titles.reduce((a, t) => a + Math.max(0, t.estimatedMin || 0), 0)
    if (est > 0) return est
  }
  return Math.max(0, s.durationMin || 0)
}

/** The teaching hours in one course, added up from the sessions laid out
 *  inside it. A course with no sessions yet — or only zero-length ones —
 *  falls back to the hours typed on its form, which is all it has. */
export function courseHours(
  course: { id: string; durationHours?: number | null },
  sessions: SessionLength[],
): number | null {
  const min = sessions
    .filter(s => s.loopId === course.id)
    .reduce((a, s) => a + sessionLength(s), 0)
  return min > 0 ? min / 60 : course.durationHours ?? null
}

/** The whole program: the sum of its courses. Given the sessions, each
 *  course is added up from the ones inside it, so the length a family is
 *  shown follows the timetable itself. A course with nothing in it yet adds
 *  nothing; null only when no course has any hours. */
export function programHours(
  courses: Array<{ id?: string; durationHours?: number | null }>,
  sessions?: SessionLength[],
): number | null {
  if (!courses.length) return null
  const each = courses.map(c => (sessions && c.id
    ? courseHours({ id: c.id, durationHours: c.durationHours }, sessions)
    : c.durationHours ?? null))
  const total = each.reduce((a: number, h) => a + (h ?? 0), 0)
  return total > 0 ? total : null
}
