/* ==========================================================================
   A student's ticked-off steps, keyed like the store's `done` map.
   ========================================================================== */

import { sb } from '@/lib/supabase'
import type { StepProgressRow } from './rows'

export type Done = Record<string, string[]>

export async function fetchMyProgress(studentId: string): Promise<Done> {
  const { data, error } = await sb()
    .from('step_progress')
    .select('session_id, step_key')
    .eq('student_id', studentId)
  if (error) throw error
  const done: Done = {}
  for (const r of (data ?? []) as Pick<StepProgressRow, 'session_id' | 'step_key'>[]) {
    ;(done[r.session_id] ??= []).push(r.step_key)
  }
  return done
}

export async function addSteps(studentId: string, items: Array<{ sessionId: string; key: string }>) {
  if (!items.length) return
  const { error } = await sb().from('step_progress').upsert(
    items.map(i => ({ student_id: studentId, session_id: i.sessionId, step_key: i.key })),
    { onConflict: 'student_id,session_id,step_key', ignoreDuplicates: true },
  )
  if (error) throw error
}

export async function removeSteps(studentId: string, items: Array<{ sessionId: string; key: string }>) {
  const bySession = new Map<string, string[]>()
  for (const i of items) (bySession.get(i.sessionId) ?? bySession.set(i.sessionId, []).get(i.sessionId)!).push(i.key)
  for (const [sessionId, keys] of bySession) {
    const { error } = await sb().from('step_progress').delete()
      .eq('student_id', studentId).eq('session_id', sessionId).in('step_key', keys)
    if (error) throw error
  }
}
