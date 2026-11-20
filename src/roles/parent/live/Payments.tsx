/* ==========================================================================
   Payments — one table, and nothing else.

   Every subscription payment this family filed: when, for what, how much,
   the screenshot they sent, where it stands, how long that student is paid
   up for, and the live countdown to the platform closing on them.

   A rejected row is the only one that does anything when clicked: it opens
   the admin's reason and the form to send it again with a new screenshot.
   That files a fresh payment, which reaches the admin's queue exactly like
   the first one did.

   Paying for the first time is not here — it belongs to the program a family
   is enrolling in (see EnrollDialog), not to a page of records.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowRight, CalendarClock, Check, CheckCircle2, Clock, CreditCard, ExternalLink,
  FileText, Loader2, Lock, Receipt, Smartphone, Upload, XCircle,
} from 'lucide-react'
import { fetchChildren, fetchMyPayments, fetchPayAccounts, proofUrl } from '@/lib/api/family'
import {
  amountToSend, EMPTY_BILLING, fetchBilling, fetchSubscriptions, METHOD_FEE_PCT, openChannels,
  priceWithoutFee, qrUrl,
} from '@/lib/api/billing'
import { fileSubscriptionPayment } from '@/lib/api/payments'
import { toMessage } from '@/lib/api/errors'
import { useAuth } from '@/lib/auth'
import { useStore } from '@/lib/store'
import { date, dateTime, money } from '@/lib/format'
import { closesAt, countdown, parseDay, PLAN_LABEL } from '@/lib/billing'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Empty, Field, Modal, Tabs } from '@/components/ui'
import {
  PAY_METHOD_LABEL,
  type PayAccountsRow, type PaymentRow, type PayMethod, type PayStatus, type SubscriptionRow,
} from '@/lib/api/rows'
import '@/roles/marketplace/live/enrollFlow.css'
import './family.css'
import '@/components/layout/countdown.css'

export const STATUS_LOOK: Record<PayStatus, { label: string; tone: string; icon: typeof Clock }> = {
  pending: { label: 'Waiting to be checked', tone: 'gold', icon: Clock },
  approved: { label: 'Accepted', tone: 'teal', icon: CheckCircle2 },
  rejected: { label: 'Rejected', tone: 'rose', icon: XCircle },
}

/** Opens the family's own screenshot in a new tab, on a short-lived link. */
export function ProofLink({ path, label = 'View' }: { path: string; label?: string }) {
  const [busy, setBusy] = useState(false)
  const open = async () => {
    setBusy(true)
    try {
      window.open(await proofUrl(path), '_blank', 'noopener,noreferrer')
    } catch { /* the link just does not open */ }
    setBusy(false)
  }
  return (
    <button className="btn sm ghost" onClick={e => { e.stopPropagation(); void open() }} disabled={busy}>
      {busy ? <Loader2 className="spin" /> : <FileText />}{label}
    </button>
  )
}

/* ---------------- sending a rejected one again ---------------- */

/* Two things live in this window and they are read in order: what the admin
   said, then the transfer that answers it. So each gets its own tab, and the
   reason's own button moves the family on to the second one.

   That second tab is the enrolment dialog's "Send the money" step, down to
   the class names (see enrollFlow.css): the same channel card, the same QR,
   the same drop and the same amount box. A family paying a second time is
   doing the identical thing, so it should not be looking at a second design. */
type Pane = 'why' | 'again'

function ResubmitDialog({ payment, accounts, onClose, onDone }: {
  payment: PaymentRow
  accounts: PayAccountsRow | null
  onClose: () => void
  onDone: () => void
}) {
  const profile = useAuth(s => s.profile)
  const toast = useStore(s => s.toast)
  const channels = useMemo(() => openChannels(accounts), [accounts])
  const [pane, setPane] = useState<Pane>('why')
  const [method, setMethod] = useState<PayMethod>(
    channels.includes(payment.method) ? payment.method : channels[0] ?? 'instapay',
  )
  /* The subscription on its own, with the cut the rejected attempt's channel
     had added taken back off. Everything here is quoted from that, so moving
     to the other channel moves the figure by the fee and by nothing else. */
  const owed = useMemo(() => priceWithoutFee(payment.amount_egp, payment.method), [payment])
  const [amount, setAmount] = useState(String(payment.amount_egp))
  const [proof, setProof] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* The channels are the admin's and can change between two attempts. */
  useEffect(() => {
    if (channels.length && !channels.includes(method)) setMethod(channels[0])
  }, [channels, method])

  const fee = METHOD_FEE_PCT[method] ?? 0
  const due = amountToSend(owed, method)
  useEffect(() => { setAmount(String(due)) }, [due])

  const qr = qrUrl(method === 'instapay' ? accounts?.instapay_qr : accounts?.vodafone_qr, accounts?.updated_at)
  const link = (method === 'instapay' ? accounts?.instapay_link : accounts?.vodafone_link)?.trim()

  const send = async () => {
    if (!profile || !payment.student_id || !payment.plan) return
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) { setError('Type the amount you sent, in EGP.'); return }
    if (!proof) { setError('Upload the new screenshot.'); return }
    setBusy(true)
    setError(null)
    try {
      await fileSubscriptionPayment({
        parentId: profile.id,
        studentId: payment.student_id,
        trackId: payment.track_id,
        plan: payment.plan,
        method,
        amountEgp: value,
        proof,
      })
      toast('Sent — the admin will check it again')
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
      className="pay-fix"
      title="This payment was rejected"
      description={dateTime(payment.reviewed_at ?? payment.created_at)}
      footer={pane === 'why' ? (
        <>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={() => setPane('again')}>
            Send it again<ArrowRight />
          </button>
        </>
      ) : (
        <>
          <span className="grow" />
          <button className="btn ghost" onClick={() => setPane('why')} disabled={busy}>Back</button>
          <button className="btn primary" onClick={() => void send()} disabled={busy || !proof}>
            {busy ? <Loader2 className="spin" /> : <Upload />}Send again
          </button>
        </>
      )}
    >
      <div className="stack g20">
        <Tabs value={pane} onChange={setPane} items={[
          { value: 'why', label: 'Reason', icon: <XCircle /> },
          { value: 'again', label: 'Send it again', icon: <Upload /> },
        ]} />

        {pane === 'why' ? (
          <div className="ef-center">
            <div className="pay-reason">
              <p className="t-sm c-ink2" style={{ lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {payment.review_note?.trim() || 'The admin did not leave a reason.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="ef-center">
            {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}

            <div className="ef-card">
              {channels.length > 1 ? (
                <div className="ef-toggle" role="radiogroup" aria-label="Pay with">
                  {channels.map(c => (
                    <button key={c} type="button" role="radio" aria-checked={method === c}
                      data-on={method === c} onClick={() => setMethod(c)}>
                      {PAY_METHOD_LABEL[c]}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="ef-q" style={{ textAlign: 'center' }}>{PAY_METHOD_LABEL[method]}</span>
              )}

              {channels.length === 0 ? (
                <p className="ef-hint" style={{ textAlign: 'center' }}>No way of paying is open right now.</p>
              ) : (
                <div className="ef-channel" key={method}>
                  <span className="ef-hint">Send <b className="c-ink2">{money(due)}</b></span>
                  {fee > 0 && (
                    <span className="ef-fee">
                      {money(owed)} for the subscription, and the {fee}% {PAY_METHOD_LABEL[method]}
                      {' '}takes off a transfer.
                    </span>
                  )}
                  {qr && <img className="ef-qr" src={qr} alt={`${PAY_METHOD_LABEL[method]} QR code`} />}
                  {link && (
                    <a className="btn" href={link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink />Open {PAY_METHOD_LABEL[method]}
                    </a>
                  )}
                </div>
              )}
            </div>

            <label className="ef-drop" data-has={!!proof || undefined}>
              {proof ? <Check /> : <Upload />}
              <span className="truncate">{proof ? proof.name : 'Upload the new screenshot'}</span>
              <input type="file" accept="image/*,application/pdf" hidden
                onChange={e => setProof(e.target.files?.[0] ?? null)} />
            </label>

            <label className="ef-amount">
              <span className="ef-hint">Amount sent</span>
              <input className="inp" type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} />
              <span className="ef-hint">EGP</span>
            </label>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ---------------- the page ---------------- */

export function ParentPayments() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null)
  const [subs, setSubs] = useState<SubscriptionRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [accounts, setAccounts] = useState<PayAccountsRow | null>(null)
  const [closeBefore, setCloseBefore] = useState(EMPTY_BILLING.close_before_days)
  const [error, setError] = useState<string | null>(null)
  const [rejected, setRejected] = useState<PaymentRow | null>(null)
  /* The countdown column ticks on its own — one clock for the whole table. */
  const [now, setNow] = useState(() => Date.now())

  /* The payments are the page; the names, the deadlines and the channels are
     what dresses them. One of those failing must not blank the table, so
     they are settled separately and only the payments can raise an error. */
  const load = useCallback(async () => {
    const [payments, kids, subRows, billing, acc] = await Promise.allSettled([
      fetchMyPayments(), fetchChildren(), fetchSubscriptions(), fetchBilling(), fetchPayAccounts(),
    ])

    if (payments.status === 'fulfilled') {
      setRows(payments.value)
      setError(null)
    } else {
      setRows([])
      setError(toMessage(payments.reason))
    }

    if (kids.status === 'fulfilled') {
      setNames(Object.fromEntries(kids.value.map(k => [k.profile.id, k.profile.name || k.profile.email])))
    }
    if (subRows.status === 'fulfilled') setSubs(subRows.value)
    if (billing.status === 'fulfilled') setCloseBefore(billing.value.close_before_days)
    if (acc.status === 'fulfilled') setAccounts(acc.value)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  /* Only what was sent for a subscription: a wallet top-up is money moving,
     not a payment with a state a family waits on. */
  const shown = (rows ?? []).filter(p => p.kind !== 'topup')

  return (
    <div className="page">
      <PageHeader title="Payments" />

      {error && <div className="auth-alert mb12" role="alert"><AlertTriangle /><span>{error}</span></div>}

      {rows === null ? (
        <div className="card" style={{ padding: 28 }}>
          <span className="row g8 c-muted t-sm"><Loader2 className="spin" />Loading your payments…</span>
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <Empty icon={<Receipt />} title="Nothing filed yet" />
        </div>
      ) : (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Program</th>
                <th className="num">Subscription fees</th>
                <th>Screenshot</th>
                <th>State</th>
                <th>Subscription deadline</th>
                <th>Countdown</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(p => {
                const look = STATUS_LOOK[p.status]
                const paidThrough = p.student_id
                  ? subs.find(s => s.student_id === p.student_id)?.paid_through ?? null
                  : null
                /* The deadline belongs to the student, so it only reads on a
                   payment that opened one: a rejected transfer bought no days. */
                const deadline = p.status === 'approved' && paidThrough
                  ? closesAt(paidThrough, closeBefore)
                  : null
                const left = deadline ? countdown(deadline, now) : null
                const canFix = p.status === 'rejected' && !!p.student_id && !!p.plan

                return (
                  <tr key={p.id}
                    onClick={canFix ? () => setRejected(p) : undefined}
                    data-click={canFix || undefined}
                    style={canFix ? { cursor: 'pointer' } : undefined}
                    title={canFix ? 'See why, and send it again' : undefined}>
                    <td>
                      <span className="stack g2">
                        <span className="t-sm">{date(p.created_at)}</span>
                        <span className="t-xs c-muted2">
                          {(p.student_id && names[p.student_id]) || 'Student'}
                        </span>
                      </span>
                    </td>

                    <td>
                      <span className="stack g2" style={{ minWidth: 0 }}>
                        <span className="t-sm">{p.program_name || 'Training program'}</span>
                        <span className="t-xs c-muted2 row g6">
                          {p.method === 'instapay'
                            ? <CreditCard style={{ width: 12, height: 12 }} />
                            : <Smartphone style={{ width: 12, height: 12 }} />}
                          {PAY_METHOD_LABEL[p.method]}
                          {p.plan ? ` · ${PLAN_LABEL[p.plan]}` : ''}
                        </span>
                      </span>
                    </td>

                    <td className="num"><b className="t-sm">{money(p.amount_egp)}</b></td>

                    <td>
                      {p.proof_path
                        ? <ProofLink path={p.proof_path} />
                        : <span className="t-xs c-muted2">None</span>}
                    </td>

                    <td>
                      <span className="stack g4">
                        <Badge tone={look.tone} dot>{look.label}</Badge>
                        {canFix && <span className="t-xs c-rose">Click to see why</span>}
                      </span>
                    </td>

                    <td>
                      {deadline && paidThrough ? (
                        <span className="stack g2">
                          <span className="t-sm tnum">{date(parseDay(paidThrough).toISOString())}</span>
                          <span className="t-xs c-muted2">closes {date(deadline.toISOString())}</span>
                        </span>
                      ) : <span className="t-xs c-muted2">—</span>}
                    </td>

                    <td>
                      {left ? (
                        <span className="cd-pill" data-urgency={left.urgency}>
                          {left.urgency === 'closed' ? <Lock /> : <CalendarClock />}
                          <span className="tnum">{left.label}</span>
                        </span>
                      ) : <span className="t-xs c-muted2">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rejected && (
        <ResubmitDialog
          payment={rejected}
          accounts={accounts}
          onClose={() => setRejected(null)}
          onDone={() => void load()}
        />
      )}
    </div>
  )
}
