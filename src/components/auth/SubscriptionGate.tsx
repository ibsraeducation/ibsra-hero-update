/* ==========================================================================
   The door itself.

   A student whose family has never paid, or is past the closing day, sees
   this instead of their work — not an error, and not a price: money is the
   parent's business, so the page says what happened and who fixes it, and
   nothing more.

   It shuts nobody else: an admin and a parent always pass. It re-checks on
   every navigation, so a subscription paid moments ago opens the door on
   the very next click rather than waiting for a reload.
   ========================================================================== */

import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { backendLive } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { fetchBilling, fetchSubscription } from '@/lib/api/billing'
import { closesAt, subscriptionState } from '@/lib/billing'
import { dateFull } from '@/lib/format'
import '@/components/layout/countdown.css'

type Shut = { reason: 'none' } | { reason: 'ran_out'; closedOn: string }

export function SubscriptionGate({ children }: { children: ReactNode }) {
  const profile = useAuth(s => s.profile)
  const loc = useLocation()
  const [shut, setShut] = useState<Shut | null>(null)

  useEffect(() => {
    if (!backendLive || profile?.role !== 'student') { setShut(null); return }
    let live = true
    void (async () => {
      try {
        const [sub, billing] = await Promise.all([fetchSubscription(profile.id), fetchBilling()])
        if (!live) return
        const state = subscriptionState(sub?.paid_through ?? null, billing.close_before_days)
        if (state.state === 'open') { setShut(null); return }
        if (state.state === 'none') { setShut({ reason: 'none' }); return }
        setShut({
          reason: 'ran_out',
          closedOn: closesAt(sub!.paid_through!, billing.close_before_days).toISOString(),
        })
      } catch {
        /* A read that fails must never lock a student out. */
        if (live) setShut(null)
      }
    })()
    return () => { live = false }
    // Re-checked on every navigation, so a payment made while signed in
    // opens the door on the next click rather than waiting for a reload.
  }, [profile?.id, profile?.role, loc.pathname])

  if (!shut) return <>{children}</>

  return (
    <div className="page">
      <div className="cd-shut">
        <span className="cd-shut-mark"><Lock /></span>
        {shut.reason === 'none' ? (
          <>
            <h1 className="t-xl w-sb">Your subscription hasn't started yet</h1>
            <p className="t-sm c-muted">
              Your parent pays the months from the family wallet — the platform opens as soon
              as they do.
            </p>
          </>
        ) : (
          <>
            <h1 className="t-xl w-sb">Your subscription ran out</h1>
            <p className="t-sm c-muted">
              The platform closed for you on {dateFull(shut.closedOn)}. Your work is all still
              here — it opens again as soon as your parent has paid the next months.
            </p>
          </>
        )}
        <p className="t-xs c-muted2">Ask your parent to sign in and pay.</p>
      </div>
    </div>
  )
}
