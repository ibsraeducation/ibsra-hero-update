/* ==========================================================================
   Who is signed in. A plain zustand store so non-React code (the sync layer,
   the API modules) can read it; `auth.tsx` drives it from Supabase Auth.
   ========================================================================== */

import { create } from 'zustand'
import type { Session as AuthSession } from '@supabase/supabase-js'
import type { EnrollmentRow, ProfileRow } from '@/lib/api/rows'

export type AuthStatus = 'demo' | 'loading' | 'signed-out' | 'ready'

export interface AuthState {
  status: AuthStatus
  session: AuthSession | null
  profile: ProfileRow | null
  enrollments: EnrollmentRow[]
  /** Shown on the login page after a forced sign-out. */
  notice: string | null
  /** Set the moment a password-reset link signs someone in, so Login and
   *  ChangePassword know this session exists only to pick a new password —
   *  cleared the moment `changePassword` succeeds. */
  recovery: boolean
}

export const useAuthStore = create<AuthState>(() => ({
  status: 'loading',
  session: null,
  profile: null,
  enrollments: [],
  notice: null,
  recovery: false,
}))
