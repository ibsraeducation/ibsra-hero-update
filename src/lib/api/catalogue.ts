/* ==========================================================================
   The shop window: every program and course a family may read, and enough
   of each session to show what is inside one before anybody enrols.

   Tracks and loops are readable by anyone signed in (see
   20260923090000_catalogue_for_everyone.sql) so they go through the usual
   mappers — that is what makes ProgramPicker/ProgramMap work unchanged,
   since a real `Track` already carries `stage`, `nextIds`, `color`, `id`.
   Sessions are not: a non-enrolled viewer reads zero session rows, so their
   names, lengths and preview video come through `catalogue_sessions()`, a
   narrow security-definer projection — never `content`, never
   `meeting_url`, never an answer key.
   ========================================================================== */

import { sb } from '@/lib/supabase'
import { loopFromRow, trackFromRow } from './mappers'
import type { LoopRow, TrackRow } from './rows'
import type { Loop, SessionType, Track } from '@/lib/types'

export interface SessionPreview {
  id: string
  loopId: string
  name: string
  summary: string
  type: SessionType
  order: number
  durationMin: number
  videoUrl: string | null
}

export interface Catalogue {
  tracks: Track[]
  loops: Loop[]
  sessions: SessionPreview[]
}

/** Everything a family or a student may browse before they are enrolled in
 *  anything. An unlisted program is left out here — the same discipline the
 *  admin's own listing switch already enforces. */
export async function fetchCatalogue(): Promise<Catalogue> {
  const [tracksRes, loopsRes, sessionsRes] = await Promise.all([
    sb().from('tracks').select('*').order('created_at', { ascending: true }),
    sb().from('loops').select('*').order('track_id', { ascending: true }).order('idx', { ascending: true }),
    sb().rpc('catalogue_sessions'),
  ])
  if (tracksRes.error) throw tracksRes.error
  if (loopsRes.error) throw loopsRes.error
  if (sessionsRes.error) throw sessionsRes.error

  const tracks = ((tracksRes.data ?? []) as TrackRow[])
    .map(trackFromRow)
    .filter(t => t.listed ?? true)
  const trackIds = new Set(tracks.map(t => t.id))

  const loops = ((loopsRes.data ?? []) as LoopRow[])
    .map(loopFromRow)
    .filter(l => trackIds.has(l.trackId) && (l.listed ?? true))
  const loopIds = new Set(loops.map(l => l.id))

  const sessions: SessionPreview[] = (
    (sessionsRes.data ?? []) as Array<{
      id: string; loop_id: string; name: string; summary: string
      type: SessionType; sort_order: number; duration_min: number; video_url: string | null
    }>
  )
    .filter(r => loopIds.has(r.loop_id))
    .map(r => ({
      id: r.id, loopId: r.loop_id, name: r.name, summary: r.summary,
      type: r.type, order: r.sort_order, durationMin: r.duration_min, videoUrl: r.video_url,
    }))
    .sort((a, b) => a.order - b.order)

  return { tracks, loops, sessions }
}
