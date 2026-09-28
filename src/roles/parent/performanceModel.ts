/* ==========================================================================
   Parent · performance, one slice at a time.

   The performance page cuts the child's record three ways — training
   program, course, session — and every section on it reads the same cut.
   This file builds that tree once; the page only filters it.

   The rules that shape every number here, restated from data.ts:
     · Attendance counts live classes only. A recording has no class to miss.
     · Assets are named and counted, never priced. An asset's return is the
       verified income it has already brought in, divided by the share of
       fees that built it. No paying client means 0×, never a valuation.
     · Nothing past today. A trend compares two windows that already closed.
   ========================================================================== */

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { median } from '@/lib/format'
import { pathOf } from '@/lib/programs'
import type { DB, Session, TaskKind, Track } from '@/lib/types'
import type { CohortContext, CourseCard, ParentData, ProgramStage } from './data'

/* Submissions, attendance and the income log do not exist as tables yet, so
   those figures are seeded from the child's id — the same child reads the
   same on every load. Kept local rather than exported from data.ts so this
   page does not widen that file's surface. */
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
/** KM-3: the program commits to a median education payback of at least 0.5×. */
export const PAYBACK_TARGET = 0.5
/** A course is billed once — the first at the founding price, every later one
 *  at the standard price. The same split the investment page shows. */
const FOUNDING_FEE = 4900
const STANDARD_FEE = 6900

/* ---------------------------------------------------------------- *
   Shapes
 * ---------------------------------------------------------------- */

export type TopicState = 'have' | 'now' | 'next'
export type AssetState = 'have' | 'making' | 'will'
export type Attendance = 'attended' | 'missed' | 'upcoming' | 'recorded'

export interface TopicRow {
  id: string
  name: string
  minutes: number
  state: TopicState
  /** Mentor-assessed, 0–100. Covered topics only. */
  level?: number
}

export interface TaskRow {
  id: string
  question: string
  kind: TaskKind
  points: number
  /** marked: handed in and marked · missing: was due, never came · open: not due yet */
  status: 'marked' | 'missing' | 'open'
  /** 0–100. A choice question is right or wrong; the rest carry a mentor's mark. */
  mark?: number
  onTime?: boolean
}

export interface SessionRow {
  /** Unique across courses — a finished course can reuse a loop's sessions. */
  key: string
  id: string
  name: string
  order: number
  courseCode: string
  live: boolean
  when: string | null
  state: TopicState
  attendance: Attendance
  topics: TopicRow[]
  tasks: TaskRow[]
}

export interface AssetRow {
  id: string
  name: string
  note: string
  state: AssetState
  courseKey: string
  courseCode: string
  /** EGP of fees that built it. 0 for a course not charged yet. */
  feeShare: number
  /** When it was finished — the earliest a client could have paid for it. */
  madeAt: number
  /** Verified and cumulative, EGP. */
  income: number
  /** Verified income landed in the last 30 days, and in the 30 before that. */
  last30: number
  prev30: number
  /** income ÷ feeShare. Null when nothing was charged for it. */
  roi: number | null
  /** The same ratio as it stood 30 days ago. */
  roi30ago: number | null
  /** People who bought or enrolled in this piece. 0 until it is finished. */
  demand: number
  /** Client feedback: how many reviewed it, and the average out of 5. */
  reviews: number
  rating: number | null
  /** Demand and feedback folded into one score out of 100 — a measure of
   *  how wanted the piece is, never a price. Null until it is finished. */
  value: number | null
}

export interface CourseRow {
  card: CourseCard
  /** EGP. 0 for a course that has not been charged. */
  fee: number
  sessions: SessionRow[]
  assets: AssetRow[]
}

export interface ProgramRow {
  track: Track
  stage: 'done' | 'live' | 'soon'
  courses: CourseRow[]
  /** Everyone in this program — so no income figure is ever read alone. */
  cohort: CohortContext & { medianPayback: number }
}

/* ---------------------------------------------------------------- *
   Roll-ups the page uses at every level of the slice
 * ---------------------------------------------------------------- */

/** Points-weighted mark over what was handed in. Null when nothing was. */
export function markOf(tasks: TaskRow[]): number | null {
  const got = tasks.filter(t => t.status === 'marked')
  const pts = got.reduce((a, t) => a + t.points, 0)
  return pts ? Math.round(got.reduce((a, t) => a + (t.mark ?? 0) * t.points, 0) / pts) : null
}

export function attendanceOf(rows: SessionRow[]) {
  const live = rows.filter(r => r.live)
  const attended = live.filter(r => r.attendance === 'attended').length
  const missed = live.filter(r => r.attendance === 'missed').length
  return { live: live.length, held: attended + missed, attended, missed, upcoming: live.length - attended - missed }
}

/* ---------------------------------------------------------------- *
   The hook
 * ---------------------------------------------------------------- */

export function usePerformanceModel(d: ParentData): ProgramRow[] {
  const db = useStore(s => s.db)
  return useMemo(() => build(db, d), [db, d])
}

function build(db: DB, d: ParentData): ProgramRow[] {
  const rnd = stream(seedOf(`${d.child.id}:performance`))
  const now = Date.now()
  const perf = d.performance
  const liveKey = d.loop?.id
  const skillById = new Map(d.skills.map(s => [s.id, s]))

  const charged = d.courses.filter(c => c.state !== 'next')
  const feeOf = (c: CourseCard) => {
    const i = charged.indexOf(c)
    return i < 0 ? 0 : i === 0 ? FOUNDING_FEE : STANDARD_FEE
  }

  const published = (loopId: string) => db.sessions
    .filter(s => s.loopId === loopId && s.status === 'published')
    .sort((a, b) => a.order - b.order)

  /* A finished course is a record of fees paid, so its sessions are read from
     the program's own loop of the same number — and never the loop running now. */
  const sessionsOf = (c: CourseCard): Session[] => {
    if (c.key === liveKey) return d.sessions
    if (c.state === 'next') return published(c.key)
    const loops = db.loops.filter(l => l.trackId === c.trackId)
    const loop = loops.find(l => l.index === c.index && l.id !== liveKey)
      ?? loops.find(l => l.id !== liveKey) ?? loops[0]
    return loop ? published(loop.id) : []
  }

  const courseRow = (c: CourseCard, stageAssets?: ProgramStage['assets']): CourseRow => {
    const sessions = sessionsOf(c)
    const isLive = c.key === liveKey && c.state === 'live'

    const rows: SessionRow[] = sessions.map(s => {
      const topics: TopicRow[] = s.titles.map(t => {
        const base = { id: t.id, name: t.name, minutes: t.estimatedMin }
        if (c.state === 'done') return { ...base, state: 'have' as const, level: spread(rnd, 58, 96) }
        if (isLive) {
          /* The live course reads the summary's own ticks, so the two pages agree. */
          const k = skillById.get(t.id)
          return { ...base, state: k?.state ?? 'next', level: k?.level }
        }
        return { ...base, state: 'next' as const }
      })
      const state: TopicState = topics.length === 0
        ? (c.state === 'done' ? 'have' : 'next')
        : topics.every(t => t.state === 'have') ? 'have'
        : topics.some(t => t.state !== 'next') ? 'now' : 'next'
      return {
        key: `${c.key}:${s.id}`, id: s.id, name: s.name, order: s.order, courseCode: c.code,
        live: s.type === 'live', when: s.scheduledAt, state,
        attendance: s.type === 'live' ? 'upcoming' : 'recorded',
        topics, tasks: [],
      }
    })

    /* ---- attendance: live classes only ---- */
    const lives = rows.filter(r => r.live)
    if (c.state === 'done') {
      for (const r of lives) r.attendance = rnd() < 0.88 ? 'attended' : 'missed'
    } else if (isLive) {
      /* Held and missed counts match the summary's figures exactly; only which
         class was missed is placed here. */
      const held = lives.slice(0, Math.min(lives.length, perf.attendable))
      const missN = Math.max(0, Math.min(held.length, perf.attendable - perf.attended))
      for (const r of held) r.attendance = 'attended'
      held.map(r => ({ r, k: rnd() })).sort((a, b) => a.k - b.k)
        .slice(0, missN).forEach(({ r }) => { r.attendance = 'missed' })
    }

    /* ---- assignments: due once the topic is covered ---- */
    const accuracy = isLive ? perf.accuracy : 80
    const onTimeRate = isLive ? perf.onTimeRate : 85
    let budget = isLive ? perf.tasksAnswered : Number.POSITIVE_INFINITY
    rows.forEach((r, i) => {
      r.tasks = sessions[i].titles.flatMap((t, ti) => t.tasks.map((k): TaskRow => {
        const base = { id: k.id, question: k.question, kind: k.kind, points: k.points }
        if (r.topics[ti].state !== 'have') return { ...base, status: 'open' }
        const handedIn = isLive ? budget > 0 : rnd() > 0.08
        if (isLive) budget--
        if (!handedIn) return { ...base, status: 'missing' }
        const choice = k.kind === 'mcq' || k.kind === 'multi'
        return {
          ...base, status: 'marked',
          mark: choice ? (rnd() * 100 < accuracy ? 100 : 0) : spread(rnd, 55, 98),
          onTime: rnd() * 100 < onTimeRate,
        }
      }))
    })

    /* ---- assets: every course ends in one real brief, and leaves these ---- */
    const src = stageAssets ?? pathOf(c.trackId).assets.map(a => ({
      ...a, state: (c.state === 'done' ? 'have' : c.state === 'live' ? 'making' : 'will') as AssetState,
    }))
    const fee = feeOf(c)
    const share = src.length ? Math.round(fee / src.length) : 0
    const span = Math.max(0, now - c.start)
    const assets: AssetRow[] = src.map((a, i) => ({
      id: `${c.key}:${i}`, name: a.name, note: a.note, state: a.state,
      courseKey: c.key, courseCode: c.code,
      feeShare: a.state === 'will' ? 0 : share,
      madeAt: c.state === 'done' ? c.end : c.start + ((i + 1) / (src.length + 1)) * span,
      income: 0, last30: 0, prev30: 0, roi: null, roi30ago: null,
      demand: 0, reviews: 0, rating: null, value: null,
    }))

    return { card: c, fee, sessions: rows, assets }
  }

  const programs: ProgramRow[] = d.journey
    .filter(j => j.stage !== 'recommended')
    .map(j => ({
      track: j.track,
      stage: j.stage as ProgramRow['stage'],
      courses: d.courses
        .filter(c => c.trackId === j.track.id)
        .map(c => courseRow(c, c.key === liveKey && j.stage === 'live' ? j.assets : undefined)),
      cohort: cohortOf(db, j.track),
    }))

  /* ---- verified income, placed on the assets that earned it ---- */
  const all = programs.flatMap(p => p.courses.flatMap(c => c.assets))
  let held = all.filter(a => a.state === 'have')
  /* A client paid, so the piece they paid for exists. */
  if (!held.length && d.roi.income > 0) {
    const first = all.find(a => a.state === 'making')
    if (first) { first.state = 'have'; held = [first] }
  }
  for (const a of held) { a.roi = a.feeShare ? 0 : null; a.roi30ago = a.roi }
  allocate(held, d.roi.income, rnd, now)
  for (const a of held) rate(a, rnd)

  return programs
}

/** Demand at which a piece scores full marks for demand. */
const DEMAND_FULL = 12

/* Demand and feedback for a finished piece. A piece that has earned was
   bought at least once, so it always carries some demand; a piece that has
   not earned can still have been enrolled in or reviewed.
   The value score is 60% demand (people, capped at DEMAND_FULL) and 40%
   feedback (average rating). With no reviews, only the demand part counts. */
function rate(a: AssetRow, rnd: () => number) {
  a.demand = a.income > 0 ? 2 + Math.floor(rnd() * 12) : Math.floor(rnd() * 4)
  a.reviews = Math.min(a.demand, Math.floor(a.demand * (0.3 + rnd() * 0.5)))
  a.rating = a.reviews ? Math.round((3.4 + rnd() * 1.5) * 10) / 10 : null
  const demandPart = Math.min(1, a.demand / DEMAND_FULL) * 60
  const feedbackPart = a.rating === null ? 0 : ((a.rating - 1) / 4) * 40
  a.value = Math.round(demandPart + feedbackPart)
}

/* Splits the child's verified income across the assets they hold. Some
   assets earn nothing, and are shown at 0× — that is the honest share of a
   portfolio, not a gap to be filled in. */
function allocate(held: AssetRow[], total: number, rnd: () => number, now: number) {
  if (!held.length || total <= 0) return
  const weights = held.map(() => (rnd() < 0.35 ? 0 : 0.4 + rnd()))
  if (!weights.some(w => w > 0)) weights[0] = 1
  const sum = weights.reduce((a, b) => a + b, 0)
  const amounts = weights.map(w => Math.floor(((w / sum) * total) / 50) * 50)
  amounts[amounts.indexOf(Math.max(...amounts))] += total - amounts.reduce((a, b) => a + b, 0)

  held.forEach((a, i) => {
    const amount = amounts[i]
    if (!amount) return
    /* One to three client payments, between the day it was made and today. */
    const payments = 1 + Math.floor(rnd() * 3)
    const window = Math.max(DAY, now - a.madeAt)
    let left = amount
    let before30 = 0
    for (let j = 0; j < payments; j++) {
      const part = j === payments - 1
        ? left
        : Math.min(left, Math.round((amount * (0.25 + rnd() * 0.3)) / 50) * 50)
      left -= part
      const age = now - (a.madeAt + rnd() * window)
      if (age <= 30 * DAY) a.last30 += part
      else if (age <= 60 * DAY) a.prev30 += part
      if (age > 30 * DAY) before30 += part
    }
    a.income = amount
    a.roi = a.feeShare ? amount / a.feeShare : null
    a.roi30ago = a.feeShare ? before30 / a.feeShare : null
  })
}

/* The program's whole cohort: n, median, the share at zero and the full
   distribution — the disclosure every income figure has to travel with. */
function cohortOf(db: DB, track: Track): ProgramRow['cohort'] {
  const peers = db.people.filter(p => p.role === 'student' && p.trackId === track.id)
  const income = peers.map(p => p.verifiedIncome ?? 0)
  const EDGES: Array<[string, number, number]> = [
    ['Nothing', 0, 0],
    ['Under 1k', 1, 999],
    ['1k – 2.5k', 1000, 2499],
    ['2.5k – 5k', 2500, 4999],
    ['5k and up', 5000, Number.POSITIVE_INFINITY],
  ]
  return {
    n: peers.length,
    median: median(income),
    zeroPct: peers.length ? Math.round((income.filter(v => v === 0).length / peers.length) * 100) : 0,
    earningPct: peers.length ? Math.round((income.filter(v => v > 0).length / peers.length) * 100) : 0,
    label: track.name,
    buckets: EDGES.map(([label, lo, hi]) => ({
      label, n: income.filter(v => v >= lo && v <= hi).length, holdsMe: false,
    })),
    medianPayback: median(peers.map(p => (p.feesPaid ? (p.verifiedIncome ?? 0) / p.feesPaid : 0))),
  }
}
