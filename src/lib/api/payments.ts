/* ==========================================================================
   The admin side of payments: read what families filed, and answer it.

   Approving is not a status change — it is the enrolment. `approve_payment`
   writes one active enrolment per course of the program, in the same
   transaction that stamps the payment, so a family never pays into silence.

   With no backend configured every read here answers from `demoPay` instead,
   so the page can be looked at — and its settings changed — without an
   account. Those writes reach this browser's localStorage and nothing else.
   ========================================================================== */

import { backendLive, sb } from '@/lib/supabase'
import { PLAN_DAYS, type PayPlan } from '@/lib/billing'
import { DEMO_PEOPLE, demoPay } from './demoPay'
import type { PayAccountsRow, PaymentRow, PayMethod } from './rows'

/** A payment with the names an admin needs to read it in one line. */
export interface PaymentWithPeople extends PaymentRow {
  parent: { id: string; name: string; email: string; phone: string | null; region?: string | null } | null
  student: { id: string; name: string; email: string; age: number | null; region?: string | null } | null
}


export async function listPayments(): Promise<PaymentWithPeople[]> {
  if (!backendLive) {
    return demoPay.payments().map(p => ({
      ...p, parent: DEMO_PEOPLE.parent, student: DEMO_PEOPLE.student,
    }))
  }
  const { data, error } = await sb()
    .from('payments')
    .select(`*,
      parent:profiles!payments_parent_id_fkey (id, name, email, phone, region),
      student:profiles!payments_student_id_fkey (id, name, email, age, region)`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as PaymentWithPeople[]
}

export async function approvePayment(id: string, note?: string): Promise<PaymentRow> {
  if (!backendLive) return demoPay.approve(id, note, p => PLAN_DAYS[p.plan!])
  const { data, error } = await sb().rpc('approve_payment', { p_id: id, p_note: note ?? null })
  if (error) throw error
  return data as PaymentRow
}

export async function rejectPayment(id: string, note?: string): Promise<PaymentRow> {
  if (!backendLive) return demoPay.reject(id, note)
  const { data, error } = await sb().rpc('reject_payment', { p_id: id, p_note: note ?? null })
  if (error) throw error
  return data as PaymentRow
}

/* ---------------- the family paying directly ---------------- */

export interface SubscriptionTransfer {
  parentId: string
  studentId: string
  /** The program being enrolled in. Null on a renewal, which buys months
   *  for a student who is already in one. */
  trackId?: string | null
  plan: PayPlan
  method: PayMethod
  amountEgp: number
  proof: File
  senderRef?: string
  note?: string
}

/** File a subscription paid straight by InstaPay or Vodafone Cash. The
 *  screenshot goes up first, under the parent's own folder; then
 *  `file_subscription_payment` checks the plan is on sale, the student is
 *  theirs and nothing is already waiting, and files it as pending. The
 *  countdown only starts when the admin approves it. */
export async function fileSubscriptionPayment(t: SubscriptionTransfer): Promise<PaymentRow> {
  const client = sb()
  const safe = t.proof.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-60) || 'proof'
  const path = `${t.parentId}/${crypto.randomUUID()}-${safe}`
  const up = await client.storage.from('payment-proofs')
    .upload(path, t.proof, { contentType: t.proof.type || undefined, upsert: false })
  if (up.error) throw up.error

  const { data, error } = await client.rpc('file_subscription_payment', {
    p_student: t.studentId,
    p_plan: t.plan,
    p_method: t.method,
    p_amount: Math.round(t.amountEgp),
    p_proof: up.data.path,
    p_sender_ref: t.senderRef?.trim() ?? '',
    p_note: t.note?.trim() || null,
    p_track: t.trackId ?? null,
  })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) as PaymentRow
}

/** How many transfers are still waiting to be checked — for the rail badge.
 *  A kit is born already approved (the wallet was checked on the way in), so
 *  it never shows here; `owedKitCount` in `products.ts` is its own count. */
export async function pendingPaymentCount(): Promise<number> {
  if (!backendLive) return 0
  const { count, error } = await sb().from('payments')
    .select('id', { count: 'exact', head: true }).eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

/* ---------------- where families send the money ---------------- */

export async function fetchPayAccountsAdmin(): Promise<PayAccountsRow> {
  if (!backendLive) return demoPay.accounts()
  const { data, error } = await sb().from('pay_accounts').select('*').maybeSingle()
  if (error) throw error
  return (data ?? {
    id: true, instapay_handle: '', vodafone_number: '', instructions: '', updated_at: '',
  }) as PayAccountsRow
}

/** A patch, not the whole row: a QR code is saved on its own, the moment
 *  the file lands, while the text fields wait for the Save button. */
export type PayAccountsPatch = Partial<Omit<PayAccountsRow, 'id' | 'updated_at'>>

export async function savePayAccounts(patch: PayAccountsPatch): Promise<PayAccountsRow> {
  if (!backendLive) return demoPay.saveAccounts(patch)
  const { data, error } = await sb().from('pay_accounts')
    .update(patch).eq('id', true).select('*').single()
  if (error) throw error
  return data as PayAccountsRow
}
