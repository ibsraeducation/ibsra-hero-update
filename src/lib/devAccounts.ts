/* ==========================================================================
   Switching between the three sides of the platform while building it.

   Authentication cannot simply be "turned off" here: every row the app
   reads is decided by row-level security on the server, from the signed-in
   person's token. A parent's heroes, an admin's queues and a student's
   courses are three different answers to the same query, and the database
   gives the one the session asks for. Hiding the sign-in screen would not
   hide that — it would just leave every page empty.

   So the top-bar tabs really do sign in, as accounts named in `.env.local`:

       VITE_DEV_ADMIN=admin@example.com:the-password
       VITE_DEV_PARENT=parent@example.com:the-password
       VITE_DEV_STUDENT=hero@example.com:the-password

   Nothing here is read in a production build: `import.meta.env.DEV` is a
   literal that the bundler folds away, so the whole switcher, passwords and
   all, is dropped from `npm run build`. `.env.local` is already ignored by
   git (`.env.*`), and these are the developer's own test accounts.
   ========================================================================== */

import type { ViewRole } from '@/lib/types'

export interface DevAccount {
  role: ViewRole
  email: string
  password: string
}

/** The first colon splits it: a password may contain one, an email may not. */
export function parseDevAccount(role: ViewRole, raw: string | undefined): DevAccount | null {
  const at = raw?.indexOf(':') ?? -1
  if (!raw || at < 1) return null
  const email = raw.slice(0, at).trim()
  const password = raw.slice(at + 1)
  return email && password ? { role, email, password } : null
}

/** The accounts the tabs offer, in rail order. Empty in a production build,
 *  and empty in dev until `.env.local` names at least one. */
export const DEV_ACCOUNTS: DevAccount[] = import.meta.env.DEV
  ? ([
      parseDevAccount('admin', import.meta.env.VITE_DEV_ADMIN as string | undefined),
      parseDevAccount('parent', import.meta.env.VITE_DEV_PARENT as string | undefined),
      parseDevAccount('student', import.meta.env.VITE_DEV_STUDENT as string | undefined),
    ].filter(Boolean) as DevAccount[])
  : []

export const devSwitching = DEV_ACCOUNTS.length > 0
