/* ==========================================================================
   The password box a family fills in twice — on their own sign-up, on a
   hero they add, and when they reset one. Its own file because the add-a-
   hero fields (HeroFields) use it too, and those are used from the Enroll
   dialog as well as My Heroes.
   ========================================================================== */

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Field } from '@/components/ui'

/** A password field with a show/hide eye, the same as the sign-in one. */
export function PasswordField({ id, label, value, onChange, hint, autoComplete = 'new-password' }: {
  id: string; label: string; value: string; onChange: (v: string) => void
  hint?: string; autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <Field label={label}>
      <div className="auth-pw">
        <input id={id} className="inp" type={show ? 'text' : 'password'} autoComplete={autoComplete}
          value={value} onChange={e => onChange(e.target.value)} />
        <button type="button" className="btn ghost icon sm" onClick={() => setShow(v => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
    </Field>
  )
}
