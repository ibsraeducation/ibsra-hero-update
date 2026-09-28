/* ==========================================================================
   Answers. A student sends them through `submit_answer` (graded on the
   server for multiple choice); an admin reads and grades them.
   ========================================================================== */

import { create } from 'zustand'
import { sb } from '@/lib/supabase'
import type { SubmissionRow, SubmitResult } from './rows'

export type MySubmission = Pick<SubmitResult,
  'id' | 'task_id' | 'session_id' | 'task_kind' | 'status' | 'is_correct' | 'score' | 'points' |
  'attempts' | 'feedback' | 'choice_ids' | 'answer_text' | 'link_url' | 'file_path' | 'updated_at'>

export const subKey = (sessionId: string, taskId: string) => `${sessionId}:${taskId}`

interface SubmissionsState {
  /** The signed-in student's own answers, keyed `sessionId:taskId`. */
  mine: Record<string, MySubmission>
  put: (s: MySubmission) => void
  replace: (list: MySubmission[]) => void
  clear: () => void
}

export const useSubmissions = create<SubmissionsState>(set => ({
  mine: {},
  put: s => set(st => ({ mine: { ...st.mine, [subKey(s.session_id, s.task_id)]: s } })),
  replace: list => set({ mine: Object.fromEntries(list.map(s => [subKey(s.session_id, s.task_id), s])) }),
  clear: () => set({ mine: {} }),
}))

export async function fetchMySubmissions(studentId: string): Promise<MySubmission[]> {
  const { data, error } = await sb().from('submissions').select('*').eq('student_id', studentId)
  if (error) throw error
  return (data ?? []) as SubmissionRow[]
}

export interface AnswerPayload {
  choiceIds?: string[]
  text?: string
  link?: string
  filePath?: string
}

export async function submitAnswer(sessionId: string, taskId: string, a: AnswerPayload): Promise<SubmitResult> {
  const { data, error } = await sb().rpc('submit_answer', {
    p_session_id: sessionId,
    p_task_id: taskId,
    p_choice_ids: a.choiceIds ?? null,
    p_text: a.text ?? null,
    p_link: a.link ?? null,
    p_file_path: a.filePath ?? null,
  })
  if (error) throw error
  const result = data as SubmitResult
  useSubmissions.getState().put(result)
  return result
}

/* ---------------- admin ---------------- */

export async function listSubmissionsForStudent(studentId: string): Promise<SubmissionRow[]> {
  const { data, error } = await sb().from('submissions').select('*')
    .eq('student_id', studentId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SubmissionRow[]
}

/** Every answer on the place, for the admin's scoreboard. RLS keeps this
 *  to an admin; anyone else reads their own rows and nothing more. */
export async function listAllSubmissions(): Promise<SubmissionRow[]> {
  const { data, error } = await sb().from('submissions').select('*')
  if (error) throw error
  return (data ?? []) as SubmissionRow[]
}

/** How many answers per student are still waiting for a mentor. */
export async function pendingReviewCounts(): Promise<Record<string, number>> {
  const { data, error } = await sb().from('submissions').select('student_id').eq('status', 'submitted')
  if (error) throw error
  const out: Record<string, number> = {}
  for (const r of (data ?? []) as Array<{ student_id: string }>) out[r.student_id] = (out[r.student_id] ?? 0) + 1
  return out
}

/** The same queue, as one number — for the rail badge. */
export async function pendingGradingCount(): Promise<number> {
  const { count, error } = await sb().from('submissions')
    .select('id', { count: 'exact', head: true }).eq('status', 'submitted')
  if (error) throw error
  return count ?? 0
}

export async function gradeSubmission(id: string, graderId: string, score: number, feedback: string) {
  const { data, error } = await sb().from('submissions')
    .update({
      score, feedback: feedback.trim() || null, status: 'graded',
      graded_by: graderId, graded_at: new Date().toISOString(),
    })
    .eq('id', id).select('*').single()
  if (error) throw error
  return data as SubmissionRow
}
