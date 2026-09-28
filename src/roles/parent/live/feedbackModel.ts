/* ==========================================================================
   What the family's feedback page shows, derived — nothing invented.

   Three numbers per session, each read off rows the child themselves wrote:

     attendance   a session they turned up to is one they opened: any step
                  ticked, or any answer handed in. A session still to come is
                  not a miss, and is left out of the bars entirely.
     tasks done   answers handed in, over the questions the session asks.
     focus        how much of the session they actually walked through, and
                  how well what was graded scored — half each. With nothing
                  graded yet it is the walk-through on its own, rather than a
                  number dragged down by work no one has looked at.

   And the projects: every title a mentor marked as a project, in the order
   the child meets them. The ones whose steps are all ticked are built; the
   rest are what comes next, in sequence.
   ========================================================================== */

import { sessionFlow } from '@/lib/store'
import { titleKind, titleState } from '@/lib/types'
import type { Loop, ProjectState, Session } from '@/lib/types'
import type { SubmissionRow } from '@/lib/api/rows'

export type Done = Record<string, string[]>

export type Attendance = 'attended' | 'missed' | 'upcoming'

export interface SessionMark {
  sessionId: string
  name: string
  /** "S1", "S2" — the label under the bars. */
  short: string
  loopName: string
  live: boolean
  when: string | null
  attendance: Attendance
  /** 100 when they turned up, 0 when they did not. */
  attendancePct: number
  tasksTotal: number
  tasksDone: number
  tasksPct: number
  stepsTotal: number
  stepsDone: number
  /** Everything in the session — recording, material and task — ticked off. */
  activityPct: number
  focus: number
}

const pct = (a: number, b: number) => (b <= 0 ? 0 : Math.round((a / b) * 100))

/** A session the student can open at all: published, and past its release
 *  date when it has one. Anything else is still ahead of them. */
export const released = (s: Session): boolean =>
  s.status === 'published' && (s.type === 'live' || !s.scheduledAt || new Date(s.scheduledAt) <= new Date())

export function markSession(s: Session, loopName: string, order: number, done: Done, subs: SubmissionRow[]): SessionMark {
  const steps = sessionFlow(s)
  const hit = done[s.id] ?? []
  const stepsDone = steps.filter(x => hit.includes(x.key)).length

  const tasksTotal = s.titles.reduce((a, t) => a + t.tasks.length, 0)
  const mine = subs.filter(x => x.session_id === s.id)
  const tasksDone = new Set(mine.map(x => x.task_id)).size

  const graded = mine.filter(x => x.score != null && x.points > 0)
  const earned = graded.reduce((a, x) => a + (x.score ?? 0), 0)
  const possible = graded.reduce((a, x) => a + x.points, 0)

  const walked = pct(stepsDone, steps.length)
  const scored = pct(earned, possible)
  const focus = graded.length === 0 ? walked : Math.round(walked * 0.5 + scored * 0.5)

  const open = released(s)
  const turnedUp = stepsDone > 0 || mine.length > 0
  const attendance: Attendance = !open ? 'upcoming' : turnedUp ? 'attended' : 'missed'

  return {
    sessionId: s.id,
    name: s.name,
    short: `S${order}`,
    loopName,
    live: s.type === 'live',
    when: s.scheduledAt ?? null,
    attendance,
    attendancePct: attendance === 'attended' ? 100 : 0,
    tasksTotal,
    tasksDone,
    tasksPct: pct(tasksDone, tasksTotal),
    stepsTotal: steps.length,
    stepsDone,
    activityPct: walked,
    focus,
  }
}

/** Every session of the child's courses, in the order they meet them. */
export function markSessions(
  sessions: Session[], loops: Loop[], done: Done, subs: SubmissionRow[],
): SessionMark[] {
  const order = new Map(loops.map(l => [l.id, l.index]))
  const sorted = [...sessions].sort((a, b) =>
    (order.get(a.loopId) ?? 0) - (order.get(b.loopId) ?? 0) || a.order - b.order)
  return sorted.map((s, i) =>
    markSession(s, loops.find(l => l.id === s.loopId)?.name ?? '', i + 1, done, subs))
}

/* ---------------- what they have built, and what comes next ---------------- */

export interface ProjectMark {
  id: string
  name: string
  sessionId: string
  sessionName: string
  loopName: string
  /** 0–100 of its own steps. */
  progress: number
  state: ProjectState
}

/** The projects on this child's path, in sequence. Built ones first in time,
 *  not in the list: the order is the order they meet them. */
export function markProjects(
  sessions: Session[], loops: Loop[], done: Done,
): ProjectMark[] {
  const order = new Map(loops.map(l => [l.id, l.index]))
  const sorted = [...sessions].sort((a, b) =>
    (order.get(a.loopId) ?? 0) - (order.get(b.loopId) ?? 0) || a.order - b.order)

  const out: ProjectMark[] = []
  for (const s of sorted) {
    const steps = sessionFlow(s)
    const hit = done[s.id] ?? []
    for (const t of s.titles) {
      if (titleKind(t) !== 'project') continue
      const own = steps.filter(x => x.titleId === t.id)
      const doneSteps = own.filter(x => hit.includes(x.key)).length
      const progress = own.length === 0 ? 0 : Math.round((doneSteps / own.length) * 100)
      out.push({
        id: t.id,
        name: t.name || 'Untitled project',
        sessionId: s.id,
        sessionName: s.name,
        loopName: loops.find(l => l.id === s.loopId)?.name ?? '',
        progress,
        state: titleState(t),
      })
    }
  }
  return out
}

/** The three headline numbers over the bars, counted on the sessions that
 *  have actually opened. */
export function summary(marks: SessionMark[]) {
  const open = marks.filter(m => m.attendance !== 'upcoming')
  const attended = open.filter(m => m.attendance === 'attended').length
  const tasksTotal = open.reduce((a, m) => a + m.tasksTotal, 0)
  const tasksDone = open.reduce((a, m) => a + m.tasksDone, 0)
  return {
    sessions: open.length,
    attended,
    attendancePct: pct(attended, open.length),
    tasksTotal,
    tasksDone,
    tasksPct: pct(tasksDone, tasksTotal),
    focus: open.length === 0 ? 0 : Math.round(open.reduce((a, m) => a + m.focus, 0) / open.length),
    upcoming: marks.length - open.length,
  }
}
