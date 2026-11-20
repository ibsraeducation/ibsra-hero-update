/* ==========================================================================
   Promo codes: a code that opens a course, or every course of a program,
   for free.

   The admin writes them and decides whether and when each one expires; a
   family redeems one for a hero on their own account. Redeeming is an RPC,
   because it is the enrolment and the browser cannot be trusted to write
   that (see the promo_codes migration).
   ========================================================================== */

import { sb } from '@/lib/supabase'

export interface PromoRow {
  id: string
  code: string
  track_id: string | null
  loop_id: string | null
  active: boolean
  /** null means it never expires. */
  expires_at: string | null
  redeemed_count: number
  created_at: string
}

export async function listPromos(): Promise<PromoRow[]> {
  const { data, error } = await sb().from('promo_codes').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PromoRow[]
}

export async function createPromo(p: {
  code: string; trackId?: string; loopId?: string; expiresAt: string | null
}): Promise<void> {
  const { error } = await sb().from('promo_codes').insert({
    code: normalizeCode(p.code),
    track_id: p.trackId ?? null,
    loop_id: p.loopId ?? null,
    expires_at: p.expiresAt,
  })
  if (error) throw error
}

export async function updatePromo(
  id: string, patch: Partial<Pick<PromoRow, 'active' | 'expires_at'>>,
): Promise<void> {
  const { error } = await sb().from('promo_codes').update(patch).eq('id', id)
  if (error) throw error
}

export async function deletePromo(id: string): Promise<void> {
  const { error } = await sb().from('promo_codes').delete().eq('id', id)
  if (error) throw error
}

export async function redeemPromo(code: string, studentId: string): Promise<number> {
  const { data, error } = await sb().rpc('redeem_promo', { p_code: normalizeCode(code), p_student: studentId })
  if (error) throw error
  return Number((data as { courses?: number } | null)?.courses ?? 0)
}

export const normalizeCode = (v: string) => v.trim().toUpperCase()

/** Letters and digits with nothing easy to misread: no 0/O or 1/I. */
export function generateCode(len = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}

export const validCode = (v: string) => /^[A-Z0-9_-]{3,32}$/.test(normalizeCode(v))

/** A code a family can still use: switched on and not past its date. */
export const promoLive = (p: Pick<PromoRow, 'active' | 'expires_at'>, now = Date.now()) =>
  p.active && (!p.expires_at || new Date(p.expires_at).getTime() > now)
