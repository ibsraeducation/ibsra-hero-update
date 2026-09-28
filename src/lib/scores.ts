/* ==========================================================================
   The four measures, in one place.

   Tasks      how well the marked work scored — graded tasks only
   Activities the same, for the questions a recording stops to ask
   Focus      how much of the work is being done at all — every task the
              session holds, an unanswered one counting zero
   Attendance sittings confirmed against sittings held

   Tasks and Focus answer different questions on purpose: a hero who answers
   one task perfectly scores 100 on the first and very little on the second.
   ========================================================================== */

import { videoChecks, type Session } from '@/lib/types'

export interface Tally {
  earned: number
  possible: number
}

export interface Mark {
  id: string
  name: string
  tally: Tally
  pct: number | null
}

export interface SessionScores {
  sessionId: string
  name: string
  /** One per topic, in the order the session lays them out. */
  topics: Mark[]
  tasks: Tally
  activities: Tally
  focus: Tally
  attendance: Tally
}

/** What a submission has to carry to be counted. */
export interface ScoredSubmission {
  session_id: string
  task_id: string
  points: number
  score: number | string | null
  status: string
}

/** A sitting, as attendance reads it. */
export interface HeldSitting {
  /** Null while the admin has not said yet — it counts as held, not attended. */
  attended: boolean | null
  endsAt: string
}

export const ZERO: Tally = { earned: 0, possible: 0 }

export const asPct = (t: Tally): number | null =>
  t.possible > 0 ? Math.round((t.earned / t.possible) * 100) : null

export const addUp = (list: Tally[]): Tally => list.reduce(
  (a, b) => ({ earned: a.earned + b.earned, possible: a.possible + b.possible }), ZERO,
)

const isGraded = (s: ScoredSubmission) => s.status === 'graded' && s.score !== null
const earnedOf = (s: ScoredSubmission) => (isGraded(s) ? Number(s.score) || 0 : 0)
const pointsOf = (n: number | null | undefined) => Math.max(0, Math.round(Number(n) || 0))

const gradedTally = (subs: ScoredSubmission[]): Tally => addUp(
  subs.filter(isGraded).map(s => ({ earned: earnedOf(s), possible: pointsOf(s.points) })),
)

/** Every sitting that has finished. One the admin has not answered yet is
 *  held but not attended, so a forgotten confirmation reads as a gap. */
export function attendanceOf(sittings: HeldSitting[], now = Date.now()): Tally {
  const done = sittings.filter(s => new Date(s.endsAt).getTime() <= now)
  return { earned: done.filter(s => s.attended === true).length, possible: done.length }
}

export function scoreSession(
  session: Session,
  submissions: ScoredSubmission[],
  sittings: HeldSitting[] = [],
  now = Date.now(),
): SessionScores {
  const mine = submissions.filter(s => s.session_id === session.id)
  const byTask = new Map(mine.map(s => [s.task_id, s]))

  const checkIds = new Set(
    session.titles.flatMap(t => videoChecks(t.video).map(c => c.id)),
  )

  const topics: Mark[] = session.titles.map(t => {
    const ids = new Set(t.tasks.map(task => task.id))
    const tally = gradedTally(mine.filter(s => ids.has(s.task_id)))
    return { id: t.id, name: t.name, tally, pct: asPct(tally) }
  })

  const taskIds = new Set(session.titles.flatMap(t => t.tasks.map(task => task.id)))

  const focus = addUp(session.titles.flatMap(t => t.tasks.map(task => {
    const s = byTask.get(task.id)
    return { earned: s ? earnedOf(s) : 0, possible: pointsOf(task.points) }
  })))

  return {
    sessionId: session.id,
    name: session.name,
    topics,
    tasks: gradedTally(mine.filter(s => taskIds.has(s.task_id))),
    activities: gradedTally(mine.filter(s => checkIds.has(s.task_id))),
    focus,
    attendance: attendanceOf(sittings, now),
  }
}

export interface CourseScores {
  sessions: SessionScores[]
  tasks: Tally
  activities: Tally
  focus: Tally
  attendance: Tally
}

export function scoreSessions(
  sessions: Session[],
  submissions: ScoredSubmission[],
  sittings: HeldSitting[] = [],
  now = Date.now(),
): CourseScores {
  const rows = sessions.map(s => scoreSession(s, submissions, [], now))
  return {
    sessions: rows,
    tasks: addUp(rows.map(r => r.tasks)),
    activities: addUp(rows.map(r => r.activities)),
    focus: addUp(rows.map(r => r.focus)),
    attendance: attendanceOf(sittings, now),
  }
}
