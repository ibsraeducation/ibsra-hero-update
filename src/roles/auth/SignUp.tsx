/* ==========================================================================
   The one page anybody can use without an account: a parent makes theirs.

   It creates a parent and nothing else — the role is decided on the server,
   not asked for here. Students are added afterwards, from inside the family
   pages, and a course opens only once a payment has been approved.
   ========================================================================== */

import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AlertTriangle, Eye, EyeOff, Loader2, UserPlus } from 'lucide-react'
import { backendLive } from '@/lib/supabase'
import { signIn, useAuth } from '@/lib/auth'
import { ParentUsersError, signUpParent } from '@/lib/api/family'
import { toMessage } from '@/lib/api/errors'
import { BootScreen } from '@/components/auth/BootScreen'
import './auth.css'

export function SignUp() {
  const status = useAuth(s => s.status)
  const profile = useAuth(s => s.profile)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!backendLive) return <Navigate to="/" replace />
  if (status === 'ready' && profile) return <Navigate to="/" replace />
  if (status === 'loading' && !busy) return <BootScreen />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) { setError('Your name and your email.'); return }
    if (password.length < 8) { setError('Choose a password of at least 8 characters.'); return }
    if (password !== confirm) { setError('The two passwords are not the same.'); return }
    setBusy(true)
    setError(null)
    try {
      await signUpParent(name.trim(), email.trim(), password, phone.trim() || null)
    } catch (err) {
      setError(err instanceof ParentUsersError ? err.message : toMessage(err))
      setBusy(false)
      return
    }
    /* Straight in: the account is ready, so sign in and let the auth
       listener take this page off the screen. */
    const signInError = await signIn(email, password)
    if (signInError) { setError(signInError); setBusy(false) }
  }

  return (
    <div className="auth-screen">
      <div className="card auth-card">
        <div className="auth-brand">
          <div className="rail-mark">IH</div>
          <div className="stack" style={{ lineHeight: 1.25 }}>
            <span className="t-md w-sb">IBSRA Heros</span>
            <span className="t-xs c-muted2">Create a parent account</span>
          </div>
        </div>

        {error && (
          <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>
        )}

        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="field">
            <label className="label" htmlFor="su-name">Your name</label>
            <input id="su-name" className="inp" autoComplete="name" autoFocus
              value={name} onChange={e => setName(e.target.value)} disabled={busy} />
          </div>
          <div className="field">
            <label className="label" htmlFor="su-email">Your email</label>
            <input id="su-email" className="inp" type="email" autoComplete="username"
              value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
          </div>
          <div className="field">
            <label className="label" htmlFor="su-phone">Phone</label>
            <input id="su-phone" className="inp" type="tel" autoComplete="tel" placeholder="Optional"
              value={phone} onChange={e => setPhone(e.target.value)} disabled={busy} />
          </div>
          <div className="field">
            <label className="label" htmlFor="su-pw">Password</label>
            <div className="auth-pw">
              <input id="su-pw" className="inp" type={show ? 'text' : 'password'}
                autoComplete="new-password" value={password}
                onChange={e => setPassword(e.target.value)} disabled={busy} />
              <button type="button" className="btn ghost icon sm" onClick={() => setShow(v => !v)}
                aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
            <span className="hint">At least 8 characters.</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="su-pw2">Confirm password</label>
            <div className="auth-pw">
              <input id="su-pw2" className="inp" type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password" value={confirm}
                onChange={e => setConfirm(e.target.value)} disabled={busy} />
              <button type="button" className="btn ghost icon sm" onClick={() => setShowConfirm(v => !v)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                {showConfirm ? <EyeOff /> : <Eye />}
              </button>
            </div>
            <span className="hint">
              {confirm && confirm !== password ? 'The two passwords are not the same.' : 'Type it again.'}
            </span>
          </div>
          <button type="submit" className="btn primary block lg" disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <UserPlus />}
            {busy ? 'Creating your account…' : 'Create my account'}
          </button>
        </form>

        <p className="auth-foot">
          This account is for you, the parent. You add your children on it, and a training program
          opens for them once your transfer is approved.
          <br />
          Already have one? <Link className="crumb-link" to="/login">Sign in</Link>.
        </p>
      </div>
    </div>
  )
}
