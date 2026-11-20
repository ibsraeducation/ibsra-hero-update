/* ==========================================================================
   Which signed-in role may open which path. Pure, so it is tested on its own.

   Admin works in /admin. A student has Missions, the session view and
   their own progress page; the other student pages still show demo
   records, so they send a student back to Missions.

   A parent has its own live area — the material their child opens, the
   heroes on the account, the mentor's feedback on them, the family wallet,
   Payments, and the Marketplace they ask for a program from. An admin may
   look at that same live area to see exactly what a family sees, but no
   further: the rest of /parent is the demo report, and in live mode the
   store that feeds it is kept empty (see `src/lib/store.ts` `load()`), so
   there is nothing honest for an admin to preview there any more. The two
   paths the live pages replaced (`/parent/children` and `/parent/enroll`)
   are still allowed: they redirect, and a redirect nobody may open never
   runs.
   ========================================================================== */

import type { AppRole } from '@/lib/api/rows'

export type Decision = { allow: true } | { allow: false; to: string }

export const HOME: Record<AppRole, string> = {
  admin: '/admin/material',
  student: '/student/missions',
  parent: '/parent/material',
}

/** The parent pages that run on real accounts, not on the demo record. Both
 *  a parent and an admin previewing the family side are held to this list. */
const PARENT_LIVE = [
  '/parent/material', '/parent/heroes', '/parent/feedback', '/parent/wallet',
  '/parent/payments', '/parent/marketplace', '/parent/calendar',
  /* the pre-merge paths, so an old link redirects instead of bouncing home */
  '/parent/children', '/parent/enroll',
]

const allow: Decision = { allow: true }
const go = (to: string): Decision => ({ allow: false, to })

const under = (path: string, base: string) => path === base || path.startsWith(base + '/')

export function decide(pathname: string, role: AppRole): Decision {
  const path = pathname.replace(/\/+$/, '') || '/'

  /* One inbox, read by whoever is signed in — nothing on the page depends
     on the role, so there is nothing here to gate. */
  if (path === '/notifications') return allow

  if (under(path, '/admin')) {
    return role === 'admin' ? allow : go(HOME[role])
  }
  if (under(path, '/parent')) {
    if (role === 'admin' || role === 'parent') {
      return PARENT_LIVE.some(p => under(path, p)) ? allow : go(HOME.parent)
    }
    return go(HOME.student)
  }
  if (under(path, '/student/missions')
    || under(path, '/student/session') || under(path, '/student/progress')
    || under(path, '/student/marketplace') || under(path, '/student/calendar')
    || under(path, '/student/wallet')) {
    return role === 'student' ? allow : go(HOME[role])
  }
  if (under(path, '/student')) return go(HOME[role])
  return go(HOME[role])
}

/** A `next` redirect after login is honoured only if the role may open it. */
export function safeNext(next: string | null, role: AppRole): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return HOME[role]
  const d = decide(next.split('?')[0], role)
  return d.allow ? next : d.to
}
