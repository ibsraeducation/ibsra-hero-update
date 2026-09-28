/* ==========================================================================
   Parent surface — everything the three parent pages read.

   One rule shapes this whole file: a parent is shown what already happened.
   Nothing here projects, forecasts or values a future outcome. Income is
   reported after a mentor verified a client payment, and never travels
   without n / median / % earning nothing beside it.

   Vocabulary on screen is the parent's, not the schema's:
     Track = "program"   Loop = "course"   Title = "topic" / "skill"
   ========================================================================== */

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { median } from '@/lib/format'
import { comesAfter, leadsTo, pathOf } from '@/lib/programs'
import type { Loop, Person, Session, Track } from '@/lib/types'

/* ---------------------------------------------------------------- *
   Deterministic derivation

   Submissions, attendance and mentor scoring do not exist as tables yet.
   Rather than invent a number per render, every such figure is derived
   from the student's id, so the same child always reads the same and the
   page can be screenshotted, reviewed and argued about.
 * ---------------------------------------------------------------- */

function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function stream(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const spread = (r: () => number, lo: number, hi: number) => lo + Math.round(r() * (hi - lo))

const DAY = 86_400_000
const WEEK = 7 * DAY
/** A course runs 8–10 weeks; 9 is the planning midpoint used for dates. */
const COURSE_DAYS = 63

/* ---------------------------------------------------------------- *
   Shapes
 * ---------------------------------------------------------------- */

export type CourseState = 'done' | 'live' | 'next'

export interface CourseCard {
  key: string
  index: number
  name: string
  /** The training program this course belongs to. */
  trackId: string
  code: string
  state: CourseState
  start: number
  end: number
  /** 0–100 for the live course, 100 for finished, 0 for coming. */
  progress: number
  topicsDone: number
  topicsTotal: number
  /** Mentor's closing mark out of 5 — finished courses only. */
  score?: number
  piecesPublished?: number
  /** False when the course is a paid-for record with no content built yet. */
  detailed: boolean
}

export interface SkillItem {
  id: string
  name: string
  /** The session that teaches it — the parent's "where did this come from". */
  from: string
  state: 'have' | 'now' | 'next'
  /** Mentor-assessed; acquired skills only. */
  level?: number
  minutes: number
}

export interface Competency { name: string; score: number; delta: number }

export interface Performance {
  progress: number
  topicsDone: number
  topicsTotal: number
  tasksAnswered: number
  tasksTotal: number
  accuracy: number
  attended: number
  attendable: number
  mentorScore: number
  reviewHours: number
  slaHours: number
  onTimeRate: number
  weeklyMinutes: number[]
  competencies: Competency[]
  strengths: string[]
  focus: string[]
  /** A band inside the cohort — never a leaderboard position. */
  band: string
}

export interface CohortContext {
  n: number
  median: number
  zeroPct: number
  earningPct: number
  label: string
  /** The whole distribution, so the median is never read alone. */
  buckets: Array<{ label: string; n: number; holdsMe: boolean }>
}

export interface Roi {
  fees: number
  income: number
  payback: number
  /** Fees ÷ pieces published. A backward-looking division, not a valuation. */
  costPerPiece: number | null
  assets: Array<{ label: string; value: string; note: string }>
  /** Cumulative, week by week, since the current course started. */
  weeks: Array<{ label: string; fees: number; income: number }>
  cohort: CohortContext
}

/* ---------------------------------------------------------------- *
   The program journey — the funnel on the reporting summary.

   finished → in progress → soon → recommended. The first three are the
   child's own record; the fourth is IBSRA's program path (admin-authored in
   lib/programs.ts) read forward from where the child is now.
 * ---------------------------------------------------------------- */

export type Stage = 'done' | 'live' | 'soon' | 'recommended'

export interface ProgramStage {
  stage: Stage
  track: Track
  courses: CourseCard[]
  /** Null when there is no date to report — never an invented one. */
  start: number | null
  end: number | null
  progress: number
  /** Mentor's closing mark out of 5 — finished programs only. */
  score?: number
  /** Topics, grouped by the session that teaches them. */
  learn: Array<{ session: string; topics: Array<{ id: string; name: string; state: 'have' | 'now' | 'next' }> }>
  skills: Array<{ name: string; state: 'have' | 'building' | 'will'; score?: number }>
  assets: Array<{ name: string; note: string; state: 'have' | 'making' | 'will' }>
  /** Recommended only: the program it follows. */
  after?: string
}

export interface ParentData {
  parent: Person | undefined
  child: Person
  track: Track | undefined
  loop: Loop | undefined
  mentor: Person | undefined
  cohortName: string
  sessions: Session[]
  courses: CourseCard[]
  journey: ProgramStage[]
  skills: SkillItem[]
  performance: Performance
  roi: Roi
  /** The reporting window named in the header — the current course. */
  period: { from: number; to: number }
}

/* ---------------------------------------------------------------- *
   The hook
 * ---------------------------------------------------------------- */

export function useParent(): ParentData {
  const db = useStore(s => s.db)

  return useMemo<ParentData>(() => {
    /* Auth is out of scope, so "my child" is the furthest-along student who
       has actually earned something — the account most worth designing for. */
    const students = db.people.filter(p => p.role === 'student')
    const child = students.find(p => (p.verifiedIncome ?? 0) > 0 && (p.progress ?? 0) > 40 && (p.feesPaid ?? 0) > 4900)
      ?? students.find(p => (p.verifiedIncome ?? 0) > 0 && (p.progress ?? 0) > 40)
      ?? students.find(p => (p.verifiedIncome ?? 0) > 0)
      ?? students[0]

    const parent = db.people.find(p => p.id === child.parentId)
    const cohort = db.cohorts.find(c => c.id === child.cohortId)
    const loop = db.loops.find(l => l.id === cohort?.loopId)
    const track = db.tracks.find(t => t.id === child.trackId)
    const mentor = db.people.find(p => p.id === cohort?.instructorId)

    const rnd = stream(seedOf(child.id))
    const fees = child.feesPaid ?? 0
    const income = child.verifiedIncome ?? 0
    const progress = child.progress ?? 0

    /* ---- content the child can actually open ---- */
    const sessions = db.sessions
      .filter(s => s.loopId === loop?.id && s.status === 'published')
      .sort((a, b) => a.order - b.order)

    const flatTitles = sessions.flatMap(s => s.titles.map(t => ({
      id: t.id, name: t.name, from: s.name, minutes: t.estimatedMin, tasks: t.tasks.length,
    })))
    const topicsTotal = flatTitles.length
    const topicsDone = Math.round((progress / 100) * topicsTotal)

    /* ---- the program journey ----
       Fees say how many courses were bought (the first at founding price).
       Every course before the current one was spent in the programs the admin
       path says lead into this one; with no predecessor, they were earlier
       courses of this same program. Forward from here, "soon" is the first
       next program with an intake already scheduled, and "recommended" is the
       rest of the admin's path. */
    const tracksById = new Map(db.tracks.map(t => [t.id, t]))
    const paidCourses = fees <= 4900 ? 1 : 1 + Math.round((fees - 4900) / 6900)
    const priorCourses = paidCourses - 1
    const liveStart = loop ? new Date(loop.startDate).getTime() : Date.now()
    const liveEnd = loop ? new Date(loop.endDate).getTime() : Date.now() + COURSE_DAYS * DAY
    const gap = (COURSE_DAYS + 7) * DAY

    const stemOf = (trackId: string) =>
      db.loops.find(l => l.trackId === trackId)?.code.split('-')[0]
      ?? (tracksById.get(trackId)?.name ?? 'PRG').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
    const firstLoopOf = (trackId: string) =>
      db.loops.filter(l => l.trackId === trackId).sort((a, b) => a.index - b.index)[0]

    /* Which program each earlier course was spent in, oldest first. */
    const preds = child.trackId ? comesAfter(child.trackId, db.tracks).filter(id => tracksById.has(id)) : []
    const donePrograms = preds.slice(0, priorCourses)
    const priorPlan: string[] = donePrograms.length
      ? Array.from({ length: priorCourses }, (_, i) => donePrograms[Math.min(i, donePrograms.length - 1)])
      : Array.from({ length: priorCourses }, () => child.trackId ?? '')
    const perProgram = new Map<string, number>()

    const courses: CourseCard[] = priorPlan.map((trackId, i) => {
      const back = priorCourses - i
      const idx = (perProgram.get(trackId) ?? 0) + 1
      perProgram.set(trackId, idx)
      return {
        key: `past_${i + 1}`,
        index: idx,
        name: `${tracksById.get(trackId)?.name ?? 'Program'} · Course ${idx}`,
        trackId,
        code: `${stemOf(trackId)}-C${idx}`,
        state: 'done' as const,
        start: liveStart - back * gap,
        end: liveStart - (back - 1) * gap - 7 * DAY,
        progress: 100,
        topicsDone: spread(rnd, 14, 22),
        topicsTotal: spread(rnd, 22, 26),
        score: Math.round((3.4 + rnd() * 1.4) * 10) / 10,
        piecesPublished: spread(rnd, 1, 3),
        detailed: true,
      }
    })

    const liveIndex = (perProgram.get(child.trackId ?? '') ?? 0) + 1
    if (loop && track) {
      courses.push({
        key: loop.id, index: liveIndex, name: `${track.name} · Course ${liveIndex}`, trackId: track.id,
        code: loop.code, state: 'live',
        start: liveStart, end: liveEnd, progress, topicsDone, topicsTotal,
        piecesPublished: child.portfolioPieces ?? 0, detailed: true,
      })
    }

    /* Soon: the first program on the path with an intake already on the calendar. */
    /* What this program produces is still authored in lib/programs; what
       comes AFTER it is the admin's own connection. */
    const path = pathOf(child.trackId)
    const childTrack = child.trackId ? tracksById.get(child.trackId) : undefined
    const soonNext = childTrack
      ? leadsTo(childTrack, db.tracks).find(id =>
          db.loops.some(l => l.trackId === id && l.status === 'planning'))
      : undefined
    const soonLoop = soonNext
      ? db.loops.filter(l => l.trackId === soonNext && l.status === 'planning').sort((a, b) => a.index - b.index)[0]
      : undefined
    if (soonLoop && soonNext) {
      courses.push({
        key: soonLoop.id, index: 1, name: `${tracksById.get(soonNext)!.name} · Course 1`,
        trackId: soonNext, code: soonLoop.code, state: 'next',
        start: new Date(soonLoop.startDate).getTime(), end: new Date(soonLoop.endDate).getTime(),
        progress: 0, topicsDone: 0, topicsTotal: 0, detailed: true,
      })
    }

    /* ---- skills: held · being worked on now · queued ----
       "Now" is the session the child is inside; everything after it is queued.
       Nothing is called a gap that the course does not actually close. */
    const currentSession = flatTitles[topicsDone]?.from ?? flatTitles[flatTitles.length - 1]?.from
    const skills: SkillItem[] = flatTitles.map((t, i) => (
      i < topicsDone
        ? { id: t.id, name: t.name, from: t.from, minutes: t.minutes, state: 'have' as const, level: spread(rnd, 58, 96) }
        : { id: t.id, name: t.name, from: t.from, minutes: t.minutes, state: t.from === currentSession ? 'now' as const : 'next' as const }
    ))

    /* ---- performance ---- */
    const tasksTotal = flatTitles.reduce((a, t) => a + t.tasks, 0)
    const answerRate = 0.72 + rnd() * 0.26
    const tasksAnswered = Math.round(flatTitles.slice(0, topicsDone).reduce((a, t) => a + t.tasks, 0) * answerRate)
    const liveSessions = db.sessions.filter(s => s.loopId === loop?.id && s.type === 'live').length
    const attendable = Math.max(1, Math.round(liveSessions * (progress / 100)))
    const attended = Math.max(0, attendable - spread(rnd, 0, 2))
    const reviewHours = mentor?.reviewSlaHours ?? 24

    const competencies: Competency[] = path.competencies.map(name => ({
      name,
      score: Math.round((2.6 + rnd() * 2.3) * 10) / 10,
      delta: Math.round((rnd() * 1.2 - 0.25) * 10) / 10,
    }))
    const mentorScore = Math.round((competencies.reduce((a, c) => a + c.score, 0) / competencies.length) * 10) / 10

    const elapsedWeeks = Math.max(4, Math.min(10, Math.ceil((Date.now() - liveStart) / WEEK)))
    const weeklyMinutes = Array.from({ length: elapsedWeeks }, () => spread(rnd, 45, 260))

    const ranked = [...competencies].sort((a, b) => b.score - a.score)
    const performance: Performance = {
      progress, topicsDone, topicsTotal, tasksAnswered, tasksTotal,
      accuracy: spread(rnd, 61, 93),
      attended, attendable, mentorScore, reviewHours, slaHours: 72,
      onTimeRate: spread(rnd, 64, 97),
      weeklyMinutes, competencies,
      strengths: ranked.slice(0, 2).map(c => c.name),
      focus: ranked.slice(-2).map(c => c.name),
      band: progress >= 70 ? 'Top third of the cohort' : progress >= 40 ? 'Middle of the cohort' : 'Behind the cohort pace',
    }

    /* ---- return on the money ----
       Assets are counted and evidenced, never priced. Putting an EGP figure on
       an unsold portfolio piece would be a valuation, and a valuation of a
       child's unsold work is exactly the claim this product refuses to make. */
    const pieces = child.portfolioPieces ?? 0
    const mentorHours = sessions.length * 2 + pieces * 3
    const assets: Roi['assets'] = [
      { label: 'Published pieces', value: String(pieces), note: `Mentor-approved, client-facing, published under ${child.name.split(' ')[0]}'s own name` },
      { label: 'Topics owned outright', value: `${topicsDone} of ${topicsTotal}`, note: 'Recordings and workbooks stay accessible after the course closes' },
      { label: 'Mentor hours', value: `${mentorHours}h`, note: `${mentor?.name ?? 'A mentor'} · ${reviewHours}h median review turnaround` },
      { label: 'Live sessions run', value: String(liveSessions), note: 'Small cohort, scheduled, recorded' },
    ]

    const spanWeeks = Math.max(6, Math.ceil((liveEnd - liveStart) / WEEK))
    const elapsed = Math.max(1, Math.min(spanWeeks, Math.ceil((Date.now() - liveStart) / WEEK)))
    /* Income lands in lumps when a client pays, so the curve steps, it does not
       ramp. Fees step too — a course is billed once, not monthly. */
    const lumps = income > 0 ? [0.34, 0.28, 0.38] : []
    const lumpWeeks = lumps.map((_, i) => Math.round(((i + 1.4) / (lumps.length + 1)) * elapsed))
    const weeks = Array.from({ length: spanWeeks }, (_, i) => {
      const w = i + 1
      const earned = lumps.reduce((a, share, k) => a + (w >= lumpWeeks[k] && w <= elapsed ? share * income : 0), 0)
      return { label: `w${w}`, fees, income: Math.round(earned) }
    })

    const peers = db.people.filter(p => p.role === 'student' && p.trackId === child.trackId)
    const peerIncome = peers.map(p => p.verifiedIncome ?? 0)

    /* The distribution, not just its middle. A parent who sees only the median
       has been told the flattering half of the truth. */
    const EDGES: Array<[string, number, number]> = [
      ['Nothing', 0, 0],
      ['Under 1k', 1, 999],
      ['1k – 2.5k', 1000, 2499],
      ['2.5k – 5k', 2500, 4999],
      ['5k and up', 5000, Infinity],
    ]
    const buckets = EDGES.map(([label, lo, hi]) => ({
      label,
      n: peerIncome.filter(v => v >= lo && v <= hi).length,
      holdsMe: income >= lo && income <= hi,
    }))

    /* ---- the journey, one card per program ----
       What a program teaches is read from its real sessions, so a card can
       never describe content that is not built. */
    const curriculumOf = (trackId: string) => {
      const l = firstLoopOf(trackId)
      return db.sessions
        .filter(s => s.loopId === l?.id)
        .sort((a, b) => a.order - b.order)
        .map(s => ({ session: s.name, topics: s.titles.map(t => ({ id: t.id, name: t.name })) }))
    }
    const allHave = (trackId: string): ProgramStage['learn'] =>
      curriculumOf(trackId).map(g => ({ ...g, topics: g.topics.map(t => ({ ...t, state: 'have' as const })) }))
    const allNext = (trackId: string): ProgramStage['learn'] =>
      curriculumOf(trackId).map(g => ({ ...g, topics: g.topics.map(t => ({ ...t, state: 'next' as const })) }))

    const journey: ProgramStage[] = []

    for (const id of [...new Set(priorPlan)].filter(id => id !== child.trackId)) {
      const t = tracksById.get(id)!
      const own = courses.filter(c => c.trackId === id)
      const score = Math.round((own.reduce((a, c) => a + (c.score ?? 0), 0) / own.length) * 10) / 10
      journey.push({
        stage: 'done', track: t, courses: own,
        start: own[0].start, end: own[own.length - 1].end, progress: 100, score,
        learn: allHave(id),
        skills: pathOf(id).competencies.map(name => ({ name, state: 'have' as const, score: Math.round((3.2 + rnd() * 1.7) * 10) / 10 })),
        assets: pathOf(id).assets.map(a => ({ ...a, state: 'have' as const })),
      })
    }

    if (track) {
      const madeSoFar = Math.round((progress / 100) * path.assets.length)
      journey.push({
        stage: 'live', track,
        courses: courses.filter(c => c.trackId === track.id),
        start: liveStart, end: liveEnd, progress,
        learn: sessions.map(s => ({
          session: s.name,
          topics: s.titles.map(tt => ({ id: tt.id, name: tt.name, state: skills.find(k => k.id === tt.id)?.state ?? 'next' })),
        })),
        skills: competencies.map(c => ({ name: c.name, state: c.score >= 3.5 ? 'have' as const : 'building' as const, score: c.score })),
        assets: path.assets.map((a, i) => ({ ...a, state: i < madeSoFar ? 'have' as const : 'making' as const })),
      })
    }

    if (soonNext && soonLoop) {
      const t = tracksById.get(soonNext)!
      journey.push({
        stage: 'soon', track: t, courses: courses.filter(c => c.trackId === t.id),
        start: new Date(soonLoop.startDate).getTime(), end: new Date(soonLoop.endDate).getTime(), progress: 0,
        learn: allNext(t.id),
        skills: pathOf(t.id).competencies.map(name => ({ name, state: 'will' as const })),
        assets: pathOf(t.id).assets.map(a => ({ ...a, state: 'will' as const })),
        after: track?.name,
      })
    }

    /* Recommended: the admin's "what comes next" from every program the child
       is in or booked into, minus anything already on the journey. */
    const onJourney = new Set(journey.map(j => j.track.id))
    const fromIds = journey.filter(j => j.stage === 'live' || j.stage === 'soon').map(j => j.track.id)
    for (const fromId of fromIds) {
      const fromTrack = tracksById.get(fromId)
      for (const nextId of fromTrack ? leadsTo(fromTrack, db.tracks) : []) {
        const t = tracksById.get(nextId)
        if (!t || onJourney.has(t.id)) continue
        onJourney.add(t.id)
        const intake = db.loops
          .filter(l => l.trackId === t.id && new Date(l.startDate).getTime() > Date.now())
          .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
        journey.push({
          stage: 'recommended', track: t, courses: [],
          start: intake ? new Date(intake.startDate).getTime() : null,
          end: intake ? new Date(intake.endDate).getTime() : null,
          progress: 0,
          learn: allNext(t.id),
          skills: pathOf(t.id).competencies.map(name => ({ name, state: 'will' as const })),
          assets: pathOf(t.id).assets.map(a => ({ ...a, state: 'will' as const })),
          after: tracksById.get(fromId)?.name,
        })
      }
    }

    return {
      parent, child, track, loop, mentor,
      cohortName: cohort?.name ?? '—',
      sessions, courses, journey, skills, performance,
      roi: {
        fees, income,
        payback: fees ? income / fees : 0,
        costPerPiece: pieces ? Math.round(fees / pieces) : null,
        assets, weeks,
        cohort: {
          n: peers.length,
          median: median(peerIncome),
          zeroPct: peers.length ? Math.round((peerIncome.filter(v => v === 0).length / peers.length) * 100) : 0,
          earningPct: peers.length ? Math.round((peerIncome.filter(v => v > 0).length / peers.length) * 100) : 0,
          label: track?.name ?? 'this program',
          buckets,
        },
      },
      period: { from: liveStart, to: liveEnd },
    }
  }, [db])
}

/* Shared derivations the three pages agree on, so a badge on one page cannot
   contradict the same badge on another. */
export const paybackTone = (x: number) => (x >= 1 ? 'teal' : x >= 0.5 ? 'gold' : 'line')
export const paybackWord = (x: number) =>
  (x >= 1 ? 'Fees returned in full' : x >= 0.5 ? 'At or above the 0.5× target' : 'Below the 0.5× target')
export const scoreTone = (x: number) => (x >= 4 ? 'teal' : x >= 3 ? 'brand' : 'gold')
