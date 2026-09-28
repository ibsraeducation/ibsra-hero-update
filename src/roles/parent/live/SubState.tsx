/* ==========================================================================
   One line saying where a child stands: paid up to a date, how long is left
   before the platform closes on them, or that it already has.
   ========================================================================== */

import { CalendarClock, CheckCircle2, Clock, Lock } from 'lucide-react'
import { closesAt, countdown } from '@/lib/billing'
import { dateFull } from '@/lib/format'
import '@/roles/admin/billing.css'

export function SubState({ name, paidThrough, closeBefore, tail }: {
  name: string
  paidThrough: string | null
  closeBefore: number
  tail?: React.ReactNode
}) {
  if (!paidThrough) {
    return (
      <div className="bill-state">
        <Clock style={{ width: 16, height: 16, flex: 'none' }} />
        <span className="t-sm grow">
          <b>{name}</b> has no subscription yet.
        </span>
        {tail}
      </div>
    )
  }

  const closes = closesAt(paidThrough, closeBefore)
  const left = countdown(closes)
  const Icon = left.urgency === 'closed' ? Lock : left.urgency === 'calm' ? CheckCircle2 : CalendarClock

  return (
    <div className="bill-state" data-urgency={left.urgency}>
      <Icon style={{ width: 16, height: 16, flex: 'none' }} />
      <span className="t-sm grow">
        <b>{name}</b>{' '}
        {left.urgency === 'closed'
          ? <>is locked out — the platform closed on {dateFull(closes.toISOString())}.</>
          : <>is paid up to {dateFull(paidThrough)}. The platform closes
            on {dateFull(closes.toISOString())} — <b>{left.label}</b>.</>}
      </span>
      {tail}
    </div>
  )
}
