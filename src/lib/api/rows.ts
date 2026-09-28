/* ==========================================================================
   Row shapes of the Supabase tables, as the API returns them (snake_case).
   Hand-written to match supabase/migrations/*; the store keeps its own
   camelCase domain types, and `mappers.ts` is the only place the two meet.
   ========================================================================== */

import type { PayPlan } from '@/lib/billing'
import type {
  ContentArea, Loop, ProgramStage, PublishStatus, SessionType, TabVideos, TaskKind,
} from '@/lib/types'

type LoopStatusRow = Loop['status']
export type AppRole = 'admin' | 'student' | 'parent'
export type EnrollmentStatus = 'active' | 'completed' | 'dropped'
export type SubmissionStatus = 'submitted' | 'graded'

export interface ProfileRow {
  id: string
  role: AppRole
  name: string
  email: string
  age: number | null
  phone: string | null
  /* What a family fills in when they enrol a hero: the 14-digit national ID
     (which is also where `age` comes from), the number the mentor reaches
     them on, and the name in the three parts they typed it in. */
  national_id: string | null
  whatsapp: string | null
  first_name: string | null
  second_name: string | null
  last_name: string | null
  /** Migration region. Where this family is — a country code from
   *  lib/region. The parent picks it on the first step of the enrol form;
   *  an admin can correct it on Payments. Null is nobody has said. */
  region?: string | null
  disabled: boolean
  must_change_password: boolean
  created_at: string
  updated_at: string
}

export interface EnrollmentRow {
  student_id: string
  loop_id: string
  status: EnrollmentStatus
  enrolled_at: string
  enrolled_by: string | null
  updated_at: string
}

export interface TrackRow {
  id: string
  name: string
  /** Migration 5. What the program covers, as Markdown. */
  overview?: string
  technical_values: string
  personal_values: string
  market_values: string
  asset_value: string
  technical_skills: string
  marketing_skills: string
  personal_skills: string
  skills: Array<{ name: string; category: 'technical' | 'marketing' | 'personal' }>
  /** Migration parent_payments. EGP; null means it is not for sale yet. */
  price_egp?: number | null
  /** Migration program_path. null means the column is read off the lines. */
  stage?: ProgramStage | null
  /** Migration program_path. The programs this one leads to. */
  next_ids?: string[]
  /** Migration marketplace_listing. Show it in the Marketplace. */
  listed?: boolean
  /** Migration program_area. Sent only for a Work program, so saving a
   *  Material one never depends on the column. */
  area?: ContentArea
  /** Migration video_on_content. The program's intro video, shown in the
   *  Marketplace before anybody enrols. */
  video_url?: string | null
  /** Migration tab_videos. A video link per tab. */
  tab_videos?: TabVideos
  created_at?: string
  updated_at?: string
}

export interface LoopRow {
  id: string
  track_id: string
  code: string
  name: string
  idx: number
  /** Lectures a week for this course, 1 or 2. The admin sets it on Programs;
   *  a family picks which days they fall on. */
  lectures_per_week?: number
  /** Migration tab_videos. A video link per tab. */
  tab_videos?: TabVideos
  /** Teaching hours in this course. null: not set. */
  duration_hours?: number | null
  start_date: string
  end_date: string
  status: LoopStatusRow
  /** Migration marketplace_listing. Offer this course on its own. */
  listed?: boolean
  /** Migration marketplace_listing. EGP for this one course; null is
   *  'only sold with its program'. */
  price_egp?: number | null
  /** Migration values_on_courses_and_sessions: what the course covers, and
   *  the same seven lists a program has. */
  overview?: string
  technical_values?: string
  personal_values?: string
  market_values?: string
  asset_value?: string
  technical_skills?: string
  marketing_skills?: string
  personal_skills?: string
  skills?: Array<{ name: string; category: 'technical' | 'marketing' | 'personal' }>
  /** Migration video_on_content. The course's own video. */
  video_url?: string | null
  created_at?: string
  updated_at?: string
}

/* ---------------- families, prices and payments ---------------- */

export type PayMethod = 'instapay' | 'vodafone_cash' | 'wallet' | 'admin'
export type PayStatus = 'pending' | 'approved' | 'rejected'

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  instapay: 'InstaPay',
  vodafone_cash: 'Vodafone Cash',
  wallet: 'Family wallet',
  /** Migration admin_pay_method. The admin put it on the wallet themselves. */
  admin: 'Added by the admin',
}

export interface PaymentRow {
  id: string
  parent_id: string
  /** null on a wallet top-up: that money is the family's, not a student's. */
  student_id: string | null
  /** null once the program itself is deleted — `program_name` still reads. */
  track_id: string | null
  /** Migration marketplace_listing. The single course this buys; null is
   *  the whole program named by track_id. */
  loop_id?: string | null
  program_name: string
  amount_egp: number
  method: PayMethod
  /** The wallet or InstaPay address it came from, or the transfer number. */
  sender_ref: string
  proof_path: string | null
  note: string | null
  status: PayStatus
  /** Migration subscriptions. Which package the transfer buys — null on the
   *  program-only payments filed before packages existed. */
  plan?: PayPlan | null
  /** Migration wallet. A transfer for a student, money into the wallet, or
   *  (migration kit_orders) a kit bought out of it. */
  kind?: PayKind
  /** Migration kit_orders. Which marketplace listing was bought. */
  product_id?: string | null
  /** Migration kit_orders. Kit orders only: when the admin handed it over.
   *  Null is a kit that is paid for and still owed. */
  fulfilled_at?: string | null
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface PayAccountsRow {
  id: boolean
  instapay_handle: string
  vodafone_number: string
  instructions: string
  /* Migration subscriptions: each channel is opened or closed on its own
     and carries the link a family taps and the QR they scan. `*_qr` is a
     path in the public `pay-qr` bucket; null means none. `vodafone_number`
     above is left from the migration before and is no longer shown. */
  instapay_on?: boolean
  instapay_link?: string
  instapay_qr?: string | null
  vodafone_on?: boolean
  vodafone_link?: string
  vodafone_qr?: string | null
  support_whatsapp?: string
  updated_at: string
}

/** Migration subscriptions. The four packages, and how many days before a
 *  child's paid-through date the platform shuts. */
export interface BillingSettingsRow {
  id: boolean
  monthly_egp: number | null
  quarterly_egp: number | null
  half_annual_egp: number | null
  annual_egp: number | null
  monthly_on: boolean
  quarterly_on: boolean
  half_annual_on: boolean
  annual_on: boolean
  close_before_days: number
  updated_at: string
}

/** What one child is paid up to. No row means they never paid — and a child
 *  who never paid is never locked out. */
export interface SubscriptionRow {
  student_id: string
  paid_through: string
  last_plan: PayPlan | null
  updated_at: string
}

/** One child on a parent's account, with what they are enrolled in. */
export interface GuardianChild {
  profile: ProfileRow
  enrollments: EnrollmentRow[]
}

/** What `sessions.content` holds — the session's titles with every answer
 *  key stripped out, plus the student-facing order. */
export interface SessionContent {
  titles: unknown[]
  flowOrder?: string[] | null
}

export interface SessionRow {
  id: string
  loop_id: string
  code: string
  name: string
  summary: string
  type: SessionType
  status: PublishStatus
  sort_order: number
  instructor_id: string | null
  scheduled_at: string | null
  duration_min: number
  meeting_url: string | null
  recording_ready: boolean
  content: SessionContent
  /** Migration values_on_courses_and_sessions: the same seven lists a
   *  program has. Written through admin_save_session like the rest. */
  technical_values?: string
  personal_values?: string
  market_values?: string
  asset_value?: string
  technical_skills?: string
  marketing_skills?: string
  personal_skills?: string
  skills?: Array<{ name: string; category: 'technical' | 'marketing' | 'personal' }>
  /** Migration video_on_content. A preview of this session, separate from
   *  the teaching recordings on its topics. */
  video_url?: string | null
  rev?: number
  published_at?: string | null
  created_at?: string
  updated_at?: string
}

/** { "<taskId>": { correct: ["<optionId>"], modelAnswer: "…" } } */
export type SessionKeys = Record<string, { correct?: string[]; modelAnswer?: string }>

export interface UpcomingSessionRow {
  id: string
  loop_id: string
  code: string
  name: string
  sort_order: number
  type: SessionType
  scheduled_at: string | null
  duration_min: number
}

export interface StepProgressRow {
  student_id: string
  session_id: string
  step_key: string
  done_at: string
}

export interface SubmissionRow {
  id: string
  student_id: string
  session_id: string
  task_id: string
  task_kind: TaskKind
  question: string
  points: number
  choice_ids: string[] | null
  answer_text: string | null
  link_url: string | null
  file_path: string | null
  is_correct: boolean | null
  score: number | null
  auto_graded: boolean
  status: SubmissionStatus
  feedback: string | null
  graded_by: string | null
  graded_at: string | null
  attempts: number
  created_at: string
  updated_at: string
}

/** What `submit_answer` returns: never the key, never the grading note. */
export interface SubmitResult {
  id: string
  task_id: string
  session_id: string
  task_kind: TaskKind
  status: SubmissionStatus
  is_correct: boolean | null
  score: number | null
  points: number
  attempts: number
  feedback: string | null
  choice_ids: string[] | null
  answer_text: string | null
  link_url: string | null
  file_path: string | null
  created_at: string
  updated_at: string
  already?: boolean
  locked?: boolean
}

/* ---------------- the family wallet ---------------- */

/** Migration wallet. What a payment is for: a student, or the wallet. */
export type PayKind = 'program' | 'topup' | 'kit'

/** One family's balance, in EGP. No row means they never charged it. */
export interface WalletRow {
  parent_id: string
  balance_egp: number
  updated_at: string
}

export type WalletMove = 'topup' | 'spend' | 'refund'

/** One movement, with the balance it left behind. */
export interface WalletEntryRow {
  id: string
  parent_id: string
  move: WalletMove
  amount_egp: number
  balance_after: number
  payment_id: string | null
  student_id: string | null
  note: string
  created_at: string
}

/** Migration parent_view. The mentor's note about one child, on one day. */
export interface MentorFeedbackRow {
  id: string
  student_id: string
  track_id: string | null
  /** The sitting it is about; null is a note about the hero in general. */
  session_id: string | null
  /** yyyy-mm-dd, the mentor's own day. */
  day: string
  body: string
  focus: string
  /** Older notes only — recording was dropped, these are no longer played. */
  voice_path: string | null
  voice_sec: number | null
  author_id: string | null
  created_at: string
  updated_at: string
}

/* ---------------- access requests ---------------- */

/** Migration access_requests. What a family asked for, and the answer. */
export type RequestStatus = 'pending' | 'approved' | 'declined'

export interface AccessRequestRow {
  id: string
  parent_id: string
  student_id: string
  /** The program asked for. A course request names its program too. */
  track_id: string | null
  /** One course of it; null means the whole program was asked for. */
  loop_id: string | null
  note: string
  status: RequestStatus
  /** What the admin wrote back — the reason, or what opens when. */
  answer_note: string
  /** Migration booking_and_notices. The weekly window the family asked for,
   *  before the admin books anything — see `session_bookings`. */
  window_id?: string | null
  /** Migration 2 (lectures/sections round two). The intake the admin
   *  answered them into — what the calendar slices by. */
  batch_id?: string | null
  /** The rhythm the family asked for: 2-hour lectures a week, and how long
   *  each section is. null on requests filed before it was asked. */
  lectures_per_week?: number | null
  section_minutes?: number | null
  /** The week itself, once the form started asking for days and clock
   *  times: { lectures: [{ day, start, min }], sections: [...] }. Read it
   *  with parseAsk() — the two numbers above are derived from it, and are
   *  all an older row has. */
  schedule_ask?: unknown
  answered_by: string | null
  answered_at: string | null
  created_at: string
  updated_at: string
}

/* ---------------- weekly availability and bookings ---------------- */

/** A recurring weekly teaching slot, authored in Africa/Cairo — "Sunday
 *  16:00–18:00", not a date. See `window_occurrences()` for real dates. */
/** A two-hour sitting where the material is taught, or the short one on
 *  each of the other days where the student is worked with on what the
 *  lecture gave them. The durations are a database constraint rather than a
 *  convention: a lecture is exactly 120 minutes, a section is 15-60. */
export type SlotKind = 'lecture' | 'section'

export interface AvailabilityWindowRow {
  id: string
  kind: SlotKind
  /** A lecture falls on one weekday. A section carries none — it is offered
   *  daily and the family says which days they want it on. */
  weekday: number | null
  start_min: number
  end_min: number
  track_id: string | null
  /** The course this window belongs to. Null on rows written before a time
   *  carried one — those still stand for every course, and
   *  `fetchOfferedWindows` reads them. */
  loop_id: string | null
  /** The intake this hour is for. A batch is created with the time now, so
   *  "Tuesdays at four" and "who is in it" are one answer. */
  batch_id: string | null
  /** The shortest sitting inside this opening, and what it divides by when
   *  a family names no length. `start_min`/`end_min` bound the opening.
   *  Null is the whole opening as one sitting, which is every row written
   *  before slots existed. */
  slot_min: number | null
  /** The longest sitting a family may ask for here. Null reads as the
   *  shortest — one fixed length, how every row behaved before the range. */
  slot_max_min?: number | null
  mentor: string
  capacity: number
  active: boolean
  note: string
  created_at: string
  updated_at: string
}

/** What suggest_windows() hands back: a window this student could actually
 *  take -- offered for the program, and not landing on an hour already on
 *  their calendar -- with how many places are left in it. */
export interface SuggestedWindowRow {
  id: string
  kind: SlotKind
  weekday: number | null
  start_min: number
  end_min: number
  loop_id: string
  mentor: string
  capacity: number
  note: string
  seats_left: number
}

export interface WindowOccurrenceRow {
  starts_at: string
  duration_min: number
}

/** One student, in one window, at one real moment. */
export interface SessionBookingRow {
  id: string
  student_id: string
  loop_id: string
  session_id: string | null
  window_id: string | null
  kind: SlotKind
  /** Which intake this sitting belongs to. Null for anything booked before
   *  batches existed — the calendar shows those under "No batch". */
  batch_id: string | null
  starts_at: string
  duration_min: number
  /** Kept by a trigger at starts_at + duration_min, so the no-overlap
   *  exclusion constraint has two plain columns to build a range from. */
  ends_at: string
  status: 'booked' | 'done' | 'cancelled'
  request_id: string | null
  meeting_url: string | null
  /** When the hero (or their parent) asked for the link — their own claim. */
  joined_at: string | null
  /** The record, and only an admin writes it. Null means not answered yet. */
  attended: boolean | null
  confirmed_by: string | null
  confirmed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** One chosen slot on a request: the window, and — for a day-less section
 *  — the day the family wants it on. */
export interface RequestSlotRow {
  id: string
  request_id: string
  window_id: string
  weekday: number | null
}

/** A batch: the students who started one course together. The unit an admin
 *  actually runs the place in, and what the calendar slices by. */
export interface CourseBatchRow {
  id: string
  loop_id: string
  name: string
  starts_on: string
  status: 'forming' | 'running' | 'done'
  seats: number
  /** Migration region. Where this intake is run: 'anywhere', or a country
   *  the enrol form matches against the family's own clock. See lib/region. */
  region?: string
  note: string
  created_at: string
  updated_at: string
}

/** One line of a window's roster: a student enrolled in its course, and
 *  whether the admin has put them in this window yet. */
export interface RosterRow {
  student_id: string
  name: string
  email: string
  assigned: boolean
  sittings: number
}

/** One published occurrence, from window_grid() — availability drawn on the
 *  admin's calendar beside the sittings actually booked into it. */
export interface WindowGridRow {
  window_id: string
  loop_id: string
  kind: SlotKind
  mentor: string
  capacity: number
  starts_at: string
  duration_min: number
  taken: number
  /** Migration region. The intake that published this hour, so an untaken
   *  hour is read under the batch it belongs to. */
  batch_id?: string | null
}

/* ---------------- notifications ---------------- */

export interface NotificationRow {
  id: string
  recipient_id: string
  kind: string
  title: string
  body: string
  link: string
  read_at: string | null
  created_at: string
}
