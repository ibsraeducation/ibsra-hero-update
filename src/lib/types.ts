/* ==========================================================================
   IBSRA Heros — domain model
   Content hierarchy:  Track → Loop → Session → Title → { Video, Material[], Task[] }
   A Loop is the 8–10 week unit of sale from the business model.
   ========================================================================== */

/** What a person is. An instructor is still a person the platform knows —
 *  sessions are assigned to one and cohorts are run by one — they just do not
 *  have a workspace of their own to sign into. */
export type Role = 'admin' | 'instructor' | 'student' | 'parent'

/** The workspaces that exist. */
export type ViewRole = Exclude<Role, 'instructor'>

export const VIEW_ROLES: ViewRole[] = ['admin', 'student', 'parent']

export type SessionType = 'recorded' | 'live'
export type PublishStatus = 'draft' | 'scheduled' | 'published' | 'archived'

export type MaterialKind = 'pdf' | 'slides' | 'sheet' | 'link' | 'code' | 'image' | 'dataset' | 'video'
export type TaskKind = 'mcq' | 'multi' | 'short' | 'long' | 'upload' | 'link' | 'imagetext'

export interface Option {
  id: string
  text: string
  correct: boolean
}

export interface Task {
  id: string
  order: number
  kind: TaskKind
  question: string
  /** Shown to the student before they answer. */
  hint?: string
  /** Model answer / grading note — instructor-facing only. */
  modelAnswer?: string
  options: Option[]
  points: number
  required: boolean
  /** The step type this counts as in the sequence. Unset reads off the kind. */
  category?: StepCategory
  /** Technical and branding work: a video the student watches before doing
   *  it. Not shown, and not used, for any other category. */
  refVideoUrl?: string
}

export interface Material {
  id: string
  order: number
  kind: MaterialKind
  name: string
  url: string
  /** Bytes; 0 for external links. */
  size: number
  note?: string
  /** The step type this counts as in the sequence. Unset means a plain file;
   *  'video' marks an extra recording living among the topic's files. */
  category?: StepType
  /** Live step only: ISO date-time the class starts. */
  startsAt?: string
  /** Live step only: how long it runs, in minutes. */
  durationMin?: number
}

/** What a checkpoint asks for: one of a list of options, or work the student
 *  goes and does and then writes up. */
export type VideoCheckKind = 'mcq' | 'technical'

/** A question the recording stops for. The moment the playhead reaches or
 *  passes `atSec` the video pauses and this is asked — the point is to catch
 *  the student who left it playing in another tab. */
export interface VideoCheck {
  id: string
  /** Seconds into the recording. */
  atSec: number
  kind: VideoCheckKind
  question: string
  /** A picture shown with the question — a frame from the video, a diagram. */
  image?: string
  /** MCQ only: what there is to pick from, one of them marked correct. */
  options: Option[]
  /** What answering it is worth, on the same scale as a task's points. */
  points: number
  /** Technical task only: the student sends a picture of what they did
   *  alongside the words. */
  wantsImage?: boolean
  /** Whether the recording can be carried on with this unanswered. */
  required: boolean
}

export interface VideoAsset {
  /** The recording's own name — a topic and its video are named separately. */
  name?: string
  provider: 'upload' | 'youtube' | 'vimeo' | 'drive'
  url: string
  durationSec: number
  thumbnail?: string
  captions: boolean
  /** Transcoding state — mocked in dev. */
  state: 'ready' | 'processing' | 'failed' | 'none'
  /** Questions that stop playback at a given minute. Absent or empty plays
   *  straight through. */
  checks?: VideoCheck[]
}

/** A recording's checkpoints in the order the student meets them. */
export const videoChecks = (v: VideoAsset | null | undefined): VideoCheck[] =>
  [...(v?.checks ?? [])].sort((a, b) => a.atSec - b.atSec)

/** What a title is: something taught, or something built. Both hold the same
 *  things — a recording, files, questions — so this is a label on the same
 *  box, not a second shape to maintain. */
export type TitleKind = 'topic' | 'project'

export const TITLE_KIND_META: Record<TitleKind, {
  /** The word for one of them, as it appears in front of its number. */
  one: string
  /** The plural, for counts. */
  many: string
  tone: string
  /** What the field says before anyone has named it. */
  blank: string
  hint: string
}> = {
  topic: {
    one: 'Topic', many: 'topics', tone: 'brand', blank: 'Untitled topic',
    hint: 'Something taught — a recording, its material and its questions',
  },
  project: {
    one: 'Project', many: 'projects', tone: 'teal', blank: 'Untitled project',
    hint: 'Something built — the brief, its material and the work handed in',
  },
}

export const TITLE_KINDS: TitleKind[] = ['topic', 'project']

/** Which column a project sits in on the board. The mentor sets it on the
 *  project itself, so a batch moving through a course moves together. */
export type ProjectState = 'done' | 'building' | 'soon'

export const PROJECT_STATE_META: Record<ProjectState, { label: string; tone: string }> = {
  done: { label: 'Done', tone: 'teal' },
  building: { label: 'In progress', tone: 'brand' },
  soon: { label: 'Scheduled', tone: 'sky' },
}

export const PROJECT_STATES: ProjectState[] = ['soon', 'building', 'done']

/** A Title is one teaching topic — or one project — inside a session. It owns
 *  the video, the material set and the Q&A tasks for that piece. */
export interface Title {
  id: string
  order: number
  name: string
  summary?: string
  estimatedMin: number
  /** Absent means a topic: everything authored before projects existed. */
  kind?: TitleKind
  /** Projects only. Absent means scheduled — nothing has started on it. */
  state?: ProjectState
  video: VideoAsset | null
  materials: Material[]
  tasks: Task[]
}

/** A title's kind, with the old default spelled out in one place. */
export const titleKind = (t: Pick<Title, 'kind'>): TitleKind => t.kind ?? 'topic'

/** Where a project stands, as the mentor last said. */
export const titleState = (t: Pick<Title, 'state'>): ProjectState => t.state ?? 'soon'

/** What number this one wears. Topics and projects are counted apart, so the
 *  first project is "Project 1" even with three topics above it. */
export const titleNumber = (titles: Pick<Title, 'id' | 'kind'>[], id: string): number => {
  const t = titles.find(x => x.id === id)
  if (!t) return 0
  return titles.filter(x => titleKind(x) === titleKind(t)).findIndex(x => x.id === id) + 1
}

/** "Topic 2" / "Project 1" — the label a title is known by on every screen. */
export const titleLabel = (titles: Pick<Title, 'id' | 'kind'>[], id: string): string => {
  const t = titles.find(x => x.id === id)
  return t ? `${TITLE_KIND_META[titleKind(t)].one} ${titleNumber(titles, id)}` : ''
}

/* ---------- the student-facing flow ----------
   A topic owns its video, its material and its tasks, but it does not dictate
   the order the student meets them in. That order is one flat list per
   session, so a session can run video → task → task → material → video. */

/** The medium a step is delivered in — what it is made of. */
export type StepKind = 'video' | 'material' | 'task'

/** What a step actually is, standing on its own. Every step in a sequence
 *  carries one of these, so a session can run a technical task, then a
 *  personal branding piece, then an MCQ, whatever the topic it came from. */
export type StepType = 'video' | 'live' | 'technical' | 'branding' | 'mcq' | 'imagetext' | 'material'

/** Everything except the video: a recording's type is the recording itself,
 *  so it is not something to choose. Stored on the task or the material. */
export type StepCategory = Exclude<StepType, 'video'>

export interface Step {
  /** Stable and order-independent: v:<titleId> · m:<materialId> · t:<taskId> */
  key: string
  kind: StepKind
  /** The step's own type, set by hand or read off the item. */
  type: StepType
  /** The topic that owns the underlying item. */
  titleId: string
  /** Material or task id; empty for a video step. */
  refId: string
}

export const STEP_TYPE_META: Record<StepType, {
  label: string
  short: string
  tone: string
  /** The medium a step of this type is made of. */
  kind: StepKind
  hint: string
}> = {
  video: {
    label: 'Video', short: 'Video', tone: 'brand', kind: 'video',
    hint: 'The recording that teaches the topic',
  },
  technical: {
    label: 'Technical task', short: 'Technical', tone: 'teal', kind: 'task',
    hint: 'Hands-on work in the craft itself',
  },
  branding: {
    label: 'Personal branding', short: 'Branding', tone: 'gold', kind: 'task',
    hint: 'Profile, portfolio or client-facing work',
  },
  mcq: {
    label: 'MCQ question', short: 'MCQ', tone: 'sky', kind: 'task',
    hint: 'Multiple choice, marked on the spot',
  },
  imagetext: {
    label: 'Image + text question', short: 'Image + text', tone: 'gold', kind: 'task',
    hint: 'The student sends a picture of the work and writes about it',
  },
  live: {
    label: 'Live session', short: 'Live', tone: 'rose', kind: 'material',
    hint: 'A class the student joins at a set time',
  },
  material: {
    label: 'Material file', short: 'Material', tone: 'rose', kind: 'material',
    hint: 'A file the student reads, downloads or annotates',
  },
}

/** The types an item of each medium can honestly be labelled with — a file
 *  cannot become a question, but it can be technical or branding work. */
export const TYPES_FOR: Record<StepKind, StepType[]> = {
  video: ['video'],
  task: ['technical', 'branding', 'mcq', 'imagetext'],
  material: ['material', 'live', 'technical', 'branding', 'video'],
}

/** The types that can be added straight into a sequence. A video belongs to
 *  its topic's recording, so it is added in the Video tab instead. */
export const ADDABLE_TYPES: StepType[] = ['live', 'technical', 'branding', 'mcq', 'imagetext', 'material']

/* The seven lists a program, a course and a session describe themselves
   with — see lib/programInfo. The skills array is filled from the three
   skill lists on save. */
export interface ValueLists {
  technical?: string
  personal?: string
  market?: string
  asset?: string
  technicalSkills?: string
  marketingSkills?: string
  personalSkills?: string
  skills?: TrackSkill[]
}

export interface Session extends ValueLists {
  id: string
  code: string
  loopId: string
  name: string
  summary?: string
  type: SessionType
  status: PublishStatus
  order: number
  instructorId: string | null
  /** ISO string. For live sessions this is the class time; for recorded, the release date. */
  scheduledAt: string | null
  durationMin: number
  /** Live only. */
  meetingUrl?: string
  recordingReady?: boolean
  /** A preview of this session, shown in the Marketplace outline — separate
   *  from the teaching recordings on its topics. See `Track.videoUrl`. */
  videoUrl?: string | null
  /** The card's picture: an image URL, or `storage://…` for an uploaded one.
   *  Empty falls back to the programme colour, exactly as before. */
  cover?: string
  titles: Title[]
  /** Step keys in the order the student meets them. Anything not listed falls
   *  back to its default place, so this can never go stale enough to hide
   *  content — see sessionFlow(). */
  flowOrder?: string[]
  createdAt: string
  updatedAt: string
}

export interface Loop extends ValueLists {
  id: string
  code: string
  trackId: string
  name: string
  /** 8–10 week loop number within the track. */
  index: number
  startDate: string
  endDate: string
  status: 'planning' | 'running' | 'closed'
  cohortIds: string[]
  /** Lectures a week for this course, 1 or 2 — the course's rhythm, set by
   *  the admin on Programs. A family picks which days those fall on, and a
   *  section on every other day of the week. Unset reads as 1. */
  lecturesPerWeek?: number
  /** Teaching hours in this course, lectures and sections together. A
   *  program runs for the sum of its courses; the enrol calculator divides
   *  that by the weekly hours a family picks. Unset: not given yet. */
  durationHours?: number | null
  /** What the course covers, as a Markdown outline — written with the same
   *  bullets and sub-bullets a program's lists use. Empty shows nothing. */
  overview?: string
  /** Migration marketplace_listing. Offer this course in the Marketplace on
   *  its own. Unset reads as listed, which is what every course saved before
   *  the flag existed was. */
  listed?: boolean
  /** EGP for this one course, bought without the rest of the program.
   *  `null`/unset means it is only sold as part of its program — never shown
   *  as free. */
  priceEgp?: number | null
  /** The course's own video — see `Track.videoUrl`. */
  videoUrl?: string | null
  /** A video per tab — see TabVideos. */
  tabVideos?: TabVideos
}

/* ---------- where a program sits on the path ----------
   Derived from the program graph in lib/programs, never typed twice: the
   one everybody starts on, one of the specializations that follow it, or
   the capstone they all lead to. A program can override its own place. */

export type ProgramStage = 'foundation' | 'specialization' | 'capstone'

export const PROGRAM_STAGE_META: Record<ProgramStage, {
  /** Plural — the column heading on the map. */
  label: string
  /** Singular — the chip on a card. */
  one: string
  tone: string
  /** What the stage is, in the family's own words. */
  blurb: string
}> = {
  foundation: {
    label: 'Where everybody starts', one: 'Foundation', tone: 'brand',
    blurb: 'The first program. It is what the specializations are chosen from.',
  },
  specialization: {
    label: 'Specializations', one: 'Specialization', tone: 'sky',
    blurb: 'Pick the craft. Each one is a full path of its own.',
  },
  capstone: {
    label: 'Where it leads', one: 'Capstone', tone: 'gold',
    blurb: 'The last program, whichever specialization was taken.',
  },
}

export const PROGRAM_STAGES = Object.keys(PROGRAM_STAGE_META) as ProgramStage[]

export type SkillCategory = 'technical' | 'marketing' | 'personal'

export interface TrackSkill {
  name: string
  category: SkillCategory
}

/** A video link per tab — what a family watches while they read that tab.
 *  `covers` follows the order of the "what it covers" tabs; `lists` is keyed
 *  by the values-and-skills list. A tab with none falls back to the
 *  program's own `videoUrl`. */
export interface TabVideos {
  covers?: string[]
  lists?: Record<string, string>
}

/** Material is what the student learns from; Work is where they work on
 *  their own assets. Each has its own programs — see lib/area. */
export type ContentArea = 'material' | 'work'

export interface Track {
  id: string
  name: string
  /** What this program covers, as a Markdown outline — the same bullets a
   *  course overview uses. The first thing a family reads when they open it
   *  in the Marketplace. */
  overview?: string
  /** EGP, what a family pays for the whole program. `null`/unset means it
   *  is not for sale yet — it is never shown as free. */
  priceEgp?: number | null
  /** Migration marketplace_listing. Show this program in the Marketplace.
   *  Unset reads as listed: what Material holds is what is on sale, and this
   *  is the switch that takes one off. */
  listed?: boolean
  /** The area the program, its courses and its sessions live in. Unset is Material. */
  area?: ContentArea
  /** Where it sits on the path. Unset means it is worked out from the
   *  connections — see stageOf() in lib/programs. */
  stage?: ProgramStage
  /** The programs this one leads to, as the admin drew them on the map.
   *  This is the path: nothing else decides what follows what. */
  nextIds?: string[]

  /* The demo pages still read these four; the program form no longer sets them. */
  skill: string
  tier: 'T2' | 'T3'
  color: string
  blurb: string
  /* What the program is worth to the student, each a Markdown list. */
  technical?: string
  personal?: string
  market?: string
  asset?: string
  /* The skills it builds, one Markdown list per kind. `skills` below is
     filled from these on save. */
  technicalSkills?: string
  marketingSkills?: string
  personalSkills?: string
  /** The skills the student gains, each in one category. */
  skills?: TrackSkill[]
  /** A link the admin pastes — YouTube, Vimeo or Drive, the same providers a
   *  topic recording uses — shown in the Marketplace before anybody enrols.
   *  Not a `VideoAsset`: no checkpoints, no transcoding state. */
  videoUrl?: string | null
  /** A video per tab — see TabVideos. */
  tabVideos?: TabVideos
}

export interface Cohort {
  id: string
  name: string
  loopId: string
  instructorId: string | null
  seats: number
  studentIds: string[]
  schedule: string
}

export interface Person {
  id: string
  role: Role
  name: string
  email: string
  phone?: string
  city?: string
  avatarTone?: string
  createdAt: string

  /* student-only */
  age?: number
  parentId?: string
  cohortId?: string
  trackId?: string
  /** EGP, verified income logged by the mentor. */
  verifiedIncome?: number
  feesPaid?: number
  portfolioPieces?: number
  progress?: number

  /* instructor-only */
  expertise?: string[]
  cohortIds?: string[]
  reviewSlaHours?: number

  /* parent-only */
  childIds?: string[]
}

/* ---------- store shape ---------- */

/** Bumped whenever the persisted shape gains a collection. `migrate()` in
 *  the store fills the gap rather than throwing a saved DB away. */
export const DB_VERSION = 4

export interface DB {
  version: number
  tracks: Track[]
  loops: Loop[]
  cohorts: Cohort[]
  people: Person[]
  sessions: Session[]
  products: Product[]
}

/* ---------- ui vocabulary ---------- */

export const STATUS_META: Record<PublishStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'line' },
  scheduled: { label: 'Scheduled', tone: 'sky' },
  published: { label: 'Published', tone: 'teal' },
  archived: { label: 'Archived', tone: '' },
}

export const TASK_META: Record<TaskKind, { label: string; hint: string }> = {
  mcq: { label: 'Single choice', hint: 'One correct option' },
  multi: { label: 'Multiple choice', hint: 'Several correct options' },
  short: { label: 'Short answer', hint: 'One or two lines, mentor-graded' },
  long: { label: 'Long answer', hint: 'Paragraph, mentor-graded' },
  upload: { label: 'File upload', hint: 'Student submits a file' },
  link: { label: 'Link submission', hint: 'Student submits a published URL' },
  imagetext: { label: 'Image + text answer', hint: 'Student sends a picture and writes about it' },
}

export const MATERIAL_META: Record<MaterialKind, { label: string; tone: string }> = {
  pdf: { label: 'PDF', tone: 'rose' },
  slides: { label: 'Slides', tone: 'gold' },
  sheet: { label: 'Sheet', tone: 'teal' },
  link: { label: 'Link', tone: 'sky' },
  code: { label: 'Code', tone: 'brand' },
  image: { label: 'Image', tone: 'sky' },
  dataset: { label: 'Dataset', tone: 'teal' },
  /** An extra recording in a topic — the first one lives on the topic itself. */
  video: { label: 'Video', tone: 'brand' },
}

/* ==========================================================================
   Marketplace catalogue

   A Product is one thing a family can buy. It is deliberately separate from
   the content model above: a course in the catalogue is an offer with a
   price, an age band and a date, while a Loop is the teaching unit that
   actually runs. A product may point at a Track or a Loop, and when it does
   its content facts (courses, open sessions, minutes) are read live off the
   store instead of being typed in twice.
   ========================================================================== */

/** Two things are sold: a training program (taught, and built out in
 *  Material as courses → sessions → topics) and a kit (shipped). */
export type ProductCategory = 'program' | 'kit'

export type ProductStatus = 'draft' | 'published' | 'archived'

/** How the buyer receives it. A kit is shipped; everything else is taught. */
export type DeliveryMode = 'online' | 'onsite' | 'hybrid' | 'shipped'

export interface Product {
  id: string
  category: ProductCategory
  name: string
  summary: string
  status: ProductStatus
  /** EGP. `null` means the price has not been decided — never shown as free. */
  price: number | null
  /** Optional link into the curriculum, so counts come from real content. */
  trackId?: string | null
  loopId?: string | null
  instructorId?: string | null
  ageMin: number
  ageMax: number
  seats: number
  seatsTaken: number
  startDate: string | null
  endDate: string | null
  /** Human-written: "8–10 weeks", "2 weeks · 5 days", "3 hours". */
  duration: string
  delivery: DeliveryMode
  location?: string
  /** What the buyer actually gets — one line each, listed on the card. */
  highlights: string[]
  /** The long description on the listing page, under the summary. */
  description?: string
  /** The skill the program teaches — also the program's eyebrow in Material. */
  skill?: string
  /** EGP per course, for a program paid course by course. `null` = not offered. */
  pricePerCourse?: number | null
  /** How many payments the full price can be split into. 1 = paid in one go. */
  installments?: number
  /** EGP taken up front to hold a seat, deducted from the price. 0 = none. */
  deposit?: number
  /** Percent off the full price when paid in one go. 0 = none. */
  upfrontDiscount?: number
  /** The card's cover. Either an image URL, or a CSS gradient — this build
   *  makes no network calls, so everything seeded here is a gradient and a
   *  URL is what a real asset pipeline would put in later. Empty falls back
   *  to a gradient mixed from `color`. */
  thumbnail?: string
  /** Design token stem: brand · gold · teal · rose · sky. */
  color: string
  createdAt: string
  updatedAt: string
}

export const PRODUCT_CATEGORY_META: Record<ProductCategory, {
  /** Plural — tabs and headings. */
  label: string
  /** Singular — the badge on a card. */
  one: string
  tone: string
  /** What the category is, in the seller's own words. */
  blurb: string
}> = {
  program: {
    label: 'Training programs', one: 'Training program', tone: 'brand',
    blurb: 'The long track: several 8–10 week courses in one skill, taken in order.',
  },
  kit: {
    label: 'Kits', one: 'Kit', tone: 'gold',
    blurb: 'Templates, prompt packs and hardware bundles. Shipped or downloaded, not taught.',
  },
}

export const PRODUCT_STATUS_META: Record<ProductStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'line' },
  published: { label: 'Listed', tone: 'teal' },
  archived: { label: 'Archived', tone: '' },
}

export const DELIVERY_META: Record<DeliveryMode, { label: string }> = {
  online: { label: 'Online, live' },
  onsite: { label: 'On site' },
  hybrid: { label: 'Hybrid' },
  shipped: { label: 'Shipped / download' },
}

export const PRODUCT_CATEGORIES = Object.keys(PRODUCT_CATEGORY_META) as ProductCategory[]
