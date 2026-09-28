/* ==========================================================================
   Performance Analysis — the calendar

   Weeks, months and quarters are the three windows every formula cuts
   against, so they are defined once here and nowhere else. Weeks are ISO
   weeks (Monday start), because the pulse and the peer rating are collected
   on a Friday and have to land in the week they were asked about.
   ========================================================================== */

import type { ISODate, MonthKey, QuarterKey, WeekKey } from './types'

export const DAY = 86_400_000
export const WEEK = 7 * DAY

export const ms = (d: ISODate): number => Date.parse(d)

/** `[from, to)` — the half-open window every window test in this module uses. */
export const within = (d: ISODate | null, from: ISODate, to: ISODate): boolean =>
  d !== null && ms(d) >= ms(from) && ms(d) < ms(to)

export const daysBetween = (a: ISODate, b: ISODate): number => (ms(b) - ms(a)) / DAY

/** Days from `d` to now. Negative for a date still ahead. */
export const ageInDays = (d: ISODate, now: ISODate): number => daysBetween(d, now)

export const plusDays = (d: ISODate, n: number): ISODate =>
  new Date(ms(d) + n * DAY).toISOString()

/* ---------------------------------------------------------------- *
   Keys
 * ---------------------------------------------------------------- */

/** ISO-8601 week key, `2026-W07`. Thursday decides the year, as the standard says. */
export function weekKey(d: ISODate | Date): WeekKey {
  const date = new Date(typeof d === 'string' ? ms(d) : d.getTime())
  const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  /* Monday = 0 … Sunday = 6, then step to the Thursday of this week. */
  const dayNo = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dayNo + 3)
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const firstDayNo = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNo + 3)
  const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / WEEK)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** The Monday that opens an ISO week key, as an ISO timestamp. */
export function weekStart(key: WeekKey): ISODate {
  const [y, w] = key.split('-W')
  const jan4 = new Date(Date.UTC(Number(y), 0, 4))
  const dayNo = (jan4.getUTCDay() + 6) % 7
  const week1Monday = jan4.getTime() - dayNo * DAY
  return new Date(week1Monday + (Number(w) - 1) * WEEK).toISOString()
}

/** Week keys from `from` to `to` inclusive, oldest first. */
export function weeksBetween(from: ISODate, to: ISODate): WeekKey[] {
  const out: WeekKey[] = []
  let cursor = ms(weekStart(weekKey(from)))
  const end = ms(to)
  while (cursor <= end) {
    out.push(weekKey(new Date(cursor).toISOString()))
    cursor += WEEK
  }
  return out
}

export const monthKey = (d: ISODate): MonthKey => d.slice(0, 7)

export const quarterKey = (d: ISODate): QuarterKey => {
  const date = new Date(ms(d))
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
}

export function monthWindow(d: ISODate): { key: MonthKey; start: ISODate; end: ISODate } {
  const date = new Date(ms(d))
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  return {
    key: monthKey(d),
    start: new Date(Date.UTC(y, m, 1)).toISOString(),
    end: new Date(Date.UTC(y, m + 1, 1)).toISOString(),
  }
}

export function quarterWindow(d: ISODate): { key: QuarterKey; start: ISODate; end: ISODate } {
  const date = new Date(ms(d))
  const y = date.getUTCFullYear()
  const q = Math.floor(date.getUTCMonth() / 3)
  return {
    key: quarterKey(d),
    start: new Date(Date.UTC(y, q * 3, 1)).toISOString(),
    end: new Date(Date.UTC(y, q * 3 + 3, 1)).toISOString(),
  }
}

/** The quarter before the one holding `d`. Used for every last-quarter delta. */
export function previousQuarter(d: ISODate): { key: QuarterKey; start: ISODate; end: ISODate } {
  const q = quarterWindow(d)
  return quarterWindow(plusDays(q.start, -1))
}

export const prevMonthKey = (key: MonthKey): MonthKey => {
  const [y, m] = key.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** The first `n` weeks after enrolment — the window every locked baseline reads. */
export const baselineWindow = (enrolledAt: ISODate, weeks: number): { start: ISODate; end: ISODate } =>
  ({ start: enrolledAt, end: plusDays(enrolledAt, weeks * 7) })
