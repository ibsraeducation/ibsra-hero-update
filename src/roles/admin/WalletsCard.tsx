/* ==========================================================================
   Transfer to a wallet — the admin's side of every parent's and every
   student's wallet.

   A parent or a student normally charges their own wallet: they send the
   money, file the transfer, and the admin approves it on the Transfers tab.
   This tab is the other case — the admin is the one holding the money.
   Cash handed over at the centre, a transfer that arrived without anyone
   filing it, a correction, a credit given as goodwill.

   A switch picks parents or students, and the table lists them. "Transfer
   money" on a row asks how much, then asks once more before anything moves:
   `admin_credit_wallet` puts it on the balance, files the approved top-up
   that records it and notifies the owner, in one transaction.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowRightLeft, GraduationCap, Loader2, Search, Users, Wallet,
} from 'lucide-react'
import { creditWallet, listWallets, type WalletOwner } from '@/lib/api/wallet'
import { toMessage } from '@/lib/api/errors'
import { useStore } from '@/lib/store'
import { dateTime, money } from '@/lib/format'
import { Badge, Empty, Field, Modal } from '@/components/ui'
import './wallets.css'

/** The amounts an admin reaches for most, so a credit is one tap and a
 *  confirm rather than a typed number. */
const QUICK = [500, 1000, 2500, 5000]

type Who = 'parent' | 'student'

/* ---------------- step 1: how much ---------------- */

function AmountDialog({ row, initial, onClose, onNext }: {
  row: WalletOwner
  onClose: () => void
  /** What was typed before stepping back from the confirm. */
  initial?: { amount: number; note: string }
  onNext: (amount: number, note: string) => void
}) {
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [note, setNote] = useState(initial?.note ?? '')
  const value = Number(amount)
  const valid = Number.isFinite(value) && value > 0

  return (
    <Modal
      open
      onClose={onClose}
      title={`Transfer to ${row.owner.name || row.owner.email}`}
      description="How much goes onto their wallet. You confirm it on the next step."
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!valid}
            onClick={() => onNext(Math.round(value), note.trim())}>
            <ArrowRightLeft />{valid ? `Transfer ${money(Math.round(value))}` : 'Transfer'}
          </button>
        </>
      }
    >
      <div className="stack g14">
        <div className="wal-add-now t-xs c-muted2">
          On the wallet now: <b className="c-ink2">{money(row.balanceEgp)}</b>
          {valid && <> → <b className="c-ink2">{money(row.balanceEgp + Math.round(value))}</b> after this</>}
        </div>

        <Field label="Amount (EGP)">
          <div className="stack g8">
            <input className="inp" type="number" min={1} step={50} autoFocus value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && valid) onNext(Math.round(value), note.trim()) }}
              style={{ maxWidth: 200 }} />
            <div className="row g6 wrap">
              {QUICK.map(q => (
                <button key={q} type="button" className="role-pill" data-on={amount === String(q)}
                  onClick={() => setAmount(String(q))}>{money(q)}</button>
              ))}
            </div>
          </div>
        </Field>

        <Field label="What it is for (optional — included in their notification)">
          <input className="inp" value={note} maxLength={300}
            placeholder="e.g. Cash handed over at the centre"
            onChange={e => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* ---------------- step 2: are you sure ---------------- */

function ConfirmTransfer({ row, amount, note, onBack, onClose, onDone }: {
  row: WalletOwner
  amount: number
  note: string
  onBack: () => void
  onClose: () => void
  onDone: (balance: number) => void
}) {
  const toast = useStore(s => s.toast)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = row.owner.name || row.owner.email

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      await creditWallet(row.owner.id, amount, note)
      toast(`${money(amount)} added to ${name}'s wallet — they have been notified`)
      onDone(row.balanceEgp + amount)
      onClose()
    } catch (e) {
      setError(toMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Confirm the transfer"
      footer={
        <>
          <button className="btn ghost" onClick={onBack} disabled={busy}>Back</button>
          <span className="grow" />
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={() => void go()} disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <ArrowRightLeft />}Confirm transfer
          </button>
        </>
      }
    >
      <div className="stack g14">
        {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}
        <p className="t-sm c-ink2" style={{ lineHeight: 1.6 }}>
          <b>{money(amount)}</b> goes onto <b>{name}</b>'s wallet straight away, and they get a
          notification. There is nothing left to approve, and it cannot be undone from here.
        </p>
        <div className="wal-add-now t-xs c-muted2">
          {money(row.balanceEgp)} → <b className="c-ink2">{money(row.balanceEgp + amount)}</b>
          {note && <> · “{note}”</>}
        </div>
      </div>
    </Modal>
  )
}

/* ---------------- the tab ---------------- */

type Step =
  | { step: 'amount'; row: WalletOwner; initial?: { amount: number; note: string } }
  | { step: 'confirm'; row: WalletOwner; amount: number; note: string }

export function WalletsPanel({ onCredited }: {
  /** The credit files an approved top-up, so the Transfers tab reloads too. */
  onCredited?: () => void
}) {
  const [rows, setRows] = useState<WalletOwner[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [who, setWho] = useState<Who>('parent')
  const [flow, setFlow] = useState<Step | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setRows(await listWallets())
    } catch (e) {
      setError(toMessage(e))
      setRows([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (rows ?? [])
      .filter(r => r.owner.role === who
        && (!q
          || r.owner.name.toLowerCase().includes(q)
          || r.owner.email.toLowerCase().includes(q)
          || (r.owner.phone ?? '').includes(q)))
      .sort((a, b) => (a.owner.name || a.owner.email).localeCompare(b.owner.name || b.owner.email))
  }, [rows, query, who])

  const count = (w: Who) => (rows ?? []).filter(r => r.owner.role === w).length
  const total = shown.reduce((a, r) => a + r.balanceEgp, 0)

  return (
    <section className="card">
      <div className="pay-filters row g10 wrap">
        {/* The slicer: one switch, two sides. */}
        <div className="seg" role="tablist" aria-label="Whose wallets">
          {(['parent', 'student'] as Who[]).map(w => (
            <button key={w} type="button" role="tab" className="seg-opt" aria-selected={who === w}
              data-on={who === w} onClick={() => setWho(w)}>
              {w === 'parent' ? <Users /> : <GraduationCap />}
              {w === 'parent' ? 'Parents' : 'Students'}
              <span className="seg-cnt tnum">{count(w)}</span>
            </button>
          ))}
        </div>
        <span className="grow" />
        {rows !== null && rows.length > 0 && (
          <span className="t-xs c-muted2">
            <b className="c-ink2">{money(total)}</b> across {shown.length} wallet{shown.length === 1 ? '' : 's'}
          </span>
        )}
        <div className="search" style={{ maxWidth: 260 }}>
          <Search />
          <input className="inp" value={query} placeholder={`Find a ${who}…`}
            onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      {error && <div className="auth-alert" role="alert" style={{ margin: 14 }}><AlertTriangle /><span>{error}</span></div>}

      {rows === null ? (
        <div style={{ padding: 28 }}>
          <span className="row g8 c-muted t-sm"><Loader2 className="spin" />Loading wallets…</span>
        </div>
      ) : shown.length === 0 ? (
        <Empty icon={<Wallet />}
          title={count(who) === 0 ? `No ${who} accounts yet` : 'Nobody matches that'} />
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{who === 'parent' ? 'Parent' : 'Student'}</th>
                <th>Contact</th>
                <th className="num">Balance</th>
                <th>Last movement</th>
                <th className="act" />
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.owner.id}>
                  <td>
                    <span className="row g8">
                      <span className="t-sm w-sb">{r.owner.name || r.owner.email}</span>
                      {r.owner.disabled && <Badge tone="rose" dot>Disabled</Badge>}
                    </span>
                  </td>
                  <td>
                    <span className="stack g2">
                      <span className="t-xs c-muted">{r.owner.email}</span>
                      {r.owner.phone && <span className="t-xs c-muted2">{r.owner.phone}</span>}
                    </span>
                  </td>
                  <td className="num"><b className="t-sm tnum">{money(r.balanceEgp)}</b></td>
                  <td className="t-xs c-muted2">{r.updatedAt ? dateTime(r.updatedAt) : 'Never used'}</td>
                  <td className="act">
                    <button className="btn sm primary" onClick={() => setFlow({ step: 'amount', row: r })}>
                      <ArrowRightLeft />Transfer money
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {flow?.step === 'amount' && (
        <AmountDialog row={flow.row} initial={flow.initial} onClose={() => setFlow(null)}
          onNext={(amount, note) => setFlow({ step: 'confirm', row: flow.row, amount, note })} />
      )}
      {flow?.step === 'confirm' && (
        <ConfirmTransfer row={flow.row} amount={flow.amount} note={flow.note}
          onBack={() => setFlow({ step: 'amount', row: flow.row, initial: { amount: flow.amount, note: flow.note } })}
          onClose={() => setFlow(null)}
          onDone={balance => {
            const id = flow.row.owner.id
            setRows(list => (list ?? []).map(r =>
              r.owner.id === id ? { ...r, balanceEgp: balance, updatedAt: new Date().toISOString() } : r))
            onCredited?.()
          }} />
      )}
    </section>
  )
}
