/* ==========================================================================
   Packages, the closing day, and what each child is paid up to.

   The admin writes `billing_settings` and the QR codes; everybody signed in
   reads them. `subscriptions` is written by nobody at all from here — the
   only thing that moves a paid-through date is the admin approving a
   payment, inside `approve_payment`.
   ========================================================================== */

import { backendLive, sb, supabase } from '@/lib/supabase'
import { demoPay } from './demoPay'
import type { BillingSettingsRow, PayAccountsRow, PayMethod, SubscriptionRow } from './rows'
import { clampCloseBefore, PLANS, type PayPlan } from '@/lib/billing'

/** What the app falls back to before the row loads, or with no backend. */
export const EMPTY_BILLING: BillingSettingsRow = {
  id: true,
  monthly_egp: null,
  quarterly_egp: null,
  half_annual_egp: null,
  annual_egp: null,
  monthly_on: true,
  quarterly_on: true,
  half_annual_on: true,
  annual_on: true,
  close_before_days: 5,
  updated_at: '',
}

export async function fetchBilling(): Promise<BillingSettingsRow> {
  if (!backendLive) return demoPay.billing()
  const { data, error } = await sb().from('billing_settings').select('*').maybeSingle()
  if (error) throw error
  return (data ?? EMPTY_BILLING) as BillingSettingsRow
}

export type BillingPatch = Partial<Omit<BillingSettingsRow, 'id' | 'updated_at'>>

export async function saveBilling(patch: BillingPatch): Promise<BillingSettingsRow> {
  const safe: BillingPatch = patch.close_before_days == null
    ? patch
    : { ...patch, close_before_days: clampCloseBefore(patch.close_before_days) }
  if (!backendLive) return demoPay.saveBilling(safe)
  const { data, error } = await sb().from('billing_settings')
    .update(safe).eq('id', true).select('*').single()
  if (error) throw error
  return data as BillingSettingsRow
}

/** Which column each package keeps its price and its switch in. */
const PRICE_OF: Record<PayPlan, keyof BillingSettingsRow> = {
  monthly: 'monthly_egp',
  quarterly: 'quarterly_egp',
  half_annual: 'half_annual_egp',
  annual: 'annual_egp',
}
const SWITCH_OF: Record<PayPlan, keyof BillingSettingsRow> = {
  monthly: 'monthly_on',
  quarterly: 'quarterly_on',
  half_annual: 'half_annual_on',
  annual: 'annual_on',
}

/** The price of one package, or null when it is not on sale. A package with
 *  no price is never offered, however its switch is set. */
export function planPrice(b: BillingSettingsRow, plan: PayPlan): number | null {
  const price = b[PRICE_OF[plan]] as number | null
  return price && price > 0 ? price : null
}

export function planOn(b: BillingSettingsRow, plan: PayPlan): boolean {
  return b[SWITCH_OF[plan]] as boolean
}

/** The packages a family may actually pick: priced, and switched on. */
export function offeredPlans(b: BillingSettingsRow): PayPlan[] {
  return PLANS.filter(p => planOn(b, p) && planPrice(b, p) !== null)
}

/* ---------------- the channels ---------------- */

/** The ways a family may actually pay: a channel the admin has opened and
 *  given something to pay to — an address, a link, or a QR. The toggles are
 *  optional on the row so an account saved before they existed reads as
 *  open, exactly as it behaved then. */
export function openChannels(a: PayAccountsRow | null | undefined): PayMethod[] {
  if (!a) return []
  const has = (...parts: Array<string | null | undefined>) => parts.some(p => !!p?.trim())
  const out: PayMethod[] = []
  if ((a.instapay_on ?? true) && has(a.instapay_link, a.instapay_qr)) {
    out.push('instapay')
  }
  if ((a.vodafone_on ?? true) && has(a.vodafone_number, a.vodafone_link, a.vodafone_qr)) {
    out.push('vodafone_cash')
  }
  return out
}

/* ---------------- the QR codes ---------------- */

const QR_BUCKET = 'pay-qr'

/** A QR lives at `instapay.png` / `vodafone.png` and is overwritten in
 *  place, so there is never a second one to clean up. The query string is
 *  what makes a replaced code show up instead of the cached one. */
export function qrUrl(path: string | null | undefined, stamp?: string): string | null {
  if (!path) return null
  /* With no bucket to live in, the demo keeps the image itself on the row. */
  if (path.startsWith('data:')) return path
  if (!supabase) return null
  const { data } = supabase.storage.from(QR_BUCKET).getPublicUrl(path)
  return stamp ? `${data.publicUrl}?v=${encodeURIComponent(stamp)}` : data.publicUrl
}

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
}

/** Upload (or replace) one QR. Returns the path to store on the row. */
export async function uploadQr(which: 'instapay' | 'vodafone', file: File): Promise<string> {
  if (!backendLive) return demoPay.readAsDataUrl(file)
  const ext = EXT[file.type] ?? 'png'
  const path = `${which}.${ext}`
  const { error } = await sb().storage.from(QR_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/png', upsert: true })
  if (error) throw error
  return path
}

export async function removeQr(path: string): Promise<void> {
  /* Nothing was uploaded in demo mode — clearing the row was the whole job. */
  if (!backendLive) return
  const { error } = await sb().storage.from(QR_BUCKET).remove([path])
  if (error) throw error
}

/* ---------------- who is paid up to when ---------------- */

/** Every subscription this account may read: the admin sees all of them, a
 *  parent their children's, a student their own. */
export async function fetchSubscriptions(): Promise<SubscriptionRow[]> {
  if (!backendLive) return demoPay.subscriptions()
  const { data, error } = await sb().from('subscriptions').select('*')
  if (error) throw error
  return (data ?? []) as SubscriptionRow[]
}

export async function fetchSubscription(studentId: string): Promise<SubscriptionRow | null> {
  if (!backendLive) return demoPay.subscriptions().find(s => s.student_id === studentId) ?? null
  const { data, error } = await sb().from('subscriptions')
    .select('*').eq('student_id', studentId).maybeSingle()
  if (error) throw error
  return (data ?? null) as SubscriptionRow | null
}
