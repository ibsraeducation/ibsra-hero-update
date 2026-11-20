/* ==========================================================================
   The money settings, above the list of transfers.

   Two cards. The first is where the money goes: two channels, each opened
   or closed on its own, with the link a family taps and the QR they scan.
   The second is what the platform costs — four packages, which of them are
   on sale, and how many days before a child's paid-up date the door shuts.
   ========================================================================== */

import { useState } from 'react'
import {
  AlertTriangle, CalendarClock, CreditCard, ImagePlus, Loader2, MessageCircle, QrCode, Save, Smartphone,
  Trash2,
} from 'lucide-react'
import { savePayAccounts, type PayAccountsPatch } from '@/lib/api/payments'
import { METHOD_FEE_PCT, qrUrl, removeQr, saveBilling, uploadQr } from '@/lib/api/billing'
import { toMessage } from '@/lib/api/errors'
import { useStore } from '@/lib/store'
import { dateTime, money } from '@/lib/format'
import { Field, Switch } from '@/components/ui'
import { clampCloseBefore, closesAt, PLAN_LABEL, PLAN_SUB, PLANS, type PayPlan } from '@/lib/billing'
import type { BillingSettingsRow, PayAccountsRow } from '@/lib/api/rows'
import './billing.css'

/* ---------------- one QR code ---------------- */

function QrBox({ which, path, stamp, onChange }: {
  which: 'instapay' | 'vodafone'
  path: string | null
  stamp: string
  onChange: (path: string | null) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const src = qrUrl(path, stamp)

  const pick = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await onChange(await uploadQr(which, file))
    } catch (e) {
      setError(toMessage(e))
    }
    setBusy(false)
  }

  const drop = async () => {
    if (!path) return
    setBusy(true)
    setError(null)
    try {
      await onChange(null)
      await removeQr(path)
    } catch (e) {
      setError(toMessage(e))
    }
    setBusy(false)
  }

  return (
    <div className="bill-qr">
      <div className="bill-qr-frame" data-empty={!src}>
        {src
          ? <img src={src} alt={`${which} QR code`} />
          : <span className="stack g4" style={{ alignItems: 'center' }}><QrCode /><span className="t-xs c-muted2">No QR yet</span></span>}
      </div>
      <div className="row g6 wrap">
        <label className="btn sm" style={{ width: 'fit-content' }}>
          {busy ? <Loader2 className="spin" /> : <ImagePlus />}{path ? 'Replace' : 'Upload QR'}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy}
            onChange={e => { const f = e.target.files?.[0] ?? null; e.target.value = ''; void pick(f) }} />
        </label>
        {path && (
          <button className="btn sm ghost" style={{ color: 'var(--rose-600)' }} disabled={busy}
            onClick={() => void drop()}><Trash2 />Remove</button>
        )}
      </div>
      {error && <span className="t-xs c-rose">{error}</span>}
      <span className="t-xs c-muted2">PNG or JPG, up to 2 MB. Families scan it on their phone.</span>
    </div>
  )
}

/* ---------------- where the money goes ---------------- */

export function PayAccountsCard({ row, onSaved }: {
  row: PayAccountsRow; onSaved: (r: PayAccountsRow) => void
}) {
  const toast = useStore(s => s.toast)
  const [instapayOn, setInstapayOn] = useState(row.instapay_on ?? true)
  const [instapayLink, setInstapayLink] = useState(row.instapay_link ?? '')
  const [vodafoneOn, setVodafoneOn] = useState(row.vodafone_on ?? true)
  const [vodafoneLink, setVodafoneLink] = useState(row.vodafone_link ?? '')
  const [whatsapp, setWhatsapp] = useState(row.support_whatsapp ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = instapayOn !== (row.instapay_on ?? true)
    || instapayLink !== (row.instapay_link ?? '')
    || vodafoneOn !== (row.vodafone_on ?? true)
    || vodafoneLink !== (row.vodafone_link ?? '')
    || whatsapp !== (row.support_whatsapp ?? '')

  const write = async (patch: PayAccountsPatch) => {
    const saved = await savePayAccounts(patch)
    onSaved(saved)
    return saved
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await write({
        instapay_on: instapayOn,
        /* InstaPay is a payment link and a QR, like Vodafone Cash — the
           old address field is cleared so nothing shows a stale one. */
        instapay_handle: '',
        instapay_link: instapayLink.trim(),
        vodafone_on: vodafoneOn,
        vodafone_link: vodafoneLink.trim(),
        support_whatsapp: whatsapp.trim(),
        /* The free-text note is gone from the form; clear any old one so
           families are not shown a stale message. */
        instructions: '',
      })
      toast('Families will see these from now on')
    } catch (e) {
      setError(toMessage(e))
    }
    setBusy(false)
  }

  /* A QR is a file, so it is saved the moment it is chosen — there is
     nothing for the Save button to do about it. */
  const setQr = (key: 'instapay_qr' | 'vodafone_qr') => async (path: string | null) => {
    await write({ [key]: path } as PayAccountsPatch)
    toast(path ? 'QR code saved' : 'QR code removed')
  }

  return (
    <section className="card"><div className="pd-col">
        <p className="t-xs c-muted2" style={{ lineHeight: 1.6 }}>
          Shown on the parent's payment page, right before they send anything. Close a channel
          and it is not offered — its link and its QR are kept for when you open it again.
        </p>

        {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}

        <div className="bill-methods">
          <div className="bill-method" data-on={instapayOn}>
            <div className="row g10" style={{ justifyContent: 'space-between' }}>
              <span className="eyebrow row g6"><CreditCard style={{ width: 13, height: 13 }} />InstaPay</span>
              <Switch on={instapayOn} onChange={setInstapayOn} label="Offer InstaPay" />
            </div>
            <Field label="Payment link">
              <input className="inp" value={instapayLink} placeholder="https://ipn.eg/S/…"
                onChange={e => setInstapayLink(e.target.value)} />
            </Field>
            <QrBox which="instapay" path={row.instapay_qr ?? null} stamp={row.updated_at}
              onChange={setQr('instapay_qr')} />
          </div>

          <div className="bill-method" data-on={vodafoneOn}>
            <div className="row g10" style={{ justifyContent: 'space-between' }}>
              <span className="eyebrow row g6"><Smartphone style={{ width: 13, height: 13 }} />Vodafone Cash</span>
              <Switch on={vodafoneOn} onChange={setVodafoneOn} label="Offer Vodafone Cash" />
            </div>
            <Field label="Payment link">
              <input className="inp" value={vodafoneLink} placeholder="https://…"
                onChange={e => setVodafoneLink(e.target.value)} />
            </Field>
            <QrBox which="vodafone" path={row.vodafone_qr ?? null} stamp={row.updated_at}
              onChange={setQr('vodafone_qr')} />
            <p className="t-xs c-muted2" style={{ lineHeight: 1.6 }}>
              A family paying this way is asked for {METHOD_FEE_PCT.vodafone_cash}% above the
              price, so what lands once Vodafone has taken its cut is the price itself.
            </p>
          </div>
        </div>

        <div className="bill-method" data-on={!!whatsapp.trim()}>
          <span className="eyebrow row g6"><MessageCircle style={{ width: 13, height: 13 }} />WhatsApp for families</span>
          <Field label="Number, with the country code"
            hint="Offered on the enrol form when none of the open times suit a family. Leave it empty to hide it.">
            <input className="inp" value={whatsapp} placeholder="+20 100 123 4567" inputMode="tel"
              onChange={e => setWhatsapp(e.target.value)} />
          </Field>
        </div>

        <div className="row g8">
          <button className="btn primary" disabled={!dirty || busy} onClick={() => void save()}>
            {busy ? <Loader2 className="spin" /> : <Save />}Save
          </button>
          {row.updated_at && <span className="t-xs c-muted2">Last changed {dateTime(row.updated_at)}</span>}
        </div>
    </div></section>
  )
}

/* ---------------- what it costs ---------------- */

const PRICE_KEY: Record<PayPlan, 'monthly_egp' | 'quarterly_egp' | 'half_annual_egp' | 'annual_egp'> = {
  monthly: 'monthly_egp', quarterly: 'quarterly_egp', half_annual: 'half_annual_egp', annual: 'annual_egp',
}
const ON_KEY: Record<PayPlan, 'monthly_on' | 'quarterly_on' | 'half_annual_on' | 'annual_on'> = {
  monthly: 'monthly_on', quarterly: 'quarterly_on', half_annual: 'half_annual_on', annual: 'annual_on',
}

export function PackagesCard({ row, onSaved }: {
  row: BillingSettingsRow; onSaved: (r: BillingSettingsRow) => void
}) {
  const toast = useStore(s => s.toast)
  const [price, setPrice] = useState<Record<PayPlan, string>>({
    monthly: row.monthly_egp == null ? '' : String(row.monthly_egp),
    quarterly: row.quarterly_egp == null ? '' : String(row.quarterly_egp),
    half_annual: row.half_annual_egp == null ? '' : String(row.half_annual_egp),
    annual: row.annual_egp == null ? '' : String(row.annual_egp),
  })
  const [on, setOn] = useState<Record<PayPlan, boolean>>({
    monthly: row.monthly_on,
    quarterly: row.quarterly_on,
    half_annual: row.half_annual_on,
    annual: row.annual_on,
  })
  const [closeBefore, setCloseBefore] = useState(String(row.close_before_days))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const asNumber = (v: string) => {
    const n = Number(v.trim())
    return v.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : Math.round(n)
  }

  const dirty = PLANS.some(p => asNumber(price[p]) !== row[PRICE_KEY[p]] || on[p] !== row[ON_KEY[p]])
    || clampCloseBefore(Number(closeBefore)) !== row.close_before_days

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      onSaved(await saveBilling({
        monthly_egp: asNumber(price.monthly),
        quarterly_egp: asNumber(price.quarterly),
        half_annual_egp: asNumber(price.half_annual),
        annual_egp: asNumber(price.annual),
        monthly_on: on.monthly,
        quarterly_on: on.quarterly,
        half_annual_on: on.half_annual,
        annual_on: on.annual,
        close_before_days: clampCloseBefore(Number(closeBefore)),
      }))
      toast('Packages saved')
    } catch (e) {
      setError(toMessage(e))
    }
    setBusy(false)
  }

  const days = clampCloseBefore(Number(closeBefore))
  /* The sentence under the box, on a real date: a family paid up to the end
     of this month is shut out that many days earlier. */
  const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
  const paidTo = `${endOfMonth.getFullYear()}-${String(endOfMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfMonth.getDate()).padStart(2, '0')}`
  const example = closesAt(paidTo, days)
  const onDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

  return (
    <section className="card"><div className="pd-col">
        <p className="t-xs c-muted2" style={{ lineHeight: 1.6 }}>
          One subscription per student, in four lengths. A package with no price is never
          offered, and switching one off hides it from families without losing the price.
        </p>

        {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}

        <div className="bill-plans">
          {PLANS.map(p => {
            const live = on[p] && asNumber(price[p]) !== null
            return (
              <div key={p} className="bill-plan" data-on={live}>
                <div className="row g10" style={{ justifyContent: 'space-between' }}>
                  <span className="stack g2">
                    <b className="t-sm">{PLAN_LABEL[p]}</b>
                    <span className="t-xs c-muted2">{PLAN_SUB[p]}</span>
                  </span>
                  <Switch on={on[p]} onChange={v => setOn(s => ({ ...s, [p]: v }))} />
                </div>
                <Field label="Price (EGP)">
                  <input className="inp" type="number" min={1} inputMode="numeric"
                    value={price[p]} placeholder="Not on sale"
                    onChange={e => setPrice(s => ({ ...s, [p]: e.target.value }))} />
                </Field>
                <span className="t-xs c-muted2">
                  {asNumber(price[p]) === null
                    ? 'No price — families do not see it'
                    : on[p]
                      ? `Families pay ${money(asNumber(price[p])!)}`
                      : `${money(asNumber(price[p])!)}, switched off`}
                </span>
              </div>
            )
          })}
        </div>

        <div className="bill-day">
          <Field label="The platform closes this many days early" >
            <input className="inp" type="number" min={0} max={60} inputMode="numeric"
              style={{ maxWidth: 120 }} value={closeBefore}
              onChange={e => setCloseBefore(e.target.value)} />
          </Field>
          <p className="t-xs c-muted2 row g6" style={{ lineHeight: 1.6 }}>
            <CalendarClock style={{ width: 14, height: 14, flex: 'none' }} />
            <span>
              {days === 0
                ? 'A student is locked out on the day their subscription runs out, and the parent has to pay to open it again.'
                : `A student is locked out ${days} day${days === 1 ? '' : 's'} before their
                   subscription runs out, so the family renews while the platform is still open.`}
              {' '}A subscription paid up to {onDay(endOfMonth)} closes on {onDay(example)}.
            </span>
          </p>
        </div>

        <div className="row g8">
          <button className="btn primary" disabled={!dirty || busy} onClick={() => void save()}>
            {busy ? <Loader2 className="spin" /> : <Save />}Save
          </button>
          {row.updated_at && <span className="t-xs c-muted2">Last changed {dateTime(row.updated_at)}</span>}
        </div>
    </div></section>
  )
}
