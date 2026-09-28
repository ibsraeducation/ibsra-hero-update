/* ==========================================================================
   Performance Analysis — fixture students

   Four records with a fixed clock, one per shape the calculations have to
   get right: a student improving, a student flat, a student declining, and
   a student two weeks in with almost nothing on file.

   Everything is generated from the profile below, so a test can change one
   number and read the effect on every card. Nothing here is random.
   ========================================================================== */

import { monthWindow, plusDays, quarterWindow, weekKey } from './time'
import type {
  Asset, AttendanceRow, MonthlyReview, PeerRating, PerfInput, Project, Session,
  SkillScore, WeeklyPulse,
} from './types'

/** The fixture clock. Late enough in the month that a month of weeks exists. */
export const NOW = '2026-09-28T12:00:00.000Z'

export type Profile = 'improving' | 'flat' | 'declining' | 'thin'

interface Shape {
  enrolledAt: string
  /** Due tasks in the first four weeks, and how many landed on time. */
  baseDue: number
  baseOnTime: number
  /** Of the twelve quarter tasks, how many landed on time. */
  curOnTime: number
  /** Sessions held in the first four weeks, and attended. */
  baseSessions: number
  baseAttended: number
  /** Index of the first quarter session onwards that is missed. */
  missFromWeek: number
  peerStart: number
  peerNow: number
  helpStepsFirst: number
  helpStepsLast: number
  marksFirst: [number, number]
  marksLast: [number, number]
  confidenceStart: number
  confidenceNow: number
  pulsePrev: number
  pulseNow: number
  skillStart: number[]
  skillNow: number[]
  levelStart: number
  levelNow: number
  snapshot: { portfolioValue: number; clientReady: number; gaps: number; level: number }
  clientProjectLive: boolean
  productLive: boolean
  paid: number
}

const SHAPES: Record<Exclude<Profile, 'thin'>, Shape> = {
  improving: {
    enrolledAt: '2026-01-12T00:00:00.000Z',
    baseDue: 10, baseOnTime: 6, curOnTime: 11,
    baseSessions: 4, baseAttended: 3, missFromWeek: 99,
    peerStart: 3, peerNow: 5,
    helpStepsFirst: 5, helpStepsLast: 2,
    marksFirst: [55, 61], marksLast: [82, 86],
    confidenceStart: 2, confidenceNow: 4,
    pulsePrev: 4, pulseNow: 5,
    skillStart: [2, 2, 3, 3, 4], skillNow: [4, 4, 3, 5, 4],
    levelStart: 1, levelNow: 3,
    snapshot: { portfolioValue: 3500, clientReady: 2, gaps: 2, level: 2 },
    clientProjectLive: true, productLive: true, paid: 4000,
  },
  flat: {
    enrolledAt: '2026-01-12T00:00:00.000Z',
    baseDue: 12, baseOnTime: 9, curOnTime: 9,
    baseSessions: 12, baseAttended: 12, missFromWeek: 99,
    peerStart: 4, peerNow: 4,
    helpStepsFirst: 3, helpStepsLast: 3,
    marksFirst: [68, 68], marksLast: [68, 68],
    confidenceStart: 3, confidenceNow: 3,
    pulsePrev: 4, pulseNow: 4,
    skillStart: [2, 3, 3, 4, 4], skillNow: [2, 3, 3, 4, 4],
    levelStart: 2, levelNow: 2,
    snapshot: { portfolioValue: 0, clientReady: 2, gaps: 1, level: 2 },
    clientProjectLive: false, productLive: false, paid: 0,
  },
  declining: {
    enrolledAt: '2026-01-12T00:00:00.000Z',
    baseDue: 12, baseOnTime: 10, curOnTime: 5,
    baseSessions: 4, baseAttended: 4, missFromWeek: 4,
    peerStart: 4, peerNow: 2,
    helpStepsFirst: 2, helpStepsLast: 7,
    marksFirst: [78, 80], marksLast: [54, 58],
    confidenceStart: 4, confidenceNow: 2,
    pulsePrev: 4, pulseNow: 2,
    skillStart: [3, 3, 4, 4, 4], skillNow: [2, 2, 3, 4, 4],
    levelStart: 2, levelNow: 2,
    snapshot: { portfolioValue: 5000, clientReady: 3, gaps: 1, level: 2 },
    clientProjectLive: false, productLive: false, paid: 0,
  },
}

/* ---------------------------------------------------------------- *
   Series
 * ---------------------------------------------------------------- */

const QUARTER = quarterWindow(NOW)
const MONTH = monthWindow(NOW)

/** Twelve Wednesdays from 8 July to 23 September — one task a week. */
const QUARTER_TASK_DAYS = Array.from({ length: 12 }, (_, i) => plusDays('2026-07-08T09:00:00.000Z', i * 7))
/** Twelve Tuesdays from 7 July to 22 September — one session a week. */
const QUARTER_SESSION_DAYS = Array.from({ length: 12 }, (_, i) => plusDays('2026-07-07T17:00:00.000Z', i * 7))

const MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
const SKILLS = ['prompting', 'editing', 'story', 'delivery', 'tools']

function buildProjects(s: Shape, studentId: string): Project[] {
  const out: Project[] = []

  /* Baseline: due inside the first four weeks, half of them late. */
  for (let i = 0; i < s.baseDue; i++) {
    const due = plusDays(s.enrolledAt, 2 + i * 2)
    const onTime = i < s.baseOnTime
    out.push({
      id: `base-${i}`,
      studentId,
      title: `Warm-up ${i + 1}`,
      difficultyTier: 1,
      stepsTotal: 10,
      assignedAt: plusDays(due, -3),
      dueAt: due,
      deliveredAt: onTime ? plusDays(due, -0.5) : plusDays(due, 2),
      mark: i === 0 ? s.marksFirst[0] : i === 1 ? s.marksFirst[1] : null,
      revisionRounds: onTime ? 0 : 2,
      remindersSent: onTime ? 0 : 1,
    })
  }

  /* The quarter: one task a week, the late ones at the end of the run. */
  QUARTER_TASK_DAYS.forEach((due, i) => {
    const onTime = i < s.curOnTime
    const last = i >= QUARTER_TASK_DAYS.length - 2
    out.push({
      id: `q-${i}`,
      studentId,
      title: `Project ${i + 1}`,
      difficultyTier: 2,
      stepsTotal: 10,
      assignedAt: plusDays(due, -5),
      /* Late is late by two days, inside the same week, so a streak survives it. */
      deliveredAt: onTime ? plusDays(due, -0.5) : plusDays(due, 2),
      dueAt: due,
      mark: last ? s.marksLast[i - (QUARTER_TASK_DAYS.length - 2)] : null,
      revisionRounds: onTime ? 0 : 1,
      remindersSent: onTime ? 0 : 1,
    })
  })
  return out
}

function buildSessions(s: Shape, cohortId: string): Session[] {
  const base = Array.from({ length: s.baseSessions }, (_, i) => ({
    id: `s-base-${i}`,
    cohortId,
    heldAt: plusDays(s.enrolledAt, 1 + i * 7),
    status: 'held' as const,
  }))
  const quarter = QUARTER_SESSION_DAYS.map((heldAt, i) => ({
    id: `s-q-${i}`, cohortId, heldAt, status: 'held' as const,
  }))
  /* The baseline sessions of a long-enrolled student fall outside the quarter,
     so the two runs never double-count. */
  return [...base.filter(b => b.heldAt < QUARTER.start), ...quarter]
}

function buildAttendance(s: Shape, studentId: string, sessions: Session[]): AttendanceRow[] {
  return sessions.map(session => {
    const isBase = session.id.startsWith('s-base')
    const index = Number(session.id.split('-').at(-1))
    return {
      sessionId: session.id,
      studentId,
      attended: isBase ? index < s.baseAttended : index < s.missFromWeek,
    }
  })
}

function buildPeerRatings(s: Shape, studentId: string): PeerRating[] {
  const out: PeerRating[] = []
  const raters = ['p1', 'p2', 'p3']
  /* Three baseline weeks in February, then the four weeks of this month. */
  const startWeeks = [0, 1, 2].map(i => weekKey(plusDays('2026-02-02T00:00:00.000Z', i * 7)))
  const nowWeeks = [0, 1, 2, 3].map(i => weekKey(plusDays('2026-09-07T00:00:00.000Z', i * 7)))
  startWeeks.forEach(week => raters.forEach(raterId =>
    out.push({ raterId, rateeId: studentId, week, score: s.peerStart })))
  nowWeeks.forEach(week => raters.forEach(raterId =>
    out.push({ raterId, rateeId: studentId, week, score: s.peerNow })))
  return out
}

function buildPulses(s: Shape, studentId: string): WeeklyPulse[] {
  const august = [0, 1, 2, 3].map(i => plusDays('2026-08-03T00:00:00.000Z', i * 7))
  const september = [0, 1, 2, 3].map(i => plusDays('2026-09-07T00:00:00.000Z', i * 7))
  const row = (d: string, v: number): WeeklyPulse => ({
    studentId, week: weekKey(d), mood: v, pride: v, answeredAt: plusDays(d, 4),
  })
  return [...august.map(d => row(d, s.pulsePrev)), ...september.map(d => row(d, s.pulseNow))]
}

function buildReviews(s: Shape, studentId: string): MonthlyReview[] {
  return MONTHS.map((month, i) => {
    const first = i === 0
    const value = first ? s.confidenceStart : i === MONTHS.length - 1 ? s.confidenceNow
      : Math.round((s.confidenceStart + s.confidenceNow) / 2)
    return {
      studentId,
      month,
      confidenceSelf: value,
      confidenceMentor: value,
      mentorMoment: 'Answered a client question in the review call without being prompted.',
      continueIntent: true,
      mentorRating: 4,
    }
  })
}

function buildSkillScores(s: Shape, studentId: string): SkillScore[] {
  const start = SKILLS.map((skillId, i) => ({
    studentId, skillId, score: s.skillStart[i], month: '2026-02', mentorId: 'm1', isStart: true,
  }))
  const now = SKILLS.map((skillId, i) => ({
    studentId, skillId, score: s.skillNow[i], month: '2026-09', mentorId: 'm1', isStart: false,
  }))
  return [...start, ...now]
}

function buildAssets(s: Shape, studentId: string): Asset[] {
  const out: Asset[] = [{
    id: 'a-wip',
    studentId,
    type: 'client_project',
    title: 'Bakery promo reel',
    link: null,
    stage: 'building',
    pctDone: 60,
    shipDate: '2026-11-05T00:00:00.000Z',
    linkLive: false,
    nameVisible: false,
    consentOnFile: true,
    clientFeePaid: null,
    benchmarkType: 'promo_reel',
    mark: null,
    outsideAccepted: false,
    acceptedBy: null,
    mentorHours: 4,
    toolsCost: 120,
  }]

  if (s.clientProjectLive) {
    out.push({
      id: 'a-live',
      studentId,
      type: 'client_project',
      title: 'Dental clinic launch film',
      link: 'https://example.com/film',
      stage: 'live',
      pctDone: 100,
      shipDate: '2026-08-20T00:00:00.000Z',
      linkLive: true,
      nameVisible: true,
      consentOnFile: true,
      clientFeePaid: 4000,
      benchmarkType: 'promo_reel',
      mark: 86,
      outsideAccepted: true,
      acceptedBy: 'Clinic owner',
      mentorHours: 9,
      toolsCost: 300,
    })
  }

  if (s.productLive) {
    out.push({
      id: 'a-course',
      studentId,
      type: 'course',
      title: 'Reels in an hour — mini course',
      link: 'https://example.com/course',
      stage: 'live',
      pctDone: 100,
      shipDate: '2026-09-02T00:00:00.000Z',
      linkLive: true,
      nameVisible: true,
      consentOnFile: true,
      clientFeePaid: null,
      benchmarkType: 'mini_course',
      mark: 80,
      outsideAccepted: false,
      acceptedBy: null,
      mentorHours: 6,
      toolsCost: 0,
    })
  }
  return out
}

/* ---------------------------------------------------------------- *
   The fixtures
 * ---------------------------------------------------------------- */

/** An empty record with the clock set — the base every fixture is built on. */
export function emptyInput(id = 'stu-1', name = 'Youssef'): PerfInput {
  return {
    student: {
      id,
      name,
      courseId: 'c-video',
      cohortId: 'co-1',
      enrolledAt: plusDays(NOW, -14),
      mentorId: 'Nada',
      levelStart: null,
      levelStartLockedAt: null,
      confidenceStart: null,
      confidenceStartLockedAt: null,
      currency: 'EGP',
    },
    course: {
      id: 'c-video',
      name: 'AI video',
      skills: SKILLS.map(s => ({ id: s, name: s })),
      levelLadder: ['follows a brief', 'edits to a brief', 'edits unsupervised',
        'takes a client brief', 'runs a job end to end'],
      confidenceLadder: ['won’t speak in team', 'speaks when asked', 'shares own ideas',
        'presents to team', 'presents to client and answers questions'],
    },
    now: NOW,
    quarter: QUARTER,
    month: MONTH,
    coursePlan: [],
    sessions: [],
    attendance: [],
    projects: [],
    helpLog: [],
    skillScores: [],
    levelChanges: [],
    retentionTests: [],
    pulses: [],
    peerRatings: [],
    reviews: [],
    extraWork: [],
    assets: [],
    assetReturns: [],
    payments: [],
    benchmarks: [
      { type: 'promo_reel', price: 3500, currency: 'EGP', source: 'Cairo freelance rates 2026', reviewedAt: '2026-07-01T00:00:00.000Z' },
      { type: 'mini_course', price: 2500, currency: 'EGP', source: 'Local course marketplaces', reviewedAt: '2026-07-01T00:00:00.000Z' },
    ],
    fees: [],
    notes: [],
    proof: [],
    snapshots: [],
  }
}

export function fixture(profile: Profile): PerfInput {
  const input = emptyInput(`stu-${profile}`)
  if (profile === 'thin') {
    /* Two weeks in: one session, one task, no review, no baseline locked. */
    input.coursePlan = [{ courseId: 'c-video', topicId: 't1', plannedWeek: 1, status: 'delivered' }]
    input.sessions = [{ id: 's1', cohortId: 'co-1', heldAt: plusDays(NOW, -7), status: 'held' }]
    input.attendance = [{ sessionId: 's1', studentId: input.student.id, attended: true }]
    input.projects = [{
      id: 'p1', studentId: input.student.id, title: 'First brief', difficultyTier: 1,
      stepsTotal: 8, assignedAt: plusDays(NOW, -10), dueAt: plusDays(NOW, -3),
      deliveredAt: plusDays(NOW, -4), mark: 64, revisionRounds: 1, remindersSent: 0,
    }]
    input.assets = [{
      id: 'a1', studentId: input.student.id, type: 'client_project', title: 'Café menu clip',
      link: null, stage: 'draft', pctDone: 20, shipDate: plusDays(NOW, 45), linkLive: false,
      nameVisible: false, consentOnFile: false, clientFeePaid: null, benchmarkType: 'promo_reel',
      mark: null, outsideAccepted: false, acceptedBy: null, mentorHours: 1, toolsCost: 0,
    }]
    input.notes = [{
      id: 'n1', studentId: input.student.id, mentorId: 'Nada',
      text: 'Cut his first sequence to music without being shown the beat markers.',
      focusNext: 'Colour grading on the café clip.', linkedCardId: null, sentAt: plusDays(NOW, -1),
    }]
    return input
  }

  const s = SHAPES[profile]
  const id = input.student.id
  input.student = {
    ...input.student,
    enrolledAt: s.enrolledAt,
    levelStart: s.levelStart,
    levelStartLockedAt: plusDays(s.enrolledAt, 7),
    confidenceStart: s.confidenceStart,
    confidenceStartLockedAt: plusDays(s.enrolledAt, 30),
  }

  input.coursePlan = Array.from({ length: 30 }, (_, i) => ({
    courseId: 'c-video', topicId: `t${i}`, plannedWeek: i + 1,
    status: i < 18 ? ('delivered' as const) : ('planned' as const),
  }))
  input.projects = buildProjects(s, id)
  input.sessions = buildSessions(s, 'co-1')
  input.attendance = buildAttendance(s, id, input.sessions)

  /* Help is logged against the first and the last delivered project only. */
  const delivered = input.projects.filter(p => p.deliveredAt)
    .sort((a, b) => Date.parse(a.deliveredAt!) - Date.parse(b.deliveredAt!))
  const first = delivered[0]
  const last = delivered.at(-1)!
  input.helpLog = [
    ...Array.from({ length: s.helpStepsFirst }, (_, i) => ({
      id: `h-first-${i}`, projectId: first.id, stepNo: i + 1, type: 'P' as const,
      loggedAt: first.deliveredAt!, mentorId: 'm1',
    })),
    ...Array.from({ length: s.helpStepsLast }, (_, i) => ({
      id: `h-last-${i}`, projectId: last.id, stepNo: i + 1,
      type: i === 0 ? ('P' as const) : ('J' as const),
      loggedAt: last.deliveredAt!, mentorId: 'm1',
    })),
  ]

  input.peerRatings = buildPeerRatings(s, id)
  input.pulses = buildPulses(s, id)
  input.reviews = buildReviews(s, id)
  input.skillScores = buildSkillScores(s, id)
  input.teamTasks = { done: 9, assigned: 12 }

  input.levelChanges = [
    { studentId: id, level: 2, proposedBy: 'm1', approvedBy: 'm2', approvedAt: '2026-05-01T00:00:00.000Z' },
    ...(s.levelNow > 2
      ? [{ studentId: id, level: s.levelNow, proposedBy: 'm1', approvedBy: 'm2', approvedAt: '2026-08-01T00:00:00.000Z' }]
      : []),
  ]
  input.retentionTests = [
    { studentId: id, skillId: 'editing', taughtAt: '2026-04-01T00:00:00.000Z', testedAt: '2026-07-15T00:00:00.000Z', passed: true },
    { studentId: id, skillId: 'story', taughtAt: '2026-05-01T00:00:00.000Z', testedAt: '2026-08-15T00:00:00.000Z', passed: profile !== 'declining' },
  ]

  input.assets = buildAssets(s, id)
  input.assetReturns = s.productLive
    ? [{ assetId: 'a-course', date: '2026-09-10T00:00:00.000Z', revenue: 900, units: 6, views: 1400, source: 'Gumroad' }]
    : []
  input.payments = s.paid
    ? [{
      id: 'pay-1', studentId: id, assetId: 'a-live', amount: s.paid, currency: 'EGP',
      paidAt: '2026-08-25T00:00:00.000Z', receiptPath: '/receipts/pay-1.pdf', verified: true,
    }]
    : []
  input.fees = [{ studentId: id, amount: 12000, paidAt: '2026-01-12T00:00:00.000Z' }]
  input.extraWork = [{
    id: 'e1', studentId: id, artifactPath: '/extra/reel.mp4',
    ts: '2026-09-14T00:00:00.000Z', hours: 3.5, verified: true,
  }]

  input.snapshots = [{ studentId: id, quarter: '2026-Q2', ...s.snapshot }]

  input.notes = [
    {
      id: 'n-old', studentId: id, mentorId: 'Nada',
      text: 'Re-cut the opening six times before he was happy with it.',
      focusNext: 'Sound levels.', linkedCardId: null, sentAt: '2026-09-05T00:00:00.000Z',
    },
    {
      id: 'n-new', studentId: id, mentorId: 'Nada',
      text: 'Ran the client call himself and wrote the brief up afterwards.',
      focusNext: 'Second draft of the bakery reel.', linkedCardId: 'independence',
      sentAt: '2026-09-26T00:00:00.000Z',
    },
  ]

  input.proof = [
    { id: 'pr-1', studentId: id, area: 'character', cardId: 'independence', type: 'text', path: 'Built the whole edit alone.', consentOnFile: true, createdAt: '2026-09-10T00:00:00.000Z' },
    { id: 'pr-2', studentId: id, area: 'engagement', cardId: 'attendance', type: 'image', path: '/proof/class.jpg', consentOnFile: true, createdAt: '2026-08-18T00:00:00.000Z' },
    { id: 'pr-3', studentId: id, area: 'learning', cardId: 'project_marks', type: 'link', path: 'https://example.com/work', consentOnFile: true, createdAt: '2026-09-01T00:00:00.000Z' },
    { id: 'pr-4', studentId: id, area: 'portfolio', cardId: 'projects_delivered', type: 'video', path: '/proof/film.mp4', consentOnFile: true, createdAt: '2026-08-21T00:00:00.000Z' },
    /* No consent — must never reach a client, in any view. */
    { id: 'pr-5', studentId: id, area: 'portfolio', cardId: 'projects_delivered', type: 'image', path: '/proof/private.jpg', consentOnFile: false, createdAt: '2026-08-22T00:00:00.000Z' },
  ]

  return input
}
