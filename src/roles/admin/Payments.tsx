/* ==========================================================================
   Payments — who paid, for what, and the one button that opens it.

   Three tabs, three jobs:

   · Transfers — what families filed by InstaPay or Vodafone Cash, and what
     they bought from their wallet. Approving is not a label change: it
     enrols that student, in the same transaction. Rejecting says why, and
     the family can file again. Each row also shows how long the student is
     paid up for, and the live countdown to the platform closing on them.
   · Settings — the payment channels every family is shown before they send
     anything, and the price of each package.
   · Transfer to a wallet — money the admin puts on a parent's or a
     student's wallet themselves.

   They sit next to Students on one page (StudentsAndPayments), which owns
   the tab row. The tab lives in the URL (`?tab=`), so the top-bar inbox
   can link straight to the one that needs attention.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, CalendarClock, CalendarDays, Check, CheckCircle2, Clock, CreditCard, FileText,
  Loader2, Lock, Package, PackageCheck, Receipt, Smartphone, Wallet, X, XCircle,
} from 'lucide-react'
import {
  approvePayment, fetchPayAccountsAdmin, listPayments, rejectPayment,
  type PaymentWithPeople,
} from '@/lib/api/payments'
import { setFamilyRegion } from '@/lib/api/students'
import { markKitHandedOver } from '@/lib/api/products'
import {
  fetchRequest, listRequests, pendingRequestFor, scheduleStudent, type RequestWithPeople,
} from '@/lib/api/requests'
import { ScheduleDialog } from './ScheduleDialog'
import { fetchBilling, fetchSubscriptions } from '@/lib/api/billing'
import { PackagesCard, PayAccountsCard } from './BillingPanel'
import { WalletsPanel } from './WalletsCard'
import { proofUrl } from '@/lib/api/family'
import { toMessage } from '@/lib/api/errors'
import { useAdminQueue } from '@/lib/api/adminQueue'
import { useStore } from '@/lib/store'
import { date, dateTime, money } from '@/lib/format'
import { WEEKDAYS } from '@/lib/time'
import { REGIONS, regionLabel } from '@/lib/region'
import {
  askProblem, clock, hoursLabel, lengthOfAsk, minutesLabel, parseAsk, type WeekAsk,
} from '@/lib/programLength'
import { closesAt, countdown, parseDay, PLAN_DAYS, PLAN_LABEL } from '@/lib/billing'
import { Badge, Confirm, Empty, Field, Modal } from '@/components/ui'
import {
  PAY_METHOD_LABEL, type BillingSettingsRow, type PayAccountsRow, type PayStatus, type SubscriptionRow,
} from '@/lib/api/rows'
import '../parent/live/family.css'
import '@/components/layout/countdown.css'
import './wallets.css'

const STATUS_LOOK: Record<PayStatus, { label: string; tone: string; icon: typeof Clock }> = {
  pending: { label: 'Waiting for you', tone: 'gold', icon: Clock },
  approved: { label: 'Approved', tone: 'teal', icon: CheckCircle2 },
  rejected: { label: 'Rejected', tone: 'rose', icon: XCircle },
}


/* ---------------- rejecting, with a reason ---------------- */

function RejectDialog({ payment, onClose, onDone }: {
  payment: PaymentWithPeople; onClose: () => void; onDone: () => void
}) {
  const toast = useStore(s => s.toast)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    if (!note.trim()) { setError('Write the reason — the family reads it.'); return }
    setBusy(true)
    setError(null)
    try {
      await rejectPayment(payment.id, note.trim())
      toast('Rejected — the family can file it again', 'info')
      onDone()
      onClose()
    } catch (e) {
      setError(toMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reject this payment?"
      description="Nothing opens for the student. The family gets a notification with your reason and can file the transfer again."
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn danger" onClick={() => void go()} disabled={busy || !note.trim()}>
            {busy ? <Loader2 className="spin" /> : <X />}Reject
          </button>
        </>
      }
    >
      <div className="stack g14">
        {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}
        <Field label="Reason (required)">
          <textarea className="inp" rows={3} autoFocus value={note}
            placeholder="e.g. The transfer never arrived — check the number you sent it to."
            onChange={e => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* ---------------- where the family is ---------------- */

/** The country this family belongs to, as the admin keeps it. Saved on the
 *  parent and on the hero at once — they live in the same house — and it
 *  is what decides which intakes the family is offered when they enrol. */
function CountryCell({ p }: { p: PaymentWithPeople }) {
  const toast = useStore(s => s.toast)
  const [value, setValue] = useState(p.parent?.region || p.student?.region || '')
  const [busy, setBusy] = useState(false)

  const save = async (next: string) => {
    const before = value
    setValue(next)
    setBusy(true)
    try {
      await setFamilyRegion([p.parent_id, p.student_id], next || null)
      toast(next
        ? `${p.parent?.name || 'This family'} is in ${regionLabel(next)}`
        : 'Country cleared')
    } catch (e) {
      setValue(before)
      toast(toMessage(e), 'err')
    }
    setBusy(false)
  }

  return (
    <span className="stack g2" style={{ minWidth: 0 }}>
      <select className="sel" value={value} disabled={busy}
        style={{ minWidth: 118, maxWidth: 150, height: 28, fontSize: 12.5 }}
        title="Saved on the parent and the hero — it decides which intakes they are offered"
        aria-label="Country" onChange={e => void save(e.target.value)}>
        <option value="">Not said</option>
        {REGIONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
      </select>
    </span>
  )
}

/* ---------------- the week the family picked ---------------- */

function WeekDialog({ p, ask, onClose }: {
  p: PaymentWithPeople; ask: WeekAsk; onClose: () => void
}) {
  const rows = [
    ...ask.lectures.map(s => ({ s, lecture: true })),
    ...ask.sections.map(s => ({ s, lecture: false })),
  ].sort((a, b) => a.s.day - b.s.day || a.s.start - b.s.start)
  const run = lengthOfAsk(null, ask)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  return (
    <Modal
      open
      onClose={onClose}
      title={`${p.student?.name || 'This student'}'s week`}
      description={`${p.program_name || 'Training program'} — the days, hours and lengths the family picked at enrolment.`}
      footer={<>
        <span className="grow" />
        <button className="btn primary" onClick={onClose}>Close</button>
      </>}
    >
      <div className="stack g14">
        <span className="t-sm c-muted">
          {plural(ask.lectures.length, 'lecture')} · {plural(ask.sections.length, 'section')} · {hoursLabel(run.weeklyHours)} a week
        </span>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Day</th><th>What</th><th>Time</th><th>How long</th></tr>
            </thead>
            <tbody>
              {rows.map(({ s, lecture }) => (
                <tr key={`${lecture ? 'l' : 's'}-${s.day}-${s.start}`}>
                  <td className="t-sm nowrap">{WEEKDAYS[s.day]}</td>
                  <td><Badge tone={lecture ? 'brand' : 'sky'}>{lecture ? 'Lecture' : 'Section'}</Badge></td>
                  <td className="t-sm tnum nowrap">{clock(s.start)}–{clock(s.start + s.min)}</td>
                  <td className="t-sm tnum nowrap">{minutesLabel(s.min)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}

function WeekCell({ p, ask }: { p: PaymentWithPeople; ask: WeekAsk | null }) {
  const [open, setOpen] = useState(false)
  if (!ask) return null
  return (
    <span className="stack g4" style={{ alignItems: 'flex-start' }}>
      <button className="btn sm ghost" style={{ paddingInline: 8 }} onClick={() => setOpen(true)}
        title="The days, hours and lengths this family picked">
        <CalendarDays />
        {ask.lectures.length} lecture{ask.lectures.length === 1 ? '' : 's'} ·{' '}
        {ask.sections.length} section{ask.sections.length === 1 ? '' : 's'}
      </button>
      {open && <WeekDialog p={p} ask={ask} onClose={() => setOpen(false)} />}
    </span>
  )
}

/* ---------------- one filed transfer ---------------- */

/** The screenshot, opened in place on a short-lived link — the admin checks
 *  it against the account without leaving the table. A PDF opens in a tab. */
function ProofButton({ path }: { path: string }) {
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const pdf = /\.pdf$/i.test(path)
  const open = async () => {
    setBusy(true)
    try {
      const signed = await proofUrl(path, 300)
      if (pdf) window.open(signed, '_blank', 'noopener,noreferrer')
      else setUrl(signed)
    } catch { /* the link just does not open */ }
    setBusy(false)
  }
  return (
    <>
      <button className="btn sm" onClick={() => void open()} disabled={busy}>
        {busy ? <Loader2 className="spin" /> : <FileText />}View
      </button>
      {url && (
        <Modal open wide onClose={() => setUrl(null)} title="Transfer screenshot"
          footer={<>
            <a className="btn" href={url} target="_blank" rel="noopener noreferrer">Open full size</a>
            <span className="grow" />
            <button className="btn primary" onClick={() => setUrl(null)}>Close</button>
          </>}>
          <img src={url} alt="Transfer screenshot"
            style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', margin: '0 auto', borderRadius: 8 }} />
        </Modal>
      )}
    </>
  )
}

/* ---------------- the deadline on a row ---------------- */

/** How long the student on a row is paid up for, and when the platform
 *  closes on them. Null when the row has no student (a wallet top-up) or
 *  the student has never been paid up. */
interface Deadline { paidThrough: string; closes: Date }

function DeadlineCell({ d }: { d: Deadline | null }) {
  if (!d) return null
  return (
    <span className="stack g2 t-xs c-muted2 tnum nowrap">
      <span>paid to {date(parseDay(d.paidThrough).toISOString())}</span>
      <span>closes {date(d.closes.toISOString())}</span>
    </span>
  )
}

function CountdownCell({ d, now }: { d: Deadline | null; now: number }) {
  if (!d) return null
  const left = countdown(d.closes, now)
  const closed = left.urgency === 'closed'
  return (
    <span className="cd-pill" data-urgency={left.urgency}
      title={closed ? 'The platform is closed for this student' : `Access closes ${dateTime(d.closes.toISOString())}`}>
      {closed ? <Lock /> : <CalendarClock />}
      <span className="tnum">{left.label}</span>
    </span>
  )
}

function PaymentRowView({ p, ask, deadline, now, onChanged, onSchedule }: {
  p: PaymentWithPeople
  /** The week this student's family picked, when they picked one. */
  ask: WeekAsk | null
  deadline: Deadline | null
  now: number
  onChanged: () => void
  /** Accepted a program payment: ask for this student's week. Held by the
   *  list, not the row — the row leaves the Waiting filter the moment the
   *  payment is accepted, and the dialog must not leave with it. */
  onSchedule: (req: RequestWithPeople) => void
}) {
  const toast = useStore(s => s.toast)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const look = STATUS_LOOK[p.status]
  /* A wallet top-up has no student and opens nothing: approving it credits
     the family's balance, and they spend it themselves. */
  const topUp = p.kind === 'topup'
  /* A kit is already paid for — it came out of a wallet, which is money that
     was checked on the way in. What is left is physical: handing it over. */
  const kit = p.kind === 'kit'
  const owed = kit && !p.fulfilled_at

  const handOver = async () => {
    setBusy(true)
    try {
      await markKitHandedOver(p.id)
      toast(`${p.program_name || 'The kit'} marked as handed over`)
      onChanged()
    } catch (e) {
      toast(toMessage(e), 'err')
    }
    setBusy(false)
  }

  const approve = async () => {
    setBusy(true)
    try {
      await approvePayment(p.id)
      const who = p.student?.name || 'The student'
      if (topUp) {
        toast(`${money(p.amount_egp)} credited to ${p.parent?.name || 'the family'}'s wallet`)
        onChanged()
        setBusy(false)
        return
      }

      const opened = p.track_id ? `${who} is enrolled in ${p.program_name}` : `${who} is paid up again`
      /* The family already picked their week. Accepting books it — onto the
         admin's calendar and theirs — and opens the course in the same go,
         so the ordinary case is one button. The form only opens for a week
         that cannot be booked as it stands: a renewal with nothing asked,
         an older row that carries a count and no days, or a clash. */
      const id = p.student_id ? await pendingRequestFor(p.student_id).catch(() => null) : null
      const row = id ? await fetchRequest(id).catch(() => null) : null
      const week = row ? parseAsk(row.schedule_ask) : null
      let booked = false
      if (row && week && !askProblem(week)) {
        try {
          await scheduleStudent({ requestId: row.id, plan: week })
          booked = true
        } catch (e) {
          toast(toMessage(e), 'err')
        }
      }
      toast(booked ? `${opened} — their week is on the calendar` : opened)
      onChanged()
      if (row && !booked) onSchedule(row)
    } catch (e) {
      toast(toMessage(e), 'err')
    }
    setBusy(false)
  }

  return (
    <tr>
      {/* The family: who paid, how to reach them, where they are, and when */}
      <td>
        <span className="stack g4" style={{ minWidth: 0 }}>
          <span className="t-sm w-sb nowrap">{p.parent?.name || 'Parent'}</span>
          <span className="t-xs c-muted2 truncate">{p.parent?.phone || p.parent?.email || ''}</span>
          <CountryCell p={p} />
          <span className="t-xs c-muted2 nowrap">{dateTime(p.created_at)}</span>
        </span>
      </td>

      {/* Who it is for, and the week they picked */}
      <td>
        <span className="stack g4" style={{ minWidth: 0 }}>
          {topUp
            ? <span className="row g6 t-sm"><Wallet style={{ width: 14, height: 14 }} />Wallet top-up</span>
            : <span className="t-sm nowrap">{p.student?.name || 'Student'}</span>}
          <WeekCell p={p} ask={ask} />
          {p.note && <span className="t-xs c-muted" style={{ maxWidth: 220 }}><b>They wrote:</b> {p.note}</span>}
        </span>
      </td>

      {/* Program — what it buys */}
      <td>
        <span className="stack g2" style={{ minWidth: 0 }}>
          {topUp ? (
            <span className="t-xs c-muted2">Goes onto the wallet</span>
          ) : kit ? (
            <>
              <span className="row g6 t-sm"><Package style={{ width: 14, height: 14 }} />{p.program_name || 'Kit'}</span>
              <span className="t-xs c-muted2">
                {p.fulfilled_at
                  ? `handed over ${dateTime(p.fulfilled_at)}`
                  : <span className="c-gold">still to hand over</span>}
              </span>
            </>
          ) : (
            <>
              <span className="t-sm nowrap">{p.program_name || 'Training program'}</span>
              <span className="t-xs c-muted2">
                {p.plan
                  ? `${PLAN_LABEL[p.plan]} · ${PLAN_DAYS[p.plan]} days`
                  : p.loop_id ? 'One course' : p.track_id ? 'Whole program' : ''}
                {!p.track_id && !p.plan && <span className="c-rose">that program was deleted</span>}
              </span>
            </>
          )}
        </span>
      </td>

      {/* What was sent, how, and the proof of it */}
      <td>
        <span className="stack g4">
          <b className="t-sm tnum nowrap">{money(p.amount_egp)}</b>
          <span className="row g6 t-xs c-muted nowrap">
            {/* The two transfer rails have their own icon; money that never
                travelled — the wallet paying itself, or a credit you added —
                carries the wallet's. */}
            {p.method === 'instapay'
              ? <CreditCard style={{ width: 13, height: 13 }} />
              : p.method === 'vodafone_cash'
                ? <Smartphone style={{ width: 13, height: 13 }} />
                : <Wallet style={{ width: 13, height: 13 }} />}
            {PAY_METHOD_LABEL[p.method]}
          </span>
          {/* Money you added yourself came from nowhere a family can be asked
              about, so there is no "from" to print. */}
          {p.method !== 'admin' && p.sender_ref && (
            <span className="t-xs c-muted2 truncate">from {p.sender_ref}</span>
          )}
          {p.proof_path && <ProofButton path={p.proof_path} />}
        </span>
      </td>

      {/* Where it stands, and how long this hero is paid up for */}
      <td>
        <span className="stack g4" style={{ minWidth: 0 }}>
          <Badge tone={look.tone} dot>{look.label}</Badge>
          <CountdownCell d={deadline} now={now} />
          <DeadlineCell d={deadline} />
          {p.review_note && (
            <span className="t-xs c-muted" style={{ maxWidth: 200 }}>
              <b>{p.status === 'rejected' ? 'Reason:' : 'Note:'}</b> {p.review_note}
            </span>
          )}
        </span>
      </td>

      <td className="act">
      <div className="row g6 wrap" style={{ justifyContent: 'flex-end' }}>
        {owed && (
          <button className="btn sm primary" disabled={busy}
            title="The kit is with the family — tick it off"
            onClick={() => void handOver()}>
            {busy ? <Loader2 className="spin" /> : <PackageCheck />}Mark handed over
          </button>
        )}
        {p.status !== 'approved' && (
          <button className="btn sm primary" disabled={busy || (!topUp && !p.track_id && !p.plan)}
            title={topUp
              ? "Put this on the family's wallet"
              : p.track_id || p.plan
                ? 'Open the platform for this student'
                : 'The program is gone — nothing to enrol in'}
            onClick={() => setConfirm(true)}>
            {busy ? <Loader2 className="spin" /> : <Check />}
            {topUp ? 'Approve & credit' : p.track_id ? 'Approve & enrol' : 'Approve & extend'}
          </button>
        )}
        {/* Only what is still waiting can be rejected. Rejecting something
            already approved never undid it — not the enrolment, and not the
            money on a wallet — it only made the record disagree with what
            happened. */}
        {p.status === 'pending' && (
          <button className="btn sm ghost" style={{ color: 'var(--rose-600)' }} disabled={busy}
            onClick={() => setRejecting(true)}>
            <X />Reject
          </button>
        )}
      </div>

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void approve()}
        danger={false}
        confirmLabel={topUp ? 'Approve & credit' : p.track_id ? 'Approve & enrol' : 'Approve & extend'}
        title={topUp ? 'Credit this to the wallet?' : 'Approve this payment?'}
        body={
          <>
            {topUp && <>{money(p.amount_egp)} goes onto {p.parent?.name || 'this family'}'s wallet,
            ready to spend on any of their students. </>}
            {/* One course, or the whole program: the payment says which, and
                approving opens exactly that much. */}
            {!topUp && p.loop_id && <>{p.student?.name || 'The student'} is enrolled in that one
            course — “{p.program_name}” — straight away. The rest of the program stays shut. </>}
            {!topUp && !p.loop_id && p.track_id && <>{p.student?.name || 'The student'} is enrolled in
            every course of “{p.program_name}” straight away. </>}
            {p.plan && <>Their {PLAN_DAYS[p.plan]}-day countdown starts today — or runs on from
            the date they are already paid up to, if they renewed early. </>}
            {!topUp && <>The week they picked goes onto the calendar in the same go; if there is
            nothing to book, the schedule form opens so you can set it yourself. </>}
            The family gets a notification that it was accepted. Only do this once you have found
            the {money(p.amount_egp)} in the account.
          </>
        }
      />
      {rejecting && (
        <RejectDialog payment={p} onClose={() => setRejecting(false)} onDone={onChanged} />
      )}
      </td>
    </tr>
  )
}

/* ---------------- the transfers tab ---------------- */

type Show = PayStatus | 'all'

const SHOW: Array<{ value: Show; label: string }> = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'Everything' },
]

const isShow = (v: string | null): v is Show => SHOW.some(s => s.value === v)

/** The countdown moves in whole minutes, so the table re-reads the clock
 *  once a minute and no more. */
const TICK = 60_000

function TransfersTab({ rows, asks, subs, billing, show, onShow, onChanged }: {
  rows: PaymentWithPeople[] | null
  asks: (p: PaymentWithPeople) => WeekAsk | null
  subs: SubscriptionRow[]
  billing: BillingSettingsRow | null
  show: Show
  onShow: (s: Show) => void
  onChanged: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), TICK)
    return () => window.clearInterval(t)
  }, [])

  const deadlineOf = useMemo(() => {
    const closeBefore = billing?.close_before_days ?? 0
    const byStudent = new Map(subs.map(s => [s.student_id, s.paid_through]))
    return (studentId: string | null): Deadline | null => {
      const paidThrough = studentId ? byStudent.get(studentId) : undefined
      return paidThrough ? { paidThrough, closes: closesAt(paidThrough, closeBefore) } : null
    }
  }, [subs, billing])

  const counts = useMemo(() => {
    const list = rows ?? []
    return {
      pending: list.filter(r => r.status === 'pending').length,
      approved: list.filter(r => r.status === 'approved').length,
      rejected: list.filter(r => r.status === 'rejected').length,
      all: list.length,
    }
  }, [rows])

  const [scheduling, setScheduling] = useState<RequestWithPeople | null>(null)

  const shown = (rows ?? []).filter(r => show === 'all' || r.status === show)

  return (
    <section className="card">
      <div className="pay-filters row g8 wrap">
        {SHOW.map(f => (
          <button key={f.value} type="button" className="role-pill" data-on={show === f.value}
            onClick={() => onShow(f.value)}>
            {f.label}<span className="tail tnum">{counts[f.value]}</span>
          </button>
        ))}
      </div>

      {rows === null ? (
        <div style={{ padding: 28 }}>
          <span className="row g8 c-muted t-sm"><Loader2 className="spin" />Loading payments…</span>
        </div>
      ) : shown.length === 0 ? (
        <Empty icon={<Receipt />}
          title={show === 'pending' ? 'Nothing waiting' : 'Nothing here'} />
      ) : (
        <div className="tbl-wrap">
          <table className="tbl pay-tbl">
            <thead>
              <tr>
                <th>Family</th>
                <th>For</th>
                <th>Program</th>
                <th>Sent</th>
                <th>Status</th>
                <th className="act" />
              </tr>
            </thead>
            <tbody>
              {shown.map(p => (
                <PaymentRowView key={p.id} p={p} now={now} ask={asks(p)}
                  deadline={p.kind === 'topup' ? null : deadlineOf(p.student_id)}
                  onChanged={onChanged} onSchedule={setScheduling} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scheduling && (
        <ScheduleDialog req={scheduling} onClose={() => setScheduling(null)} onDone={onChanged} />
      )}
    </section>
  )
}

/* ---------------- the panel ---------------- */

/* The three payment tabs of Students & payments (see StudentsAndPayments).
   That page owns the tab row; this owns the data behind the three of them. */
export type PayTab = 'transfers' | 'settings' | 'wallets'

export function PaymentsPanel({ tab }: { tab: PayTab }) {
  const [params, setParams] = useSearchParams()
  const showParam = params.get('show')
  const show: Show = isShow(showParam) ? showParam : 'pending'

  const [rows, setRows] = useState<PaymentWithPeople[] | null>(null)
  const [reqs, setReqs] = useState<RequestWithPeople[]>([])
  const [subs, setSubs] = useState<SubscriptionRow[]>([])
  const [accounts, setAccounts] = useState<PayAccountsRow | null>(null)
  const [billing, setBilling] = useState<BillingSettingsRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refreshQueue = useAdminQueue(s => s.refresh)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [payments, acc, bill, subscriptions, requests] = await Promise.all([
        listPayments(), fetchPayAccountsAdmin(), fetchBilling(), fetchSubscriptions(), listRequests(),
      ])
      setRows(payments)
      setReqs(requests)
      setAccounts(acc)
      setBilling(bill)
      setSubs(subscriptions)
      /* The inbox in the top bar and the tab badge count the same rows. */
      void refreshQueue()
    } catch (e) {
      setError(toMessage(e))
      setRows([])
    }
  }, [refreshQueue])

  useEffect(() => { void load() }, [load])

  /* A payment names a student and what it buys; the week lives on the ask
     they filed. Same course first, then same program, then their newest —
     a renewal buys months for a week that was picked long before. */
  const asks = useMemo(() => {
    const byStudent = new Map<string, Array<{ loop: string | null; track: string | null; ask: WeekAsk }>>()
    for (const r of reqs) {
      const ask = parseAsk(r.schedule_ask)
      if (!ask) continue
      const list = byStudent.get(r.student_id) ?? []
      list.push({ loop: r.loop_id, track: r.track_id, ask })
      byStudent.set(r.student_id, list)
    }
    return (p: PaymentWithPeople): WeekAsk | null => {
      if (p.kind === 'topup' || p.kind === 'kit' || !p.student_id) return null
      const list = byStudent.get(p.student_id)
      if (!list?.length) return null
      const sameCourse = p.loop_id ? list.find(x => x.loop === p.loop_id) : undefined
      const sameProgram = p.track_id ? list.find(x => x.track === p.track_id) : undefined
      return (sameCourse ?? sameProgram ?? list[0]).ask
    }
  }, [reqs])

  const setShow = (next: Show) => {
    const p = new URLSearchParams(params)
    p.set('show', next)
    setParams(p, { replace: true })
  }

  return (
    <>
      {error && <div className="auth-alert mb12" role="alert"><AlertTriangle /><span>{error}</span></div>}

      {tab === 'transfers' && (
        <TransfersTab rows={rows} asks={asks} subs={subs} billing={billing}
          show={show} onShow={setShow} onChanged={() => void load()} />
      )}

      {tab === 'settings' && (
        accounts === null || billing === null ? (
          <div className="card" style={{ padding: 28 }}>
            <span className="row g8 c-muted t-sm"><Loader2 className="spin" />Loading settings…</span>
          </div>
        ) : (
          <>
            <PayAccountsCard row={accounts} onSaved={setAccounts} />
            <PackagesCard row={billing} onSaved={setBilling} />
          </>
        )
      )}

      {/* A credit files an approved top-up, so Transfers has to pick it up. */}
      {tab === 'wallets' && <WalletsPanel onCredited={() => void load()} />}
    </>
  )
}
