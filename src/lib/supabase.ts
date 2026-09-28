/* ==========================================================================
   The Supabase client — the one door to the backend.

   Configured from `.env.local` (see `.env.example`). The publishable key is
   meant to ship in the bundle: what a signed-in person can read or write is
   decided by row-level security in the database, not by hiding the key.

   Until both variables are set, `supabase` is null and the app keeps running
   on the local demo store, so a missing env never blanks the screen.
   `VITE_BACKEND=off` forces that demo mode even when the keys are present.
   ========================================================================== */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url: string = import.meta.env.VITE_SUPABASE_URL || ''
const key: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
const off = import.meta.env.VITE_BACKEND === 'off'

export const supabase: SupabaseClient | null = url && key && !off
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

/** Whether a backend is configured at all. False means the local demo. */
export const backendLive = supabase !== null

/** The client, for code that only runs when the backend is live. */
export function sb(): SupabaseClient {
  if (!supabase) throw new Error('Backend is not configured')
  return supabase
}
