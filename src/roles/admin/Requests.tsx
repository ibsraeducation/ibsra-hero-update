/* ==========================================================================
   Admin · Registrations

   Every hero a family has enrolled, in one table: who the parent is, who
   the hero is, the national ID the platform files them under, the WhatsApp
   number the mentor reaches them on, the program, and the rhythm the family
   asked for — so many 2-hour lectures a week, and a stand-up of so many
   minutes on the other days.

   That last column is the point of the page. It is the family's
   availability, and the last column but one is the button that turns it
   into real sittings: "Set the schedule" opens the week dialog, where the
   admin types the days and times, every lecture and stand-up is booked, and
   the parent and the hero are notified and taken to their calendars.

   Accepting a payment opens the same dialog on Students & payments;
   `?answer=<registration>` opens it here.

   The rows come from the `program_registrations` view, which is the join of
   the request with both people and the program — see
   `listRegistrations`.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, CalendarCheck, CheckCircle2, Clock, Inbox, Loader2, User, XCircle,
} from 'lucide-react'
import {
  fetchRequest, listRegistrations, type RegistrationRow, type RequestWithPeople,
} from '@/lib/api/requests'
import { ScheduleDialog } from './ScheduleDialog'
import { useAdminQueue } from '@/lib/api/adminQueue'
import { toMessage } from '@/lib/api/errors'
import { date } from '@/lib/format'
import { availabilityLine } from '@/lib/programLength'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Empty, SearchInput } from '@/components/ui'
import type { RequestStatus } from '@/lib/api/rows'
import '../parent/live/family.css'
import './wallets.css'

const LOOK: Record<RequestStatus, { label: string; tone: string; icon: typeof Clock }> = {
  pending: { label: 'Waiting for you', tone: 'gold', icon: Clock },
  approved: { label: 'Scheduled', tone: 'teal', icon: CheckCircle2 },
  declined: { label: 'Declined', tone: 'rose', icon: XCircle },
}

const FILTERS: Array<{ value: RequestStatus | 'all'; label: string }> = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Scheduled' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'Everything' },
]

export default function AdminRequests() {
  const [rows, setRows] = useState<RegistrationRow[] | null>(null)
  const [filter, setFilter] = useState<RequestStatus | 'all'>('pending')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [answering, setAnswering] = useState<RequestWithPeople | null>(null)
  const [params, setParams] = useSearchParams()
  const answerId = params.get('answer')

  const refreshQueue = useAdminQueue(s => s.refresh)

  const load = useCallback(async () => {
    try {
      setError(null)
      setRows(await listRegistrations())
      /* The badge on the rail counts the same rows this page just read. */
      void refreshQueue()
    } catch (e) {
      setError(toMessage(e))
      setRows([])
    }
  }, [refreshQueue])

  useEffect(() => { void load() }, [load])

  /* The table reads the flat view; the dialog needs the request itself. */
  const open = useCallback(async (id: string) => {
    setOpening(id); setError(null)
    try {
      const req = await fetchRequest(id)
      if (req) setAnswering(req)
      else setError('That registration is gone — the family may have withdrawn it.')
    } catch (e) {
      setError(toMessage(e))
    }
    setOpening(null)
  }, [])

  /* Arriving from an accepted payment: open that family's registration
     straight away, then drop the parameter so closing it stays closed. */
  useEffect(() => {
    if (!answerId || !rows) return
    if (rows.some(r => r.id === answerId && r.status === 'pending')) void open(answerId)
    setParams(p => { p.delete('answer'); return p }, { replace: true })
  }, [answerId, rows, setParams, open])

  const counts = useMemo(() => ({
    pending: (rows ?? []).filter(r => r.status === 'pending').length,
    approved: (rows ?? []).filter(r => r.status === 'approved').length,
    declined: (rows ?? []).filter(r => r.status === 'declined').length,
    all: (rows ?? []).length,
  }), [rows])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (rows ?? []).filter(r => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!needle) return true
      return [r.student_name, r.parent_name, r.parent_email, r.program_name, r.student_national_id,
        r.student_whatsapp].some(v => v?.toLowerCase().includes(needle))
    })
  }, [rows, filter, q])

  return (
    <div className="page">
      <PageHeader
        title="Registrations"
        actions={
          <div className="row g8 wrap">
            {FILTERS.map(f => (
              <button key={f.value} type="button" className="role-pill" data-on={filter === f.value}
                onClick={() => setFilter(f.value)}>
                {f.label}<span className="tail tnum">{counts[f.value]}</span>
              </button>
            ))}
          </div>
        }
      />

      {error && <div className="auth-alert mb12" role="alert"><AlertTriangle /><span>{error}</span></div>}

      <div className="card mb16" style={{ padding: 10 }}>
        <SearchInput value={q} onChange={setQ}
          placeholder="Search by hero, parent, program, national ID or number…" />
      </div>

      {rows === null ? (
        <div className="card" style={{ padding: 28 }}>
          <span className="row g8 c-muted t-sm"><Loader2 className="spin" />Loading registrations…</span>
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <Empty
            icon={filter === 'pending' ? <Inbox /> : <User />}
            title={filter === 'pending' ? 'Nothing waiting' : 'Nothing here'}
          />
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="tbl-wrap" style={{ maxHeight: 'calc(100dvh - 300px)' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Hero</th>
                  <th style={{ width: 150 }}>National ID</th>
                  <th style={{ width: 130 }}>WhatsApp</th>
                  <th style={{ width: 180 }}>Parent</th>
                  <th style={{ width: 200 }}>Program</th>
                  <th>What they asked for</th>
                  <th style={{ width: 140 }}>Status</th>
                  <th style={{ width: 160 }} />
                </tr>
              </thead>
              <tbody>
                {shown.map(r => {
                  const look = LOOK[r.status]
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="stack g2" style={{ minWidth: 0 }}>
                          <span className="t-sm w-sb truncate">{r.student_name}</span>
                          <span className="t-xs c-muted2">
                            {r.student_age ? `${r.student_age} years old · ` : ''}asked {date(r.created_at)}
                          </span>
                        </span>
                      </td>
                      <td className="tnum t-sm">{r.student_national_id ?? <span className="c-muted2">—</span>}</td>
                      <td className="tnum t-sm">{r.student_whatsapp ?? <span className="c-muted2">—</span>}</td>
                      <td>
                        <span className="stack g2" style={{ minWidth: 0 }}>
                          <span className="t-sm truncate">{r.parent_name}</span>
                          <span className="t-xs c-muted2 truncate">{r.parent_phone || r.parent_email}</span>
                        </span>
                      </td>
                      <td>
                        <span className="stack g2" style={{ minWidth: 0 }}>
                          <span className="t-sm truncate">{r.program_name ?? 'A program that is gone'}</span>
                          {r.course_name && <span className="t-xs c-muted2 truncate">{r.course_name}</span>}
                        </span>
                      </td>
                      <td className="t-xs c-muted">{availabilityLine(r) ?? <span className="c-muted2">—</span>}</td>
                      <td><Badge tone={look.tone} dot>{look.label}</Badge></td>
                      <td className="num">
                        {r.status === 'pending' && (
                          <button className="btn sm primary" disabled={opening === r.id}
                            onClick={() => void open(r.id)}>
                            {opening === r.id ? <Loader2 className="spin" /> : <CalendarCheck />}
                            Set the schedule
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows && (
        <div className="mt12 t-xs c-muted2">
          {shown.length} of {rows.length} registration{rows.length === 1 ? '' : 's'}
        </div>
      )}

      {answering && (
        <ScheduleDialog req={answering} canDecline onClose={() => setAnswering(null)} onDone={() => void load()} />
      )}
    </div>
  )
}
