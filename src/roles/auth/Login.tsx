import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Eye, EyeOff, Info, LogIn, Mail, Send } from 'lucide-react'
import { backendLive } from '@/lib/supabase'
import { resetPassword, signIn, useAuth } from '@/lib/auth'
import { safeNext } from '@/lib/routeAccess'
import { BootScreen } from '@/components/auth/BootScreen'
import './auth.css'

/** The email-only form behind "Forgot password?". Only a parent's own
 *  password can be reset this way — a student's is reset by their parent on
 *  My Heroes, and the admin's own account is changed in the Supabase
 *  dashboard, so the copy on it says so rather than promising more. */
function ForgotPassword({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Enter the email on your family account.'); return }
    setBusy(true)
    setError(null)
    const err = await resetPassword(email)
    setBusy(false)
    if (err) { setError(err); return }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="auth-alert info" role="status">
        <Info />
        <span>
          If that email has a family account, a reset link is on its way. Open it on this
          device to choose a new password. <button type="button" className="crumb-link"
            style={{ background: 'none', border: 0, padding: 0 }} onClick={onDone}>Back to sign in</button>
        </span>
      </div>
    )
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}
      <div className="field">
        <label className="label" htmlFor="forgot-email">Your email</label>
        <input id="forgot-email" className="inp" type="email" autoComplete="username" autoFocus
          value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
      </div>
      <button type="submit" className="btn primary block" disabled={busy}>
        <Send />{busy ? 'Sending…' : 'Send reset link'}
      </button>
      <button type="button" className="btn ghost block" onClick={onDone} disabled={busy}>Back to sign in</button>
    </form>
  )
}

export function Login() {
  const status = useAuth(s => s.status)
  const profile = useAuth(s => s.profile)
  const notice = useAuth(s => s.notice)
  const recovery = useAuth(s => s.recovery)
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forgot, setForgot] = useState(false)

  /* Signed in, but turned away (paused account): give the form back. */
  useEffect(() => {
    if (status === 'signed-out') setBusy(false)
  }, [status, notice])

  if (!backendLive) return <Navigate to="/" replace />
  if (status === 'ready' && profile) {
    const to = profile.must_change_password || recovery
      ? '/account/password'
      : safeNext(params.get('next'), profile.role)
    return <Navigate to={to} replace />
  }
  if (status === 'loading' && !busy) return <BootScreen />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) { setError('Enter your email and password.'); return }
    setBusy(true)
    setError(null)
    const err = await signIn(email, password)
    if (err) { setError(err); setBusy(false) }
    /* On success the auth listener loads the profile and this page redirects. */
  }

  return (
    <div className="auth-screen">
      <div className="card auth-card">
        <div className="auth-brand">
          <div className="rail-mark">IH</div>
          <div className="stack" style={{ lineHeight: 1.25 }}>
            <span className="t-md w-sb">IBSRA Heros</span>
            <span className="t-xs c-muted2">Sign in to continue</span>
          </div>
        </div>

        {notice && !error && !forgot && (
          <div className="auth-alert info" role="status"><Info /><span>{notice}</span></div>
        )}
        {error && !forgot && (
          <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>
        )}

        {forgot ? (
          <ForgotPassword onDone={() => setForgot(false)} />
        ) : (
          <>
            <form className="auth-form" onSubmit={submit} noValidate>
              <div className="field">
                <label className="label" htmlFor="login-email">Email</label>
                <input id="login-email" className="inp" type="email" autoComplete="username" autoFocus
                  value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
              </div>
              <div className="field">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <label className="label" htmlFor="login-password">Password</label>
                  <button type="button" className="crumb-link t-xs"
                    style={{ background: 'none', border: 0, padding: 0 }}
                    onClick={() => setForgot(true)}>Forgot password?</button>
                </div>
                <div className="auth-pw">
                  <input id="login-password" className="inp" type={show ? 'text' : 'password'}
                    autoComplete="current-password" value={password}
                    onChange={e => setPassword(e.target.value)} disabled={busy} />
                  <button type="button" className="btn ghost icon sm" onClick={() => setShow(v => !v)}
                    aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn primary block lg" disabled={busy}>
                <LogIn />{busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="auth-foot">
              Students: ask your parent to set a new password on My Heroes. Admin: reset it
              from the Supabase dashboard.
              <br />
              A parent? <Link className="crumb-link" to="/signup">Create your family account</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
