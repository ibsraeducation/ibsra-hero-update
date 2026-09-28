/* ==========================================================================
   Performance Analysis — domain model

   The record side of the module: one type per table in §9 of the build
   brief, plus the shapes the calculation layer hands to a view.

   Nothing here is derived. Everything a card shows is computed in calc.ts
   from these rows, so a number and its proof can never drift apart.
   ========================================================================== */

/* ---------------------------------------------------------------- *
   Scalars
 * ---------------------------------------------------------------- */

/** ISO timestamp. Stored and compared as a string, parsed only to measure. */
export type ISODate = string
/** `2026-W07`. Weeks are the unit of the pulse, the peer rating and the streak. */
export type WeekKey = string
/** `2026-03`. Months are the unit of every mentor and student review. */
export type MonthKey = string
/** `2026-Q1`. */
export type QuarterKey = string

/** Procedural — "how do I do this". Judgment — "which of these is better". */
export type HelpType = 'P' | 'J'

export type AssetType = 'client_project' | 'course' | 'game' | 'template'
export type AssetStage = 'draft' | 'building' | 'review' | 'live'
export type SessionStatus = 'held' | 'cancelled'

/* ---------------------------------------------------------------- *
   Records — §9
 * ---------------------------------------------------------------- */

export interface Student {
  id: string
  name: string
  courseId: string
  cohortId: string
  enrolledAt: ISODate
  mentorId: string
  /** Locked at day 7 after enrolment. Null until then. */
  levelStart: number | null
  levelStartLockedAt: ISODate | null
  /** Locked at the end of month 1, from the first mentor + self rating. */
  confidenceStart: number | null
  confidenceStartLockedAt: ISODate | null
  /** The currency every money figure on this student is stated in. */
  currency: string
}

export interface Course {
  id: string
  name: string
  /** The five skills this course is measured on, in display order. */
  skills: Array<{ id: string; name: string }>
  /** Rung text for levels 1–5. */
  levelLadder: [string, string, string, string, string]
  /** Rung text for the confidence ladder, 1–5. */
  confidenceLadder: [string, string, string, string, string]
}

/** The teaching plan. Feeds the Delivered strip — our output, not his outcome. */
export interface CoursePlanRow {
  courseId: string
  topicId: string
  plannedWeek: number
  status: 'planned' | 'delivered'
}

export interface Session {
  id: string
  cohortId: string
  heldAt: ISODate
  status: SessionStatus
}

export interface AttendanceRow {
  sessionId: string
  studentId: string
  attended: boolean
}

export interface Project {
  id: string
  studentId: string
  title: string
  /** 1–3. Set at assignment; the independence gate reads it, nothing edits it here. */
  difficultyTier: number
  stepsTotal: number
  assignedAt: ISODate
  dueAt: ISODate
  deliveredAt: ISODate | null
  /** 0–100 against the fixed rubric. Null until marked. */
  mark: number | null
  revisionRounds: number
  remindersSent: number
}

export interface HelpLogRow {
  id: string
  projectId: string
  stepNo: number
  type: HelpType
  loggedAt: ISODate
  mentorId: string
}

export interface SkillScore {
  studentId: string
  skillId: string
  /** 1–5. */
  score: number
  month: MonthKey
  mentorId: string
  /** True on the first monthly review only — the locked baseline. */
  isStart: boolean
}

export interface LevelChange {
  studentId: string
  level: number
  proposedBy: string
  /** A level above the previous one needs a second mentor. Null while pending. */
  approvedBy: string | null
  approvedAt: ISODate | null
}

export interface RetentionTest {
  studentId: string
  skillId: string
  /** The skill has to have been taught at least six weeks before the test. */
  taughtAt: ISODate
  testedAt: ISODate
  passed: boolean
}

export interface WeeklyPulse {
  studentId: string
  week: WeekKey
  mood: number | null
  pride: number | null
  /** Null means the week went unanswered — silence, which admin is alerted to. */
  answeredAt: ISODate | null
}

/** Never exposed per rater, in any view. Aggregated by calc.ts and nowhere else. */
export interface PeerRating {
  raterId: string
  rateeId: string
  week: WeekKey
  score: number
}

export interface MonthlyReview {
  studentId: string
  month: MonthKey
  confidenceSelf: number | null
  confidenceMentor: number | null
  /** One observed moment. Required of the mentor alongside the rating. */
  mentorMoment: string | null
  /** Admin only. A `false` opens a mentor task and a founder call. */
  continueIntent: boolean | null
  mentorRating: number | null
}

export interface ExtraWork {
  id: string
  studentId: string
  artifactPath: string
  ts: ISODate
  hours: number
  verified: boolean
}

export interface Asset {
  id: string
  studentId: string
  type: AssetType
  title: string
  link: string | null
  stage: AssetStage
  /** 0–100. */
  pctDone: number
  shipDate: ISODate | null
  linkLive: boolean
  nameVisible: boolean
  /** No consent, no render. The server filters on this before a client sees it. */
  consentOnFile: boolean
  clientFeePaid: number | null
  benchmarkType: string | null
  /** 0–100, the mark the piece was given. Scales the benchmark price. */
  mark: number | null
  outsideAccepted: boolean
  acceptedBy: string | null
  mentorHours: number
  toolsCost: number
}

export interface AssetReturn {
  assetId: string
  date: ISODate
  revenue: number
  units: number
  views: number
  source: string
}

export interface Payment {
  id: string
  studentId: string
  assetId: string | null
  amount: number
  currency: string
  paidAt: ISODate
  receiptPath: string | null
  verified: boolean
}

export interface BenchmarkPrice {
  type: string
  price: number
  currency: string
  /** Where the rate came from. Reviewed quarterly. */
  source: string
  reviewedAt: ISODate
}

/** Admin only. Never reaches a parent or student client. */
export interface Fee {
  studentId: string
  amount: number
  paidAt: ISODate
}

export interface MentorNote {
  id: string
  studentId: string
  mentorId: string
  /** ≤ 40 words, one concrete observation. */
  text: string
  focusNext: string
  linkedCardId: CardId | null
  sentAt: ISODate
}

export type ProofType = 'image' | 'video' | 'link' | 'text'

export interface ProofItem {
  id: string
  studentId: string
  area: AreaId
  cardId: CardId
  type: ProofType
  path: string
  consentOnFile: boolean
  createdAt: ISODate
}

/** Written on the first day of each quarter, for last-quarter comparisons. */
export interface QuarterSnapshot {
  studentId: string
  quarter: QuarterKey
  portfolioValue: number
  clientReady: number
  gaps: number
  level: number
}

/* ---------------------------------------------------------------- *
   The bundle a calculation reads
 * ---------------------------------------------------------------- */

/** Every row for one student, plus the windows the formulas cut against. */
export interface PerfInput {
  student: Student
  course: Course
  now: ISODate
  /** Current quarter window, `[start, end)`. */
  quarter: { key: QuarterKey; start: ISODate; end: ISODate }
  /** Current month window, `[start, end)`. */
  month: { key: MonthKey; start: ISODate; end: ISODate }

  coursePlan: CoursePlanRow[]
  sessions: Session[]
  attendance: AttendanceRow[]
  projects: Project[]
  helpLog: HelpLogRow[]
  skillScores: SkillScore[]
  levelChanges: LevelChange[]
  retentionTests: RetentionTest[]
  pulses: WeeklyPulse[]
  peerRatings: PeerRating[]
  reviews: MonthlyReview[]
  extraWork: ExtraWork[]
  assets: Asset[]
  assetReturns: AssetReturn[]
  payments: Payment[]
  benchmarks: BenchmarkPrice[]
  fees: Fee[]
  notes: MentorNote[]
  proof: ProofItem[]
  snapshots: QuarterSnapshot[]
  /** Team task counts for the student's team. Absent where no team work is set. */
  teamTasks?: { done: number; assigned: number }
}

/* ---------------------------------------------------------------- *
   The shapes a view reads
 * ---------------------------------------------------------------- */

export type AreaId = 'character' | 'engagement' | 'learning' | 'portfolio' | 'return'

export type CardId =
  | 'reliability' | 'teamwork' | 'independence'
  | 'attendance' | 'happiness' | 'confidence'
  | 'project_marks' | 'skill_level' | 'skills_map'
  | 'projects_delivered' | 'published_products' | 'client_ready' | 'portfolio_value'
  | 'return'

/** ▲ improved · ▬ unchanged · ▼ declined. Neutral everywhere but admin. */
export type Direction = 'up' | 'flat' | 'down'

/**
 * collecting — fewer than the card's minimum data points
 * baseline   — the start value is not locked yet, so only NOW is honest
 * normal     — start → now
 * stale      — the last input for this card is older than 21 days
 */
export type CardState = 'collecting' | 'baseline' | 'normal' | 'stale'

/** Admin only. The server omits it for a parent or student. */
export type Status = 'green' | 'amber' | 'red'

export interface Reading {
  value: number
  /** What the parent reads: "9 of 10", "4.2/5", "61%". */
  label: string
}

export interface Card {
  cardId: CardId
  area: AreaId
  question: string
  start: Reading | null
  now: Reading | null
  direction: Direction
  /** Generated from a §5 template. Never free text. */
  sentence: string
  state: CardState
  /** Shown in place of a number while `state` is `collecting`. */
  collecting?: { have: number; need: number; unit: string }
  /** A small second line — extra verified hours, team tasks. */
  secondary?: string | null
  proofCount: number
  /** Word label for the student view, where a number is withheld. */
  studentLabel?: string
  /** Admin only, stripped for every other view. */
  status?: Status
  /** Admin only. The working behind the card. */
  internals?: Record<string, number | string | boolean | null>
}

export interface Area {
  areaId: AreaId
  title: string
  question: string
  cards: Card[]
  /** "2 of 3 measures improved since start." */
  sentence: string
  proofCount: number
}

export interface Highlight {
  id: string
  text: string
}
