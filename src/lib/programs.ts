/* ==========================================================================
   Program path — what IBSRA says each training program produces, and where
   it sits on the training path.

   What a program PRODUCES is authored here, keyed by Track id: the
   competencies a mentor scores and the assets the student walks away with.
   Topics are NOT listed — what a program teaches is read from its real
   sessions, so this can never drift from the content.

   What FOLLOWS a program is not here. The admin draws that on the program
   map and it is stored on the Track itself (`nextIds`), so the path is data
   the admin owns rather than a table only a developer can edit.
   ========================================================================== */

import type { ProgramStage, Track } from './types'

export interface ProgramAsset { name: string; note: string }

export interface ProgramPath {
  /** What a mentor scores in this program. */
  competencies: string[]
  /** The work a student owns at the end — named, never priced. */
  assets: ProgramAsset[]
}

export const PROGRAM_PATHS: Record<string, ProgramPath> = {
  trk_brand: {
    competencies: ['Brief interrogation', 'Type & layout', 'Colour systems', 'Asset production', 'Presenting work'],
    assets: [
      { name: 'Brand identity kit', note: 'Logo lockups, palette and type system for a real client' },
      { name: '6-asset social kit', note: 'Platform-ready templates the client keeps reusing' },
      { name: 'Published case study', note: 'The write-up of the job, under the student\'s own name' },
    ],
  },
  trk_video: {
    competencies: ['Scripting & hooks', 'Prompted generation', 'Edit & pacing', 'Sound design', 'Client delivery'],
    assets: [
      { name: '30-second client ad', note: 'Scripted, generated and cut to a real brief' },
      { name: 'Short-form reel series', note: 'Three reels in the client\'s format and voice' },
      { name: 'Scope note + handover pack', note: 'The paperwork that gets a video job paid' },
    ],
  },
  trk_data: {
    competencies: ['Data cleaning', 'Formulas & logic', 'Pivot & modelling', 'Dashboard design', 'Reporting to client'],
    assets: [
      { name: 'Cleaned client dataset', note: 'A real messy sheet, rebuilt with rules that scale' },
      { name: 'Looker Studio dashboard', note: 'The answer the client asked for, on one screen' },
      { name: 'Refresh + handover guide', note: 'So the client can keep it running without the student' },
    ],
  },
  trk_auto: {
    competencies: ['Process mapping', 'Node & flow logic', 'API & auth handling', 'Error handling', 'Client handover'],
    assets: [
      { name: 'Live client workflow', note: 'An n8n automation running inside a real business' },
      { name: 'Process map', note: 'The client\'s process, drawn before it was automated' },
      { name: 'Handover documentation', note: 'What breaks, how to tell, and who to call' },
    ],
  },
  trk_ai: {
    competencies: ['Prompt design', 'API integration', 'Evaluating output', 'Cost & latency', 'Shipping to product'],
    assets: [
      { name: 'Shipped AI feature', note: 'An LLM call wired into a real product, not a demo' },
      { name: 'Tiny agent with guardrails', note: 'Tool calling, refusals and structured output' },
      { name: 'Cost-per-request report', note: 'What the feature costs the client to run' },
    ],
  },
}

const FALLBACK: ProgramPath = {
  competencies: ['Craft', 'Tooling', 'Problem solving', 'Consistency', 'Client work'],
  assets: [{ name: 'Published client piece', note: 'Mentor-approved work under the student\'s own name' }],
}

export const pathOf = (trackId: string | undefined): ProgramPath =>
  (trackId && PROGRAM_PATHS[trackId]) || FALLBACK

/* ==========================================================================
   The path itself — the admin's connections, and the shape they make.

   An edge is one line the admin drew on the program map: `from` leads to
   `to`. Everything below reads those and nothing else, so what the map
   shows, what the parent report calls "next", and which column a card sits
   in can never disagree with each other.
   ========================================================================== */

export interface ProgramEdge { from: string; to: string }

/** Where the seeded programs pointed before the map could be drawn by hand.
 *  Used once, to fill in a saved database made before connections existed. */
export const LEGACY_NEXT: Record<string, string[]> = {
  trk_brand: ['trk_video'],
  trk_video: ['trk_ai', 'trk_auto'],
  trk_data: ['trk_auto'],
  trk_auto: ['trk_ai'],
  trk_ai: [],
}

/** The programs this one leads to, ignoring any that no longer exist. */
export const leadsTo = (track: Pick<Track, 'nextIds'>, all: Pick<Track, 'id'>[]): string[] =>
  (track.nextIds ?? []).filter(id => all.some(t => t.id === id))

/** The programs that lead INTO this one. */
export const comesAfter = (id: string, all: Pick<Track, 'id' | 'nextIds'>[]): string[] =>
  all.filter(t => t.id !== id && (t.nextIds ?? []).includes(id)).map(t => t.id)

/** Every line to draw, with both ends still present. */
export function programEdges(all: Pick<Track, 'id' | 'nextIds'>[]): ProgramEdge[] {
  const ids = new Set(all.map(t => t.id))
  return all.flatMap(t => (t.nextIds ?? [])
    .filter(to => ids.has(to) && to !== t.id)
    .map(to => ({ from: t.id, to })))
}

/** Where the connections put this program, knowing nothing else about it. */
export function derivedStage(track: Pick<Track, 'id' | 'nextIds'>, all: Pick<Track, 'id' | 'nextIds'>[]): ProgramStage {
  const leadsOn = leadsTo(track, all).length > 0
  const after = comesAfter(track.id, all).length > 0
  if (!after && leadsOn) return 'foundation'
  if (after && !leadsOn) return 'capstone'
  /* Connected at both ends, or connected at neither: a program nobody has
     wired up yet is a specialization until the admin says otherwise. Calling
     it both the start and the finish would be worse than saying nothing. */
  return 'specialization'
}

/** Where a program sits: what it says about itself, else what the lines say. */
export const stageOf = <T extends Pick<Track, 'id' | 'stage' | 'nextIds'>>(track: T, all: T[]): ProgramStage =>
  track.stage ?? derivedStage(track, all)

/** The programs of each stage, each keeping the order it has in the DB. */
export function byStage<T extends Pick<Track, 'id' | 'stage' | 'nextIds'>>(tracks: T[]): Record<ProgramStage, T[]> {
  const out: Record<ProgramStage, T[]> = { foundation: [], specialization: [], capstone: [] }
  for (const t of tracks) out[stageOf(t, tracks)].push(t)
  return out
}
