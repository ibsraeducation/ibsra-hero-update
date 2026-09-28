import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AlertTriangle, Info, KeyRound } from 'lucide-react'
import { backendLive } from '@/lib/supabase'
import { changePassword, signOut, useAuth } from '@/lib/auth'
import { HOME } from '@/lib/routeAccess'
import { useGoBackOr } from '@/lib/backNav'
import { BootScreen } from '@/components/auth/BootScreen'
import './auth.css'

export function ChangePassword() {
  const status = useAuth(s => s.status)
  const profile = useAuth(s => s.profile)
  const recovery = useAuth(s => s.recovery)
  const nav = useNavigate()
  const goBackOr = useGoBackOr()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!backendLive) return <Navigate to="/" replace />
  if (status === 'loading') return <BootScreen />
  if (status !== 'ready' || !profile) return <Navigate to="/login?next=/account/password" replace />

  const forced = profile.must_change_password
  /* A reset link and a temporary password land here for the same reason —
     the old password is done — so the page reads the same way for both.
     Recovery is checked second: a temporary password the admin set takes
     the wording, since must_change_password is the state that actually
     blocks every other route. */
  const openedBySomeoneElse = forced || recovery

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Use at least 8 characters.'); return }
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    setBusy(true)
    setError(null)
    const err = await changePassword(password)
    setBusy(false)
    if (err) { setError(err); return }
    nav(HOME[profile.role], { replace: true })
  }

  return (
    <div className="auth-screen">
      <div className="card auth-card">
        <div className="auth-brand">
          <div className="rail-mark">IH</div>
          <div className="stack" style={{ lineHeight: 1.25 }}>
            <span className="t-md w-sb">
              {forced ? 'Choose your own password' : recovery ? 'Choose a new password' : 'Change password'}
            </span>
            <span className="t-xs c-muted2">{profile.email}</span>
          </div>
        </div>

        {forced && !error && (
          <div className="auth-alert info" role="status">
            <Info /><span>You signed in with a temporary password. Pick a new one only you know.</span>
          </div>
        )}
        {!forced && recovery && !error && (
          <div className="auth-alert info" role="status">
            <Info /><span>You opened a reset link — pick a new password.</span>
          </div>
        )}
        {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}

        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="field">
            <label className="label" htmlFor="pw-new">New password</label>
            <input id="pw-new" className="inp" type="password" autoComplete="new-password" autoFocus
              value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
            <span className="hint">At least 8 characters.</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="pw-confirm">Type it again</label>
            <input id="pw-confirm" className="inp" type="password" autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} />
          </div>
          <button type="submit" className="btn primary block lg" disabled={busy}>
            <KeyRound />{busy ? 'Saving…' : 'Save password'}
          </button>
        </form>

        <p className="auth-foot">
          {openedBySomeoneElse
            ? <button className="btn ghost sm" onClick={() => void signOut()}>Sign out</button>
            : <Link to={HOME[profile.role]}
                onClick={e => { e.preventDefault(); goBackOr(HOME[profile.role]) }}>Back</Link>}
        </p>
      </div>
    </div>
  )
}
