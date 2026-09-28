/* ==========================================================================
   A calendar belongs to a training program.

   A hero on two programs used to read one grid holding both, which is not a
   week anybody recognises: the Discovery lectures and the Robotics
   stand-ups sit on the same Tuesday and nothing says which is which. So
   every calendar picks a program first and shows that program's week.

   A sitting knows its course (`loop_id`); the course knows its program.
   That is the whole mapping, and it lives here because the parent's,
   the hero's and the admin's calendars all need the same one.
   ========================================================================== */

import type { DB } from '@/lib/types'

/** One program with sittings on the calendar, and how many. */
export interface ProgramSlice {
  id: string
  name: string
  count: number
}

/** The program a sitting belongs to, through its course. */
export function trackOfLoop(db: DB, loopId: string): string | null {
  return db.loops.find(l => l.id === loopId)?.trackId ?? null
}

/** The programs these sittings fall under, busiest first, then by name.
 *  Sittings whose course has since been deleted are gathered under one
 *  entry rather than dropped — they are still time in somebody's week. */
export function programsOf(rows: Array<{ loop_id: string }>, db: DB): ProgramSlice[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const id = trackOfLoop(db, r.loop_id) ?? ''
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return [...counts].map(([id, count]) => ({
    id,
    name: db.tracks.find(t => t.id === id)?.name ?? 'Other sittings',
    count,
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The program to open on: the one already chosen if it still has
 *  sittings, otherwise the busiest. '' when there is nothing booked. */
export function pickProgram(slices: ProgramSlice[], chosen: string): string {
  if (chosen && slices.some(s => s.id === chosen)) return chosen
  return slices[0]?.id ?? ''
}
