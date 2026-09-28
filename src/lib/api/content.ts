/* ==========================================================================
   Programs, courses and sessions on the server.
   ========================================================================== */

import { sb } from '@/lib/supabase'
import type { Loop, Session, Track } from '@/lib/types'
import {
  loopFromRow, loopToRow, sessionFromRow, sessionToPayload, trackFromRow, trackToRow, upcomingStub,
} from './mappers'
import type { EnrollmentRow, LoopRow, SessionKeys, SessionRow, TrackRow, UpcomingSessionRow } from './rows'

export interface ContentSnapshot {
  tracks: Track[]
  loops: Loop[]
  sessions: Session[]
  /** Session id → the revision the copy in hand was read at. */
  revs: Map<string, number>
}

function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error
  return res.data as T
}

async function readContent(withKeys: boolean) {
  const client = sb()
  const [tracks, loops, sessions, keys] = await Promise.all([
    client.from('tracks').select('*').order('created_at'),
    client.from('loops').select('*').order('track_id').order('idx'),
    client.from('sessions').select('*').order('loop_id').order('sort_order'),
    withKeys
      ? client.from('session_keys').select('session_id, keys')
      : Promise.resolve({ data: [] as Array<{ session_id: string; keys: SessionKeys }>, error: null }),
  ])
  const keyMap = new Map(
    must<Array<{ session_id: string; keys: SessionKeys }>>(keys).map(k => [k.session_id, k.keys]),
  )
  const sessionRows = must<SessionRow[]>(sessions)
  return {
    tracks: must<TrackRow[]>(tracks).map(trackFromRow),
    loops: must<LoopRow[]>(loops).map(loopFromRow),
    sessions: sessionRows.map(r => sessionFromRow(r, withKeys ? keyMap.get(r.id) ?? {} : undefined)),
    revs: new Map(sessionRows.map(r => [r.id, r.rev ?? 1])),
  }
}

/** Everything, answer keys included. RLS returns it only to an admin. */
export const fetchAdminContent = (): Promise<ContentSnapshot> => readContent(true)

/** What RLS lets this student read, plus the not-yet-released sessions of
 *  their courses as locked cards. */
export async function fetchStudentContent(): Promise<ContentSnapshot> {
  const [snap, upcoming] = await Promise.all([
    readContent(false),
    sb().rpc('student_upcoming_sessions'),
  ])
  const stubs = must<UpcomingSessionRow[]>(upcoming).map(upcomingStub)
  return { ...snap, sessions: [...snap.sessions, ...stubs] }
}

/** The student's own course enrolments (they change when the admin acts). */
export async function fetchMyEnrollments(studentId: string): Promise<EnrollmentRow[]> {
  const { data, error } = await sb().from('enrollments').select('*').eq('student_id', studentId)
  if (error) throw error
  return (data ?? []) as EnrollmentRow[]
}

export async function upsertTrack(t: Track) {
  const { error } = await sb().from('tracks').upsert(trackToRow(t))
  if (error) throw error
}

export async function deleteTrack(id: string) {
  const { error } = await sb().from('tracks').delete().eq('id', id)
  if (error) throw error
}

export async function upsertLoop(l: Loop) {
  const { error } = await sb().from('loops').upsert(loopToRow(l))
  if (error) throw error
}

export async function deleteLoop(id: string) {
  const { error } = await sb().from('loops').delete().eq('id', id)
  if (error) throw error
}

/** Save a whole session. `baseRev` null means it is new. Returns the new rev. */
export async function saveSession(s: Session, baseRev: number | null): Promise<number> {
  const { row, keys } = sessionToPayload(s)
  const { data, error } = await sb().rpc('admin_save_session', {
    p_session: row, p_keys: keys, p_base_rev: baseRev,
  })
  if (error) throw error
  const first = Array.isArray(data) ? data[0] : data
  return (first as { new_rev: number }).new_rev
}

export async function deleteSession(id: string) {
  const { error } = await sb().from('sessions').delete().eq('id', id)
  if (error) throw error
}
