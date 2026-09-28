// ==========================================================================
// admin-users — the only way a student account is created or changed.
//
// Called from the admin's Students page with the admin's own session token.
// The platform JWT check is off (verify_jwt = false) because new projects use
// publishable/secret keys it does not understand; the caller is verified here
// instead: a valid session whose profile is an enabled admin. It never acts
// on an admin account, and has no action that changes anyone's role.
// ==========================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BOOTSTRAP_ADMIN = 'ibsra.education@gmail.com'
const BAN_FOREVER = '876000h'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

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

const age = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n < 8 || n > 99) throw new HttpError(400, 'invalid_input', 'Age must be a whole number between 8 and 99')
  return n
}

const uuid = (v: unknown) => {
  if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v)) throw new HttpError(400, 'invalid_input', 'user_id is not valid')
  return v
}

/* ---------------- helpers ---------------- */

async function requireStudent(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.from('profiles').select('id, role').eq('id', userId).maybeSingle()
  if (error) throw new HttpError(500, 'db', error.message)
  if (!data) throw new HttpError(404, 'not_found', 'Student not found')
  if (data.role !== 'student') throw new HttpError(403, 'forbidden', 'Only student accounts can be changed here')
}

function authError(err: { message?: string; code?: string; status?: number }): never {
  const code = err.code ?? ''
  if (code === 'email_exists' || /already (been )?registered|already exists/i.test(err.message ?? '')) {
    throw new HttpError(409, 'email_exists', 'An account with this email already exists')
  }
  if (code === 'weak_password') throw new HttpError(400, 'weak_password', err.message ?? 'Password is too weak')
  throw new HttpError(err.status && err.status >= 400 && err.status < 500 ? err.status : 500, code || 'auth', err.message ?? 'Auth error')
}

async function listFolder(admin: SupabaseClient, prefix: string, depth: number, out: string[]) {
  const { data, error } = await admin.storage.from('submissions').list(prefix, { limit: 1000 })
  if (error) throw new HttpError(500, 'storage', error.message)
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`
    // folders come back without an id
    if (item.id === null && depth > 0) await listFolder(admin, path, depth - 1, out)
    else if (item.id !== null) out.push(path)
  }
}

/* ---------------- handler ---------------- */

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: { code: 'method', message: 'POST only' } })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    if (!url) throw new HttpError(500, 'config', 'SUPABASE_URL is not configured')
    const admin = createClient(url, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } })

    // --- who is calling
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) throw new HttpError(401, 'unauthorized', 'Sign in first')
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData.user) throw new HttpError(401, 'unauthorized', 'Session expired — sign in again')
    const { data: caller } = await admin.from('profiles')
      .select('id, role, disabled').eq('id', userData.user.id).maybeSingle()
    if (!caller || caller.role !== 'admin' || caller.disabled) throw new HttpError(403, 'forbidden', 'Admins only')

    const body = await req.json().catch(() => { throw new HttpError(400, 'invalid_input', 'Body must be JSON') })
    const action = body?.action

    switch (action) {
      case 'create_student': {
        const e = email(body.email)
        const pw = password(body.password)
        const name = str(body.name, 'Name', 120)!
        const a = age(body.age)
        const phone = str(body.phone, 'Phone', 32, false)
        const loopId = str(body.loop_id, 'Course', 64, false)

        if (loopId) {
          const { data: loop } = await admin.from('loops').select('id').eq('id', loopId).maybeSingle()
          if (!loop) throw new HttpError(400, 'invalid_input', 'That course does not exist')
        }

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: e,
          password: pw,
          email_confirm: true,
          user_metadata: { name },
          app_metadata: { role: 'student', created_by: 'admin-users' },
        })
        if (createErr || !created.user) authError(createErr ?? { message: 'Could not create the account' })
        const id = created.user.id

        try {
          const { error: pErr } = await admin.from('profiles')
            .update({ name, age: a, phone, must_change_password: true, disabled: false })
            .eq('id', id)
          if (pErr) throw new HttpError(500, 'db', pErr.message)
          if (loopId) {
            const { error: eErr } = await admin.from('enrollments')
              .insert({ student_id: id, loop_id: loopId, enrolled_by: caller.id })
            if (eErr) throw new HttpError(500, 'db', eErr.message)
          }
        } catch (err) {
          await admin.auth.admin.deleteUser(id)
          throw err
        }

        const { data: profile } = await admin.from('profiles')
          .select('*, enrollments!enrollments_student_id_fkey(loop_id, status, enrolled_at)').eq('id', id).single()
        return json(200, { profile })
      }

      case 'set_email': {
        const id = uuid(body.user_id)
        const e = email(body.email)
        await requireStudent(admin, id)
        const { error } = await admin.auth.admin.updateUserById(id, { email: e, email_confirm: true })
        if (error) authError(error)
        return json(200, { ok: true })
      }

      case 'reset_password': {
        const id = uuid(body.user_id)
        const pw = password(body.password)
        await requireStudent(admin, id)
        const { error } = await admin.auth.admin.updateUserById(id, { password: pw })
        if (error) authError(error)
        const { error: pErr } = await admin.from('profiles').update({ must_change_password: true }).eq('id', id)
        if (pErr) throw new HttpError(500, 'db', pErr.message)
        return json(200, { ok: true })
      }

      case 'set_disabled': {
        const id = uuid(body.user_id)
        const disabled = body.disabled === true
        await requireStudent(admin, id)
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: disabled ? BAN_FOREVER : 'none' })
        if (error) authError(error)
        const { error: pErr } = await admin.from('profiles').update({ disabled }).eq('id', id)
        if (pErr) throw new HttpError(500, 'db', pErr.message)
        return json(200, { ok: true })
      }

      case 'delete_student': {
        const id = uuid(body.user_id)
        await requireStudent(admin, id)
        const files: string[] = []
        await listFolder(admin, id, 3, files)
        for (let i = 0; i < files.length; i += 100) {
          const { error } = await admin.storage.from('submissions').remove(files.slice(i, i + 100))
          if (error) throw new HttpError(500, 'storage', error.message)
        }
        const { error } = await admin.auth.admin.deleteUser(id)
        if (error) authError(error)
        return json(200, { ok: true, files_removed: files.length })
      }

      case 'list_auth_meta': {
        const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        if (error) authError(error)
        const users = data.users.map(u => ({
          id: u.id,
          last_sign_in_at: u.last_sign_in_at ?? null,
          banned_until: (u as { banned_until?: string | null }).banned_until ?? null,
        }))
        return json(200, { users })
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
