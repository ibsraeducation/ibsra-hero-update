/* ==========================================================================
   Performance Analysis — highlights (§6)

   Up to four chips at the top of the parent page, picked from the quarter's
   record in a fixed order. Nothing here is written by hand; a chip exists
   because a threshold was crossed, and the section disappears rather than
   padding itself out.
   ========================================================================== */

import { streakOf } from './calc'
import { cardName } from './glossary'
import { ms, within } from './time'
import type { Card, Highlight, PerfInput } from './types'

/** Levels approved inside the quarter, against the level held going into it. */
function levelMove(input: PerfInput): { start: number; now: number } | null {
  const approved = input.levelChanges
    .filter(c => c.studentId === input.student.id && c.approvedAt !== null)
    .sort((a, b) => ms(a.approvedAt!) - ms(b.approvedAt!))
  const inQuarter = approved.filter(c => within(c.approvedAt, input.quarter.start, input.quarter.end))
  if (!inQuarter.length) return null

  const before = approved.filter(c => ms(c.approvedAt!) < ms(input.quarter.start)).at(-1)
  const start = before?.level ?? input.student.levelStart
  const now = inQuarter.at(-1)!.level
  if (start === null || now - start < 1) return null
  return { start, now }
}

/**
 * The chips, in the brief's order. Falls back to progress chips — any card
 * that moved up — and then to nothing at all.
 */
export function highlights(input: PerfInput, cards: Card[]): Highlight[] {
  const { student, quarter } = input
  const picked: Highlight[] = []
  const card = (id: string) => cards.find(c => c.cardId === id)

  const level = levelMove(input)
  if (level) picked.push({ id: 'level', text: `Level ${level.start} → ${level.now}` })

  const accepted = input.assets.filter(a => a.studentId === student.id && a.outsideAccepted)
  const firstAccepted = accepted.sort((a, b) => ms(a.shipDate ?? input.now) - ms(b.shipDate ?? input.now)).at(0)
  if (firstAccepted && within(firstAccepted.shipDate, quarter.start, quarter.end)) {
    picked.push({ id: 'accepted', text: 'First client accepted his work' })
  }

  const { weeks: streak } = streakOf(input)
  if (streak >= 8) picked.push({ id: 'streak', text: `${streak}-week streak` })

  const live = card('projects_delivered')?.now?.value ?? 0
  if (live >= 1) picked.push({ id: 'live', text: `${live} pieces live` })

  const conf = card('confidence')
  if (conf && conf.direction === 'up' && conf.start && conf.now) {
    picked.push({ id: 'confidence', text: `Confidence ${conf.start.value} → ${conf.now.value}` })
  }

  const gaps = card('skills_map')
  if (gaps && gaps.direction === 'up' && gaps.start && gaps.now) {
    picked.push({ id: 'gaps', text: `Skill gaps ${gaps.start.value} → ${gaps.now.value}` })
  }

  const payments = input.payments
    .filter(p => p.studentId === student.id && p.verified)
    .sort((a, b) => ms(a.paidAt) - ms(b.paidAt))
  if (payments.length && within(payments[0].paidAt, quarter.start, quarter.end)) {
    picked.push({ id: 'paid', text: 'First paid work' })
  }

  if (picked.length >= 2) return picked.slice(0, 4)

  /* Fewer than two: show what actually moved instead. */
  return cards
    .filter(c => c.direction === 'up' && c.start && c.now && c.state !== 'collecting')
    .slice(0, 4)
    .map(c => ({ id: `progress-${c.cardId}`, text: `${cardName(c.cardId)} ${c.start!.label} → ${c.now!.label}` }))
}
