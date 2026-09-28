/* ==========================================================================
   One child, as their family may read them.

   A parent's pages do not go through the content store — the store belongs
   to whoever is signed in, and a parent is not the student. Everything the
   family's Material and Feedback pages need is read here, per child, when
   the page opens: the programs and courses that child is in, the sessions
   they can open, what they ticked off, and what they handed in.

   RLS decides all of it (migration parent_view): a parent reading a child
   who is not on their account gets nothing back, not an error page.
   ========================================================================== */

import { sb } from '@/lib/supabase'
import type { Loop, Session, Track } from '@/lib/types'
import { loopFromRow, sessionFromRow, trackFromRow } from './mappers'
import type { LoopRow, SessionRow, SubmissionRow, TrackRow } from './rows'

function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}

export interface FamilyContent {
  tracks: Track[]
  loops: Loop[]
  /** Every released session of every course a child of theirs is in. */
  sessions: Session[]
}

/** The catalogue plus the sessions the family's children can open. Answer
 *  keys are never part of it — that read is admin-only. */
export async function fetchFamilyContent(): Promise<FamilyContent> {
  const client = sb()
  const [tracks, loops, sessions] = await Promise.all([
    client.from('tracks').select('*').order('created_at'),
    client.from('loops').select('*').order('track_id').order('idx'),
    client.from('sessions').select('*').order('loop_id').order('sort_order'),
  ])
  return {
    tracks: must<TrackRow[]>(tracks).map(trackFromRow),
    loops: must<LoopRow[]>(loops).map(loopFromRow),
    sessions: must<SessionRow[]>(sessions).map(r => sessionFromRow(r)),
  }
}

/** Session id → the step keys that child ticked off. */
export type Done = Record<string, string[]>

export async function fetchChildProgress(studentId: string): Promise<Done> {
  const { data, error } = await sb().from('step_progress')
    .select('session_id, step_key').eq('student_id', studentId)
  if (error) throw error
  const done: Done = {}
  for (const r of (data ?? []) as Array<{ session_id: string; step_key: string }>) {
    ;(done[r.session_id] ??= []).push(r.step_key)
  }
  return done
}

/** Everything that child handed in, with its grade where there is one. */
export async function fetchChildSubmissions(studentId: string): Promise<SubmissionRow[]> {
  const { data, error } = await sb().from('submissions')
    .select('*').eq('student_id', studentId).order('created_at')
  if (error) throw error
  return (data ?? []) as SubmissionRow[]
}
