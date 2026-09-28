/* ==========================================================================
   Reading one class time in two clocks.

   Cairo is where every session time is authored — see the admin's weekly
   availability windows and `window_occurrences()` on the server. This file
   never converts a wall-clock time itself: Postgres already did that, with
   the real tz database, DST included (see `private.expand_window` in
   supabase/migrations/20260924093000_booking_and_notices.sql). What arrives
   here is always an absolute instant (an ISO string with a real offset), and
   all this does is render that one instant in a browser's own timezone, so
   a family in Toronto or Riyadh reads their own clock without anybody
   hand-rolling a timezone table in JavaScript.
   ========================================================================== */

export const CAIRO = 'Africa/Cairo'

/** The viewer's own zone, as the browser reports it. */
export const viewerTz = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || CAIRO } catch { return CAIRO }
}

export function formatInTz(iso: string, tz: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: tz }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleString()
  }
}

/** "16:00" */
export const timeIn = (iso: string, tz: string): string =>
  formatInTz(iso, tz, { hour: '2-digit', minute: '2-digit', hour12: false })

/** "Sun 5 Oct" */
export const dayIn = (iso: string, tz: string): string =>
  formatInTz(iso, tz, { weekday: 'short', day: 'numeric', month: 'short' })

/** "2026-10-05", in the given zone — for bucketing a list of instants into
 *  the calendar cell they actually fall on in that viewer's own day. */
export const dayKey = (iso: string, tz: string): string =>
  formatInTz(iso, tz, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .split('/').reverse().join('-')

/** "Sun 16:00 Cairo · 09:00 your time" — collapses to one clock when the
 *  viewer's own zone already is Cairo. */
export function bothClocks(iso: string, tz: string = viewerTz()): string {
  const cairo = `${dayIn(iso, CAIRO)} · ${timeIn(iso, CAIRO)} Cairo`
  if (tz === CAIRO) return cairo
  return `${cairo} · ${timeIn(iso, tz)} your time`
}

/* ---------------- pure minute arithmetic, no zone at all ----------------
   Only for the admin's window editor: 0–1439 minutes from midnight, in
   whichever zone the number is later interpreted as (Cairo, always). */

export const minToHHMM = (m: number): string => {
  const h = Math.floor(m / 60) % 24
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export const hhmmToMin = (s: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return 0
  const h = Math.min(23, Math.max(0, Number(m[1])))
  const mm = Math.min(59, Math.max(0, Number(m[2])))
  return h * 60 + mm
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
