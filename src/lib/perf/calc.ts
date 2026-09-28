/* ==========================================================================
   Performance Analysis — the calculations (§4)

   One pure function per card. Each takes the student's rows and returns a
   Card: start, now, direction, state, the generated sentence, the proof
   count, and — for admin only — the status colour and the internals behind
   the number. No function here reads a store, a clock or a role.

   Three rules hold across all of them:
     · A card without its locked start is `baseline`, and shows NOW alone.
     · A card under its minimum data points is `collecting`, and shows no
       number at all.
     · A fall is returned as a fall. Nothing is floored, rounded up or hidden.

   Two places where the brief leaves a gap and this file takes a decision,
   both marked BASELINE ASSUMPTION below: attendance has no baseline defined
   in §4, and "growth 0 for two quarters" needs history the fixtures do not
   carry. Both are read off the enrolment date instead.
   ========================================================================== */

import { areaSentence, sentence } from './sentences'
import {
  DAY, ageInDays, baselineWindow, monthKey, ms, prevMonthKey, previousQuarter,
  weekKey, weekStart, weeksBetween, within,
} from './time'
import type {
  Area, AreaId, Card, CardId, CardState, Direction, PerfInput, Project,
  Reading, Status,
} from './types'

/* ---------------------------------------------------------------- *
   Small arithmetic
 * ---------------------------------------------------------------- */

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const round1 = (v: number): number => Math.round(v * 10) / 10
const pct = (v: number): number => Math.round(v * 100)
const uniq = <T>(xs: T[]): T[] => Array.from(new Set(xs))

/** A reading is only different if it moves more than a rounding wobble. */
const EPS = 1e-9

function directionOf(now: number | null, start: number | null, eps = EPS): Direction {
  if (now === null || start === null) return 'flat'
  if (now > start + eps) return 'up'
  if (now < start - eps) return 'down'
  return 'flat'
}

function band(value: number, green: number, amber: number): Status {
  if (value >= green) return 'green'
  if (value >= amber) return 'amber'
  return 'red'
}

/** Days since the newest input feeding a card. Null where the card has no input yet. */
function lastInputAge(dates: Array<string | null>, now: string): number | null {
  const stamps = dates.filter((d): d is string => !!d).map(ms)
  if (!stamps.length) return null
  return (ms(now) - Math.max(...stamps)) / DAY
}

const STALE_DAYS = 21

/** State precedence: not enough data, then no baseline, then stale, then normal. */
function stateOf(enough: boolean, hasStart: boolean, staleDays: number | null): CardState {
  if (!enough) return 'collecting'
  if (!hasStart) return 'baseline'
  if (staleDays !== null && staleDays > STALE_DAYS) return 'stale'
  return 'normal'
}

const reading = (value: number, label: string): Reading => ({ value, label })

const proofCount = (input: PerfInput, cardId: CardId): number =>
  input.proof.filter(p => p.cardId === cardId && p.consentOnFile).length

/** The month a week belongs to is the month its Monday falls in. */
const weekInWindow = (week: string, from: string, to: string): boolean =>
  within(weekStart(week), from, to)

const deliveredProjects = (input: PerfInput): Project[] =>
  input.projects
    .filter(p => p.studentId === input.student.id && p.deliveredAt)
    .sort((a, b) => ms(a.deliveredAt!) - ms(b.deliveredAt!))

/* ================================================================ *
   Area 1 — Character
 * ================================================================ */

/** 1.1 Reliability — does he deliver on time? */
export function reliability(input: PerfInput): Card {
  const { quarter, student } = input
  const mine = input.projects.filter(p => p.studentId === student.id)
  const onTimeOf = (rows: Project[]) =>
    rows.filter(p => p.deliveredAt && ms(p.deliveredAt) <= ms(p.dueAt) && p.remindersSent === 0)

  const due = mine.filter(p => within(p.dueAt, quarter.start, quarter.end))
  const onTime = onTimeOf(due)

  const base = baselineWindow(student.enrolledAt, 4)
  const dueStart = mine.filter(p => within(p.dueAt, base.start, base.end))
  const onTimeStart = onTimeOf(dueStart)

  const enough = due.length >= 4
  const nowValue = due.length ? onTime.length / due.length : null
  const startValue = dueStart.length ? onTimeStart.length / dueStart.length : null
  const staleDays = lastInputAge(due.map(p => p.deliveredAt ?? p.dueAt), input.now)
  const direction = directionOf(nowValue, startValue, 0.005)

  return {
    cardId: 'reliability',
    area: 'character',
    question: 'Does he deliver on time?',
    start: startValue === null ? null
      : reading(startValue, `${onTimeStart.length} of ${dueStart.length}`),
    now: nowValue === null || !enough ? null
      : reading(nowValue, `${onTime.length} of ${due.length}`),
    direction,
    sentence: enough && nowValue !== null && startValue !== null
      ? sentence('reliability', direction, {
        on_time: onTime.length, due: due.length, start_pct: pct(startValue ?? 0),
      })
      : '',
    state: stateOf(enough, startValue !== null, staleDays),
    collecting: enough ? undefined : { have: due.length, need: 4, unit: 'due tasks' },
    proofCount: proofCount(input, 'reliability'),
    status: nowValue === null ? 'amber' : band(nowValue, 0.85, 0.6),
    internals: {
      due: due.length,
      on_time: onTime.length,
      reminders_sent: due.reduce((a, p) => a + p.remindersSent, 0),
      stale_days: staleDays === null ? null : Math.round(staleDays),
    },
  }
}

/** 1.2 Teamwork — is he a good teammate? */
export function teamwork(input: PerfInput): Card {
  const { month, student } = input
  const mine = input.peerRatings.filter(r => r.rateeId === student.id)

  const inMonth = mine.filter(r => weekInWindow(r.week, month.start, month.end))
  const raters = uniq(inMonth.map(r => r.raterId)).length
  const weeks = uniq(inMonth.map(r => r.week)).length
  const enough = raters >= 3 && weeks >= 3

  /* The baseline is the first three weeks that carried at least three raters. */
  const byWeek = new Map<string, typeof mine>()
  mine.forEach(r => byWeek.set(r.week, [...(byWeek.get(r.week) ?? []), r]))
  const qualified = Array.from(byWeek.entries())
    .filter(([, rows]) => uniq(rows.map(r => r.raterId)).length >= 3)
    .sort((a, b) => ms(weekStart(a[0])) - ms(weekStart(b[0])))
  const startRows = qualified.slice(0, 3).flatMap(([, rows]) => rows)

  const nowValue = inMonth.length ? round1(mean(inMonth.map(r => r.score))) : null
  const startValue = qualified.length >= 3 ? round1(mean(startRows.map(r => r.score))) : null
  const direction = directionOf(nowValue, startValue, 0.05)
  const share = input.teamTasks
  const staleDays = lastInputAge(uniq(mine.map(r => weekStart(r.week))), input.now)

  const label = (v: number) => (v >= 4 ? 'Strong teammate' : v >= 3 ? 'Good teammate' : 'Working on teamwork')

  return {
    cardId: 'teamwork',
    area: 'character',
    question: 'Is he a good teammate?',
    start: startValue === null ? null : reading(startValue, `${startValue}/5`),
    now: nowValue === null || !enough ? null : reading(nowValue, `${nowValue}/5`),
    direction,
    sentence: enough && nowValue !== null && startValue !== null
      ? sentence('teamwork', direction, { now: nowValue, start: startValue })
      : '',
    state: stateOf(enough, startValue !== null, staleDays),
    collecting: enough
      ? undefined
      : { have: Math.min(raters, weeks), need: 3, unit: raters < 3 ? 'raters' : 'weeks' },
    secondary: share ? `Team tasks ${share.done} of ${share.assigned}` : null,
    studentLabel: nowValue === null ? undefined : label(nowValue),
    proofCount: proofCount(input, 'teamwork'),
    status: nowValue === null ? 'amber' : band(nowValue, 4, 3),
    internals: {
      raters,
      weeks,
      team_share: share && share.assigned ? round1(share.done / share.assigned) : null,
      stale_days: staleDays === null ? null : Math.round(staleDays),
    },
  }
}

/** 1.3 Independence — can he work without someone beside him? */
export function independence(input: PerfInput): Card {
  const delivered = deliveredProjects(input)
  const scoreOf = (p: Project) => {
    const steps = uniq(input.helpLog.filter(h => h.projectId === p.id).map(h => h.stepNo)).length
    return p.stepsTotal ? (p.stepsTotal - steps) / p.stepsTotal : null
  }

  const latest = delivered.at(-1) ?? null
  const previous = delivered.at(-2) ?? null
  /* The gate: an easier project cannot claim a better independence score. */
  const gateOpen = !latest || !previous || latest.difficultyTier >= previous.difficultyTier
  const measured = gateOpen ? latest : previous

  const nowValue = measured ? scoreOf(measured) : null
  /* One delivered project is the baseline and the current reading at once.
     Showing it twice would read as a comparison that has not happened yet. */
  const hasStart = delivered.length >= 2
  const startValue = hasStart ? scoreOf(delivered[0]) : null
  const enough = delivered.length >= 1 && nowValue !== null
  const direction = directionOf(nowValue, startValue, 0.005)

  const help = latest ? input.helpLog.filter(h => h.projectId === latest.id) : []
  const judgment = help.length ? help.filter(h => h.type === 'J').length / help.length : null
  const staleDays = latest ? ageInDays(latest.deliveredAt!, input.now) : null

  return {
    cardId: 'independence',
    area: 'character',
    question: 'Can he work without someone beside him?',
    start: startValue === null ? null : reading(startValue, `${pct(startValue)}%`),
    now: nowValue === null ? null : reading(nowValue, `${pct(nowValue)}%`),
    direction,
    sentence: enough && nowValue !== null && hasStart
      ? sentence('independence', direction, {
        pct: pct(nowValue), start_pct: pct(startValue ?? 0),
      })
      : '',
    state: stateOf(enough, hasStart, staleDays),
    collecting: enough ? undefined : { have: delivered.length, need: 1, unit: 'delivered projects' },
    proofCount: proofCount(input, 'independence'),
    status: nowValue === null ? 'amber' : band(nowValue, 0.7, 0.4),
    internals: {
      judgment_ratio: judgment === null ? null : round1(judgment),
      help_steps: latest ? uniq(help.map(h => h.stepNo)).length : null,
      tier_gate: gateOpen,
      measured_project: measured?.title ?? null,
      stale_days: staleDays === null ? null : Math.round(staleDays),
    },
  }
}

/* ================================================================ *
   Area 2 — Engagement
 * ================================================================ */

/** Weeks, newest first, in which the student both attended and delivered. */
function activeWeeks(input: PerfInput): Set<string> {
  const attendedSessions = new Set(
    input.attendance.filter(a => a.studentId === input.student.id && a.attended).map(a => a.sessionId))
  const attended = input.sessions
    .filter(s => attendedSessions.has(s.id))
    .map(s => weekKey(s.heldAt))
  const deliveredWeeks = deliveredProjects(input).map(p => weekKey(p.deliveredAt!))
  const both = new Set<string>()
  uniq(attended).forEach(w => { if (deliveredWeeks.includes(w)) both.add(w) })
  return both
}

/**
 * Consecutive active weeks ending at the most recent active week. A streak is
 * only current if that week is this week or the one before — a Monday morning
 * with nothing logged yet does not wipe out eight weeks.
 */
export function streakOf(input: PerfInput): { weeks: number; brokenWeeksAgo: number } {
  const active = activeWeeks(input)
  const timeline = weeksBetween(input.student.enrolledAt, input.now)
  const lastActive = [...timeline].reverse().find(w => active.has(w))
  if (!lastActive) return { weeks: 0, brokenWeeksAgo: timeline.length }

  const gap = timeline.length - 1 - timeline.indexOf(lastActive)
  let weeks = 0
  for (let i = timeline.indexOf(lastActive); i >= 0 && active.has(timeline[i]); i--) weeks++
  return gap <= 1 ? { weeks, brokenWeeksAgo: 0 } : { weeks: 0, brokenWeeksAgo: gap }
}

/** 2.1 Attendance — does he show up? */
export function attendance(input: PerfInput): Card {
  const { quarter, student } = input
  const attendedIds = new Set(
    input.attendance.filter(a => a.studentId === student.id && a.attended).map(a => a.sessionId))
  const cohortSessions = input.sessions.filter(s => s.cohortId === student.cohortId && s.status === 'held')

  const held = cohortSessions.filter(s => within(s.heldAt, quarter.start, quarter.end))
  const came = held.filter(s => attendedIds.has(s.id))

  /* BASELINE ASSUMPTION — §4 defines no start for attendance and §0 rule 1
     requires one, so it is the same first-four-weeks window reliability uses. */
  const base = baselineWindow(student.enrolledAt, 4)
  const heldStart = cohortSessions.filter(s => within(s.heldAt, base.start, base.end))
  const cameStart = heldStart.filter(s => attendedIds.has(s.id))

  const nowValue = held.length ? came.length / held.length : null
  const startValue = heldStart.length ? cameStart.length / heldStart.length : null
  const { weeks: streak, brokenWeeksAgo } = streakOf(input)
  const enough = held.length >= 1

  /* A broken streak is a decline even where the rate held up. */
  const rateDirection = directionOf(nowValue, startValue, 0.005)
  const direction: Direction = brokenWeeksAgo > 0 ? 'down' : rateDirection
  const staleDays = lastInputAge(held.map(s => s.heldAt), input.now)

  const status: Status = nowValue === null ? 'amber'
    : brokenWeeksAgo >= 2 ? 'red'
      : band(nowValue, 0.85, 0.7)

  return {
    cardId: 'attendance',
    area: 'engagement',
    question: 'Does he show up?',
    start: startValue === null ? null : reading(startValue, `${cameStart.length} of ${heldStart.length}`),
    now: nowValue === null ? null : reading(nowValue, `${came.length} of ${held.length}`),
    direction,
    sentence: enough
      ? sentence('attendance', direction, {
        attended: came.length, held: held.length, streak, weeks_ago: brokenWeeksAgo,
      })
      : '',
    state: stateOf(enough, startValue !== null, staleDays),
    collecting: enough ? undefined : { have: held.length, need: 1, unit: 'sessions held' },
    secondary: streak > 0 ? `${streak}-week streak` : null,
    proofCount: proofCount(input, 'attendance'),
    status,
    internals: {
      held: held.length,
      attended: came.length,
      streak,
      streak_broken_weeks_ago: brokenWeeksAgo,
      stale_days: staleDays === null ? null : Math.round(staleDays),
    },
  }
}

/** 2.2 Happiness — is he happy here? Parent only; never shown to the student. */
export function happiness(input: PerfInput): Card {
  const { month, student } = input
  const mine = input.pulses.filter(p => p.studentId === student.id)
  const answeredIn = (from: string, to: string) =>
    mine.filter(p => p.answeredAt !== null && p.mood !== null && p.pride !== null
      && weekInWindow(p.week, from, to))

  const thisMonth = answeredIn(month.start, month.end)
    .sort((a, b) => ms(weekStart(a.week)) - ms(weekStart(b.week)))
  const score = (p: { mood: number | null; pride: number | null }) => ((p.mood ?? 0) + (p.pride ?? 0)) / 2

  const prevKey = prevMonthKey(month.key)
  const lastMonth = mine.filter(p => p.answeredAt !== null && monthKey(weekStart(p.week)) === prevKey)

  const nowValue = thisMonth.length ? round1(mean(thisMonth.map(score))) : null
  const prevValue = lastMonth.length ? round1(mean(lastMonth.map(score))) : null
  const enough = thisMonth.length >= 3
  const direction = directionOf(nowValue, prevValue, 0.05)

  const momentum = thisMonth.length >= 4
    ? round1(mean(thisMonth.slice(-2).map(score)) - mean(thisMonth.slice(0, 2).map(score)))
    : null

  /* Silence is counted back from now over weeks that were asked and not answered. */
  const timeline = weeksBetween(student.enrolledAt, input.now)
  const answeredWeeks = new Set(mine.filter(p => p.answeredAt !== null).map(p => p.week))
  let silence = 0
  for (let i = timeline.length - 1; i >= 0 && !answeredWeeks.has(timeline[i]); i--) silence++

  const staleDays = lastInputAge(mine.map(p => p.answeredAt), input.now)
  const status: Status = nowValue === null ? 'amber'
    : silence >= 2 || (momentum !== null && momentum <= -0.5) ? 'red'
      : band(nowValue, 4, 3)

  return {
    cardId: 'happiness',
    area: 'engagement',
    question: 'Is he happy here?',
    start: prevValue === null ? null : reading(prevValue, `${prevValue}/5`),
    now: nowValue === null || !enough ? null : reading(nowValue, `${nowValue}/5`),
    direction,
    sentence: enough && nowValue !== null && prevValue !== null
      ? sentence('happiness', direction, { now: nowValue, prev: prevValue })
      : '',
    state: stateOf(enough, prevValue !== null, staleDays),
    collecting: enough ? undefined : { have: thisMonth.length, need: 3, unit: 'weeks' },
    proofCount: proofCount(input, 'happiness'),
    status,
    internals: {
      momentum,
      silence_weeks: silence,
      answered: thisMonth.length,
      stale_days: staleDays === null ? null : Math.round(staleDays),
    },
  }
}

/** 2.3 Confidence — is he more confident than when he started? */
export function confidence(input: PerfInput): Card {
  const { course, student } = input
  const rated = input.reviews
    .filter(r => r.studentId === student.id && r.confidenceSelf !== null && r.confidenceMentor !== null)
    .sort((a, b) => a.month.localeCompare(b.month))
  const value = (r: (typeof rated)[number]) => ((r.confidenceSelf ?? 0) + (r.confidenceMentor ?? 0)) / 2

  const latest = rated.at(-1) ?? null
  const nowValue = latest ? round1(value(latest)) : null
  const startValue = student.confidenceStart ?? (rated.length ? round1(value(rated[0])) : null)
  const enough = nowValue !== null

  const rung = (v: number) => course.confidenceLadder[Math.min(5, Math.max(1, Math.round(v))) - 1]
  const growth = nowValue !== null && startValue !== null
    ? Math.round(nowValue) - Math.round(startValue)
    : null
  const direction: Direction = growth === null ? 'flat' : growth > 0 ? 'up' : growth < 0 ? 'down' : 'flat'

  const hours = input.extraWork
    .filter(w => w.studentId === student.id && w.verified && within(w.ts, input.month.start, input.month.end))
    .reduce((a, w) => a + w.hours, 0)

  const firstQuarter = ageInDays(student.enrolledAt, input.now) <= 92
  const status: Status = growth === null ? 'amber'
    : growth >= 1 ? 'green'
      /* BASELINE ASSUMPTION — "0 for two quarters" is read as no growth after
         half a year, which is the same thing without a snapshot history. */
      : growth < 0 || ageInDays(student.enrolledAt, input.now) > 184 ? 'red'
        : firstQuarter ? 'amber' : 'amber'

  return {
    cardId: 'confidence',
    area: 'engagement',
    question: 'Is he more confident than when he started?',
    start: startValue === null ? null : reading(startValue, `${Math.round(startValue)}`),
    now: nowValue === null ? null : reading(nowValue, `${Math.round(nowValue)}`),
    direction,
    sentence: enough && nowValue !== null && startValue !== null
      ? sentence('confidence', direction, {
        start: startValue === null ? '' : Math.round(startValue),
        now: Math.round(nowValue),
        ladder_start: startValue === null ? '' : rung(startValue),
        ladder_now: rung(nowValue),
      })
      : '',
    state: stateOf(enough, startValue !== null, latest ? null : null),
    collecting: enough ? undefined : { have: rated.length, need: 1, unit: 'monthly reviews' },
    secondary: hours > 0 ? `${round1(hours)} extra hours logged this month` : null,
    proofCount: proofCount(input, 'confidence'),
    status,
    internals: {
      growth,
      moment: latest?.mentorMoment ?? null,
      self: latest?.confidenceSelf ?? null,
      mentor: latest?.confidenceMentor ?? null,
      extra_hours: round1(hours),
    },
  }
}

/* ================================================================ *
   Area 3 — Learning
 * ================================================================ */

const markLabel = (x: number): string =>
  x >= 80 ? 'Strong' : x >= 65 ? 'Good' : x >= 50 ? 'Building' : 'Needs work'

/** 3.1 Project marks — how good is his work? */
export function projectMarks(input: PerfInput): Card {
  const marked = input.projects
    .filter(p => p.studentId === input.student.id && p.mark !== null)
    .sort((a, b) => ms(a.deliveredAt ?? a.assignedAt) - ms(b.deliveredAt ?? b.assignedAt))

  const first = marked.length >= 2 ? Math.round(mean(marked.slice(0, 2).map(p => p.mark!))) : null
  const latest = marked.length ? Math.round(mean(marked.slice(-2).map(p => p.mark!))) : null
  const enough = marked.length >= 1
  const trend = first !== null && latest !== null ? latest - first : null
  const direction = directionOf(latest, first, 0.5)

  const staleDays = lastInputAge(marked.map(p => p.deliveredAt ?? p.assignedAt), input.now)
  const status: Status = latest === null ? 'amber'
    : latest >= 70 || (trend !== null && trend >= 10) ? 'green'
      : latest >= 55 && trend !== null && trend >= 0 ? 'amber'
        : latest < 55 || (trend !== null && trend < 0) ? 'red' : 'amber'

  return {
    cardId: 'project_marks',
    area: 'learning',
    question: 'How good is his work?',
    start: first === null ? null : reading(first, `${first}%`),
    now: latest === null ? null : reading(latest, `${latest}%`),
    direction,
    sentence: enough && latest !== null && first !== null
      ? sentence('project_marks', direction, { first, latest })
      : '',
    state: stateOf(enough, first !== null, staleDays),
    collecting: enough ? undefined : { have: marked.length, need: 1, unit: 'marked projects' },
    studentLabel: latest === null ? undefined : markLabel(latest),
    proofCount: proofCount(input, 'project_marks'),
    status,
    internals: {
      marked: marked.length,
      trend,
      revision_rounds: marked.reduce((a, p) => a + p.revisionRounds, 0),
      stale_days: staleDays === null ? null : Math.round(staleDays),
    },
  }
}

/**
 * The three gates a level rise has to clear (§3.2). Admin reads this before
 * a second mentor signs anything off.
 */
export function levelGate(input: PerfInput): {
  firstPassNow: number | null; firstPassPrev: number | null
  reworkNow: number | null; reworkPrev: number | null
  retention: number | null; open: boolean
} {
  const prev = previousQuarter(input.now)
  const mine = input.projects.filter(p => p.studentId === input.student.id && p.deliveredAt)
  const slice = (from: string, to: string) => mine.filter(p => within(p.deliveredAt, from, to))

  const firstPass = (rows: Project[]) =>
    rows.length ? rows.filter(p => p.revisionRounds === 0).length / rows.length : null
  const rework = (rows: Project[]) =>
    rows.length ? rows.reduce((a, p) => a + p.revisionRounds, 0) / rows.length : null

  const nowRows = slice(input.quarter.start, input.quarter.end)
  const prevRows = slice(prev.start, prev.end)

  const tests = input.retentionTests
    .filter(t => t.studentId === input.student.id)
    .sort((a, b) => ms(a.testedAt) - ms(b.testedAt))
    .slice(-2)
  const retention = tests.length ? tests.filter(t => t.passed).length / tests.length : null

  const firstPassNow = firstPass(nowRows)
  const firstPassPrev = firstPass(prevRows)
  const reworkNow = rework(nowRows)
  const reworkPrev = rework(prevRows)

  const open =
    firstPassNow !== null && firstPassPrev !== null && firstPassNow > firstPassPrev &&
    reworkNow !== null && reworkPrev !== null && reworkNow < reworkPrev &&
    retention !== null && retention >= 0.7

  return { firstPassNow, firstPassPrev, reworkNow, reworkPrev, retention, open }
}

/** 3.2 Skill level — did he level up? */
export function skillLevel(input: PerfInput): Card {
  const { course, student } = input
  const approved = input.levelChanges
    .filter(c => c.studentId === student.id && c.approvedAt !== null)
    .sort((a, b) => ms(a.approvedAt!) - ms(b.approvedAt!))

  const nowValue = approved.at(-1)?.level ?? student.levelStart ?? null
  const startValue = student.levelStart ?? null
  const growth = nowValue !== null && startValue !== null ? nowValue - startValue : null
  const direction: Direction = growth !== null && growth >= 1 ? 'up' : 'flat'
  const enough = nowValue !== null

  const rung = (v: number) => course.levelLadder[Math.min(5, Math.max(1, v)) - 1]
  const gate = levelGate(input)
  const firstQuarter = ageInDays(student.enrolledAt, input.now) <= 92
  const status: Status = growth === null ? 'amber'
    : growth >= 1 ? 'green'
      : firstQuarter ? 'amber'
        : ageInDays(student.enrolledAt, input.now) > 184 ? 'red' : 'amber'

  return {
    cardId: 'skill_level',
    area: 'learning',
    question: 'Did he level up?',
    start: startValue === null ? null : reading(startValue, `Level ${startValue}`),
    now: nowValue === null ? null : reading(nowValue, `Level ${nowValue}`),
    direction,
    sentence: enough && nowValue !== null
      ? sentence('skill_level', direction, {
        start: startValue ?? '', now: nowValue, ladder_now: rung(nowValue),
      })
      : '',
    state: stateOf(enough, startValue !== null, null),
    collecting: enough ? undefined : { have: 0, need: 1, unit: 'level reviews' },
    proofCount: proofCount(input, 'skill_level'),
    status,
    internals: {
      growth,
      first_pass_now: gate.firstPassNow === null ? null : round1(gate.firstPassNow),
      first_pass_prev: gate.firstPassPrev === null ? null : round1(gate.firstPassPrev),
      rework_now: gate.reworkNow === null ? null : round1(gate.reworkNow),
      rework_prev: gate.reworkPrev === null ? null : round1(gate.reworkPrev),
      retention: gate.retention === null ? null : round1(gate.retention),
      gate_open: gate.open,
    },
  }
}

/** The latest month of skill scores, and the locked first review. */
function skillSlices(input: PerfInput) {
  const mine = input.skillScores.filter(s => s.studentId === input.student.id)
  const months = uniq(mine.map(s => s.month)).sort()
  const latestMonth = months.at(-1) ?? null
  return {
    latest: latestMonth ? mine.filter(s => s.month === latestMonth) : [],
    start: mine.filter(s => s.isStart),
    months,
  }
}

/** 3.3 Skills map — where is he strong, where are the gaps? */
export function skillsMap(input: PerfInput): Card {
  const { latest, start, months } = skillSlices(input)
  const gapsNow = latest.length ? latest.filter(s => s.score <= 2).length : null
  const gapsStart = start.length ? start.filter(s => s.score <= 2).length : null
  const enough = latest.length > 0

  /* Fewer gaps is an improvement, so the direction is inverted against the count. */
  const direction: Direction = gapsNow === null || gapsStart === null ? 'flat'
    : gapsNow < gapsStart ? 'up' : gapsNow > gapsStart ? 'down' : 'flat'

  const status: Status = gapsNow === null || gapsStart === null ? 'amber'
    : gapsNow < gapsStart ? 'green' : gapsNow === gapsStart ? 'amber' : 'red'

  return {
    cardId: 'skills_map',
    area: 'learning',
    question: 'Where is he strong, where are the gaps?',
    start: gapsStart === null ? null : reading(gapsStart, `${gapsStart} weak`),
    now: gapsNow === null ? null : reading(gapsNow, `${gapsNow} weak`),
    direction,
    sentence: enough && gapsNow !== null && gapsStart !== null
      ? sentence('skills_map', direction, {
        gaps_start: gapsStart ?? '', gaps_now: gapsNow,
      })
      : '',
    state: stateOf(enough, gapsStart !== null, null),
    collecting: enough ? undefined : { have: months.length, need: 1, unit: 'monthly reviews' },
    proofCount: proofCount(input, 'skills_map'),
    status,
    internals: {
      client_ready: latest.filter(s => s.score >= 4).length,
      reviews: months.length,
      scores: latest.map(s => `${s.skillId}:${s.score}`).join(' '),
    },
  }
}

/* ================================================================ *
   Area 4 — Portfolio
 * ================================================================ */

/** The most advanced piece not yet live — what a card shows instead of nothing. */
export function fallbackAsset(input: PerfInput, types?: string[]) {
  return input.assets
    .filter(a => a.studentId === input.student.id && a.stage !== 'live')
    .filter(a => !types || types.includes(a.type))
    .sort((a, b) => b.pctDone - a.pctDone)
    .at(0) ?? null
}

/** 4.1 Projects delivered — what client work is live with his name? */
export function projectsDelivered(input: PerfInput): Card {
  const { quarter } = input
  const live = input.assets.filter(a =>
    a.studentId === input.student.id && a.type === 'client_project' && a.stage === 'live'
    && a.linkLive && a.nameVisible && a.consentOnFile
    && within(a.shipDate, quarter.start, quarter.end))

  const fallback = fallbackAsset(input, ['client_project'])
  const n = live.length
  const direction: Direction = n >= 1 ? 'up' : 'down'
  const status: Status = n >= 1 ? 'green'
    : fallback && fallback.pctDone >= 50 && fallback.shipDate ? 'amber' : 'red'

  return {
    cardId: 'projects_delivered',
    area: 'portfolio',
    question: 'What client work is live with his name?',
    start: reading(0, '0'),
    now: reading(n, `${n}`),
    direction,
    /* With nothing live and nothing in progress there is no fallback to name,
       so the line stops at the count rather than describing an empty asset. */
    sentence: n === 0 && !fallback
      ? '0 live this quarter.'
      : sentence('projects_delivered', direction, {
        n,
        fallback_title: fallback?.title ?? '',
        pct: fallback?.pctDone ?? 0,
        date: fallback?.shipDate?.slice(0, 10) ?? 'no date set',
      }),
    state: 'normal',
    proofCount: proofCount(input, 'projects_delivered'),
    status,
    internals: {
      live: n,
      fallback_pct: fallback?.pctDone ?? null,
      outside_accepted: input.assets.filter(a => a.studentId === input.student.id && a.outsideAccepted).length,
    },
  }
}

/** 4.2 Published products — what did he publish that can earn on its own? */
export function publishedProducts(input: PerfInput): Card {
  const types = ['course', 'game', 'template']
  const live = input.assets.filter(a =>
    a.studentId === input.student.id && types.includes(a.type) && a.stage === 'live' && a.consentOnFile)
  const fallback = fallbackAsset(input, types)

  const n = live.length
  const direction: Direction = n >= 1 ? 'up' : 'down'
  const status: Status = n >= 1 ? 'green' : fallback ? 'amber' : 'red'

  return {
    cardId: 'published_products',
    area: 'portfolio',
    question: 'What did he publish that can earn on its own?',
    start: reading(0, '0'),
    now: reading(n, `${n}`),
    direction,
    sentence: n === 0 && !fallback
      ? 'None published yet.'
      : sentence('published_products', direction, { n, fallback_title: fallback?.title ?? '' }),
    state: 'normal',
    proofCount: proofCount(input, 'published_products'),
    status,
    internals: { live: n, in_progress: fallback ? 1 : 0 },
  }
}

/** 4.3 Client-ready skills — which skills can he sell today? */
export function clientReady(input: PerfInput): Card {
  const { latest } = skillSlices(input)
  const prevQ = previousQuarter(input.now)
  const snapshot = input.snapshots.find(s => s.studentId === input.student.id && s.quarter === prevQ.key)

  const now = latest.length ? latest.filter(s => s.score >= 4).length : null
  const prev = snapshot?.clientReady ?? null
  const enough = latest.length > 0
  const direction = directionOf(now, prev, 0.5)
  const status: Status = now === null || prev === null ? 'amber'
    : now > prev ? 'green' : now === prev ? 'amber' : 'red'

  return {
    cardId: 'client_ready',
    area: 'portfolio',
    question: 'Which skills can he sell today?',
    start: prev === null ? null : reading(prev, `${prev} of 5`),
    now: now === null ? null : reading(now, `${now} of 5`),
    direction,
    sentence: enough && now !== null && prev !== null
      ? sentence('client_ready', direction, { n: now, prev })
      : '',
    state: stateOf(enough, prev !== null, null),
    collecting: enough ? undefined : { have: 0, need: 1, unit: 'monthly reviews' },
    proofCount: proofCount(input, 'client_ready'),
    status,
    internals: { now, prev },
  }
}

/** The value of one live piece: what a client paid, or the benchmark scaled by its mark. */
export function assetValue(input: PerfInput, assetId: string): number {
  const a = input.assets.find(x => x.id === assetId)
  if (!a) return 0
  if (a.clientFeePaid !== null) return a.clientFeePaid
  const benchmark = input.benchmarks.find(b => b.type === a.benchmarkType)
  if (!benchmark) return 0
  return Math.round(benchmark.price * ((a.mark ?? 0) / 100))
}

/** 4.4 Portfolio value — what is his portfolio worth today? Parent only, estimated. */
export function portfolioValue(input: PerfInput): Card {
  const live = input.assets.filter(a => a.studentId === input.student.id && a.stage === 'live')
  const value = live.reduce((a, x) => a + assetValue(input, x.id), 0)

  const prevQ = previousQuarter(input.now)
  const snapshot = input.snapshots.find(s => s.studentId === input.student.id && s.quarter === prevQ.key)
  const prev = snapshot?.portfolioValue ?? null

  const cur = input.student.currency
  const direction = directionOf(value, prev, 0.5)
  const status: Status = prev === null ? 'amber' : value > prev ? 'green' : value === prev ? 'amber' : 'red'

  return {
    cardId: 'portfolio_value',
    area: 'portfolio',
    question: 'What is his portfolio worth today?',
    start: prev === null ? null : reading(prev, `${cur} ${prev.toLocaleString('en-US')}`),
    now: reading(value, `${cur} ${value.toLocaleString('en-US')} estimated`),
    direction,
    /* With no snapshot behind it there is nothing to compare to, so the card
       shows the estimate alone rather than calling it unchanged. */
    sentence: prev === null ? '' : sentence('portfolio_value', direction, {
      cur, value: value.toLocaleString('en-US'), prev: prev.toLocaleString('en-US'),
    }),
    state: prev === null ? 'baseline' : 'normal',
    proofCount: proofCount(input, 'portfolio_value'),
    status,
    internals: {
      live_assets: live.length,
      priced_by_client: live.filter(a => a.clientFeePaid !== null).length,
      priced_by_benchmark: live.filter(a => a.clientFeePaid === null).length,
    },
  }
}

/* ================================================================ *
   Area 5 — Return
 * ================================================================ */

/** The one money line a parent sees. Everything else about money is admin. */
export function returnCard(input: PerfInput): Card {
  const paid = input.payments.filter(p => p.studentId === input.student.id && p.verified)
  const total = paid.reduce((a, p) => a + p.amount, 0)
  const cur = input.student.currency

  const next = input.assets
    .filter(a => a.studentId === input.student.id && a.stage !== 'live' && a.shipDate)
    .sort((a, b) => ms(a.shipDate!) - ms(b.shipDate!))
    .at(0) ?? null

  return {
    cardId: 'return',
    area: 'return',
    question: 'What has his work earned?',
    start: null,
    now: total > 0 ? reading(total, `${cur} ${total.toLocaleString('en-US')}`) : null,
    direction: 'up',
    sentence: total > 0
      ? sentence('return', 'up', { cur, total: total.toLocaleString('en-US') })
      : `First paid piece planned · ${next?.shipDate?.slice(0, 10) ?? 'date to be set'}`,
    state: total > 0 ? 'normal' : 'baseline',
    proofCount: proofCount(input, 'return'),
    status: total > 0 ? 'green' : 'amber',
    internals: { payments: paid.length, total },
  }
}

/** Admin only — the breakdown §4 Area 5 keeps off every family screen. */
export function returnBreakdown(input: PerfInput, mentorRate: number) {
  const mine = input.assets.filter(a => a.studentId === input.student.id)
  const earnedTotal = input.payments
    .filter(p => p.studentId === input.student.id && p.verified)
    .reduce((a, p) => a + p.amount, 0)

  const perAsset = mine.map(a => {
    const rows = input.assetReturns.filter(r => r.assetId === a.id)
    const revenue = rows.reduce((s, r) => s + r.revenue, 0)
    const cost = a.mentorHours * mentorRate + a.toolsCost
    const value = assetValue(input, a.id)
    return {
      assetId: a.id,
      title: a.title,
      type: a.type,
      revenue,
      units: rows.reduce((s, r) => s + r.units, 0),
      views: rows.reduce((s, r) => s + r.views, 0),
      cost,
      margin: revenue - cost,
      returnRatio: value ? round1(revenue / value) : null,
    }
  })

  const feesPaid = input.fees
    .filter(f => f.studentId === input.student.id)
    .reduce((a, f) => a + f.amount, 0)
  const passiveTypes = ['course', 'game', 'template']
  const passive = perAsset
    .filter(a => passiveTypes.includes(a.type))
    .reduce((s, a) => s + a.revenue, 0)

  return {
    perAsset,
    earnedTotal,
    paybackProgress: feesPaid ? round1(earnedTotal / feesPaid) : null,
    passiveShare: earnedTotal ? round1(passive / earnedTotal) : null,
  }
}

/* ================================================================ *
   Areas
 * ================================================================ */

const AREA_META: Record<AreaId, { title: string; question: string }> = {
  character: { title: 'Character', question: 'Who is he becoming?' },
  engagement: { title: 'Engagement', question: 'Does he want to be here?' },
  learning: { title: 'Learning', question: 'Is he getting better at the work?' },
  portfolio: { title: 'Portfolio', question: 'What does he have to show?' },
  return: { title: 'Return', question: 'What has his work earned?' },
}

/** Every card by id, in the order §3.1 puts them on the page. */
export const CARD_FNS: Record<CardId, (input: PerfInput) => Card> = {
  reliability, teamwork, independence,
  attendance, happiness, confidence,
  project_marks: projectMarks, skill_level: skillLevel, skills_map: skillsMap,
  projects_delivered: projectsDelivered, published_products: publishedProducts,
  client_ready: clientReady, portfolio_value: portfolioValue,
  return: returnCard,
}

export function allCards(input: PerfInput): Card[] {
  return (Object.keys(CARD_FNS) as CardId[]).map(id => CARD_FNS[id](input))
}

export function areasOf(cards: Card[]): Area[] {
  const ids: AreaId[] = ['character', 'engagement', 'learning', 'portfolio', 'return']
  return ids.map(areaId => {
    const own = cards.filter(c => c.area === areaId)
    const improved = own.filter(c => c.direction === 'up').length
    return {
      areaId,
      title: AREA_META[areaId].title,
      question: AREA_META[areaId].question,
      cards: own,
      sentence: areaId === 'return'
        ? ''
        : areaSentence(improved, own.length, areaId === 'portfolio' ? 'last quarter' : 'start'),
      proofCount: own.reduce((a, c) => a + c.proofCount, 0),
    }
  })
}

export { markLabel }
