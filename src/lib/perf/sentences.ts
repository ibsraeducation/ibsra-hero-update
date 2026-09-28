/* ==========================================================================
   Performance Analysis — outcome statements (§5)

   Every sentence a parent reads is filled from one of these templates. No
   card writes prose of its own, and there is no branch that hides a fall:
   a declined reading gets a declined sentence and is shown.

   The copy is stated exactly as the brief specifies it, third person
   singular included. Swapping the pronoun for a per-student token is a
   one-line change here and nowhere else.
   ========================================================================== */

import type { CardId, Direction } from './types'

export type Vars = Record<string, string | number>

/** `{name}` is replaced; anything unfilled is left visible rather than blanked. */
export function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole)
}

/**
 * One template per card per direction. A missing branch means that direction
 * cannot happen for that card — a level never goes down, a count of live
 * pieces is either up or it is the fallback line.
 */
export const TEMPLATES: Record<CardId, Partial<Record<Direction, string>>> = {
  reliability: {
    up: '{on_time} of {due} tasks delivered on time, up from {start_pct}%.',
    flat: '{on_time} of {due} on time. Same rate as at the start.',
    down: '{on_time} of {due} on time, down from {start_pct}%.',
  },
  teamwork: {
    up: 'Teammates rate him {now}/5, up from {start}/5.',
    flat: 'Teammates rate him {now}/5. Unchanged.',
    down: 'Teammates rate him {now}/5, down from {start}/5.',
  },
  independence: {
    up: '{pct}% of his last project done without help, up from {start_pct}%.',
    flat: '{pct}% without help. Unchanged from the first project.',
    down: '{pct}% without help, down from {start_pct}%.',
  },
  attendance: {
    up: '{attended} of {held} sessions. {streak} weeks in a row.',
    flat: '{attended} of {held} sessions. {streak} weeks in a row.',
    down: '{attended} of {held} sessions. Streak ended {weeks_ago} weeks ago.',
  },
  happiness: {
    up: 'Rates his weeks {now}/5 this month, up from {prev}/5.',
    flat: 'Rates his weeks {now}/5. Unchanged.',
    down: 'Rates his weeks {now}/5, down from {prev}/5.',
  },
  confidence: {
    up: 'Started at {start}: {ladder_start}. Now {now}: {ladder_now}.',
    flat: 'At {now}: {ladder_now}. Same as the start.',
    down: 'At {now}: {ladder_now}, down from {start}.',
  },
  project_marks: {
    up: 'First projects {first}%. Latest {latest}%.',
    flat: 'Latest {latest}%. Same as first.',
    down: 'Latest {latest}%, down from {first}%.',
  },
  skill_level: {
    up: 'Level {start} → Level {now}: {ladder_now}.',
    flat: 'Level {now}. No change this quarter.',
  },
  skills_map: {
    up: '{gaps_start} weak skills at start. {gaps_now} now.',
    flat: '{gaps_now} weak skills. Unchanged.',
    down: '{gaps_now} weak skills, up from {gaps_start}.',
  },
  projects_delivered: {
    up: '{n} client pieces live with his name.',
    down: '0 live this quarter. {fallback_title} at {pct}%, due {date}.',
  },
  published_products: {
    up: '{n} product(s) published.',
    down: 'None published yet. {fallback_title} in progress.',
  },
  client_ready: {
    up: '{n} of 5 skills at client level, up from {prev}.',
    flat: '{n} of 5 at client level. Unchanged.',
    down: '{n} of 5 at client level, down from {prev}.',
  },
  portfolio_value: {
    up: 'Estimated {cur} {value}, up from {cur} {prev} last quarter.',
    flat: 'Estimated {cur} {value}. Unchanged.',
    down: 'Estimated {cur} {value}, down from {cur} {prev}.',
  },
  return: {
    up: 'Earned {cur} {total} to date.',
    flat: 'Earned {cur} {total} to date.',
  },
}

/** The sentence for a card. Falls back to the flat branch where one direction has none. */
export function sentence(cardId: CardId, direction: Direction, vars: Vars): string {
  const set = TEMPLATES[cardId]
  const template = set[direction] ?? set.flat ?? set.up ?? ''
  return fill(template, vars)
}

/** Shown in place of a number while a card is still short of its minimum. */
export const collectingLine = (have: number, need: number, unit: string): string =>
  `Collecting · ${have} of ${need} ${unit}`

/** Under an area title: how many of its measures moved since the start. */
export const areaSentence = (improved: number, total: number, since: 'start' | 'last quarter'): string =>
  since === 'start'
    ? `${improved} of ${total} measures improved since start.`
    : `${improved} of ${total} measures up since last quarter.`

/** The Return line. No target, no ratio, no fee — §4 Area 5. */
export const returnLine = (currency: string, total: number, nextShipDate: string | null): string =>
  total > 0
    ? `Earned so far: ${currency} ${total.toLocaleString('en-US')} 🧾`
    : `First paid piece planned · ${nextShipDate ?? 'date to be set'}`
