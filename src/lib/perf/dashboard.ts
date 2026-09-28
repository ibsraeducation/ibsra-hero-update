/* ==========================================================================
   Performance Analysis — the view assembly (§0, §7, §11)

   One function builds the dashboard; the view it is asked for decides what
   survives. The filtering happens here rather than in a component, so a
   parent client is never sent a status colour and a student client is never
   sent a figure in money — not hidden with CSS, not present at all.
   ========================================================================== */

import { allCards, areasOf, fallbackAsset, returnBreakdown } from './calc'
import { highlights } from './highlights'
import { returnLine } from './sentences'
import { ms, within } from './time'
import type {
  Area, Card, Highlight, PerfInput, ProofItem,
} from './types'

export type View = 'parent' | 'student' | 'admin'

export interface Delivered {
  topicsDelivered: number
  topicsPlanned: number
  sessionsHeld: number
  sessionsPlanned: number
  projects: number
  mentorNotes: number
}

export interface NextMilestone {
  title: string
  shipDate: string | null
  pctDone: number
  mentor: string
}

export interface Dashboard {
  view: View
  header: { student: string; course: string; quarter: string; mentor: string }
  highlights: Highlight[]
  delivered: Delivered
  areas: Area[]
  /** The single money line. Absent for the student entirely. */
  returnLine?: string
  mentor: {
    latest: { text: string; focusNext: string; sentAt: string } | null
    earlier: Array<{ text: string; sentAt: string }>
  }
  nextMilestone: NextMilestone | null
  /** Admin only. */
  breakdown?: ReturnType<typeof returnBreakdown>
}

/* ---------------------------------------------------------------- *
   What each view is allowed to carry
 * ---------------------------------------------------------------- */

/** §7: the student never sees money, marks as %, peer numbers or happiness. */
const HIDDEN_FROM_STUDENT = ['happiness', 'portfolio_value', 'return'] as const
/** Cards the student sees as a word, never as a figure. */
const LABEL_ONLY_FOR_STUDENT = ['teamwork', 'project_marks'] as const

/**
 * §0 rule 3 and rule 5. A parent or student card loses its colour and its
 * internals; a student card also loses the number where §7 says so.
 */
function redact(card: Card, view: View): Card | null {
  if (view === 'admin') return card

  const open: Card = { ...card }
  delete open.status
  delete open.internals

  if (view === 'parent') return open

  if ((HIDDEN_FROM_STUDENT as readonly string[]).includes(card.cardId)) return null
  if ((LABEL_ONLY_FOR_STUDENT as readonly string[]).includes(card.cardId)) {
    return { ...open, start: null, now: null, sentence: '' }
  }
  return open
}

/**
 * §0 rule 1 — a parent number without its start is not rendered as a
 * comparison. `baseline` and `collecting` cards stay: they say so on their
 * face rather than showing half a reading.
 */
const rendersForParent = (card: Card): boolean =>
  card.state !== 'normal' || card.start !== null

/** §0 rule 2 — no proof and nothing in progress to stand in for it, no card. */
const hasSomethingToShow = (card: Card, input: PerfInput): boolean =>
  card.proofCount > 0 || fallbackAsset(input) !== null

/* ---------------------------------------------------------------- *
   Proof
 * ---------------------------------------------------------------- */

/** §3.4 — consent-filtered, newest first, at most six per area per quarter. */
export function proofFor(input: PerfInput, area: string): ProofItem[] {
  return input.proof
    .filter(p => p.studentId === input.student.id && p.area === area && p.consentOnFile)
    .filter(p => within(p.createdAt, input.quarter.start, input.quarter.end))
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
    .slice(0, 6)
}

/* ---------------------------------------------------------------- *
   Assembly
 * ---------------------------------------------------------------- */

function deliveredStrip(input: PerfInput): Delivered {
  const topics = input.coursePlan.filter(t => t.courseId === input.student.courseId)
  const sessions = input.sessions.filter(s => s.cohortId === input.student.cohortId)
  return {
    topicsDelivered: topics.filter(t => t.status === 'delivered').length,
    topicsPlanned: topics.length,
    sessionsHeld: sessions.filter(s => s.status === 'held').length,
    sessionsPlanned: sessions.length,
    projects: input.projects.filter(p => p.studentId === input.student.id && p.deliveredAt).length,
    mentorNotes: input.notes.filter(n => n.studentId === input.student.id).length,
  }
}

function milestoneOf(input: PerfInput): NextMilestone | null {
  const next = fallbackAsset(input)
  if (!next) return null
  return {
    title: next.title,
    shipDate: next.shipDate,
    pctDone: next.pctDone,
    mentor: input.student.mentorId,
  }
}

/** The mentor block: the latest note and the ones before it. */
function mentorBlock(input: PerfInput) {
  const notes = input.notes
    .filter(n => n.studentId === input.student.id)
    .sort((a, b) => ms(b.sentAt) - ms(a.sentAt))
  const [latest, ...earlier] = notes
  return {
    latest: latest
      ? { text: latest.text, focusNext: latest.focusNext, sentAt: latest.sentAt }
      : null,
    earlier: earlier.map(n => ({ text: n.text, sentAt: n.sentAt })),
  }
}

/** The one call a route handler makes. `view` is set by the server, not the client. */
export function dashboard(input: PerfInput, view: View, mentorRate = 0): Dashboard {
  const cards = allCards(input)

  /* The two visibility rules read the full card — a student card that has had
     its number withheld has still earned its place on the page. */
  const visible = cards
    .filter(c => view === 'admin' || (rendersForParent(c) && hasSomethingToShow(c, input)))
    .map(c => redact(c, view))
    .filter((c): c is Card => c !== null)

  const paid = input.payments
    .filter(p => p.studentId === input.student.id && p.verified)
    .reduce((a, p) => a + p.amount, 0)
  const nextPaid = input.assets
    .filter(a => a.studentId === input.student.id && a.stage !== 'live' && a.shipDate)
    .sort((a, b) => ms(a.shipDate!) - ms(b.shipDate!))
    .at(0) ?? null

  return {
    view,
    header: {
      student: input.student.name,
      course: input.course.name,
      quarter: input.quarter.key,
      mentor: input.student.mentorId,
    },
    highlights: highlights(input, cards),
    delivered: deliveredStrip(input),
    areas: areasOf(visible).filter(a => a.cards.length > 0),
    returnLine: view === 'student'
      ? undefined
      : returnLine(input.student.currency, paid, nextPaid?.shipDate?.slice(0, 10) ?? null),
    mentor: mentorBlock(input),
    nextMilestone: milestoneOf(input),
    breakdown: view === 'admin' ? returnBreakdown(input, mentorRate) : undefined,
  }
}
