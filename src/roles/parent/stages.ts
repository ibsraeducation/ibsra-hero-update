/* The four stages of a child's program path, and the small readers the
   summary folders and the program page both use — kept here so neither
   page has to import the other. */

import type { ProgramStage, Stage } from './data'

export const STAGES: Array<{ key: Stage; label: string; tone: string; hint: string; empty: string }> = [
  { key: 'done', label: 'Finished', tone: 'teal', hint: 'Completed and marked', empty: 'No program finished yet.' },
  { key: 'live', label: 'In progress', tone: 'brand', hint: 'Running now', empty: 'Nothing running right now.' },
  { key: 'soon', label: 'Booked', tone: 'sky', hint: 'Already on the calendar', empty: 'Nothing booked yet.' },
  { key: 'recommended', label: 'Next step', tone: 'gold', hint: 'Next on IBSRA\'s program path', empty: 'The path ends here for now.' },
]

export const stageMeta = (s: Stage) => STAGES.find(x => x.key === s)!

export const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString())

export const topicCount = (p: ProgramStage) => p.learn.reduce((a, g) => a + g.topics.length, 0)

export const programPath = (trackId: string) => `/parent/program/${trackId}`
