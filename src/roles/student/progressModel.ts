/* ==========================================================================
   Student · My Progress — what the student's own record says.

   One area at a time (Learning or Work), derived from rows the student
   themselves wrote. Nothing here is estimated and nothing is a promise:

     attendance   a session they turned up to is one they opened — any step
                  ticked, or any answer handed in. A session that has not
                  been released yet is not a miss; it is counted apart.
     score        graded points earned over graded points possible. A session
                  with nothing marked yet has no score, rather than a zero
                  that reads like a bad one.
     projects     every title a mentor marked as a project, in the order the
                  student meets them: finished, being built now, or still to
                  start.

   The same three readings roll up to the totals over the tab. Both tabs run
   through here — only the area changes.
   ========================================================================== */

import { useMemo } from 'react'
import { sessionFlow, useStore } from '@/lib/store'
import { useSubmissions, type MySubmission } from '@/lib/api/submissions'
import { inArea } from '@/lib/area'
import { titleKind, titleState } from '@/lib/types'
import type { ContentArea, Loop, Session, Track } from '@/lib/types'
import { useMe } from './useMe'

export type Done = Record<string, string[]>

/** Turned up, did not, or has not been asked to yet. */
export type Attend = 'attended' | 'missed' | 'ahead'

/** Finished, being built now, or still to start. */
export type ProjectState = 'done' | 'building' | 'soon'

export interface SessionMark {
  id: string
  name: string
  /** "S1", "S2" — the label under the columns. */
  short: string
  loopId: string
  loopName: string
  live: boolean
  when: string | null
  /** Published, and past its release date when it has one. */
  released: boolean
  attend: Attend
  stepsTotal: number
  stepsDone: number
  /** 0–100 of the session's own sequence. */
  walked: number
  tasksTotal: number
  tasksAnswered: number
  /** How many answers a mentor has marked. */
  gradedCount: number
  /** 0–100 over what was marked. Null when nothing has been. */
  score: number | null
}

export interface ProjectMark {
  /** Carries its session, so a list of them never needs a second field to
   *  key on. */
  key: string
  name: string
  sessionId: string
  sessionName: string
  loopName: string
  when: string | null
  stepsTotal: number
  stepsDone: number
  /** 0–100 of its own steps. */
  progress: number
  state: ProjectState
}

export interface Totals {
  /** Sessions that have been released — the only ones counted against them. */
  opened: number
  attended: number
  missed: number
  ahead: number
  attendancePct: number
  /** Averaged over the sessions that carry a score. Null when none do. */
  score: number | null
  scored: number
  tasksTotal: number
  tasksAnswered: number
  tasksPct: number
  /** 0–100 of every step in every released session. */
  walked: number
  projects: number
  done: number
  building: number
  soon: number
}

export interface CourseRow {
  loop: Loop
  marks: SessionMark[]
  walked: number
  attendancePct: number
  score: number | null
}

export interface AreaProgress {
  area: ContentArea
  tracks: Track[]
  loops: Loop[]
  marks: SessionMark[]
  projects: ProjectMark[]
  totals: Totals
  /** Per course, for the breakdown under the charts. */
  courses: CourseRow[]
}

const pct = (a: number, b: number) => (b <= 0 ? 0 : Math.round((a / b) * 100))

/** A session the student can open at all: published, and past its release
 *  date when it has one. A live class is released the moment it is published
 *  — its time is when to turn up, not when it appears. */
export const released = (s: Session, now = new Date()): boolean =>
  s.status === 'published' && (s.type === 'live' || !s.scheduledAt || new Date(s.scheduledAt) <= now)

export function markSession(
  s: Session, loopName: string, order: number, done: Done, subs: MySubmission[], now = new Date(),
): SessionMark {
  const steps = sessionFlow(s)
  const hit = done[s.id] ?? []
  const stepsDone = steps.filter(x => hit.includes(x.key)).length

  const tasksTotal = s.titles.reduce((a, t) => a + t.tasks.length, 0)
  const mine = subs.filter(x => x.session_id === s.id)
  const tasksAnswered = new Set(mine.map(x => x.task_id)).size

  const graded = mine.filter(x => x.score != null && x.points > 0)
  const earned = graded.reduce((a, x) => a + (x.score ?? 0), 0)
  const possible = graded.reduce((a, x) => a + x.points, 0)

  const open = released(s, now)
  const turnedUp = stepsDone > 0 || mine.length > 0
  const attend: Attend = !open ? 'ahead' : turnedUp ? 'attended' : 'missed'

  return {
    id: s.id,
    name: s.name,
    short: `S${order}`,
    loopId: s.loopId,
    loopName,
    live: s.type === 'live',
    when: s.scheduledAt ?? null,
    released: open,
    attend,
    stepsTotal: steps.length,
    stepsDone,
    walked: pct(stepsDone, steps.length),
    tasksTotal,
    tasksAnswered,
    gradedCount: graded.length,
    score: graded.length === 0 ? null : pct(earned, possible),
  }
}

/** Every session of the student's courses, in the order they meet them. */
export function markSessions(
  sessions: Session[], loops: Loop[], done: Done, subs: MySubmission[], now = new Date(),
): SessionMark[] {
  return sortByPath(sessions, loops).map((s, i) =>
    markSession(s, loops.find(l => l.id === s.loopId)?.name ?? '', i + 1, done, subs, now))
}

/** Every title a mentor marked as a project, in the order they are met. */
export function markProjects(sessions: Session[], loops: Loop[], done: Done): ProjectMark[] {
  const out: ProjectMark[] = []
  for (const s of sortByPath(sessions, loops)) {
    const steps = sessionFlow(s)
    const hit = done[s.id] ?? []
    for (const t of s.titles) {
      if (titleKind(t) !== 'project') continue
      /* The column is the mentor's call; the bar inside the card is the
         hero's own progress through it. */
      const own = steps.filter(x => x.titleId === t.id)
      const stepsDone = own.filter(x => hit.includes(x.key)).length
      const progress = pct(stepsDone, own.length)
      out.push({
        key: `${s.id}:${t.id}`,
        name: t.name || 'Untitled project',
        sessionId: s.id,
        sessionName: s.name,
        loopName: loops.find(l => l.id === s.loopId)?.name ?? '',
        when: s.scheduledAt ?? null,
        stepsTotal: own.length,
        stepsDone,
        progress,
        state: titleState(t),
      })
    }
  }
  return out
}

/** Course order first, then the session's own place inside it. */
function sortByPath(sessions: Session[], loops: Loop[]): Session[] {
  const order = new Map(loops.map(l => [l.id, l.index]))
  return [...sessions].sort((a, b) =>
    (order.get(a.loopId) ?? 0) - (order.get(b.loopId) ?? 0) || a.order - b.order)
}

export function totalsOf(marks: SessionMark[], projects: ProjectMark[]): Totals {
  const open = marks.filter(m => m.released)
  const attended = open.filter(m => m.attend === 'attended').length
  const scored = open.filter(m => m.score !== null)
  const tasksTotal = open.reduce((a, m) => a + m.tasksTotal, 0)
  const tasksAnswered = open.reduce((a, m) => a + m.tasksAnswered, 0)
  const stepsTotal = open.reduce((a, m) => a + m.stepsTotal, 0)
  const stepsDone = open.reduce((a, m) => a + m.stepsDone, 0)

  return {
    opened: open.length,
    attended,
    missed: open.length - attended,
    ahead: marks.length - open.length,
    attendancePct: pct(attended, open.length),
    score: scored.length === 0
      ? null
      : Math.round(scored.reduce((a, m) => a + (m.score ?? 0), 0) / scored.length),
    scored: scored.length,
    tasksTotal,
    tasksAnswered,
    tasksPct: pct(tasksAnswered, tasksTotal),
    walked: pct(stepsDone, stepsTotal),
    projects: projects.length,
    done: projects.filter(p => p.state === 'done').length,
    building: projects.filter(p => p.state === 'building').length,
    soon: projects.filter(p => p.state === 'soon').length,
  }
}

/* ---------------- the hook ---------------- */

/** One tab's worth of record: the student's own courses in that area, and
 *  every reading taken off them. */
export function useAreaProgress(area: ContentArea): AreaProgress {
  const db = useStore(s => s.db)
  const done = useStore(s => s.done)
  const mine = useSubmissions(s => s.mine)
  const { loopIds } = useMe()

  return useMemo(() => {
    const byTrack = new Map(db.tracks.map(t => [t.id, t]))
    const keep = inArea(area)
    const loops = db.loops
      .filter(l => {
        const t = byTrack.get(l.trackId)
        return loopIds.includes(l.id) && !!t && keep(t)
      })
      .sort((a, b) => a.index - b.index)
    const ids = new Set(loops.map(l => l.id))
    const tracks = [...new Set(loops.map(l => l.trackId))]
      .map(id => byTrack.get(id))
      .filter((t): t is Track => !!t)

    const sessions = db.sessions.filter(s => ids.has(s.loopId) && s.status === 'published')
    const subs = Object.values(mine)
    const marks = markSessions(sessions, loops, done, subs)
    const projects = markProjects(sessions, loops, done)

    const courses: CourseRow[] = loops.map(loop => {
      const own = marks.filter(m => m.loopId === loop.id)
      const open = own.filter(m => m.released)
      const scored = open.filter(m => m.score !== null)
      return {
        loop,
        marks: own,
        walked: open.length === 0 ? 0 : Math.round(open.reduce((a, m) => a + m.walked, 0) / open.length),
        attendancePct: pct(open.filter(m => m.attend === 'attended').length, open.length),
        score: scored.length === 0
          ? null
          : Math.round(scored.reduce((a, m) => a + (m.score ?? 0), 0) / scored.length),
      }
    })

    return { area, tracks, loops, marks, projects, totals: totalsOf(marks, projects), courses }
  }, [db, done, mine, loopIds, area])
}
