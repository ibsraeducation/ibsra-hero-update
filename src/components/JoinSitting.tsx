/* ==========================================================================
   The way into a live class, and the moment attendance is claimed.

   The link is not printed anywhere: asking for it is what records that the
   hero turned up, so it is handed over by the server, inside the sitting's
   own window and no earlier. What an admin confirms afterwards is the
   record; this is only the claim.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Video } from 'lucide-react'
import { joinBooking } from '@/lib/api/schedule'
import { toMessage } from '@/lib/api/errors'
import { useStore } from '@/lib/store'
import type { SessionBookingRow } from '@/lib/api/rows'

/** Minutes before the start that the link opens — the server enforces the
 *  same number, this only keeps the button honest. */
const EARLY_MIN = 15

export interface Sitting {
  id: string
  label: string
  startsAt: string
  endsAt: string
}

export const sittingsOf = (
  rows: SessionBookingRow[], nameOf: (loopId: string) => string,
): Sitting[] => rows
  .filter(b => b.status !== 'cancelled')
  .map(b => ({
    id: b.id,
    label: `${b.kind === 'section' ? 'Section' : 'Lecture'} · ${nameOf(b.loop_id)}`,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
  }))

/** The one that is open now, if any: from a quarter hour before it starts
 *  until it ends. */
export function openNow(sittings: Sitting[], now: number): Sitting | null {
  const within = sittings.filter(s => {
    const from = new Date(s.startsAt).getTime() - EARLY_MIN * 60_000
    const to = new Date(s.endsAt).getTime()
    return now >= from && now <= to
  })
  within.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  return within[0] ?? null
}

function waiting(startsAt: string, now: number): string {
  const mins = Math.round((new Date(startsAt).getTime() - now) / 60_000)
  if (mins <= 0) return 'Happening now'
  return `Starts in ${mins} minute${mins === 1 ? '' : 's'}`
}

export function JoinSitting({ sittings, onJoined }: {
  sittings: Sitting[]
  onJoined?: () => void
}) {
  const toast = useStore(s => s.toast)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const due = useMemo(() => openNow(sittings, now), [sittings, now])
  if (!due) return null

  const join = async () => {
    setBusy(true)
    try {
      const url = await joinBooking(due.id)
      window.open(url, '_blank', 'noopener,noreferrer')
      onJoined?.()
    } catch (e) {
      toast(toMessage(e), 'err')
    }
    setBusy(false)
  }

  return (
    <div className="card join-now mb16">
      <span className="fn-card-ico" style={{ background: 'var(--teal-100)', color: 'var(--teal-700)' }}>
        <Video />
      </span>
      <span className="stack g2 grow" style={{ minWidth: 0 }}>
        <span className="t-sm w-sb truncate">{due.label}</span>
        <span className="t-xs c-muted2">{waiting(due.startsAt, now)}</span>
      </span>
      <button className="btn primary" disabled={busy} onClick={() => void join()}>
        {busy ? <Loader2 className="spin" /> : <Video />}Join the class
      </button>
    </div>
  )
}
