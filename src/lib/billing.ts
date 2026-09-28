/* ==========================================================================
   The subscription clock, with no React and no network in it.

   Two numbers decide everything a family sees. `paid_through` is the last
   day the money they sent covers, and the admin's closing rule says how
   many days BEFORE that the platform actually shuts — five by default. A
   child paid up to the 26th is locked out on the 21st, so the family renews
   while the platform is still open rather than after it has stopped.

   Everything else here is the countdown that sits in the top bar: how long
   is left, and how loud to say it.
   ========================================================================== */

export type PayPlan = 'monthly' | 'quarterly' | 'half_annual' | 'annual'

/** What is on sale. Half-yearly and annual stay in the type because older
 *  payments may carry them, but nothing new is sold on them. */
export const PLANS: PayPlan[] = ['monthly', 'quarterly']

/** How long each plan runs once the admin accepts it — the countdown. Kept in
 *  step with `public.plan_days` on the server. */
export const PLAN_DAYS: Record<PayPlan, number> = {
  monthly: 30,
  quarterly: 90,
  half_annual: 180,
  annual: 365,
}

export const PLAN_LABEL: Record<PayPlan, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_annual: 'Half-yearly',
  annual: 'Annual',
}

export const PLAN_SUB: Record<PayPlan, string> = {
  monthly: '30 days of access',
  quarterly: '90 days of access',
  half_annual: '180 days of access',
  annual: '365 days of access',
}

/** 0–60 days. Zero shuts on the paid-through date itself. */
export const clampCloseBefore = (days: number) =>
  Math.min(60, Math.max(0, Math.round(Number.isFinite(days) ? days : 5)))

/** A `date` column as local midnight — never `new Date('2026-01-05')`, which
 *  is UTC and lands on the 4th for anybody west of Greenwich. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** The moment the platform closes for a child paid up to `paidThrough`:
 *  the start of the day `closeBefore` days ahead of it. With the default
 *  five, a child paid up to the 26th has the 20th as their last full day
 *  and is locked out when the 21st begins. */
export function closesAt(paidThrough: string, closeBefore: number): Date {
  const at = parseDay(paidThrough)
  at.setDate(at.getDate() - clampCloseBefore(closeBefore))
  at.setHours(0, 0, 0, 0)
  return at
}

export type Urgency = 'calm' | 'soon' | 'urgent' | 'closed'

export interface Countdown {
  /** Milliseconds left. Negative once the platform has closed. */
  ms: number
  days: number
  hours: number
  urgency: Urgency
  /** "18 days left", "9 hours left", "Access closed". */
  label: string
}

const DAY = 86_400_000
const HOUR = 3_600_000

/** How long is left, and how loudly to say it. Under two days it counts in
 *  hours, because a parent who reads "1 day" reads it as tomorrow. */
export function countdown(closes: Date, now: number = Date.now()): Countdown {
  const ms = closes.getTime() - now
  const days = Math.floor(ms / DAY)
  const hours = Math.floor(ms / HOUR)

  if (ms <= 0) return { ms, days: 0, hours: 0, urgency: 'closed', label: 'Access closed' }

  const urgency: Urgency = ms <= 2 * DAY ? 'urgent' : ms <= 7 * DAY ? 'soon' : 'calm'
  const label = ms >= 2 * DAY
    ? `${days} day${days === 1 ? '' : 's'} left`
    : hours >= 1
      ? `${hours} hour${hours === 1 ? '' : 's'} left`
      : `${Math.max(1, Math.floor(ms / 60_000))} min left`

  return { ms, days, hours, urgency, label }
}

/** Whether a child is locked out right now. No subscription at all is not a
 *  lockout: a child is only ever shut out after having been paid up once.
 *  This is the countdown's own reading — SubscriptionGate uses `isLive`
 *  instead, because it must shut a child who has never paid at all too. */
export function isClosed(paidThrough: string | null | undefined, closeBefore: number, now = Date.now()): boolean {
  if (!paidThrough) return false
  return closesAt(paidThrough, closeBefore).getTime() <= now
}

/** Whether the platform is open for a child right now, the way the server
 *  itself decides it — paid through today or later. This is the rule
 *  `answer_request` enforces before it opens a course, and the one the
 *  subscription gate now shuts on: unlike `isClosed`, a child who never paid
 *  at all is not live either. */
export function isLive(paidThrough: string | null | undefined, now: number = Date.now()): boolean {
  if (!paidThrough) return false
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return parseDay(paidThrough).getTime() >= today.getTime()
}

/** The three things a family's payment page, the top bar and Requests all
 *  need to say about one child: never paid, ran out, or open (with how long
 *  is left, when open). */
export type SubState = { state: 'none' } | { state: 'closed'; closes: Date } | { state: 'open'; closes: Date }

export function subscriptionState(
  paidThrough: string | null | undefined, closeBefore: number, now: number = Date.now(),
): SubState {
  if (!paidThrough) return { state: 'none' }
  const closes = closesAt(paidThrough, closeBefore)
  return closes.getTime() <= now ? { state: 'closed', closes } : { state: 'open', closes }
}

/** Rank three states the way a parent needs to see the worst one first: a
 *  child who has never paid is a bigger problem than one who has merely run
 *  out, which is a bigger problem than any child who is still open. */
const RANK: Record<SubState['state'], number> = { none: 0, closed: 1, open: 2 }

/** The child whose situation needs attention first — never paid beats run
 *  out beats the soonest-closing child still open. Unlike `soonest`, a
 *  never-paid child is never skipped: they are the whole point of this one. */
export function worst<T extends { paidThrough: string | null }>(
  rows: T[], closeBefore: number, now: number = Date.now(),
): { row: T; state: SubState } | null {
  let best: { row: T; state: SubState } | null = null
  for (const row of rows) {
    const state = subscriptionState(row.paidThrough, closeBefore, now)
    if (!best) { best = { row, state }; continue }
    if (RANK[state.state] < RANK[best.state.state]) { best = { row, state }; continue }
    if (state.state === 'open' && best.state.state === 'open' && state.closes < best.state.closes) {
      best = { row, state }
    }
  }
  return best
}

/** The child whose door shuts first — the one the top bar counts down to. */
export function soonest<T extends { paidThrough: string | null }>(
  rows: T[], closeBefore: number,
): { row: T; closes: Date } | null {
  let best: { row: T; closes: Date } | null = null
  for (const row of rows) {
    if (!row.paidThrough) continue
    const closes = closesAt(row.paidThrough, closeBefore)
    if (!best || closes < best.closes) best = { row, closes }
  }
  return best
}
