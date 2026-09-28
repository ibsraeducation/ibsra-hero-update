import { useMemo } from 'react'
import { sessionFlow, useStore } from '@/lib/store'
import { backendLive } from '@/lib/supabase'
import { useAuthStore } from '@/lib/authStore'
import type { Loop, Person, Session, Track } from '@/lib/types'

export interface Me {
  me: Person
  /** The loop the student is actually enrolled in. Everything else is locked. */
  loopId: string | undefined
  trackId: string | undefined
  mentor: Person | undefined
  /** Every course the student is (or was) enrolled in, and their programs. */
  loopIds: string[]
  trackIds: string[]
}

/** The signed-in student when the backend is live; in the demo, the
 *  furthest-along seeded student. */
export function useMe(): Me {
  const db = useStore(s => s.db)
  const profile = useAuthStore(s => s.profile)
  const enrollments = useAuthStore(s => s.enrollments)
  return useMemo(() => {
    if (backendLive && profile) {
      const loopIds = enrollments.filter(e => e.status !== 'dropped').map(e => e.loop_id)
      const trackIds = [...new Set(loopIds
        .map(id => db.loops.find(l => l.id === id)?.trackId)
        .filter((t): t is string => !!t))]
      const active = enrollments.find(e => e.status === 'active')?.loop_id ?? loopIds[0]
      const me: Person = {
        id: profile.id,
        role: 'student',
        name: profile.name || profile.email,
        email: profile.email,
        ...(profile.age != null ? { age: profile.age } : {}),
        ...(profile.phone ? { phone: profile.phone } : {}),
        createdAt: profile.created_at,
        trackId: db.loops.find(l => l.id === active)?.trackId ?? trackIds[0],
      }
      return { me, loopId: active, trackId: me.trackId, mentor: undefined, loopIds, trackIds }
    }

    const me = db.people.find(p => p.role === 'student' && (p.progress ?? 0) > 30)
      ?? db.people.find(p => p.role === 'student')!
    const cohort = db.cohorts.find(c => c.id === me.cohortId)
    return {
      me,
      loopId: cohort?.loopId,
      trackId: me.trackId,
      mentor: db.people.find(p => p.id === cohort?.instructorId),
      loopIds: cohort?.loopId ? [cohort.loopId] : [],
      trackIds: me.trackId ? [me.trackId] : [],
    }
  }, [db, profile, enrollments])
}

/** Only published content reaches a student — draft and scheduled stay hidden. */
export const isOpen = (s: Session) => s.status === 'published'

export function loopSessions(sessions: Session[], loopId: string): Session[] {
  return sessions.filter(s => s.loopId === loopId).sort((a, b) => a.order - b.order)
}

export function trackLoops(loops: Loop[], trackId: string): Loop[] {
  return loops.filter(l => l.trackId === trackId).sort((a, b) => a.index - b.index)
}

/** Minutes of teaching content in a session, summed off its titles. */
export const sessionMinutes = (s: Session) => s.titles.reduce((a, t) => a + t.estimatedMin, 0)

/* ---------------- progress ----------------
   Finished is derived from the steps the student ticked off, all the way up:
   every step in the session's sequence done → the session is finished; every
   open session finished → the course is; every course finished → the program
   is. One source of truth, so the slicer on each section can never disagree
   with the one above it. */

export type Done = Record<string, string[]>

/** 0–100, counted over the session's sequence — a video, a file and a
 *  question are each one step. An empty session cannot be finished. */
export function sessionPct(s: Session, done: Done): number {
  const steps = sessionFlow(s)
  if (steps.length === 0) return 0
  const hit = done[s.id] ?? []
  return Math.round((steps.filter(x => hit.includes(x.key)).length / steps.length) * 100)
}

export const sessionDone = (s: Session, done: Done) => sessionPct(s, done) === 100

/** Averaged over the sessions actually open to the student — locked ones are
 *  not work they can do yet, so counting them would understate the effort. */
export function loopPct(sessions: Session[], done: Done): number {
  const open = sessions.filter(isOpen)
  if (open.length === 0) return 0
  return Math.round(open.reduce((a, s) => a + sessionPct(s, done), 0) / open.length)
}

export const loopDone = (sessions: Session[], done: Done) => {
  const open = sessions.filter(isOpen)
  return open.length > 0 && open.every(s => sessionDone(s, done))
}

export const trackTone = (t: Track | undefined) => t?.color ?? 'brand'
