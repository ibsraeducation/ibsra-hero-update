/* ==========================================================================
   The mentor's note about one child, in words.

   A note is about one sitting, or about the hero in general when it names
   no session. Either way there is one per day: writing again replaces it,
   so a family reading today’s card is never looking at three versions of
   it. The admin writes; the child and their parents read.
   ========================================================================== */

import { sb } from '@/lib/supabase'
import type { MentorFeedbackRow } from './rows'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local yyyy-mm-dd — a note belongs to the day it was written where the
 *  mentor is, not to a UTC day that may already be tomorrow. */
export const dayOf = (d: Date = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Every note about one child, newest day first. */
export async function fetchMentorFeedback(studentId: string, limit = 30): Promise<MentorFeedbackRow[]> {
  const { data, error } = await sb().from('mentor_feedback')
    .select('*').eq('student_id', studentId)
    .order('day', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as MentorFeedbackRow[]
}

/** Every note the admin can see, for the scoreboard. */
export async function listMentorFeedback(): Promise<MentorFeedbackRow[]> {
  const { data, error } = await sb().from('mentor_feedback')
    .select('*').order('day', { ascending: false })
  if (error) throw error
  return (data ?? []) as MentorFeedbackRow[]
}

export interface NotePatch {
  studentId: string
  trackId?: string | null
  /** The sitting this note is about. Absent is a note about the hero. */
  sessionId?: string | null
  body: string
  focus?: string
  authorId?: string | null
}

/** Write today's note. Admin only — RLS says so too. */
export async function postMentorFeedback(p: NotePatch): Promise<MentorFeedbackRow> {
  const row = {
    student_id: p.studentId,
    track_id: p.trackId || null,
    session_id: p.sessionId || null,
    day: dayOf(),
    body: p.body.trim(),
    focus: (p.focus ?? '').trim(),
    author_id: p.authorId || null,
  }

  const { data, error } = await sb().from('mentor_feedback')
    .upsert(row, { onConflict: 'student_id,day,session_id' }).select('*').single()
  if (error) throw error
  return data as MentorFeedbackRow
}
