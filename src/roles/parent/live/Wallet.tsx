/* ==========================================================================
   The family wallet — money in the account, before it is spent on anything.

   Two halves, in the order a family uses them. Charging it is the transfer
   they already know: send it by InstaPay or Vodafone Cash, file it here, and
   the admin credits the balance once the money has landed. Spending it is
   the part that no longer waits — the subscription is paid on the spot from
   what is already in the wallet, on the Buy a Program page.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Clock, CreditCard, Loader2, Paperclip,
  Plus, Smartphone, Wallet as WalletIcon,
} from 'lucide-react'
import { fetchPayAccounts } from '@/lib/api/family'
import { chargeWallet, fetchPendingTopUps, fetchRejectedTopUps, fetchWallet, fetchWalletEntries } from '@/lib/api/wallet'
import { toMessage } from '@/lib/api/errors'
import { useAuth } from '@/lib/auth'
import { useStore } from '@/lib/store'
import { dateTime, money } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Empty, Field, Modal } from '@/components/ui'
import {
  PAY_METHOD_LABEL,
  type PayAccountsRow, type PaymentRow, type PayMethod, type WalletEntryRow, type WalletRow,
} from '@/lib/api/rows'
import { PayWhere } from './PayWhere'
import { usePayArea } from './useFamily'
import './family.css'
import './live.css'
import '@/roles/admin/billing.css'

const METHODS: Array<{ value: PayMethod; icon: typeof CreditCard }> = [
  { value: 'instapay', icon: CreditCard },
  { value: 'vodafone_cash', icon: Smartphone },
]

/** The amounts a family charges most often — one tap instead of typing. */
const QUICK = [500, 1000, 2500, 5000]

export function ParentWallet() {
  const profile = useAuth(s => s.profile)
  const toast = useStore(s => s.toast)
  const area = usePayArea()

  const [wallet, setWallet] = useState<WalletRow | null>(null)
  const [entries, setEntries] = useState<WalletEntryRow[]>([])
  const [waiting, setWaiting] = useState<PaymentRow[]>([])
  const [rejected, setRejected] = useState<PaymentRow[]>([])
  const [accounts, setAccounts] = useState<PayAccountsRow | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PayMethod>('instapay')
  const [senderRef, setSenderRef] = useState('')
  const [note, setNote] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    try {
      setLoadError(null)
      const [w, list, pending, acc, turnedDown] = await Promise.all([
        fetchWallet(profile.id), fetchWalletEntries(), fetchPendingTopUps(), fetchPayAccounts(),
        fetchRejectedTopUps(),
      ])
      setWallet(w)
      setEntries(list)
      setWaiting(pending)
      setAccounts(acc)
      setRejected(turnedDown)
    } catch (e) {
      setLoadError(toMessage(e))
      setWallet({ parent_id: profile.id, balance_egp: 0, updated_at: '' })
    }
  }, [profile])

  useEffect(() => { void load() }, [load])

  const charge = async () => {
    if (!profile) return
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) { setError('Type how much you sent, in EGP.'); return }
    if (!senderRef.trim()) { setError('Type the number or InstaPay address you sent it from.'); return }

    setBusy(true)
    setError(null)
    try {
      await chargeWallet({
        parentId: profile.id,
        amountEgp: Math.round(value),
        method,
        senderRef: senderRef.trim(),
        note: note.trim(),
        proof,
      })
      toast('Transfer filed — the balance goes up once the admin has found the money')
      setOpen(false)
      setAmount(''); setSenderRef(''); setNote(''); setProof(null)
      await load()
    } catch (e) {
      setError(toMessage(e))
    }
    setBusy(false)
  }

  const pendingTotal = waiting.reduce((a, p) => a + p.amount_egp, 0)

  if (wallet === null) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 28 }}>
          <span className="row g8 c-muted t-sm"><Loader2 className="spin" />Loading your wallet…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="Wallet"
        actions={
          <button className="btn primary" onClick={() => setOpen(v => !v)}>
            <Plus />Charge the wallet
          </button>
        }
      />

      {loadError && <div className="auth-alert mb12" role="alert"><AlertTriangle /><span>{loadError}</span></div>}

      <div className="fam-stack">
        {/* ---- what is in it ---- */}
        <section className="card wal-top">
          <div className="wal-balance">
            <span className="eyebrow row g6"><WalletIcon style={{ width: 13, height: 13 }} />Balance</span>
            <b className="wal-figure">{money(wallet.balance_egp)}</b>
            <span className="t-xs c-muted2">
              {wallet.balance_egp > 0
                ? 'Enough to pay for a subscription without sending anything.'
                : 'Empty — charge it and the next payment takes a single tap.'}
            </span>
          </div>
          <div className="wal-side">
            {pendingTotal > 0 && (
              <div className="wal-pending">
                <span className="row g6 t-sm"><Clock style={{ width: 14, height: 14 }} />
                  <b>{money(pendingTotal)}</b> waiting to be checked
                </span>
                <span className="t-xs c-muted2">
                  {waiting.length} transfer{waiting.length === 1 ? '' : 's'} filed. It lands on the
                  balance as soon as the admin finds the money.
                </span>
              </div>
            )}
            <Link className="btn" to={`${area}/payments`}>{area === '/student' ? 'Pay a subscription' : 'Pay for a hero'}</Link>
          </div>
        </section>

        {/* ---- charging it ---- */}
        <Modal open={open} onClose={() => setOpen(false)} title="Charge the wallet"
          description="Send the money, then file the transfer. The admin checks it and your balance goes up.">
          <div className="stack g14" style={{ maxWidth: 560 }}>
            <PayWhere accounts={accounts} />

            {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}

            <Field label="How much you sent (EGP)">
              <div className="stack g8">
                <input className="inp" type="number" min={1} value={amount}
                  onChange={e => setAmount(e.target.value)} style={{ maxWidth: 200 }} />
                <div className="row g6 wrap">
                  {QUICK.map(q => (
                    <button key={q} type="button" className="role-pill" data-on={amount === String(q)}
                      onClick={() => setAmount(String(q))}>{money(q)}</button>
                  ))}
                </div>
              </div>
            </Field>

            <Field label="How you sent it">
              <div className="row g8 wrap">
                {METHODS.map(m => (
                  <button key={m.value} type="button" className="role-pill" data-on={method === m.value}
                    onClick={() => setMethod(m.value)}>
                    <m.icon />{PAY_METHOD_LABEL[m.value]}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label={method === 'instapay' ? 'The InstaPay address you sent from' : 'The number you sent from'}
            >
              <input className="inp" value={senderRef} onChange={e => setSenderRef(e.target.value)}
                placeholder={method === 'instapay' ? 'name@instapay' : '01xxxxxxxxx'} />
            </Field>

            <Field label="Screenshot of the transfer" >
              <label className="btn" style={{ width: 'fit-content' }}>
                <Paperclip />{proof ? proof.name : 'Choose a file'}
                <input type="file" accept="image/*,application/pdf" hidden
                  onChange={e => setProof(e.target.files?.[0] ?? null)} />
              </label>
            </Field>

            <Field label="Anything the admin should know">
              <textarea className="inp" rows={2} value={note} onChange={e => setNote(e.target.value)} />
            </Field>

            <div className="row g8">
              <button className="btn primary" disabled={busy} onClick={() => void charge()}>
                {busy ? <Loader2 className="spin" /> : <WalletIcon />}
                {busy ? 'Filing…' : 'File this transfer'}
              </button>
              <button className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </Modal>

        {/* ---- every movement ---- */}
        <section className="card">
          <div className="pd-col">
            <h2 className="pd-col-head"><ArrowUpRight />Movements</h2>
            {entries.length === 0 && waiting.length === 0 ? (
              <Empty icon={<WalletIcon />} title="Nothing has moved yet"
                action={<button className="btn primary" onClick={() => setOpen(true)}><Plus />Charge the wallet</button>} />
            ) : (
              <div className="wal-log">
                {waiting.map(p => (
                  <article key={p.id} className="wal-row" data-move="pending">
                    <span className="wal-ico"><Clock /></span>
                    <span className="stack g2 grow" style={{ minWidth: 0 }}>
                      <span className="t-sm w-med">Top-up waiting to be checked</span>
                      <span className="t-xs c-muted2">
                        {PAY_METHOD_LABEL[p.method]} · from {p.sender_ref || '—'} · filed {dateTime(p.created_at)}
                      </span>
                    </span>
                    <span className="stack g2" style={{ textAlign: 'end' }}>
                      <b className="t-sm">+{money(p.amount_egp)}</b>
                      <Badge tone="gold" dot>Pending</Badge>
                    </span>
                  </article>
                ))}

                {rejected.map(p => (
                  <article key={p.id} className="wal-row" data-move="rejected">
                    <span className="wal-ico"><AlertTriangle /></span>
                    <span className="stack g2 grow" style={{ minWidth: 0 }}>
                      <span className="t-sm w-med">Top-up not accepted</span>
                      <span className="t-xs c-muted2">
                        {PAY_METHOD_LABEL[p.method]} · filed {dateTime(p.created_at)}
                      </span>
                      <span className="t-xs c-muted2">
                        Reason: {p.review_note?.trim() || 'The admin did not leave a reason.'}
                      </span>
                    </span>
                    <span className="stack g2" style={{ textAlign: 'end' }}>
                      <b className="t-sm">{money(p.amount_egp)}</b>
                      <Badge tone="rose" dot>Rejected</Badge>
                    </span>
                  </article>
                ))}

                {entries.map(e => (
                  <article key={e.id} className="wal-row" data-move={e.move}>
                    <span className="wal-ico">
                      {e.move === 'spend' ? <ArrowUpRight /> : <ArrowDownLeft />}
                    </span>
                    <span className="stack g2 grow" style={{ minWidth: 0 }}>
                      <span className="t-sm w-med truncate">
                        {e.move === 'spend' ? e.note || 'Paid for a student' : e.note || 'Wallet charged'}
                      </span>
                      <span className="t-xs c-muted2">{dateTime(e.created_at)}</span>
                    </span>
                    <span className="stack g2" style={{ textAlign: 'end' }}>
                      <b className="t-sm">{e.move === 'spend' ? '−' : '+'}{money(e.amount_egp)}</b>
                      <span className="t-xs c-muted2">left {money(e.balance_after)}</span>
                    </span>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
