/* ==========================================================================
   Parent · performance — the parts of the report with no table of their own
   yet: character, portfolio valuation, LinkedIn reach, and the one piece of
   the Learning charts nothing tracks today — how engaged a session felt.

   Everything else on the Learning page (new information, information value,
   understanding) is read straight from the real session/asset/task data in
   performanceModel.ts — see PerformanceLearning in Performance.tsx.

   None of this is billed or promised — "estimated" travels with every money
   figure, the same as the reporting summary's portfolio line. Every figure
   is seeded from the slice itself, so the same slice reads the same on every
   load, screenshot or re-render.
   ========================================================================== */

import { useMemo } from 'react'
import type { AssetRow } from './performanceModel'

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

/** How engaged a session felt, in the room and after it — the one Learning
 *  measure nothing in the data model tracks yet. One point per session. */
export interface EngagementSeries {
  during: number[]
  after: number[]
}

export interface CharacterTrait {
  key: string
  label: string
  note: string
  score: number
}

export interface PortfolioProject {
  id: string
  name: string
  courseCode: string
  /** Estimated worth, EGP — never billed, never promised. */
  value: number
}

export interface MediaImpact {
  impressions: number
  profileViews: number
  connections: number
  postsPublished: number
  engagementRate: number
}

export interface ScoresModel {
  character: CharacterTrait[]
  characterAvg: number
  portfolio: PortfolioProject[]
  portfolioTotal: number
  media: MediaImpact
  engagement: EngagementSeries
}

/** The ten habits a mentor can actually see, not a personality test. */
const TRAITS: Array<{ key: string; label: string; note: string }> = [
  { key: 'reliability', label: 'Reliability', note: 'Keeps deadlines without reminders.' },
  { key: 'accountability', label: 'Accountability', note: 'Owns results, initiates their own fixes.' },
  { key: 'autonomy', label: 'Autonomy', note: 'Completes work without supervision.' },
  { key: 'resilience', label: 'Resilience', note: 'Returns to work within 48 hours of a rejection.' },
  { key: 'collaboration', label: 'Collaboration', note: 'Trusted and rated by their team.' },
  { key: 'initiative', label: 'Initiative', note: 'Produces unassigned work, invests voluntary hours.' },
  { key: 'communication', label: 'Communication', note: 'Presents their work to clients and answers questions.' },
  { key: 'judgment', label: 'Judgment', note: 'Asks decision questions, not instruction questions.' },
  { key: 'integrity', label: 'Integrity', note: 'Flags at-risk deadlines before they are missed.' },
  { key: 'completion', label: 'Completion', note: 'Finishes what they start.' },
]

export function useScoresModel(seedKey: string, assets: AssetRow[], sessionCount = 0): ScoresModel {
  return useMemo(() => {
    const rnd = stream(seedOf(`${seedKey}:scores`))

    /* A small random walk, not independent points each time — engagement in
       one session says something about the next. */
    const walk = (start: number, lo: number, hi: number) => {
      let v = start
      return Array.from({ length: Math.max(1, sessionCount) }, () => {
        v = Math.max(lo, Math.min(hi, v + spread(rnd, -9, 11)))
        return v
      })
    }
    const engagement: EngagementSeries = { during: walk(66, 40, 98), after: walk(58, 35, 95) }

    const character: CharacterTrait[] = TRAITS.map(t => ({ ...t, score: spread(rnd, 45, 96) }))
    const characterAvg = character.length
      ? Math.round(character.reduce((a, t) => a + t.score, 0) / character.length)
      : 0

    /* Valuation folds together the same signals the Return page already
       trusts — demand, client rating, verified income — into one estimated
       EGP figure per piece. It is never a price and never a promise. */
    const named = assets.filter(a => a.state !== 'will')
    const portfolio: PortfolioProject[] = named.map(a => ({
      id: a.id, name: a.name, courseCode: a.courseCode,
      value: Math.round((300 + a.demand * 350 + (a.rating ?? 3) * 400 + a.income * 0.3) / 50) * 50,
    }))
    const portfolioTotal = portfolio.reduce((a, p) => a + p.value, 0)

    const media: MediaImpact = {
      impressions: spread(rnd, 400, 6200),
      profileViews: spread(rnd, 30, 480),
      connections: spread(rnd, 5, 140),
      postsPublished: spread(rnd, 0, 9),
      engagementRate: spread(rnd, 2, 14),
    }

    return { character, characterAvg, portfolio, portfolioTotal, media, engagement }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, assets.length, sessionCount])
}
