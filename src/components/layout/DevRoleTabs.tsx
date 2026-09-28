/* ==========================================================================
   Admin · Parent · Student, as three tabs in the top bar.

   One click signs out of one test account and into the next, so a whole
   journey — the family enrols, the admin takes the money and sets the week,
   the hero opens their calendar — can be walked in one sitting without
   typing a password three times.

   Dev builds only, and only once `.env.local` names the accounts. See
   src/lib/devAccounts.ts for why this signs in rather than switching a flag.
   ========================================================================== */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { signIn, signOut, useAuth } from '@/lib/auth'
import { DEV_ACCOUNTS, devSwitching, type DevAccount } from '@/lib/devAccounts'
import { useStore } from '@/lib/store'
import { ROLE_META } from './nav'

export function DevRoleTabs() {
  const nav = useNavigate()
  const toast = useStore(s => s.toast)
  const setRole = useStore(s => s.setRole)
  const here = useAuth(s => s.profile?.email)?.toLowerCase()
  const [busy, setBusy] = useState<string | null>(null)

  if (!devSwitching) return null

  const go = async (a: DevAccount) => {
    if (busy) return
    if (a.email.toLowerCase() === here) { nav(ROLE_META[a.role].home); return }
    setBusy(a.email)
    try {
      await signOut()
      const wrong = await signIn(a.email, a.password)
      if (wrong) { toast(`${a.email}: ${wrong}`, 'err'); return }
      setRole(a.role)
      nav(ROLE_META[a.role].home, { replace: true })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="roles" title="Dev only — signs in as the accounts in .env.local">
      {DEV_ACCOUNTS.map(a => {
        const M = ROLE_META[a.role]
        return (
          <button key={a.email} className="role-pill" data-on={a.email.toLowerCase() === here}
            disabled={!!busy} onClick={() => void go(a)} title={a.email}>
            {busy === a.email ? <Loader2 className="spin" /> : <M.icon />}
            <span className="hide-sm">{M.label}</span>
          </button>
        )
      })}
    </div>
  )
}
