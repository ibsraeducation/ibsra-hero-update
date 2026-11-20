import { backendLive, sb } from '@/lib/supabase'
import { ANYWHERE, inViewerRegion, viewerRegion } from '@/lib/region'
import type {
  AvailabilityWindowRow, CourseBatchRow, RosterRow, SessionBookingRow, SlotKind,
  SuggestedWindowRow, WindowGridRow, WindowOccurrenceRow,
} from './rows'

export const LECTURE_DEFAULT_MIN = 120
export const LECTURE_MIN_MIN = 30
export const LECTURE_MAX_MIN = 360
export const SECTION_MIN_MIN = 15
export const SECTION_DEFAULT_MIN = 60
export const LECTURE_STEP_MIN = 30

/** The slider moves by half hours unless the admin's own range needs a
 *  finer notch to be reachable at both ends. */
export const stepFor = (min: number, max: number): number =>
  (min % LECTURE_STEP_MIN || max % LECTURE_STEP_MIN ? 5 : LECTURE_STEP_MIN)

export const durationOk = (kind: SlotKind, startMin: number, endMin: number): boolean => {
  const len = endMin - startMin
  return kind === 'lecture'
    ? len >= LECTURE_MIN_MIN && len <= LECTURE_MAX_MIN
    : len >= SECTION_MIN_MIN
}

export interface NewWindow {
  kind: SlotKind
  weekday: number | null
  startMin: number
  endMin: number
  loopId: string
  batchId: string
  slotMin: number
  slotMaxMin?: number | null
  mentor?: string
  capacity?: number
  active?: boolean
  note?: string
}

export async function fetchWindows(opts?: { loopId?: string | null }): Promise<AvailabilityWindowRow[]> {
  if (!backendLive) return []
  let q = sb().from('availability_windows').select('*')
    .order('kind', { ascending: true })
    .order('weekday', { ascending: true, nullsFirst: false })
    .order('start_min', { ascending: true })
  if (opts?.loopId) q = q.eq('loop_id', opts.loopId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as AvailabilityWindowRow[]
}

export async function saveWindow(w: NewWindow & { id?: string }): Promise<AvailabilityWindowRow> {
  const row = {
    ...(w.id ? { id: w.id } : {}),
    kind: w.kind,
    weekday: w.weekday,
    start_min: w.startMin,
    end_min: w.endMin,
    loop_id: w.loopId,
    batch_id: w.batchId,
    slot_min: w.slotMin,
    slot_max_min: w.slotMaxMin ?? null,
    mentor: w.mentor ?? '',
    capacity: w.capacity ?? 1,
    active: w.active ?? true,
    note: w.note ?? '',
  }
  const { data, error } = await sb().from('availability_windows').upsert(row).select('*').single()
  if (error) throw error
  return data as AvailabilityWindowRow
}

export async function saveWindowDays(
  w: Omit<NewWindow, 'weekday'>, days: number[],
): Promise<AvailabilityWindowRow[]> {
  const rows = days.map(d => ({
    kind: w.kind,
    weekday: d,
    start_min: w.startMin,
    end_min: w.endMin,
    loop_id: w.loopId,
    batch_id: w.batchId,
    slot_min: w.slotMin,
    slot_max_min: w.slotMaxMin ?? null,
    mentor: w.mentor ?? '',
    capacity: w.capacity ?? 1,
    active: w.active ?? true,
    note: w.note ?? '',
  }))
  const { data, error } = await sb().from('availability_windows').insert(rows).select('*')
  if (error) throw error
  return (data ?? []) as AvailabilityWindowRow[]
}

export async function deleteWindow(id: string): Promise<void> {
  const { error } = await sb().from('availability_windows').delete().eq('id', id)
  if (error) throw error
}

export async function windowOccurrences(
  windowId: string, weekday?: number | null, count = 6,
): Promise<WindowOccurrenceRow[]> {
  const { data, error } = await sb().rpc('window_occurrences', {
    p_window: windowId, p_weekday: weekday ?? null, p_count: count,
  })
  if (error) throw error
  return (data ?? []) as WindowOccurrenceRow[]
}

export async function suggestWindows(
  studentId: string, loopId: string, kind?: SlotKind, weekday?: number | null,
): Promise<SuggestedWindowRow[]> {
  if (!backendLive) return []
  const { data, error } = await sb().rpc('suggest_windows', {
    p_student: studentId,
    p_loop: loopId,
    p_kind: kind ?? null,
    p_weekday: weekday ?? null,
  })
  if (error) throw error
  return (data ?? []) as SuggestedWindowRow[]
}

export async function fetchBookings(
  range: { from: string; to: string }, studentId?: string,
): Promise<SessionBookingRow[]> {
  if (!backendLive) return []
  let q = sb().from('session_bookings').select('*')
    .gte('starts_at', range.from).lte('starts_at', range.to)
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true })
  if (studentId) q = q.eq('student_id', studentId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as SessionBookingRow[]
}

/** Ask for the meeting link, which records that they turned up. The server
 *  only hands it over inside the sitting's own window. */
export async function joinBooking(id: string): Promise<string> {
  const { data, error } = await sb().rpc('join_booking', { p_booking: id })
  if (error) throw error
  return (data as string) ?? ''
}

/** Admin only: who was actually there. */
export async function confirmAttendance(id: string, attended: boolean): Promise<SessionBookingRow> {
  const { data, error } = await sb().rpc('confirm_attendance', {
    p_booking: id, p_attended: attended,
  })
  if (error) throw error
  return data as SessionBookingRow
}

/** Admin only: the room this one sitting happens in. */
export async function setBookingMeeting(id: string, url: string): Promise<void> {
  const { error } = await sb().from('session_bookings')
    .update({ meeting_url: url.trim() || null }).eq('id', id)
  if (error) throw error
}

export interface PlanSlot {
  w: string
  d: number | null
  s?: number | null
  m?: number | null
}

export async function fetchRequestSlots(requestId: string): Promise<PlanSlot[]> {
  if (!backendLive) return []
  const { data, error } = await sb().from('request_slots')
    .select('window_id, weekday, start_min, duration_min').eq('request_id', requestId)
  if (error) throw error
  return (data ?? []).map((r: {
    window_id: string; weekday: number | null; start_min: number | null; duration_min: number | null
  }) => ({ w: r.window_id, d: r.weekday, s: r.start_min, m: r.duration_min }))
}

export async function windowGrid(from: string, to: string): Promise<WindowGridRow[]> {
  if (!backendLive) return []
  const { data, error } = await sb().rpc('window_grid', { p_from: from, p_to: to })
  if (error) throw error
  return (data ?? []) as WindowGridRow[]
}

export async function windowRoster(windowId: string, loopId?: string | null): Promise<RosterRow[]> {
  if (!backendLive) return []
  const { data, error } = await sb().rpc('window_roster', {
    p_window: windowId, p_loop: loopId || null,
  })
  if (error) throw error
  return (data ?? []) as RosterRow[]
}

export async function assignToWindow(
  studentId: string, windowId: string, weekday?: number | null,
  batchId?: string | null, loopId?: string | null, startMin?: number | null,
): Promise<number> {
  const { data, error } = await sb().rpc('assign_to_window', {
    p_student: studentId, p_window: windowId,
    p_weekday: weekday ?? null, p_batch: batchId || null, p_loop: loopId || null,
    p_start_min: startMin ?? null,
  })
  if (error) throw error
  return (data as number) ?? 0
}

export async function unassignFromWindow(studentId: string, windowId: string): Promise<number> {
  const { data, error } = await sb().rpc('unassign_from_window', {
    p_student: studentId, p_window: windowId,
  })
  if (error) throw error
  return (data as number) ?? 0
}

export async function fetchBatches(loopId?: string): Promise<CourseBatchRow[]> {
  if (!backendLive) return []
  let q = sb().from('course_batches').select('*').order('starts_on', { ascending: false })
  if (loopId) q = q.eq('loop_id', loopId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as CourseBatchRow[]
}

/** Which intake is run where, for the enrol form's first step. Readable
 *  by any signed-in family — it is what they are choosing between. */
export async function fetchBatchRegions(loopId?: string): Promise<Map<string, string>> {
  if (!backendLive) return new Map()
  let q = sb().from('course_batches').select('id, region').neq('status', 'done')
  if (loopId) q = q.eq('loop_id', loopId)
  const { data, error } = await q
  if (error) throw error
  return new Map(((data ?? []) as Array<{ id: string; region: string | null }>)
    .map(b => [b.id, b.region || ANYWHERE]))
}

export interface NewBatch {
  id?: string
  loopId: string
  name: string
  startsOn: string
  status?: CourseBatchRow['status']
  seats?: number
  /** Who it is run for: 'anywhere', or one country (see lib/region). */
  region?: string
  note?: string
}

export async function saveBatch(b: NewBatch): Promise<CourseBatchRow> {
  const row = {
    ...(b.id ? { id: b.id } : {}),
    loop_id: b.loopId,
    name: b.name.trim(),
    starts_on: b.startsOn,
    status: b.status ?? 'forming',
    seats: b.seats ?? 12,
    region: b.region || ANYWHERE,
    note: b.note ?? '',
  }
  const { data, error } = await sb().from('course_batches').upsert(row).select('*').single()
  if (error) throw error
  return data as CourseBatchRow
}

export async function deleteBatch(id: string): Promise<void> {
  const { error } = await sb().from('course_batches').delete().eq('id', id)
  if (error) throw error
}

export async function cancelBooking(id: string): Promise<void> {
  const { error } = await sb().from('session_bookings').update({ status: 'cancelled' }).eq('id', id)
  if (error) throw error
}

export async function fetchStudentNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const { data, error } = await sb().from('profiles').select('id, name, email').in('id', [...new Set(ids)])
  if (error) throw error
  return Object.fromEntries((data ?? []).map((p: { id: string; name: string; email: string }) => [p.id, p.name || p.email]))
}

/* The hours this family is offered. An intake run for one country is not
   offered to a family reading from another — their own clock says which
   they are, and an hour behind no intake belongs to everyone. */
export async function fetchOfferedWindows(
  opts: {
    loopId?: string | null; trackId?: string | null
    /** Whose hours these are. Left out, the family's own clock decides;
     *  'all' is the admin, who books for families anywhere. */
    region?: string | null | 'all'
  },
): Promise<AvailabilityWindowRow[]> {
  if (!backendLive) return []
  const [ws, bs] = await Promise.all([
    sb().from('availability_windows').select('*').eq('active', true),
    sb().from('course_batches').select('id, region'),
  ])
  if (ws.error) throw ws.error
  const rows = offeredFrom((ws.data ?? []) as AvailabilityWindowRow[], opts)
  const where = opts.region === undefined ? viewerRegion() : opts.region
  if (where === 'all') return rows
  const regions = new Map<string, string>(
    ((bs.data ?? []) as Array<{ id: string; region: string | null }>)
      .map(b => [b.id, b.region || ANYWHERE]))
  return inViewerRegion(rows, regions, where)
}

export function offeredFrom(
  rows: AvailabilityWindowRow[],
  opts: { loopId?: string | null; trackId?: string | null },
): AvailabilityWindowRow[] {
  return rows
    .filter(w => w.active)
    .filter(w => (w.loop_id ? w.loop_id === opts.loopId
      : w.track_id ? w.track_id === opts.trackId : true))
    .sort((a, b) =>
      (a.weekday ?? 7) - (b.weekday ?? 7) || a.start_min - b.start_min || a.id.localeCompare(b.id))
}

export async function occurrencesFor(
  windows: Array<{ id: string; weekday: number | null }>,
  weekday: number | null,
  count = 4,
): Promise<Record<string, WindowOccurrenceRow[]>> {
  if (!backendLive || windows.length === 0) return {}
  const pairs = await Promise.all(windows.map(async w => {
    try {
      return [w.id, await windowOccurrences(w.id, w.weekday ?? weekday, count)] as const
    } catch {
      return [w.id, [] as WindowOccurrenceRow[]] as const
    }
  }))
  return Object.fromEntries(pairs)
}
