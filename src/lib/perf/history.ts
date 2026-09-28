/* ==========================================================================
   Performance Analysis — card history (§3.2 detail sheet)

   The last six monthly readings behind a card. Nothing is stored: the card
   is simply recomputed with the clock wound back to the end of each month,
   so a history point and the card it sits under are the same calculation.
   A month that had too little data to read returns null and is drawn as a
   gap, not as a zero.
   ========================================================================== */

import { CARD_FNS } from './calc'
import { monthWindow, ms, quarterWindow } from './time'
import type { CardId, MonthKey, PerfInput } from './types'

export interface HistoryPoint {
  month: MonthKey
  value: number | null
  label: string
}

/** The last instant of the month `back` months before the one holding `d`. */
function monthEndBefore(d: string, back: number): string {
  const date = new Date(ms(d))
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - back + 1, 1) - 1
  return new Date(end).toISOString()
}

export function historyOf(input: PerfInput, cardId: CardId, points = 6): HistoryPoint[] {
  const fn = CARD_FNS[cardId]
  const out: HistoryPoint[] = []

  for (let back = points - 1; back >= 0; back--) {
    /* The current month is read as it stands now, not at a month end in the future. */
    const asOf = back === 0 ? input.now : monthEndBefore(input.now, back)
    if (ms(asOf) < ms(input.student.enrolledAt)) continue

    const card = fn({
      ...input,
      now: asOf,
      month: monthWindow(asOf),
      quarter: quarterWindow(asOf),
    })
    out.push({
      month: monthWindow(asOf).key,
      value: card.now?.value ?? null,
      label: card.now?.label ?? '—',
    })
  }
  return out
}
