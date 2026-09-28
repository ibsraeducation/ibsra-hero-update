/* ==========================================================================
   Sign-in state, driven by Supabase Auth.

   With no backend configured the app is the local demo (`status: 'demo'`)
   and nothing here runs. Otherwise every auth event is handled in order:
   a session loads the person's profile and enrolments, sets the store's
   role, starts the sync and loads their data; no session clears it all.
   ========================================================================== */

import type { Session as AuthSession } from '@supabase/supabase-js'
import { backendLive, supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/authStore'
import { useStore } from '@/lib/store'
import { flushAndStop, hydrate, resetLiveData, startSync } from '@/lib/sync'
import { retryClockSkew, toMessage } from '@/lib/api/errors'
import { DEV_ACCOUNTS } from '@/lib/devAccounts'
import type { EnrollmentRow, ProfileRow } from '@/lib/api/rows'

export { useAuthStore as useAuth } from '@/lib/authStore'

let started = false
let currentUserId: string | null = null
let chain: Promise<void> = Promise.resolve()

/* Right after sign-in the new token can reach a server whose clock is a second
   behind ("JWT issued at future"), so these first reads wait and retry. */
function loadIdentity(userId: string) {
  return retryClockSkew(async () => {
    const client = supabase!
    const [profile, enrollments] = await Promise.all([
      client.from('profiles').select('*').eq('id', userId).maybeSingle(),
      client.from('enrollments').select('*').eq('student_id', userId),
    ])
    if (profile.error) throw profile.error
    if (enrollments.error) throw enrollments.error
    return {
      profile: profile.data as ProfileRow | null,
      enrollments: (enrollments.data ?? []) as EnrollmentRow[],
    }
  })
}

/* Dev only, and only when `.env.local` names the accounts: land signed in
   as the first of them instead of on the sign-in screen, so the top-bar
   tabs are there from the first paint. The list is empty in a production
   build, so this never fires there. See src/lib/devAccounts.ts. */
let devTried = false
function devAutoSignIn() {
  if (devTried || !DEV_ACCOUNTS.length) return
  devTried = true
  const first = DEV_ACCOUNTS[0]
  void supabase!.auth.signInWithPassword({ email: first.email, password: first.password })
    .then(({ error }) => {
      if (error) console.warn('[dev] could not sign in as', first.email, '—', error.message)
    })
}

async function onSession(session: AuthSession | null) {
  if (!session) {
    devAutoSignIn()
    if (currentUserId) {
      currentUserId = null
      await flushAndStop()
      resetLiveData()
    }
    useAuthStore.setState({ status: 'signed-out', session: null, profile: null, enrollments: [] })
    return
  }

  // Token refresh or a password change: same person, nothing to reload.
  if (session.user.id === currentUserId) {
    useAuthStore.setState({ session })
    return
  }

  if (currentUserId) {
    await flushAndStop()
    resetLiveData()
  }
  currentUserId = session.user.id
  useAuthStore.setState({ status: 'loading', session })

  try {
    const { profile, enrollments } = await loadIdentity(session.user.id)
    if (!profile || profile.disabled) {
      currentUserId = null
      useAuthStore.setState({
        notice: profile?.disabled
          ? 'Your account is paused. Ask your admin.'
          : 'This account has no access yet. Ask your admin.',
      })
      await supabase!.auth.signOut({ scope: 'local' })
      return
    }
    useStore.setState({ role: profile.role })
    useAuthStore.setState({ status: 'ready', session, profile, enrollments, notice: null })
    startSync(profile.role)
    void hydrate(profile.role)
  } catch (e) {
    currentUserId = null
    useAuthStore.setState({ status: 'signed-out', session: null, profile: null, enrollments: [], notice: toMessage(e) })
  }
}

/** Start listening to auth. Called once, before the first render. */
export function initAuth() {
  if (started) return
  started = true
  if (!backendLive || !supabase) {
    useAuthStore.setState({ status: 'demo' })
    return
  }
  supabase.auth.onAuthStateChange((event, session) => {
    /* Deferred: calling Supabase from inside this callback can deadlock the
       auth client, and events must be handled one at a time, in order. */
    window.setTimeout(() => {
      /* A reset-password link signs the browser in before this fires — set
         the flag first, so by the time onSession loads the profile and
         lands somewhere, Login and ChangePassword already know why. */
      if (event === 'PASSWORD_RECOVERY') useAuthStore.setState({ recovery: true })
      chain = chain.then(() => onSession(session)).catch(err => console.error('[auth]', err))
    }, 0)
  })
}

/** Re-read the signed-in person's profile and enrolments. */
export async function refreshIdentity() {
  const userId = useAuthStore.getState().profile?.id
  if (!userId) return
  const { profile, enrollments } = await loadIdentity(userId)
  if (profile) useAuthStore.setState({ profile, enrollments })
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Backend is not configured'
  useAuthStore.setState({ notice: null })
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (!error) return null
  const msg = error.message ?? ''
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.'
  if (/banned/i.test(msg)) return 'Your account is paused. Ask your admin.'
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a minute and try again.'
  return toMessage(error)
}

export async function signOut() {
  if (!supabase) return
  await flushAndStop()
  await supabase.auth.signOut({ scope: 'local' })
}

/** Send a reset link. Always answers the same way whether or not the email
 *  belongs to an account — a login form is not the place to say which
 *  emails exist. Only a parent has one of these: a student's and the
 *  admin's own passwords are reset by hand (Admin → Students, My Heroes). */
export async function resetPassword(email: string): Promise<string | null> {
  if (!supabase) return 'Backend is not configured'
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/account/password`,
  })
  if (error && !/rate limit|too many/i.test(error.message ?? '')) {
    /* Anything else is worth surfacing — a malformed address, a dead
       backend — the neutral wording above is only for "no such account". */
    return toMessage(error)
  }
  return null
}

export async function changePassword(password: string): Promise<string | null> {
  if (!supabase) return 'Backend is not configured'
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    const msg = error.message ?? ''
    if (/should be different|same/i.test(msg)) return 'Choose a password different from the temporary one.'
    if (/weak|at least|characters/i.test(msg)) return 'That password is too weak. Use at least 8 characters.'
    return toMessage(error)
  }
  const { error: rpcErr } = await supabase.rpc('password_changed')
  if (rpcErr) return toMessage(rpcErr)
  useAuthStore.setState({ recovery: false })
  await refreshIdentity()
  return null
}
