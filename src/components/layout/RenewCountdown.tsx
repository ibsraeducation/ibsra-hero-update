/* ==========================================================================
   The clock in the top bar, for a parent and nobody else.

   It counts down to the moment the platform closes on whichever of their
   students runs out first, and it gets louder as that gets nearer: quiet
   over a week out, amber inside one, red inside two days, and a plain
   "Access closed" once it has passed. Tapping it goes straight to paying.

   A student never sees money, so they never see this — they meet the door
   itself, in `SubscriptionGate`.
   ========================================================================== */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Lock } from 'lucide-react'
import { backendLive } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { fetchChildren } from '@/lib/api/family'
import { fetchBilling, fetchSubscriptions } from '@/lib/api/billing'
import { countdown, soonest } from '@/lib/billing'
import './countdown.css'

interface Soonest {
  studentId: string
  name: string
  closes: Date
}

/** Re-read once a minute: nothing here changes faster than that, and the
 *  label itself only moves in whole minutes. */
const TICK = 60_000

export function RenewCountdown() {
  const role = useAuth(s => s.profile?.role)
  const userId = useAuth(s => s.profile?.id)
  const [next, setNext] = useState<Soonest | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!backendLive || role !== 'parent' || !userId) { setNext(null); return }
    let live = true
    void (async () => {
      try {
        const [kids, subs, billing] = await Promise.all([
          fetchChildren(), fetchSubscriptions(), fetchBilling(),
        ])
        if (!live) return
        const rows = kids.map(k => ({
          studentId: k.profile.id,
          name: k.profile.name || k.profile.email,
          paidThrough: subs.find(s => s.student_id === k.profile.id)?.paid_through ?? null,
        }))
        const first = soonest(rows, billing.close_before_days)
        setNext(first ? { ...first.row, closes: first.closes } : null)
      } catch {
        /* The top bar is not the place to report a failed read. */
      }
    })()
    return () => { live = false }
  }, [role, userId])

  useEffect(() => {
    if (!next) return
    const t = window.setInterval(() => setNow(Date.now()), TICK)
    return () => window.clearInterval(t)
  }, [next])

  if (!next) return null

  const left = countdown(next.closes, now)
  const closed = left.urgency === 'closed'

  return (
    <Link
      to="/parent/payments"
      className="cd-pill"
      data-urgency={left.urgency}
      title={closed
        ? `The platform is closed for ${next.name} until the next payment is approved`
        : `${next.name} is paid up until the platform closes — ${left.label}`}
    >
      {closed ? <Lock /> : <CalendarClock />}
      <span className="tnum">{left.label}</span>
      <span className="cd-who hide-sm">{closed ? `· ${next.name} is locked out` : `· ${next.name}`}</span>
    </Link>
  )
}
