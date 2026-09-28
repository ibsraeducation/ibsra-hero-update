/* ==========================================================================
   The parent side of the backend.

   A parent account signs itself up and adds its children — everything that
   creates a login goes through the `parent-users` Edge Function. Money has
   one door: the wallet (`src/lib/api/wallet.ts`), charged by a filed
   transfer and spent on the months. Nothing here buys a course — a program
   or a course is asked for in the Marketplace (`src/lib/api/requests.ts`)
   and opened by the admin. What is left in this file is reading the
   catalogue, the children on the account and the family's own payment
   history, all plain rows under RLS.
   ========================================================================== */

import { FunctionsHttpError } from '@supabase/supabase-js'
import { backendLive, sb } from '@/lib/supabase'
import { useAuthStore } from '@/lib/authStore'
import { demoPay } from './demoPay'
import type { EnrollmentRow, GuardianChild, PayAccountsRow, PaymentRow, ProfileRow } from './rows'

/* ---------------- accounts (the Edge Function) ---------------- */

export type ParentUsersAction =
  | { action: 'signup'; name: string; email: string; password: string; phone?: string | null }
  | {
      action: 'add_child'; name: string; email: string; password: string
      age?: number | null; phone?: string | null
      national_id?: string | null; whatsapp?: string | null
      first_name?: string | null; second_name?: string | null; last_name?: string | null
    }
  | { action: 'reset_child_password'; user_id: string; password: string }
  | {
      action: 'update_child'; user_id: string; name: string; age: number; phone: string; email?: string
      national_id?: string | null; whatsapp?: string | null
      first_name?: string | null; second_name?: string | null; last_name?: string | null
    }
  | { action: 'remove_child'; user_id: string }

export class ParentUsersError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

export async function parentUsers<T = { ok: true }>(body: ParentUsersAction): Promise<T> {
  const { data, error } = await sb().functions.invoke('parent-users', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null) as
        { error?: { code: string; message: string } } | null
      if (payload?.error) throw new ParentUsersError(payload.error.code, payload.error.message)
    }
    throw new ParentUsersError('network', "Can't reach the server. Check the connection and try again.")
  }
  return data as T
}

/** Make the family's own account. The caller signs in with it afterwards. */
export const signUpParent = (name: string, email: string, password: string, phone?: string | null) =>
  parentUsers<{ profile: ProfileRow }>({ action: 'signup', name, email, password, phone })

/** Add one child: a student login the parent chooses the password for.
 *
 *  The national ID carries the birth date, so a child added with one is
 *  never asked for an age as well — the server reads it out of the digits.
 *  Without one, `age` is still required, which is how the older form and
 *  the admin's own still work. */
export const addChild = (child: {
  name: string; email: string; password: string; phone: string
  age?: number
  nationalId?: string
  whatsapp?: string
  firstName?: string
  secondName?: string
  lastName?: string
}) => parentUsers<{ profile: ProfileRow }>({
  action: 'add_child',
  name: child.name, email: child.email, password: child.password, phone: child.phone,
  age: child.age ?? null,
  national_id: child.nationalId ?? null,
  whatsapp: child.whatsapp ?? null,
  first_name: child.firstName ?? null,
  second_name: child.secondName ?? null,
  last_name: child.lastName ?? null,
})

export const resetChildPassword = (userId: string, password: string) =>
  parentUsers({ action: 'reset_child_password', user_id: userId, password })

/** Fix a typo, or a phone/email that changed. Age and phone stay required —
 *  it is still the record a mentor places and reaches the family through. */
export const updateChild = (userId: string, patch: {
  name: string; age: number; phone: string; email?: string
  national_id?: string | null; whatsapp?: string | null
  first_name?: string | null; second_name?: string | null; last_name?: string | null
}) => parentUsers<{ profile: ProfileRow }>({ action: 'update_child', user_id: userId, ...patch })

/** Take a child off the account. A child with money on it — a payment or a
 *  subscription — is paused and unlinked rather than erased, so its history
 *  survives on Admin → Students; a brand-new child is simply gone. */
export const removeChild = (userId: string) =>
  parentUsers<{ ok: true; mode: 'deleted' | 'paused' }>({ action: 'remove_child', user_id: userId })

/* ---------------- what a parent reads ---------------- */

/** The children on this account, newest last, with what they are enrolled in. */
export async function fetchChildren(): Promise<GuardianChild[]> {
  const client = sb()

  /* A student pays and asks for themself, so to every money page their
     "family" is the one account: their own. */
  const me = useAuthStore.getState().profile
  if (me?.role === 'student') {
    const [profile, enrollments] = await Promise.all([
      client.from('profiles').select('*').eq('id', me.id).single(),
      client.from('enrollments').select('*').eq('student_id', me.id),
    ])
    if (profile.error) throw profile.error
    if (enrollments.error) throw enrollments.error
    return [{ profile: profile.data as ProfileRow, enrollments: (enrollments.data ?? []) as EnrollmentRow[] }]
  }

  const links = await client.from('guardians').select('student_id, created_at').order('created_at')
  if (links.error) throw links.error
  const ids = (links.data ?? []).map(l => l.student_id as string)
  if (!ids.length) return []

  const [profiles, enrollments] = await Promise.all([
    client.from('profiles').select('*').in('id', ids),
    client.from('enrollments').select('*').in('student_id', ids),
  ])
  if (profiles.error) throw profiles.error
  if (enrollments.error) throw enrollments.error

  const byId = new Map((profiles.data ?? []).map(p => [p.id as string, p as ProfileRow]))
  const rows = (enrollments.data ?? []) as EnrollmentRow[]
  return ids
    .map(id => byId.get(id))
    .filter((p): p is ProfileRow => !!p)
    .map(p => ({ profile: p, enrollments: rows.filter(e => e.student_id === p.id) }))
}

/** One course of a program, as a family reads it. It is offered on its own
 *  only when the admin both listed it and gave it a price. */
export interface CourseOffer {
  id: string
  name: string
  index: number
  startDate: string
  endDate: string
  /** EGP for this course alone. Null means it is only sold with its program. */
  priceEgp: number | null
  listed: boolean
  /** Lectures a week for this course, 1 or 2 — what a family has to pick
   *  when they ask for it. The admin's answer, set on Programs. */
  lecturesPerWeek: number
}

export interface ProgramOffer {
  id: string
  name: string
  priceEgp: number | null
  /** The admin's switch in Material: false keeps it off the Marketplace. */
  listed: boolean
  /** Markdown, as the program form saved it. */
  technical: string
  personal: string
  market: string
  asset: string
  courses: CourseOffer[]
}

/** One entry per program in Material, with its courses. Work is not in it:
 *  a project is something a mentor puts a student on, never something bought.
 *  Whether each one is actually on sale is the admin's own switch, which
 *  travels with the row rather than being decided here. */
export async function fetchOffers(): Promise<ProgramOffer[]> {
  const client = sb()
  const [tracks, loops] = await Promise.all([
    client.from('tracks').select('*').order('created_at'),
    client.from('loops')
      .select('id, track_id, name, idx, start_date, end_date, listed, price_egp, lectures_per_week')
      .order('idx'),
  ])
  if (tracks.error) throw tracks.error
  if (loops.error) throw loops.error

  type L = {
    id: string; track_id: string; name: string; idx: number
    start_date: string; end_date: string; listed?: boolean; price_egp?: number | null
    lectures_per_week?: number
  }
  const courses = (loops.data ?? []) as L[]
  return (tracks.data ?? [])
    .filter(t => (t.area ?? 'material') !== 'work')
    .map(t => ({
      id: t.id as string,
      name: (t.name as string) || 'Untitled program',
      priceEgp: (t.price_egp as number | null) ?? null,
      listed: (t.listed as boolean | undefined) ?? true,
      technical: (t.technical_values as string) ?? '',
      personal: (t.personal_values as string) ?? '',
      market: (t.market_values as string) ?? '',
      asset: (t.asset_value as string) ?? '',
      courses: courses
        .filter(l => l.track_id === t.id)
        .map(l => ({
          id: l.id, name: l.name, index: l.idx,
          startDate: l.start_date, endDate: l.end_date,
          priceEgp: l.price_egp ?? null,
          listed: l.listed ?? true,
          lecturesPerWeek: l.lectures_per_week ?? 1,
        })),
    }))
}

/** Where the family sends the money — set by the admin. */
export async function fetchPayAccounts(): Promise<PayAccountsRow> {
  if (!backendLive) return demoPay.accounts()
  const { data, error } = await sb().from('pay_accounts').select('*').maybeSingle()
  if (error) throw error
  return (data ?? { id: true, instapay_handle: '', vodafone_number: '', instructions: '', updated_at: '' }) as PayAccountsRow
}

/** Every transfer this parent has filed, newest first. */
export async function fetchMyPayments(): Promise<PaymentRow[]> {
  /* The demo build has the same page, on the stand-in rows. */
  if (!backendLive) return demoPay.payments()
  const { data, error } = await sb().from('payments').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PaymentRow[]
}

/* ---------------- reading a filed transfer's proof ---------------- */

/** A short-lived link to a proof, for the person allowed to see it. */
export async function proofUrl(path: string, seconds = 120): Promise<string> {
  const { data, error } = await sb().storage.from('payment-proofs').createSignedUrl(path, seconds)
  if (error) throw error
  return data.signedUrl
}
