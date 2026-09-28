/* ==========================================================================
   How long the program runs — the one place that says it.

   The parent reads this number in the enrolment form while they are still
   choosing their hours, and the admin reads it again in the schedule dialog
   while they are booking those hours in. If the two ever disagreed, one of
   them would be a promise the platform is not keeping, so they are the same
   component over the same calculator (`lengthOfAsk`), and the only thing
   that changes between them is how big it is drawn.
   ========================================================================== */

import { hoursLabel, lengthOfAsk, type WeekAsk } from '@/lib/programLength'
import './programRun.css'

export function ProgramRun({ totalHours, ask, size = 'lg' }: {
  /** The program's own hours, summed from its courses. Null when the admin
   *  has not given every course a length yet. */
  totalHours: number | null
  ask: WeekAsk
  size?: 'lg' | 'sm'
}) {
  const len = lengthOfAsk(totalHours, ask)
  const week = hoursLabel(len.weeklyHours)

  const split = len.buildHours > 0
    ? `${hoursLabel(len.learnHours)} learning · ${hoursLabel(len.buildHours)} building`
    : `${hoursLabel(len.learnHours)} learning`

  return (
    <div className="plen" data-size={size} aria-live="polite">
      <span className="plen-eyebrow">Program length</span>
      {len.weeklyHours === 0 ? (
        <>
          <b>—</b>
          <span className="plen-note">Pick the times and this fills in.</span>
        </>
      ) : len.weeks ? (
        <>
          <b>{len.weeks} weeks</b>
          <span className="plen-note">{week} a week · {split}</span>
        </>
      ) : (
        <>
          <b>{week} a week</b>
          <span className="plen-note">{split} — the admin will confirm the length.</span>
        </>
      )}
    </div>
  )
}
