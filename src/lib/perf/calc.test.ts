/* ==========================================================================
   Performance Analysis — the acceptance tests

   Phase 2 of the brief: every formula returns start, now, direction and
   state, and the §5 templates pick the right branch on a student who is
   improving, one who is flat, one who is declining and one with almost no
   data yet. Phase 3 and 4 acceptance — no card without a start, no colour
   in a family view, no proof without consent, no money for the student —
   is asserted here too, because those are the rules that protect the
   family, not styling choices.
   ========================================================================== */

import { describe, expect, it } from 'vitest'

import {
  allCards, areasOf, attendance, clientReady, confidence, happiness, independence,
  levelGate, portfolioValue, projectMarks, projectsDelivered, publishedProducts,
  reliability, returnBreakdown, returnCard, skillLevel, skillsMap, streakOf, teamwork,
} from './calc'
import { dashboard, proofFor } from './dashboard'
import { fixture } from './fixtures'
import { highlights } from './highlights'
import { TEMPLATES, fill } from './sentences'
import type { Card, PerfInput } from './types'

const improving = fixture('improving')
const flat = fixture('flat')
const declining = fixture('declining')
const thin = fixture('thin')

const byId = (cards: Card[], id: string) => cards.find(c => c.cardId === id)!

/* ================================================================ *
   Shape
 * ================================================================ */

describe('every card has the shape a view reads', () => {
  const cards = allCards(improving)

  it('returns all fourteen cards', () => {
    expect(cards).toHaveLength(14)
    expect(new Set(cards.map(c => c.cardId)).size).toBe(14)
  })

  it.each(cards.map(c => [c.cardId, c] as const))('%s carries start, now, direction and state', (_id, card) => {
    expect(card).toHaveProperty('start')
    expect(card).toHaveProperty('now')
    expect(['up', 'flat', 'down']).toContain(card.direction)
    expect(['collecting', 'baseline', 'normal', 'stale']).toContain(card.state)
    expect(card.question.split(' ').length).toBeLessThanOrEqual(10)
  })

  it('keeps every outcome sentence inside twenty words', () => {
    cards.filter(c => c.sentence).forEach(c => {
      expect(c.sentence.split(/\s+/).length, c.cardId).toBeLessThanOrEqual(20)
    })
  })
})

/* ================================================================ *
   Area 1 — Character
 * ================================================================ */

describe('reliability', () => {
  it('reads 11 of 12 against a locked 6 of 10 baseline', () => {
    const card = reliability(improving)
    expect(card.start).toEqual({ value: 0.6, label: '6 of 10' })
    expect(card.now).toEqual({ value: 11 / 12, label: '11 of 12' })
    expect(card.direction).toBe('up')
    expect(card.state).toBe('normal')
    expect(card.sentence).toBe('11 of 12 tasks delivered on time, up from 60%.')
    expect(card.status).toBe('green')
  })

  it('says the rate is unchanged when it is', () => {
    const card = reliability(flat)
    expect(card.direction).toBe('flat')
    expect(card.sentence).toBe('9 of 12 on time. Same rate as at the start.')
  })

  it('states a fall rather than hiding it', () => {
    const card = reliability(declining)
    expect(card.direction).toBe('down')
    expect(card.sentence).toBe('5 of 12 on time, down from 83%.')
    expect(card.status).toBe('red')
  })

  it('collects rather than guessing under four due tasks', () => {
    const card = reliability(thin)
    expect(card.state).toBe('collecting')
    expect(card.now).toBeNull()
    expect(card.sentence).toBe('')
    expect(card.collecting).toEqual({ have: 1, need: 4, unit: 'due tasks' })
  })
})

describe('teamwork', () => {
  it('averages this month against the first three rated weeks', () => {
    const card = teamwork(improving)
    expect(card.start?.value).toBe(3)
    expect(card.now?.value).toBe(5)
    expect(card.sentence).toBe('Teammates rate him 5/5, up from 3/5.')
    expect(card.studentLabel).toBe('Strong teammate')
  })

  it('labels a low score without softening it', () => {
    const card = teamwork(declining)
    expect(card.direction).toBe('down')
    expect(card.studentLabel).toBe('Working on teamwork')
    expect(card.status).toBe('red')
  })

  it('never exposes a single rater', () => {
    const card = teamwork(improving)
    expect(JSON.stringify(card)).not.toContain('p1')
  })
})

describe('independence', () => {
  it('measures the last delivered project against the first', () => {
    const card = independence(improving)
    expect(card.start?.label).toBe('50%')
    expect(card.now?.label).toBe('80%')
    expect(card.sentence).toBe('80% of his last project done without help, up from 50%.')
  })

  it('holds the previous reading when the last project was easier', () => {
    const easier = structuredClone(improving) as PerfInput
    easier.projects.at(-1)!.difficultyTier = 1
    const card = independence(easier)
    expect(card.internals?.tier_gate).toBe(false)
  })

  it('reports the judgment share to admin only', () => {
    expect(independence(improving).internals?.judgment_ratio).toBe(0.5)
  })
})

/* ================================================================ *
   Area 2 — Engagement
 * ================================================================ */

describe('attendance and the streak', () => {
  it('counts held sessions in the quarter and the running streak', () => {
    const card = attendance(improving)
    expect(card.now).toEqual({ value: 1, label: '12 of 12' })
    expect(streakOf(improving).weeks).toBe(12)
    expect(card.sentence).toBe('12 of 12 sessions. 12 weeks in a row.')
  })

  it('reports a broken streak as a decline', () => {
    const card = attendance(declining)
    expect(card.direction).toBe('down')
    expect(streakOf(declining).weeks).toBe(0)
    expect(card.sentence).toMatch(/Streak ended \d+ weeks ago\./)
    expect(card.status).toBe('red')
  })
})

describe('happiness', () => {
  it('compares this month with last month', () => {
    const card = happiness(improving)
    expect(card.start?.value).toBe(4)
    expect(card.now?.value).toBe(5)
    expect(card.sentence).toBe('Rates his weeks 5/5 this month, up from 4/5.')
  })

  it('goes red on a falling mood', () => {
    expect(happiness(declining).status).toBe('red')
  })

  it('collects under three answered weeks', () => {
    const card = happiness(thin)
    expect(card.state).toBe('collecting')
    expect(card.now).toBeNull()
  })
})

describe('confidence', () => {
  it('reads the ladder rung at both ends', () => {
    const card = confidence(improving)
    expect(card.sentence)
      .toBe('Started at 2: speaks when asked. Now 4: presents to team.')
    expect(card.internals?.growth).toBe(2)
  })

  it('says unchanged when the rung has not moved', () => {
    expect(confidence(flat).sentence).toBe('At 3: shares own ideas. Same as the start.')
  })

  it('carries verified extra hours as a second line', () => {
    expect(confidence(improving).secondary).toBe('3.5 extra hours logged this month')
  })
})

/* ================================================================ *
   Area 3 — Learning
 * ================================================================ */

describe('project marks', () => {
  it('reads the first two marks against the last two', () => {
    const card = projectMarks(improving)
    expect(card.start?.value).toBe(58)
    expect(card.now?.value).toBe(84)
    expect(card.sentence).toBe('First projects 58%. Latest 84%.')
    expect(card.studentLabel).toBe('Strong')
  })

  it('gives the student a word, never the percentage', () => {
    expect(projectMarks(declining).studentLabel).toBe('Building')
  })

  it('is a first reading with a single marked project', () => {
    const card = projectMarks(thin)
    expect(card.state).toBe('baseline')
    expect(card.start).toBeNull()
    expect(card.now?.value).toBe(64)
  })
})

describe('skill level', () => {
  it('reports growth against the locked start', () => {
    const card = skillLevel(improving)
    expect(card.start?.label).toBe('Level 1')
    expect(card.now?.label).toBe('Level 3')
    expect(card.sentence).toBe('Level 1 → Level 3: edits unsupervised.')
  })

  it('never renders a fall, because a level cannot go down', () => {
    expect(TEMPLATES.skill_level.down).toBeUndefined()
    expect(skillLevel(flat).sentence).toBe('Level 2. No change this quarter.')
  })

  it('closes the gate when retention fails', () => {
    expect(levelGate(declining).open).toBe(false)
    expect(levelGate(declining).retention).toBe(0.5)
  })
})

describe('skills map', () => {
  it('treats fewer gaps as an improvement', () => {
    const card = skillsMap(improving)
    expect(card.direction).toBe('up')
    expect(card.sentence).toBe('2 weak skills at start. 0 now.')
    expect(card.internals?.client_ready).toBe(4)
  })

  it('treats more gaps as a decline', () => {
    const card = skillsMap(declining)
    expect(card.direction).toBe('down')
    expect(card.sentence).toBe('2 weak skills, up from 0.')
  })
})

/* ================================================================ *
   Area 4 — Portfolio
 * ================================================================ */

describe('portfolio', () => {
  it('counts only live, named, consented client work', () => {
    expect(projectsDelivered(improving).sentence).toBe('1 client pieces live with his name.')
  })

  it('falls back to the piece in progress when nothing is live', () => {
    expect(projectsDelivered(flat).sentence)
      .toBe('0 live this quarter. Bakery promo reel at 60%, due 2026-11-05.')
  })

  it('hides an asset that has no consent on file', () => {
    const noConsent = structuredClone(improving) as PerfInput
    noConsent.assets.find(a => a.id === 'a-live')!.consentOnFile = false
    expect(projectsDelivered(noConsent).now?.value).toBe(0)
  })

  it('counts published products separately', () => {
    expect(publishedProducts(improving).sentence).toBe('1 product(s) published.')
    expect(publishedProducts(flat).sentence).toBe('None published yet.')
  })

  it('reads client-ready skills against last quarter', () => {
    expect(clientReady(improving).sentence).toBe('4 of 5 skills at client level, up from 2.')
    expect(clientReady(flat).sentence).toBe('2 of 5 at client level. Unchanged.')
    expect(clientReady(declining).sentence).toBe('2 of 5 at client level, down from 3.')
  })

  it('prices a paid piece at its fee and an unpaid one at the benchmark', () => {
    const card = portfolioValue(improving)
    /* 4,000 paid by the client + 2,500 benchmark × the 80% mark. */
    expect(card.now?.value).toBe(6000)
    expect(card.sentence).toBe('Estimated EGP 6,000, up from EGP 3,500 last quarter.')
    expect(card.now?.label).toContain('estimated')
  })
})

/* ================================================================ *
   Area 5 — Return
 * ================================================================ */

describe('return', () => {
  it('shows one line and no ratio', () => {
    const card = returnCard(improving)
    expect(card.sentence).toBe('Earned EGP 4,000 to date.')
    expect(card.sentence).not.toMatch(/target|ratio|payback|fee/i)
  })

  it('names the next planned piece when nothing has been earned', () => {
    expect(returnCard(flat).sentence).toBe('First paid piece planned · 2026-11-05')
  })

  it('keeps the breakdown for admin', () => {
    const breakdown = returnBreakdown(improving, 150)
    expect(breakdown.earnedTotal).toBe(4000)
    expect(breakdown.paybackProgress).toBe(0.3)
    expect(breakdown.perAsset.find(a => a.assetId === 'a-course')?.revenue).toBe(900)
  })
})

/* ================================================================ *
   Templates
 * ================================================================ */

describe('outcome templates', () => {
  it('leaves an unfilled placeholder visible rather than blanking it', () => {
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}')
  })

  it('carries a declined branch for every card that can decline', () => {
    const canFall = ['reliability', 'teamwork', 'independence', 'attendance', 'happiness',
      'confidence', 'project_marks', 'skills_map', 'client_ready', 'portfolio_value'] as const
    canFall.forEach(id => expect(TEMPLATES[id].down, id).toBeTruthy())
  })

  it('writes no adjective of encouragement anywhere', () => {
    const all = Object.values(TEMPLATES).flatMap(t => Object.values(t)).join(' ')
    expect(all).not.toMatch(/great|excellent|amazing|proud|well done|keep it up|brilliant/i)
  })
})

/* ================================================================ *
   Areas and highlights
 * ================================================================ */

describe('area lines and highlights', () => {
  it('counts how many measures moved', () => {
    const areas = areasOf(allCards(improving))
    expect(areas.find(a => a.areaId === 'character')?.sentence)
      .toBe('3 of 3 measures improved since start.')
    expect(areas.find(a => a.areaId === 'portfolio')?.sentence)
      .toBe('4 of 4 measures up since last quarter.')
  })

  it('picks the quarter chips in the brief order', () => {
    const chips = highlights(improving, allCards(improving))
    expect(chips).toHaveLength(4)
    expect(chips.map(c => c.id)).toEqual(['level', 'accepted', 'streak', 'live'])
    expect(chips[0].text).toBe('Level 2 → 3')
  })

  it('falls back to progress chips when fewer than two thresholds are crossed', () => {
    const chips = highlights(flat, allCards(flat))
    expect(chips.every(c => c.id.startsWith('progress-'))).toBe(true)
  })

  it('shows nothing at all for a student with nothing yet', () => {
    expect(highlights(thin, allCards(thin))).toHaveLength(0)
  })
})

/* ================================================================ *
   The views — §0, §7
 * ================================================================ */

describe('parent view', () => {
  const view = dashboard(improving, 'parent')

  it('never carries a status colour or an internal', () => {
    const json = JSON.stringify(view)
    expect(json).not.toMatch(/"status":/)
    expect(json).not.toMatch(/"internals":/)
    expect(json).not.toMatch(/judgment_ratio|silence_weeks|continueIntent|payback/)
  })

  it('renders no comparison without its locked start', () => {
    view.areas.flatMap(a => a.cards)
      .filter(c => c.state === 'normal')
      .forEach(c => expect(c.start, c.cardId).not.toBeNull())
  })

  it('shows the money as one line and no ratio', () => {
    expect(view.returnLine).toBe('Earned so far: EGP 4,000 🧾')
  })

  it('carries the delivered strip as our output, not his outcome', () => {
    expect(view.delivered).toMatchObject({ topicsDelivered: 18, topicsPlanned: 30 })
  })

  it('offers the next milestone', () => {
    expect(view.nextMilestone).toMatchObject({ title: 'Bakery promo reel', pctDone: 60 })
  })
})

describe('student view', () => {
  const view = dashboard(improving, 'student')
  const cards = view.areas.flatMap(a => a.cards)

  it('drops money, happiness and every colour', () => {
    expect(cards.find(c => c.cardId === 'portfolio_value')).toBeUndefined()
    expect(cards.find(c => c.cardId === 'return')).toBeUndefined()
    expect(cards.find(c => c.cardId === 'happiness')).toBeUndefined()
    expect(view.returnLine).toBeUndefined()
    expect(JSON.stringify(view)).not.toMatch(/"status":/)
  })

  it('gives a word for the peer rating and the mark, never the number', () => {
    const team = cards.find(c => c.cardId === 'teamwork')!
    expect(team.now).toBeNull()
    expect(team.studentLabel).toBe('Strong teammate')

    const marks = cards.find(c => c.cardId === 'project_marks')!
    expect(marks.now).toBeNull()
    expect(marks.studentLabel).toBe('Strong')
    expect(marks.sentence).toBe('')
  })

  it('keeps the level ladder and the streak', () => {
    expect(cards.find(c => c.cardId === 'skill_level')?.now?.label).toBe('Level 3')
    expect(cards.find(c => c.cardId === 'attendance')?.secondary).toBe('12-week streak')
  })
})

describe('admin view', () => {
  const view = dashboard(improving, 'admin', 150)

  it('keeps the colours, the internals and the breakdown', () => {
    const cards = view.areas.flatMap(a => a.cards)
    expect(cards.every(c => c.status !== undefined)).toBe(true)
    expect(cards.find(c => c.cardId === 'independence')?.internals?.judgment_ratio).toBe(0.5)
    expect(view.breakdown?.passiveShare).toBe(0.2)
  })
})

describe('a card with no locked start', () => {
  it('shows the reading alone and claims no comparison', () => {
    const cards = allCards(thin).filter(c => c.state === 'baseline')
    expect(cards.length).toBeGreaterThan(0)
    cards.forEach(c => {
      expect(c.start, c.cardId).toBeNull()
      expect(c.sentence, c.cardId).not.toMatch(/up from|down from|unchanged|same as/i)
    })
  })

  it('does not show one delivered project as both ends of independence', () => {
    const card = independence(thin)
    expect(card.start).toBeNull()
    expect(card.now?.label).toBe('100%')
    expect(card.sentence).toBe('')
  })
})

describe('proof', () => {
  it('never returns an item without consent on file', () => {
    const items = proofFor(improving, 'portfolio')
    expect(items.map(i => i.id)).toEqual(['pr-4'])
    expect(items.every(i => i.consentOnFile)).toBe(true)
  })

  it('caps an area at six items in a quarter', () => {
    const many = structuredClone(improving) as PerfInput
    many.proof = Array.from({ length: 9 }, (_, i) => ({
      id: `x${i}`, studentId: many.student.id, area: 'portfolio' as const,
      cardId: 'projects_delivered' as const, type: 'image' as const, path: `/p${i}.jpg`,
      consentOnFile: true, createdAt: `2026-08-0${i + 1}T00:00:00.000Z`,
    }))
    expect(proofFor(many, 'portfolio')).toHaveLength(6)
  })
})
