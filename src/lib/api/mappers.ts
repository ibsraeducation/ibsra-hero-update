/* ==========================================================================
   Rows ↔ domain objects. Pure functions, no network.

   The one rule that matters here: a session goes to the database in two
   parts. `content` is what a student may read, so every `Option.correct` and
   `Task.modelAnswer` is taken out of it; those go into `keys`, which only an
   admin can read. Reading back, an admin gets them merged in again and a
   student gets `correct: false` everywhere.
   ========================================================================== */

import type { Loop, Material, Option, Session, Task, Title, Track, ValueLists, VideoAsset, VideoCheck } from '@/lib/types'
import { programBlurb } from '@/lib/programInfo'
import type { LoopRow, SessionKeys, SessionRow, TrackRow, UpcomingSessionRow } from './rows'

/* ---------------- tracks ---------------- */

export const trackToRow = (t: Track): TrackRow => ({
  id: t.id,
  name: t.name,
  overview: t.overview ?? '',
  technical_values: t.technical ?? '',
  personal_values: t.personal ?? '',
  market_values: t.market ?? '',
  asset_value: t.asset ?? '',
  technical_skills: t.technicalSkills ?? '',
  marketing_skills: t.marketingSkills ?? '',
  personal_skills: t.personalSkills ?? '',
  skills: t.skills ?? [],
  price_egp: t.priceEgp ?? null,
  /* Unset means listed: a program saved before the flag existed was on sale,
     and staying on sale is the answer that changes nothing. */
  listed: t.listed ?? true,
  stage: t.stage ?? null,
  next_ids: t.nextIds ?? [],
  video_url: t.videoUrl ?? null,
  tab_videos: t.tabVideos ?? {},
  ...(t.area === 'work' ? { area: 'work' as const } : {}),
})

/* The database has no skill, tier, colour or description any more; the demo
   pages that still read them get a summary of the new fields. */
export const trackFromRow = (r: TrackRow): Track => {
  const t: Track = {
    id: r.id,
    name: r.name,
    overview: r.overview ?? '',
    ...(r.area === 'work' ? { area: 'work' as const } : {}),
    technical: r.technical_values ?? '',
    personal: r.personal_values ?? '',
    market: r.market_values ?? '',
    asset: r.asset_value ?? '',
    technicalSkills: r.technical_skills ?? '',
    marketingSkills: r.marketing_skills ?? '',
    personalSkills: r.personal_skills ?? '',
    skills: r.skills ?? [],
    priceEgp: r.price_egp ?? null,
    listed: r.listed ?? true,
    ...(r.stage ? { stage: r.stage } : {}),
    nextIds: r.next_ids ?? [],
    videoUrl: r.video_url ?? null,
    tabVideos: r.tab_videos ?? {},
    skill: (r.skills ?? []).map(s => s.name).join(', '),
    tier: 'T2',
    color: 'brand',
    blurb: '',
  }
  return { ...t, blurb: programBlurb(t) }
}

/* ---------------- the seven lists ----------------
   Same columns on tracks, loops and sessions, so one pair of helpers. */

type ListColumns = Pick<LoopRow,
  'technical_values' | 'personal_values' | 'market_values' | 'asset_value'
  | 'technical_skills' | 'marketing_skills' | 'personal_skills' | 'skills'>

const listsToRow = (v: ValueLists): Required<ListColumns> => ({
  technical_values: v.technical ?? '',
  personal_values: v.personal ?? '',
  market_values: v.market ?? '',
  asset_value: v.asset ?? '',
  technical_skills: v.technicalSkills ?? '',
  marketing_skills: v.marketingSkills ?? '',
  personal_skills: v.personalSkills ?? '',
  skills: v.skills ?? [],
})

const listsFromRow = (r: ListColumns): ValueLists => ({
  technical: r.technical_values ?? '',
  personal: r.personal_values ?? '',
  market: r.market_values ?? '',
  asset: r.asset_value ?? '',
  technicalSkills: r.technical_skills ?? '',
  marketingSkills: r.marketing_skills ?? '',
  personalSkills: r.personal_skills ?? '',
  skills: r.skills ?? [],
})

/* ---------------- loops (courses) ---------------- */

export const loopToRow = (l: Loop): LoopRow => ({
  id: l.id,
  track_id: l.trackId,
  code: l.code,
  name: l.name,
  idx: Math.max(1, Math.round(l.index)),
  /* Unset reads as one: a course saved before the weekly rhythm existed met
     once a week, and one lecture is the answer that changes nothing. */
  lectures_per_week: l.lecturesPerWeek ?? 1,
  duration_hours: l.durationHours ?? null,
  start_date: l.startDate,
  end_date: l.endDate,
  status: l.status,
  listed: l.listed ?? true,
  price_egp: l.priceEgp ?? null,
  overview: l.overview ?? '',
  video_url: l.videoUrl ?? null,
  tab_videos: l.tabVideos ?? {},
  ...listsToRow(l),
})

export const loopFromRow = (r: LoopRow): Loop => ({
  id: r.id,
  code: r.code,
  trackId: r.track_id,
  name: r.name,
  index: r.idx,
  lecturesPerWeek: r.lectures_per_week ?? 1,
  durationHours: r.duration_hours ?? null,
  startDate: r.start_date,
  endDate: r.end_date,
  status: r.status,
  listed: r.listed ?? true,
  priceEgp: r.price_egp ?? null,
  overview: r.overview ?? '',
  videoUrl: r.video_url ?? null,
  tabVideos: r.tab_videos ?? {},
  ...listsFromRow(r),
  cohortIds: [],
})

/* ---------------- sessions ---------------- */

type StoredTask = Omit<Task, 'modelAnswer' | 'options'> & { options: Array<Omit<Option, 'correct'>> }
type StoredCheck = Omit<VideoCheck, 'options'> & { options: Array<Omit<Option, 'correct'>> }
type StoredVideo = Omit<VideoAsset, 'checks'> & { checks?: StoredCheck[] }
type StoredTitle = Omit<Title, 'tasks' | 'video'> & {
  tasks: StoredTask[]
  video: StoredVideo | null
}

export interface SessionPayload {
  row: SessionRow
  keys: SessionKeys
}

export function sessionToPayload(s: Session): SessionPayload {
  const keys: SessionKeys = {}

  const hide = (id: string, options: Option[]): Array<Omit<Option, 'correct'>> => {
    const correct = options.filter(o => o.correct).map(o => o.id)
    if (correct.length) keys[id] = { ...(keys[id] ?? {}), correct }
    return options.map(({ correct: _c, ...o }) => o)
  }

  const titles: StoredTitle[] = s.titles.map(t => ({
    ...t,
    video: t.video
      ? t.video.checks?.length
        ? { ...t.video, checks: t.video.checks.map(c => ({ ...c, options: hide(c.id, c.options) })) }
        : t.video
      : null,
    tasks: t.tasks.map(task => {
      const { modelAnswer, options, ...rest } = task
      if (modelAnswer) keys[task.id] = { ...(keys[task.id] ?? {}), modelAnswer }
      return { ...rest, options: hide(task.id, options) }
    }),
  }))

  return {
    row: {
      id: s.id,
      loop_id: s.loopId,
      code: s.code ?? '',
      name: s.name,
      summary: s.summary ?? '',
      type: s.type,
      status: s.status,
      sort_order: s.order,
      instructor_id: s.instructorId,
      scheduled_at: s.scheduledAt,
      duration_min: Math.max(0, Math.round(s.durationMin || 0)),
      meeting_url: s.meetingUrl ?? null,
      recording_ready: !!s.recordingReady,
      content: { titles, flowOrder: s.flowOrder ?? null },
      ...listsToRow(s),
      video_url: s.videoUrl ?? null,
      created_at: s.createdAt,
    },
    keys,
  }
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

function taskFromStored(raw: StoredTask, key: SessionKeys[string] | undefined): Task {
  const correct = new Set(key?.correct ?? [])
  return {
    ...raw,
    options: asArray<Omit<Option, 'correct'>>(raw.options).map(o => ({ ...o, correct: correct.has(o.id) })),
    ...(key?.modelAnswer ? { modelAnswer: key.modelAnswer } : {}),
  }
}

function checkFromStored(raw: StoredCheck, key: SessionKeys[string] | undefined): VideoCheck {
  const correct = new Set(key?.correct ?? [])
  return {
    ...raw,
    points: Number(raw.points) || 0,
    options: asArray<Omit<Option, 'correct'>>(raw.options).map(o => ({ ...o, correct: correct.has(o.id) })),
  }
}

function titleFromStored(raw: StoredTitle, keys: SessionKeys | undefined): Title {
  const video = (raw.video ?? null) as StoredVideo | null
  return {
    ...raw,
    video: video
      ? video.checks
        ? {
            ...video,
            checks: asArray<StoredCheck>(video.checks).map(c => checkFromStored(c, keys?.[c.id])),
          } as VideoAsset
        : video as VideoAsset
      : null,
    materials: asArray<Material>(raw.materials),
    tasks: asArray<StoredTask>(raw.tasks).map(t => taskFromStored(t, keys?.[t.id])),
  }
}

export function sessionFromRow(r: SessionRow, keys?: SessionKeys): Session {
  const content = r.content ?? { titles: [] }
  return {
    id: r.id,
    code: r.code,
    loopId: r.loop_id,
    name: r.name,
    summary: r.summary,
    type: r.type,
    status: r.status,
    order: r.sort_order,
    instructorId: r.instructor_id,
    scheduledAt: r.scheduled_at,
    durationMin: r.duration_min,
    ...(r.meeting_url ? { meetingUrl: r.meeting_url } : {}),
    recordingReady: r.recording_ready,
    videoUrl: r.video_url ?? null,
    ...listsFromRow(r),
    titles: asArray<StoredTitle>(content.titles).map(t => titleFromStored(t, keys)),
    ...(Array.isArray(content.flowOrder) ? { flowOrder: content.flowOrder } : {}),
    createdAt: r.created_at ?? new Date().toISOString(),
    updatedAt: r.updated_at ?? r.created_at ?? new Date().toISOString(),
  }
}

/** A published session that is not released yet: a locked card with a name
 *  and a date, and nothing inside it. */
export function upcomingStub(r: UpcomingSessionRow): Session {
  return {
    id: r.id,
    code: r.code,
    loopId: r.loop_id,
    name: r.name,
    summary: '',
    type: r.type,
    status: 'scheduled',
    order: r.sort_order,
    instructorId: null,
    scheduledAt: r.scheduled_at,
    durationMin: r.duration_min,
    titles: [],
    createdAt: r.scheduled_at ?? new Date().toISOString(),
    updatedAt: r.scheduled_at ?? new Date().toISOString(),
  }
}
