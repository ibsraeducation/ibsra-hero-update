/* ==========================================================================
   Access requests — a family asks, the admin answers.

   Nothing in the curriculum is bought. A family reads the Marketplace and
   asks for a program, or for one course of it, for one of their heroes; the
   admin decides which courses that student is ready for and opens those.
   Approving is the enrolment — `answer_request` writes both in the same
   transaction, so a yes on screen is never a yes that opened nothing.
   ========================================================================== */

import { backendLive, sb } from '@/lib/supabase'
import type { PlanSlot } from './schedule'
import type { WeekAsk } from '@/lib/programLength'
import type { AccessRequestRow, ProfileRow } from './rows'

/** A request with the names an admin needs to read it in one line. */
export interface RequestWithPeople extends AccessRequestRow {
  parent: Pick<ProfileRow, 'id' | 'name' | 'email' | 'phone'> | null
  student: Pick<ProfileRow, 'id' | 'name' | 'email' | 'age' | 'national_id' | 'whatsapp' | 'phone'> | null
}

export interface NewRequest {
  parentId: string
  studentId: string
  /** The course being asked for. Required: timeslots belong to a course, so
   *  a week can only be picked once a course is. The program is derived
   *  from it server-side. */
  loopId: string
  note?: string
  /** 2-hour lectures a week the family wants. */
  lecturesPerWeek?: number
  /** Minutes per section: 30, 60, 90 or 120. */
  sectionMinutes?: number
  /** The week itself — which days and hours the lectures are on, and the
   *  hour the family is free for a section on each of the other days. The
   *  two numbers above are derived from it server-side, so a row can never
   *  say one thing in its summary and another in its week. */
  ask?: WeekAsk | null
  /** The same week as the server knows it: which published sitting each
   *  half is, so the admin's approval books exactly what was picked. */
  slots?: PlanSlot[] | null
  /** Where the family said they are, from the form's first step. Stamped
   *  onto the parent's and the hero's profile as the ask is filed. */
  region?: string | null
}

/** File the ask, with the times the family picked.

    The times are theirs now: they chose published sittings, and those go in
    with the ask so the admin's approval books exactly them. The server
    checks the week holds together — the right number of lectures, a section
    on every other day, nothing clashing — and refuses in a sentence if not.
    It also does the part a browser cannot be trusted with, that the hero is
    actually on this parent's account, which is why it is an RPC. */
export async function requestWithTimes(r: NewRequest): Promise<AccessRequestRow> {
  const { data, error } = await sb().rpc('request_with_times', {
    p_student: r.studentId,
    p_loop: r.loopId,
    p_note: r.note?.trim() || '',
    p_slots: r.slots ?? [],
    p_lectures: r.lecturesPerWeek ?? null,
    p_section_min: r.sectionMinutes ?? null,
    p_ask: r.ask ?? null,
    p_region: r.region ?? null,
  })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) as AccessRequestRow
}

/** Everything this family has asked for, newest first. */
export async function fetchMyRequests(): Promise<AccessRequestRow[]> {
  if (!backendLive) return []
  const { data, error } = await sb().from('access_requests')
    .select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AccessRequestRow[]
}

/** Take back an ask nobody has answered yet. */
export async function withdrawRequest(id: string): Promise<void> {
  const { error } = await sb().from('access_requests').delete().eq('id', id)
  if (error) throw error
}

/* ---------------- the admin side ---------------- */

export async function listRequests(): Promise<RequestWithPeople[]> {
  /* The demo build has no families and no asks — an empty queue, not an
     error about a backend nobody configured. */
  if (!backendLive) return []
  const { data, error } = await sb()
    .from('access_requests')
    .select(`*,
      parent:profiles!access_requests_parent_id_fkey (id, name, email, phone),
      student:profiles!access_requests_student_id_fkey (id, name, email, age, national_id, whatsapp, phone)`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as RequestWithPeople[]
}

/** Answer one. Approving opens exactly the courses that were ticked — the
 *  server checks each belongs to what was asked for, and refuses a yes that
 *  would open nothing. */
/** `slots` books the real sittings in the same transaction as the
 *  enrolment. Omit it and the week the family filed is what gets booked;
 *  pass one and it replaces their week wholesale -- never one day of it,
 *  because a half-moved week is how a hero ends up with two Sundays and no
 *  Tuesday. An admin's substitute week is held to the same rules the
 *  family's was: they may overrule which times, not whether they clash.
 *
 *  `batchId` is the intake the sittings belong to -- what the admin's
 *  calendar slices by. */
export async function answerRequest(
  id: string, approve: boolean, loopIds: string[] = [], note?: string,
  slots?: PlanSlot[] | null, batchId?: string | null,
): Promise<AccessRequestRow> {
  const { data, error } = await sb().rpc('answer_request', {
    p_id: id,
    p_approve: approve,
    p_loops: loopIds,
    p_note: note?.trim() || null,
    p_slots: slots?.length ? slots : null,
    p_batch: batchId || null,
  })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) as AccessRequestRow
}

/* ---------------- the registration list ---------------- */

/** One family's registration, flat: who asked, for which hero, the hero's
 *  national ID and WhatsApp number, the program, and the rhythm the family
 *  chose — the week the admin then lays onto the calendar.
 *
 *  Read from the `program_registrations` view rather than assembled here,
 *  so the admin's list and the schedule step can never disagree about who a
 *  sitting is being booked for. The view runs as the caller (RLS), so a
 *  parent reading it sees their own rows and nobody else's. */
export interface RegistrationRow {
  id: string
  created_at: string
  status: AccessRequestRow['status']
  parent_id: string
  parent_name: string
  parent_email: string
  parent_phone: string | null
  student_id: string
  student_name: string
  student_national_id: string | null
  student_whatsapp: string | null
  student_age: number | null
  track_id: string | null
  program_name: string | null
  loop_id: string | null
  course_name: string | null
  lectures_per_week: number | null
  section_minutes: number | null
  /** The week in full — read it with `parseAsk` from programLength.ts. */
  schedule_ask: unknown
  answered_at: string | null
}

export async function listRegistrations(): Promise<RegistrationRow[]> {
  if (!backendLive) return []
  const { data, error } = await sb()
    .from('program_registrations').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as RegistrationRow[]
}

/** How many are still waiting — for the count on the admin rail. */
export async function pendingRequestCount(): Promise<number> {
  if (!backendLive) return 0
  const { count, error } = await sb().from('access_requests')
    .select('id', { count: 'exact', head: true }).eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}


/** The oldest request still waiting for this student — what an admin sets
 *  the times for right after accepting the payment. Null when there is
 *  none (a renewal: the months are paid, nothing new was asked for). */
export async function pendingRequestFor(studentId: string): Promise<string | null> {
  if (!backendLive) return null
  const { data, error } = await sb().from('access_requests')
    .select('id').eq('student_id', studentId).eq('status', 'pending')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (error) throw error
  return (data?.id as string | undefined) ?? null
}

/** One request with the names on it — what the schedule dialog opens on. */
export async function fetchRequest(id: string): Promise<RequestWithPeople | null> {
  if (!backendLive) return null
  const { data, error } = await sb()
    .from('access_requests')
    .select(`*,
      parent:profiles!access_requests_parent_id_fkey (id, name, email, phone),
      student:profiles!access_requests_student_id_fkey (id, name, email, age, national_id, whatsapp, phone)`)
    .eq('id', id).maybeSingle()
  if (error) throw error
  return (data ?? null) as unknown as RequestWithPeople | null
}

/** The week the admin sets for one student, typed in rather than picked
 *  from published slots. Days are 0 (Sunday) to 6; times are minutes after
 *  midnight, Cairo. Every lecture day gets a lecture, every other day the
 *  stand-up section, from `from` to `to` (the course's own dates when left
 *  out). The request is answered, and the parent and the student are told
 *  the week and taken to their calendars — one transaction. */
export interface StudentSchedule {
  requestId: string
  lectureDays?: number[]
  lectureStart?: number
  lectureMinutes?: number
  sectionStart?: number | null
  sectionMinutes?: number | null
  /** The week day by day, for when it is not one hour for every lecture and
   *  one for every section. Sent instead of the four fields above; the
   *  server folds the simple form into this same shape before it books. */
  plan?: WeekAsk | null
  from?: string | null
  to?: string | null
  meetingUrl?: string
  note?: string
}

export async function scheduleStudent(s: StudentSchedule): Promise<AccessRequestRow> {
  const { data, error } = await sb().rpc('schedule_student', {
    p_request: s.requestId,
    p_lecture_days: s.lectureDays ?? null,
    p_lecture_start: s.lectureStart ?? null,
    p_lecture_min: s.lectureMinutes ?? 120,
    p_section_start: s.sectionStart ?? null,
    p_section_min: s.sectionMinutes ?? null,
    p_from: s.from || null,
    p_to: s.to || null,
    p_meeting: s.meetingUrl?.trim() || null,
    p_note: s.note?.trim() || null,
    p_plan: s.plan ?? null,
  })
  if (error) throw error
  return (Array.isArray(data) ? data[0] : data) as AccessRequestRow
}
