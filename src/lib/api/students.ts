/* ==========================================================================
   Student accounts, for the admin's Students page. Anything that touches
   the login itself (create, email, password, disable, delete) goes through
   the `admin-users` Edge Function; profile details and course enrolments
   are plain admin writes under RLS.
   ========================================================================== */

import { FunctionsHttpError } from '@supabase/supabase-js'
import { sb } from '@/lib/supabase'
import type { EnrollmentRow, EnrollmentStatus, ProfileRow } from './rows'

/** The parent account a student hangs off. A child a family added has one;
 *  a student the admin created directly has none. */
export interface Guardian {
  id: string
  name: string
  email: string
  phone: string | null
  /** Where this family is — a country code from lib/region, or null when
   *  nobody has said. The enrol form asks for it; an admin corrects it. */
  region: string | null
  created_at: string
  disabled: boolean
}

/** Where a family is, as the admin keeps it: everyone named moves at once,
 *  because a parent and their heroes live in the same house. */
export async function setFamilyRegion(
  ids: Array<string | null | undefined>, region: string | null,
): Promise<void> {
  const list = [...new Set(ids.filter((x): x is string => !!x))]
  if (!list.length) return
  const { error } = await sb().from('profiles')
    .update({ region: region || null }).in('id', list)
  if (error) throw error
}

export interface StudentRow extends ProfileRow {
  enrollments: Array<Pick<EnrollmentRow, 'loop_id' | 'status' | 'enrolled_at'>>
  /** Empty when nobody claims them. Oldest link first. */
  parents: Guardian[]
}

export async function listStudents(): Promise<StudentRow[]> {
  const client = sb()
  const [people, links] = await Promise.all([
    client
      .from('profiles')
      .select('*, enrollments!enrollments_student_id_fkey(loop_id, status, enrolled_at)')
      .eq('role', 'student')
      .order('created_at', { ascending: false }),
    client
      .from('guardians')
      .select('student_id, parent:profiles!guardians_parent_id_fkey (id, name, email, phone, region, created_at, disabled)')
      .order('created_at'),
  ])
  if (people.error) throw people.error
  if (links.error) throw links.error

  type Link = { student_id: string; parent: Guardian | null }
  const byStudent = new Map<string, Guardian[]>()
  for (const l of (links.data ?? []) as unknown as Link[]) {
    if (!l.parent) continue
    const got = byStudent.get(l.student_id)
    if (got) got.push(l.parent)
    else byStudent.set(l.student_id, [l.parent])
  }

  return ((people.data ?? []) as Array<Omit<StudentRow, 'parents'>>)
    .map(s => ({ ...s, parents: byStudent.get(s.id) ?? [] }))
}

/** Every family account, for the picker that links a student to one. */
export async function listParents(): Promise<Guardian[]> {
  const { data, error } = await sb()
    .from('profiles')
    .select('id, name, email, phone, region, created_at, disabled')
    .eq('role', 'parent')
    .order('name')
  if (error) throw error
  return (data ?? []) as Guardian[]
}

/** Put a student on a family's account. A student a family added is linked
 *  already; this is for the ones the admin created, who otherwise belong to
 *  nobody — no subscription can be bought for them and no access asked for. */
export async function linkGuardian(parentId: string, studentId: string) {
  const { error } = await sb().from('guardians')
    .upsert({ parent_id: parentId, student_id: studentId }, { onConflict: 'parent_id,student_id' })
  if (error) throw error
}

export async function unlinkGuardian(parentId: string, studentId: string) {
  const { error } = await sb().from('guardians').delete()
    .eq('parent_id', parentId).eq('student_id', studentId)
  if (error) throw error
}

export type AdminUsersAction =
  | { action: 'create_student'; email: string; password: string; name: string; age?: number | null; phone?: string | null; loop_id?: string | null }
  | { action: 'set_email'; user_id: string; email: string }
  | { action: 'reset_password'; user_id: string; password: string }
  | { action: 'set_disabled'; user_id: string; disabled: boolean }
  | { action: 'delete_student'; user_id: string }
  | { action: 'list_auth_meta' }

export class AdminUsersError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

export async function adminUsers<T = { ok: true }>(body: AdminUsersAction): Promise<T> {
  const { data, error } = await sb().functions.invoke('admin-users', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null) as { error?: { code: string; message: string } } | null
      if (payload?.error) throw new AdminUsersError(payload.error.code, payload.error.message)
    }
    throw new AdminUsersError('network', "Can't reach the server. Check the connection and try again.")
  }
  return data as T
}

export interface AuthMeta { id: string; last_sign_in_at: string | null; banned_until: string | null }

export async function authMeta(): Promise<Record<string, AuthMeta>> {
  const { users } = await adminUsers<{ users: AuthMeta[] }>({ action: 'list_auth_meta' })
  return Object.fromEntries(users.map(u => [u.id, u]))
}

export async function updateStudentProfile(id: string, patch: { name?: string; age?: number | null; phone?: string | null }) {
  const { error } = await sb().from('profiles').update(patch).eq('id', id)
  if (error) throw error
}

export async function enrol(studentId: string, loopId: string, adminId: string) {
  const { error } = await sb().from('enrollments').upsert(
    { student_id: studentId, loop_id: loopId, status: 'active', enrolled_by: adminId },
    { onConflict: 'student_id,loop_id' },
  )
  if (error) throw error
}

export async function setEnrollmentStatus(studentId: string, loopId: string, status: EnrollmentStatus) {
  const { error } = await sb().from('enrollments').update({ status })
    .eq('student_id', studentId).eq('loop_id', loopId)
  if (error) throw error
}

export async function unenrol(studentId: string, loopId: string) {
  const { error } = await sb().from('enrollments').delete()
    .eq('student_id', studentId).eq('loop_id', loopId)
  if (error) throw error
}
