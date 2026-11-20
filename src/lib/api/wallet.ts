/* ==========================================================================
   The family wallet.

   Charging it is the transfer a family already knows how to make: they send
   the money by InstaPay or Vodafone Cash, file it here, and the admin
   approves it — the same queue as everything else, with the credit landing
   on the balance instead of opening a course.

   Spending it needs nobody: `pay_from_wallet` runs on the server, reads the
   price from the admin's own settings, takes it out of the balance, enrols
   the student and moves their paid-through date in one transaction. The
   browser never says what anything costs.

   There is a second way in, for when the admin is the one holding the money:
   `admin_credit_wallet` puts it straight on the balance and files the
   approved top-up that records it. Nothing to approve — the person approving
   would be the person adding.
   ========================================================================== */

import { backendLive, sb } from '@/lib/supabase'
import type { PayPlan } from '@/lib/billing'
import { demoPay } from './demoPay'
import type { PaymentRow, PayMethod, ProfileRow, WalletEntryRow, WalletRow } from './rows'

/** What this family has, in EGP. No row yet means an empty wallet. */
export async function fetchWallet(parentId: string): Promise<WalletRow> {
  const { data, error } = await sb()
    .from('wallets').select('*').eq('parent_id', parentId).maybeSingle()
  if (error) throw error
  return (data ?? { parent_id: parentId, balance_egp: 0, updated_at: '' }) as WalletRow
}

/** Every movement, newest first. */
export async function fetchWalletEntries(limit = 50): Promise<WalletEntryRow[]> {
  const { data, error } = await sb()
    .from('wallet_entries').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as WalletEntryRow[]
}

export interface TopUp {
  parentId: string
  amountEgp: number
  method: PayMethod
  senderRef: string
  note?: string
  proof?: File | null
}

const safeName = (name: string) =>
  name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-60) || 'proof'

/** File a transfer that charges the wallet. Pending until the admin checks
 *  it — the balance does not move before that. */
export async function chargeWallet(t: TopUp): Promise<PaymentRow> {
  const client = sb()
  let proofPath: string | null = null

  if (t.proof) {
    const path = `${t.parentId}/${crypto.randomUUID()}-${safeName(t.proof.name)}`
    const up = await client.storage.from('payment-proofs')
      .upload(path, t.proof, { contentType: t.proof.type || undefined, upsert: false })
    if (up.error) throw up.error
    proofPath = up.data.path
  }

  const { data, error } = await client.from('payments').insert({
    parent_id: t.parentId,
    student_id: null,
    track_id: null,
    plan: null,
    kind: 'topup',
    program_name: 'Wallet top-up',
    amount_egp: t.amountEgp,
    method: t.method,
    sender_ref: t.senderRef,
    note: t.note || null,
    proof_path: proofPath,
  }).select('*').single()
  if (error) throw error
  return data as PaymentRow
}

/** Pay a subscription out of the balance. Nothing is enrolled here — what a
 *  student may open is asked for in the Marketplace and granted by the
 *  admin, never bought. The price is read from the server's own settings. */
export async function payFromWallet(studentId: string, plan: PayPlan, trackId?: string | null): Promise<PaymentRow> {
  const { data, error } = await sb().rpc('pay_from_wallet', {
    p_student: studentId,
    p_plan: plan,
    p_track: trackId ?? null,
    p_loop: null,
  })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) as PaymentRow
}

/* ---------------- the admin side ---------------- */

/** One wallet holder — a parent or a student, each has their own — with what
 *  is on it right now. Someone who never charged it has no row of their own
 *  and reads as an empty balance. */
export interface WalletOwner {
  owner: Pick<ProfileRow, 'id' | 'name' | 'email' | 'phone' | 'disabled' | 'created_at' | 'role'>
  balanceEgp: number
  updatedAt: string | null
}

/** Every parent and student and their balance, the fullest wallet first. Admin only —
 *  the read policy on `wallets` is what allows it. */
export async function listWallets(): Promise<WalletOwner[]> {
  if (!backendLive) return demoPay.wallets()
  const client = sb()
  const [people, wallets] = await Promise.all([
    client.from('profiles').select('id, name, email, phone, disabled, created_at, role')
      .in('role', ['parent', 'student']).order('name'),
    client.from('wallets').select('*'),
  ])
  if (people.error) throw people.error
  if (wallets.error) throw wallets.error

  const byId = new Map((wallets.data ?? []).map(w => [w.parent_id as string, w as WalletRow]))
  return ((people.data ?? []) as WalletOwner['owner'][])
    .map(owner => {
      const w = byId.get(owner.id)
      return { owner, balanceEgp: w?.balance_egp ?? 0, updatedAt: w?.updated_at ?? null }
    })
    .sort((a, b) => b.balanceEgp - a.balanceEgp || a.owner.name.localeCompare(b.owner.name))
}

/** Put money on a parent's or a student's wallet, as the admin. The owner
 *  gets a notification. Nothing waits: the credit
 *  and the approved top-up that records it are written together, and the
 *  family can spend it the moment this returns. */
export async function creditWallet(
  parentId: string, amountEgp: number, note?: string,
): Promise<PaymentRow> {
  if (!backendLive) return demoPay.creditWallet(parentId, amountEgp, note)
  const { data, error } = await sb().rpc('admin_credit_wallet', {
    p_parent: parentId,
    p_amount: Math.round(amountEgp),
    p_note: note?.trim() || null,
  })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) as PaymentRow
}

/** Every movement on one family's wallet, newest first. The parent's own
 *  page reads the same table without the filter — RLS gives them their own. */
export async function fetchWalletEntriesFor(parentId: string, limit = 50): Promise<WalletEntryRow[]> {
  if (!backendLive) return demoPay.walletEntries(parentId)
  const { data, error } = await sb()
    .from('wallet_entries').select('*').eq('parent_id', parentId)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as WalletEntryRow[]
}

/** The top-ups this family filed that are still waiting to be checked. */
export async function fetchPendingTopUps(): Promise<PaymentRow[]> {
  const { data, error } = await sb().from('payments')
    .select('*').eq('kind', 'topup').eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PaymentRow[]
}

/** Top-ups the admin rejected — with their reason, so the family knows why
 *  the balance did not move. */
export async function fetchRejectedTopUps(limit = 10): Promise<PaymentRow[]> {
  if (!backendLive) return []
  const { data, error } = await sb().from('payments')
    .select('*').eq('kind', 'topup').eq('status', 'rejected')
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as PaymentRow[]
}
