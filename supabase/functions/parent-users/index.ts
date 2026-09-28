// ==========================================================================
// parent-users — the family side of accounts.
//
// Jobs:
//   signup               a parent makes their own account (the one public
//                         action here)
//   add_child             a signed-in parent adds one of their children, with
//                         the password they choose for them, and is linked as
//                         its guardian
//   reset_child_password  the child forgot the password the parent gave them
//   update_child           edit a child's name, national ID, phone or email
//   remove_child           take a child off the family's account — deleted
//                         outright if there is no money history to keep, or
//                         paused and unlinked otherwise
//
// A child created here is an ordinary student account with no enrolments, so
// it opens nothing: a course reaches it only when an admin answers the
// family's request (answer_request), and only once they have a live
// subscription. Roles are never taken from the caller: signup always makes a
// parent, add_child always makes a student.
//
// Like admin-users, the platform JWT check is off (verify_jwt = false) —
// new projects use publishable/secret keys it does not understand — so the
// caller is verified in here instead.
// ==========================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BOOTSTRAP_ADMIN = 'ibsra.education@gmail.com'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/** One family, a sane number of children — a cheap brake on a runaway loop. */
const MAX_CHILDREN = 12

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function secretKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      if (parsed.default) return parsed.default
      const first = Object.values(parsed)[0]
      if (first) return first
    } catch { /* fall back to the legacy key */ }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!legacy) throw new HttpError(500, 'config', 'Server key is not configured')
  return legacy
}

/* ---------------- input checks ---------------- */

const str = (v: unknown, field: string, max: number, required = true): string | null => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new HttpError(400, 'invalid_input', `${field} is required`)
    return null
  }
  if (typeof v !== 'string') throw new HttpError(400, 'invalid_input', `${field} must be text`)
  const s = v.trim()
  if (required && !s) throw new HttpError(400, 'invalid_input', `${field} is required`)
  if (s.length > max) throw new HttpError(400, 'invalid_input', `${field} is too long`)
  return s || null
}

const email = (v: unknown) => {
  const e = str(v, 'Email', 254)!.toLowerCase()
  if (!EMAIL_RE.test(e)) throw new HttpError(400, 'invalid_input', 'Email is not valid')
  if (e === BOOTSTRAP_ADMIN) throw new HttpError(400, 'invalid_input', 'That email belongs to the admin account')
  return e
}

const password = (v: unknown) => {
  if (typeof v !== 'string' || v.length < 8) throw new HttpError(400, 'weak_password', 'Password must be at least 8 characters')
  if (v.length > 72) throw new HttpError(400, 'weak_password', 'Password must be at most 72 characters')
  return v
}

/* The Egyptian national ID: 14 digits carrying the birth date, which is
   where a child's age comes from when the family gave one. The check digit
   is not verified here either — see src/lib/nationalId.ts for why. */
const CENTURY: Record<string, number> = { '2': 1900, '3': 2000, '4': 2100 }

const nationalId = (v: unknown, required = false): string | null => {
  const raw = str(v, 'National ID', 20, required)
  if (!raw) return null
  const id = raw.replace(/s+/g, '')
  if (!/^[0-9]{14}$/.test(id)) {
    throw new HttpError(400, 'invalid_input', 'A national ID is 14 digits')
  }
  if (ageFromNationalId(id) === null) {
    throw new HttpError(400, 'invalid_input', 'That national ID does not carry a real birth date')
  }
  return id
}

function ageFromNationalId(id: string): number | null {
  const base = CENTURY[id[0]]
  if (!base) return null
  const year = base + Number(id.slice(1, 3))
  const month = Number(id.slice(3, 5))
  const day = Number(id.slice(5, 7))
  const born = new Date(Date.UTC(year, month - 1, day))
  if (born.getUTCFullYear() !== year || born.getUTCMonth() !== month - 1 || born.getUTCDate() !== day) return null
  const now = new Date()
  if (born.getTime() > now.getTime()) return null
  let years = now.getUTCFullYear() - year
  const had = now.getUTCMonth() + 1 > month || (now.getUTCMonth() + 1 === month && now.getUTCDate() >= day)
  if (!had) years -= 1
  return years >= 0 && years <= 120 ? years : null
}

const age = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n < 8 || n > 99) {
    throw new HttpError(400, 'invalid_input', 'Age must be a whole number between 8 and 99')
  }
  return n
}

/* A national ID belongs to one person, and the unique index says so. The
   raw constraint name is not a sentence a parent can act on. */
function dbError(err: { message?: string; code?: string }): never {
  if (err.code === '23505' && /national_id/.test(err.message ?? '')) {
    throw new HttpError(409, 'national_id_taken', 'That national ID is already on a student here')
  }
  if (err.code === '23514' && /national_id/.test(err.message ?? '')) {
    throw new HttpError(400, 'invalid_input', 'A national ID is 14 digits')
  }
  throw new HttpError(500, 'db', err.message ?? 'Database error')
}

function authError(err: { message?: string; code?: string; status?: number }): never {
  const code = err.code ?? ''
  if (code === 'email_exists' || /already (been )?registered|already exists/i.test(err.message ?? '')) {
    throw new HttpError(409, 'email_exists', 'An account with this email already exists')
  }
  if (code === 'weak_password') throw new HttpError(400, 'weak_password', err.message ?? 'Password is too weak')
  throw new HttpError(
    err.status && err.status >= 400 && err.status < 500 ? err.status : 500,
    code || 'auth',
    err.message ?? 'Auth error',
  )
}

/** The signed-in caller, which must be an enabled parent. */
async function requireParent(admin: SupabaseClient, req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'unauthorized', 'Sign in first')
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData.user) throw new HttpError(401, 'unauthorized', 'Session expired — sign in again')
  const { data: caller } = await admin.from('profiles')
    .select('id, role, disabled').eq('id', userData.user.id).maybeSingle()
  if (!caller || caller.role !== 'parent' || caller.disabled) {
    throw new HttpError(403, 'forbidden', 'Parents only')
  }
  return caller as { id: string; role: string; disabled: boolean }
}

/* ---------------- handler ---------------- */

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: { code: 'method', message: 'POST only' } })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    if (!url) throw new HttpError(500, 'config', 'SUPABASE_URL is not configured')
    const admin = createClient(url, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } })

    const body = await req.json().catch(() => { throw new HttpError(400, 'invalid_input', 'Body must be JSON') })
    const action = body?.action

    switch (action) {
      /* The public one: a family makes its own account. The role is not read
         from the request — a sign-up is a parent, full stop. */
      case 'signup': {
        const e = email(body.email)
        const pw = password(body.password)
        const name = str(body.name, 'Name', 120)!
        const phone = str(body.phone, 'Phone', 32, false)

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: e,
          password: pw,
          email_confirm: true,
          user_metadata: { name, phone: phone ?? '', account: 'parent' },
          app_metadata: { role: 'parent', created_by: 'parent-signup' },
        })
        if (createErr || !created.user) authError(createErr ?? { message: 'Could not create the account' })
        const id = created.user.id

        // The trigger writes the profile; make sure it really is a parent.
        const { data: profile, error: pErr } = await admin.from('profiles')
          .update({ name, phone, disabled: false, must_change_password: false, role: 'parent' })
          .eq('id', id).select('*').single()
        if (pErr) {
          await admin.auth.admin.deleteUser(id)
          throw new HttpError(500, 'db', pErr.message)
        }
        return json(200, { profile })
      }

      /* A parent adds their child: a student account with the password the
         parent chose, linked to them. It opens nothing on its own. */
      case 'add_child': {
        const parent = await requireParent(admin, req)
        const e = email(body.email)
        const pw = password(body.password)
        const name = str(body.name, 'Name', 120)!
        /* A child is a real student the mentor has to place and reach, so
           both of these are asked for, not optional. */
        /* The national ID already says when the child was born, so a family
           that gave one is not asked for the age as well. */
        const nid = nationalId(body.national_id)
        const a = nid ? ageFromNationalId(nid) : age(body.age)
        if (a === null) throw new HttpError(400, 'invalid_input', 'Age is required')
        const phone = str(body.phone, 'Phone', 32)!
        const whatsapp = str(body.whatsapp, 'WhatsApp number', 32, false) ?? phone
        const first = str(body.first_name, 'First name', 60, false)
        const second = str(body.second_name, 'Second name', 60, false)
        const last = str(body.last_name, 'Last name', 60, false)

        const { count, error: countErr } = await admin.from('guardians')
          .select('student_id', { count: 'exact', head: true }).eq('parent_id', parent.id)
        if (countErr) throw new HttpError(500, 'db', countErr.message)
        if ((count ?? 0) >= MAX_CHILDREN) {
          throw new HttpError(400, 'too_many', 'That is as many students as one account can hold. Ask the admin.')
        }

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: e,
          password: pw,
          email_confirm: true,
          user_metadata: { name },
          app_metadata: { role: 'student', created_by: 'parent-users' },
        })
        if (createErr || !created.user) authError(createErr ?? { message: 'Could not create the account' })
        const id = created.user.id

        try {
          const { error: pErr } = await admin.from('profiles')
            .update({
              name, age: a, phone, role: 'student', disabled: false, must_change_password: false,
              national_id: nid, whatsapp,
              first_name: first, second_name: second, last_name: last,
            })
            .eq('id', id)
          if (pErr) dbError(pErr)
          const { error: gErr } = await admin.from('guardians')
            .insert({ parent_id: parent.id, student_id: id })
          if (gErr) throw new HttpError(500, 'db', gErr.message)
        } catch (err) {
          await admin.auth.admin.deleteUser(id)
          throw err
        }

        const { data: profile } = await admin.from('profiles').select('*').eq('id', id).single()
        return json(200, { profile })
      }

      /* The child forgot the password the parent gave them. */
      case 'reset_child_password': {
        const parent = await requireParent(admin, req)
        const childId = str(body.user_id, 'Student', 64)!
        const pw = password(body.password)

        const { data: link } = await admin.from('guardians')
          .select('student_id').eq('parent_id', parent.id).eq('student_id', childId).maybeSingle()
        if (!link) throw new HttpError(403, 'forbidden', 'That student is not on your account')

        const { error } = await admin.auth.admin.updateUserById(childId, { password: pw })
        if (error) authError(error)
        const { error: pErr } = await admin.from('profiles')
          .update({ must_change_password: false }).eq('id', childId)
        if (pErr) throw new HttpError(500, 'db', pErr.message)
        return json(200, { ok: true })
      }

      /* Fixing a typo, or a phone/email that changed. Age and phone stay
         required, same as add_child — this is still the record a mentor
         places and reaches a family through. */
      case 'update_child': {
        const parent = await requireParent(admin, req)
        const childId = str(body.user_id, 'Student', 64)!
        const { data: link } = await admin.from('guardians')
          .select('student_id').eq('parent_id', parent.id).eq('student_id', childId).maybeSingle()
        if (!link) throw new HttpError(403, 'forbidden', 'That student is not on your account')

        const name = str(body.name, 'Name', 120)!
        const nid = nationalId(body.national_id)
        const a = nid ? ageFromNationalId(nid) : age(body.age)
        if (a === null) throw new HttpError(400, 'invalid_input', 'Age is required')
        const phone = str(body.phone, 'Phone', 32)!
        const newEmail = body.email !== undefined ? email(body.email) : null

        if (newEmail) {
          const { error } = await admin.auth.admin.updateUserById(childId, { email: newEmail, email_confirm: true })
          if (error) authError(error)
        }
        const patch: Record<string, unknown> = { name, age: a, phone }
        if (newEmail) patch.email = newEmail
        /* Left out of the form, left alone on the record. */
        if (nid) patch.national_id = nid
        if (body.whatsapp !== undefined) patch.whatsapp = str(body.whatsapp, 'WhatsApp number', 32, false)
        if (body.first_name !== undefined) patch.first_name = str(body.first_name, 'First name', 60, false)
        if (body.second_name !== undefined) patch.second_name = str(body.second_name, 'Second name', 60, false)
        if (body.last_name !== undefined) patch.last_name = str(body.last_name, 'Last name', 60, false)
        const { data: profile, error: pErr } = await admin.from('profiles')
          .update(patch).eq('id', childId).select('*').single()
        if (pErr) dbError(pErr)
        return json(200, { profile })
      }

      /* Taking a child off the account. A record with money on it — a
         payment or a subscription — is never erased: it is paused and
         unlinked, so the admin still has it and can relink it. A child with
         no history yet is simply gone. */
      case 'remove_child': {
        const parent = await requireParent(admin, req)
        const childId = str(body.user_id, 'Student', 64)!
        const { data: link } = await admin.from('guardians')
          .select('student_id').eq('parent_id', parent.id).eq('student_id', childId).maybeSingle()
        if (!link) throw new HttpError(403, 'forbidden', 'That student is not on your account')

        const [{ count: payCount, error: payErr }, { count: subCount, error: subErr }] = await Promise.all([
          admin.from('payments').select('id', { count: 'exact', head: true }).eq('student_id', childId),
          admin.from('subscriptions').select('student_id', { count: 'exact', head: true }).eq('student_id', childId),
        ])
        if (payErr) throw new HttpError(500, 'db', payErr.message)
        if (subErr) throw new HttpError(500, 'db', subErr.message)

        if ((payCount ?? 0) === 0 && (subCount ?? 0) === 0) {
          const { error } = await admin.auth.admin.deleteUser(childId)
          if (error) authError(error)
          return json(200, { ok: true, mode: 'deleted' })
        }

        const { error: pErr } = await admin.from('profiles').update({ disabled: true }).eq('id', childId)
        if (pErr) throw new HttpError(500, 'db', pErr.message)
        const { error: gErr } = await admin.from('guardians')
          .delete().eq('parent_id', parent.id).eq('student_id', childId)
        if (gErr) throw new HttpError(500, 'db', gErr.message)
        return json(200, { ok: true, mode: 'paused' })
      }

      default:
        throw new HttpError(400, 'invalid_input', 'Unknown action')
    }
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: { code: err.code, message: err.message } })
    console.error(err)
    return json(500, { error: { code: 'server', message: 'Something went wrong on the server' } })
  }
})
