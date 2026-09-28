/* ==========================================================================
   Deterministic seed data — dev stage only, no network.
   Numbers follow the business model: EGP pricing, 8–10 week loops, Cairo/Alex.
   ========================================================================== */

import type {
  Cohort, DB, Loop, Material, MaterialKind, Person, Product, Session,
  Task, TaskKind, Title, Track, VideoAsset,
} from './types'
import { DB_VERSION } from './types'

/* ---- deterministic PRNG so every reload looks identical ---- */
let _s = 0x5eed1b5a
const rnd = () => ((_s = (_s * 1664525 + 1013904223) >>> 0) / 4294967296)
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1))
const chance = (p: number) => rnd() < p

let _n = 0
const uid = (p: string) => `${p}_${(++_n).toString(36).padStart(4, '0')}`

const DAY = 86_400_000
const now = new Date('2026-09-07T09:00:00Z').getTime()
const iso = (offsetDays: number, hour = 17) => {
  const d = new Date(now + offsetDays * DAY)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}

/* ---------- tracks ---------- */
export const TRACKS: Track[] = [
  { id: 'trk_video', name: 'AI Video Production', skill: 'AI video', tier: 'T2', color: 'rose', nextIds: ['trk_ai', 'trk_auto'],
    blurb: 'Script, generate and edit short-form video with AI tools. Upwork demand +329% y/y.' },
  { id: 'trk_auto', name: 'Automation with n8n', skill: 'Workflow automation', tier: 'T3', color: 'brand', nextIds: ['trk_ai'],
    blurb: 'Build paid automations for local businesses. Fiverr n8n demand +125% y/y.' },
  { id: 'trk_brand', name: 'Brand & Canva Design', skill: 'Visual design', tier: 'T2', color: 'gold', nextIds: ['trk_video'],
    blurb: 'Identity, social kits and pitch decks. Fiverr Canva designers +403% y/y.' },
  { id: 'trk_data', name: 'Data Cleaning & Sheets', skill: 'Data ops', tier: 'T2', color: 'teal', nextIds: ['trk_auto'],
    blurb: 'Turn messy client spreadsheets into dashboards. Excel data cleaning +210% y/y.' },
  { id: 'trk_ai', name: 'AI Integration', skill: 'AI engineering', tier: 'T3', color: 'sky', nextIds: [],
    blurb: 'Wire LLM APIs into real products. AI integration demand +178% y/y.' },
]

/* ---------- loops ---------- */
export const LOOPS: Loop[] = [
  { id: 'lp_v1', code: 'VID-L1', trackId: 'trk_video', name: 'AI Video · Loop 1', index: 1,
    startDate: iso(-38), endDate: iso(22), status: 'running', cohortIds: ['ch_v1a', 'ch_v1b'] },
  { id: 'lp_a1', code: 'AUT-L1', trackId: 'trk_auto', name: 'Automation · Loop 1', index: 1,
    startDate: iso(-24), endDate: iso(38), status: 'running', cohortIds: ['ch_a1a'] },
  { id: 'lp_b1', code: 'BRD-L1', trackId: 'trk_brand', name: 'Brand & Canva · Loop 1', index: 1,
    startDate: iso(-52), endDate: iso(6), status: 'running', cohortIds: ['ch_b1a', 'ch_b1b'] },
  { id: 'lp_b2', code: 'BRD-L2', trackId: 'trk_brand', name: 'Brand & Canva · Loop 2', index: 2,
    startDate: iso(14), endDate: iso(76), status: 'planning', cohortIds: ['ch_b2a'] },
  { id: 'lp_d1', code: 'DAT-L1', trackId: 'trk_data', name: 'Data & Sheets · Loop 1', index: 1,
    startDate: iso(-10), endDate: iso(52), status: 'running', cohortIds: ['ch_d1a'] },
  { id: 'lp_i1', code: 'AIX-L1', trackId: 'trk_ai', name: 'AI Integration · Loop 1', index: 1,
    startDate: iso(21), endDate: iso(83), status: 'planning', cohortIds: ['ch_i1a'] },
]

/* ---------- people ---------- */
const FIRST_M = ['Youssef', 'Omar', 'Karim', 'Adham', 'Seif', 'Marwan', 'Ziad', 'Hassan', 'Amir', 'Nour',
  'Mostafa', 'Khaled', 'Tarek', 'Bassel', 'Ali', 'Yassin', 'Fares', 'Hamza']
const FIRST_F = ['Farida', 'Malak', 'Jana', 'Hana', 'Salma', 'Nada', 'Mariam', 'Layla', 'Rana', 'Dina',
  'Sara', 'Habiba', 'Yara', 'Menna', 'Rowan', 'Aya', 'Tia', 'Nourhan']
const LAST = ['Hassan', 'Ibrahim', 'El-Sayed', 'Mansour', 'Fouad', 'Zaki', 'Shaker', 'Abdel-Rahman',
  'Kamel', 'Nassar', 'Ghoneim', 'El-Deeb', 'Sabry', 'Halim', 'Rashad', 'Wagdy', 'Emara', 'Selim']
const CITIES = ['Cairo', 'Giza', 'New Cairo', 'Alexandria', 'Sheikh Zayed', 'Nasr City', 'Maadi', 'Heliopolis']
const TONES = ['brand', 'gold', 'teal', 'rose', 'sky']

const slugEmail = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, '').split(' ').join('.') + '@ibsra.dev'

export const INSTRUCTORS: Person[] = [
  { id: 'ins_1', role: 'instructor', name: 'Nada Ghoneim', email: 'nada.ghoneim@ibsra.dev', city: 'Cairo',
    expertise: ['AI video', 'Short-form editing'], reviewSlaHours: 18, avatarTone: 'rose', createdAt: iso(-300) },
  { id: 'ins_2', role: 'instructor', name: 'Karim Mansour', email: 'karim.mansour@ibsra.dev', city: 'Alexandria',
    expertise: ['n8n', 'APIs', 'Make.com'], reviewSlaHours: 26, avatarTone: 'brand', createdAt: iso(-284) },
  { id: 'ins_3', role: 'instructor', name: 'Salma El-Deeb', email: 'salma.eldeeb@ibsra.dev', city: 'New Cairo',
    expertise: ['Brand identity', 'Canva', 'Figma'], reviewSlaHours: 12, avatarTone: 'gold', createdAt: iso(-262) },
  { id: 'ins_4', role: 'instructor', name: 'Tarek Sabry', email: 'tarek.sabry@ibsra.dev', city: 'Giza',
    expertise: ['Sheets', 'Power Query', 'Looker Studio'], reviewSlaHours: 31, avatarTone: 'teal', createdAt: iso(-198) },
  { id: 'ins_5', role: 'instructor', name: 'Mariam Rashad', email: 'mariam.rashad@ibsra.dev', city: 'Maadi',
    expertise: ['LLM APIs', 'TypeScript', 'Agents'], reviewSlaHours: 22, avatarTone: 'sky', createdAt: iso(-140) },
]

const COHORT_DEFS: Array<[string, string, string, string]> = [
  ['ch_v1a', 'Video · Sat/Tue 5pm', 'lp_v1', 'ins_1'],
  ['ch_v1b', 'Video · Sun/Wed 7pm', 'lp_v1', 'ins_1'],
  ['ch_a1a', 'Automation · Fri 11am', 'lp_a1', 'ins_2'],
  ['ch_b1a', 'Brand · Sat/Mon 6pm', 'lp_b1', 'ins_3'],
  ['ch_b1b', 'Brand · Thu 4pm', 'lp_b1', 'ins_3'],
  ['ch_b2a', 'Brand L2 · Sat/Tue 6pm', 'lp_b2', 'ins_3'],
  ['ch_d1a', 'Data · Sun/Wed 5pm', 'lp_d1', 'ins_4'],
  ['ch_i1a', 'AI Integration · Fri 1pm', 'lp_i1', 'ins_5'],
]

export function buildPeople(): { people: Person[]; cohorts: Cohort[] } {
  const cohorts: Cohort[] = COHORT_DEFS.map(([id, name, loopId, insId]) => ({
    id, name, loopId, instructorId: insId, seats: 14, studentIds: [],
    schedule: name.split(' · ')[1] ?? '',
  }))

  const people: Person[] = [
    { id: 'adm_1', role: 'admin', name: 'Sameh (Founder)', email: 'ibsra.education@gmail.com',
      city: 'Cairo', avatarTone: 'brand', createdAt: iso(-400) },
    ...INSTRUCTORS,
  ]

  let studentCount = 0
  for (const cohort of cohorts) {
    const loop = LOOPS.find(l => l.id === cohort.loopId)!
    const running = loop.status === 'running'
    const n = running ? int(8, 13) : int(3, 6)

    for (let i = 0; i < n; i++) {
      studentCount++
      const female = chance(0.47)
      const first = female ? pick(FIRST_F) : pick(FIRST_M)
      const last = pick(LAST)
      const sName = `${first} ${last}`
      const sId = uid('stu')
      const pId = uid('par')
      const parentFirst = chance(0.55) ? pick(FIRST_M) : pick(FIRST_F)
      const parentName = `${parentFirst} ${last}`

      const age = int(14, 22)
      const loops = running ? int(1, 3) : 1
      const feesPaid = loops === 1 ? 4900 : 4900 + (loops - 1) * 6900
      // KM-1 target is ≥40% earning any verified income in loop 1.
      const earns = running && chance(0.44)
      const income = earns ? int(1, 9) * 450 + int(0, 400) : 0

      people.push({
        id: sId, role: 'student', name: sName, email: slugEmail(sName),
        phone: `+2010${int(10000000, 99999999)}`, city: pick(CITIES),
        avatarTone: pick(TONES), createdAt: iso(-int(20, 160)),
        age, parentId: pId, cohortId: cohort.id, trackId: loop.trackId,
        verifiedIncome: income, feesPaid,
        portfolioPieces: running ? int(0, 4) : 0,
        progress: running ? int(12, 96) : int(0, 8),
      })

      people.push({
        id: pId, role: 'parent', name: parentName, email: slugEmail(parentName + ' p'),
        phone: `+2011${int(10000000, 99999999)}`, city: pick(CITIES),
        avatarTone: pick(TONES), createdAt: iso(-int(20, 160)), childIds: [sId],
      })

      cohort.studentIds.push(sId)
    }
  }

  for (const ins of INSTRUCTORS) {
    ins.cohortIds = cohorts.filter(c => c.instructorId === ins.id).map(c => c.id)
  }

  void studentCount
  return { people, cohorts }
}

/* ---------- content ---------- */

const THUMBS = [
  'linear-gradient(135deg,#4F3BD9,#8574F0)',
  'linear-gradient(135deg,#C07A0B,#F5C978)',
  'linear-gradient(135deg,#0C7367,#38C6B2)',
  'linear-gradient(135deg,#B41B41,#F2678A)',
  'linear-gradient(135deg,#1F6AAE,#61AEEC)',
]

const mkVideo = (min: number, state: VideoAsset['state'] = 'ready'): VideoAsset => ({
  provider: pick(['upload', 'youtube', 'vimeo'] as const),
  url: `https://cdn.ibsra.dev/v/${uid('vid')}.m3u8`,
  durationSec: min * 60 + int(0, 59),
  thumbnail: pick(THUMBS),
  captions: chance(0.6),
  state,
})

const MAT_POOL: Array<[MaterialKind, string]> = [
  ['pdf', 'Session workbook'],
  ['slides', 'Walkthrough deck'],
  ['sheet', 'Pricing calculator'],
  ['link', 'Reference tool'],
  ['code', 'Starter files'],
  ['dataset', 'Practice dataset'],
  ['image', 'Reference board'],
]

const mkMaterials = (n: number): Material[] =>
  Array.from({ length: n }, (_, i) => {
    const [kind, base] = pick(MAT_POOL)
    return {
      id: uid('mat'), order: i, kind, name: `${base}`,
      url: kind === 'link' ? 'https://ibsra.dev/resources' : `https://cdn.ibsra.dev/m/${uid('f')}`,
      size: kind === 'link' ? 0 : int(80, 9800) * 1024,
    }
  })

const Q_BANK: Array<[TaskKind, string, string[]]> = [
  ['mcq', 'Which hook length keeps retention highest on a 30-second vertical video?',
    ['Under 2 seconds', '3–5 seconds', '6–8 seconds', 'It does not matter']],
  ['mcq', 'A client asks for "a quick logo". What is the first thing you send back?',
    ['A price', 'A scope + 3 questions', 'Three draft logos', 'A contract']],
  ['multi', 'Which of these belong in a mentor-approved scope note?',
    ['Deliverables', 'Revision count', 'Your school timetable', 'Deadline', 'Price in EGP']],
  ['short', 'In one line, what problem does this workflow remove for the client?', []],
  ['short', 'Name the one metric you will report back to the client at handover.', []],
  ['long', 'Write the message you would send to a local business owner offering this service. Keep it under 90 words.', []],
  ['upload', 'Upload your finished file (source + export).', []],
  ['link', 'Paste the public URL of the published piece, under your own name.', []],
]

const mkTasks = (n: number): Task[] =>
  Array.from({ length: n }, (_, i) => {
    const [kind, question, opts] = pick(Q_BANK)
    const correctIdx = int(0, Math.max(0, opts.length - 1))
    return {
      id: uid('tsk'), order: i, kind, question,
      hint: chance(0.4) ? 'Mentor reviews this before it becomes a portfolio piece.' : undefined,
      modelAnswer: kind === 'short' || kind === 'long'
        ? 'Accept any answer that names a concrete, client-visible outcome.' : undefined,
      options: opts.map((text, oi) => ({
        id: uid('opt'), text,
        correct: kind === 'multi' ? oi !== 2 : oi === correctIdx,
      })),
      points: kind === 'upload' || kind === 'link' ? 20 : kind === 'long' ? 15 : 5,
      required: chance(0.75),
    }
  })

/** Hand-written titles for the sessions the demo shows off. */
const TITLE_SETS: Record<string, string[][]> = {
  trk_video: [
    ['Why short-form pays', 'The 3-second hook', 'Scripting with AI, honestly', 'Your first 30-second cut'],
    ['Shot list from a prompt', 'Voice cloning: the ethics line', 'B-roll that is not filler', 'Export presets that clients accept'],
    ['Pricing a 30-second video', 'Writing the scope note', 'Handling a revision request', 'Invoice + handover pack'],
  ],
  trk_auto: [
    ['What a business actually pays to automate', 'n8n in 20 minutes', 'Your first webhook', 'Error handling that saves the client'],
    ['Reading a client process', 'Mapping it to nodes', 'Testing without breaking things', 'Documenting the handover'],
    ['Finding the first automation client', 'Scoping without over-promising', 'Charging per workflow'],
  ],
  trk_brand: [
    ['Brand is a decision, not a picture', 'Reading a brief', 'Type pairing in Canva', 'Colour that survives print'],
    ['The 6-asset social kit', 'Grids and safe zones', 'Exporting for every platform', 'Building the case study page'],
    ['Your rate card', 'The discovery call script', 'Presenting three routes', 'Getting paid on time'],
  ],
  trk_data: [
    ['The messy sheet problem', 'Cleaning rules that scale', 'Power Query without fear', 'Pivot to answer, not to show off'],
    ['Charts that survive a client meeting', 'Looker Studio in one hour', 'Refresh and handover'],
    ['Scoping a data clean-up job', 'Pricing by row count', 'Delivering a dashboard'],
  ],
  trk_ai: [
    ['What an API really is', 'Your first call', 'Prompts as product', 'Cost per request'],
    ['Structured output', 'Tool calling', 'Guardrails and refusals', 'Shipping a tiny agent'],
    ['Selling an AI feature to a non-technical client'],
  ],
}

const SESSION_NAMES: Record<string, string[]> = {
  trk_video: ['Foundations of short-form', 'Producing with AI', 'Getting paid for video'],
  trk_auto: ['Automation foundations', 'Reading a real process', 'Landing the first client'],
  trk_brand: ['Brand thinking', 'The social kit', 'Selling design'],
  trk_data: ['Cleaning messy data', 'Reporting it back', 'Selling a data job'],
  trk_ai: ['API foundations', 'Building the thing', 'Selling it'],
}

export function buildSessions(): Session[] {
  const out: Session[] = []
  let n = 0

  for (const loop of LOOPS) {
    const names = SESSION_NAMES[loop.trackId]
    const titleSets = TITLE_SETS[loop.trackId]
    const instructorId = COHORT_DEFS.find(c => c[2] === loop.id)?.[3] ?? null
    const running = loop.status === 'running'

    names.forEach((sName, si) => {
      n++
      const isLive = si === 1 || (si === 2 && chance(0.5))
      const dayOffset = running ? -30 + si * 16 : 16 + si * 15
      const status = running
        ? (si === 0 ? 'published' : si === 1 ? 'published' : chance(0.5) ? 'scheduled' : 'draft')
        : (si === 0 ? 'scheduled' : 'draft')

      const set = titleSets[si] ?? titleSets[0]
      const titles: Title[] = set.map((tName, ti) => {
        /* Every session ends on the thing they build with it — that last one
           is a project, and a project is briefed rather than lectured. */
        const isProject = ti === set.length - 1
        const hasVideo = !isProject && (status !== 'draft' || ti < 2)
        const min = int(7, 22)
        return {
          id: uid('ttl'), order: ti, name: tName,
          kind: isProject ? 'project' : 'topic',
          summary: chance(0.5) ? 'Short walkthrough plus one thing to build before the next session.' : undefined,
          estimatedMin: min + int(5, 20),
          video: hasVideo ? mkVideo(min, chance(0.9) ? 'ready' : 'processing') : null,
          materials: mkMaterials(isProject ? int(1, 2) : int(hasVideo ? 1 : 0, 3)),
          tasks: mkTasks(isProject ? int(1, 2) : int(hasVideo ? 2 : 0, 5)),
        }
      })

      out.push({
        id: uid('ses'),
        code: `${loop.code}-S${String(si + 1).padStart(2, '0')}`,
        loopId: loop.id,
        name: sName,
        summary: 'Recorded walkthroughs plus a mentor-reviewed build task.',
        type: isLive ? 'live' : 'recorded',
        status: status as Session['status'],
        order: si,
        instructorId,
        scheduledAt: iso(dayOffset, int(13, 19)),
        durationMin: isLive ? 90 : titles.reduce((a, t) => a + t.estimatedMin, 0),
        meetingUrl: isLive ? `https://meet.ibsra.dev/${loop.code.toLowerCase()}-s${si + 1}` : undefined,
        recordingReady: isLive ? dayOffset < 0 : undefined,
        titles,
        // Authoring always happened in the past, even for a loop that starts later.
        createdAt: iso(Math.min(-31, dayOffset - 30)),
        updatedAt: iso(Math.min(-1, dayOffset - int(1, 14))),
      })
    })
  }

  // A couple of extra drafts so the CMS has something in-flight.
  out.push({
    id: uid('ses'), code: 'VID-L1-S04', loopId: 'lp_v1', name: 'Client work: the first paid cut',
    summary: 'Draft — needs video for titles 2 and 3 before it can be scheduled.',
    type: 'recorded', status: 'draft', order: 3, instructorId: 'ins_1',
    scheduledAt: iso(18, 17), durationMin: 0, titles: [
      { id: uid('ttl'), order: 0, name: 'Reading the client brief', estimatedMin: 18,
        video: mkVideo(11), materials: mkMaterials(2), tasks: mkTasks(3) },
      { id: uid('ttl'), order: 1, name: 'Cutting to the brief, not to taste', estimatedMin: 26,
        video: null, materials: mkMaterials(1), tasks: [] },
      { id: uid('ttl'), order: 2, name: 'Delivering files a client can open', estimatedMin: 14,
        video: null, materials: [], tasks: [] },
    ],
    createdAt: iso(-9), updatedAt: iso(-1),
  })

  void n
  return out
}

export function buildDB(): DB {
  _s = 0x5eed1b5a
  _n = 0
  const { people, cohorts } = buildPeople()
  return {
    version: DB_VERSION,
    tracks: TRACKS,
    loops: LOOPS,
    cohorts,
    people,
    sessions: buildSessions(),
    products: buildProducts(),
  }
}

/* ---------- marketplace catalogue ----------
   Hand-written rather than generated: a price list is the one thing in this
   build a reader checks line by line, so every row has to stand on its own.
   Prices follow the business model — EGP 4,900 for a first loop, EGP 6,900
   for each one after it. */

type ProdSeed = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>

const PROGRAM_PRICE = [23600, 25900, 23600, 21900, 27900]
const PROGRAM_TAKEN = [21, 17, 24, 12, 6]
const PROGRAM_START = [-38, -24, -52, -10, 21]
const PROGRAM_END = [190, 204, 176, 218, 249]

const PRODUCT_SEED: ProdSeed[] = [
  /* ---- training programs: one per track, linked to the real curriculum ---- */
  ...TRACKS.map((t, i): ProdSeed => ({
    category: 'program',
    name: `${t.name} — full program`,
    summary: `${t.blurb} Four courses of 8–10 weeks each, taken in order, ending with paid client work.`,
    status: 'published',
    price: PROGRAM_PRICE[i],
    trackId: t.id,
    loopId: null,
    instructorId: INSTRUCTORS[i]?.id ?? null,
    ageMin: 14, ageMax: 22,
    seats: 28, seatsTaken: PROGRAM_TAKEN[i],
    startDate: iso(PROGRAM_START[i]),
    endDate: iso(PROGRAM_END[i]),
    duration: '4 courses · 8–10 weeks each',
    skill: t.skill,
    description: `Four courses in ${t.skill.toLowerCase()}, each 8–10 weeks, taken in order — every one ends in a piece of work the student publishes under their own name, and the last one is a real client brief. A mentor reviews every submission.`,
    pricePerCourse: 6900,
    installments: 4,
    deposit: 1000,
    upfrontDiscount: 10,
    delivery: 'online',
    location: 'Zoom + the platform',
    highlights: [
      'A mentor reviews every submitted piece',
      'One published portfolio piece per course',
      'A real client brief in the final course',
      'Paid per course, not up front',
    ],
    color: t.color,
  })),

  /* ---- kits ---- */
  {
    category: 'kit',
    name: 'Creator starter kit',
    thumbnail: 'linear-gradient(150deg,#92590A 0%,#E09419 50%,#F5C978 100%)',
    summary: 'The physical side of the video course: a phone rig, a clip mic and a light, boxed and shipped anywhere in Egypt.',
    status: 'published',
    price: 2400, trackId: 'trk_video', loopId: null, instructorId: null,
    ageMin: 12, ageMax: 99, seats: 40, seatsTaken: 22,
    startDate: null, endDate: null,
    duration: 'Ships in 3–5 days',
    delivery: 'shipped', location: 'Egypt only',
    highlights: ['Phone rig and tripod', 'Clip-on microphone', 'LED panel', 'Setup walkthrough video'],
    color: 'rose',
  },
  {
    category: 'kit',
    name: 'Prompt pack: client work',
    summary: 'Sixty prompts the mentors actually use — scoping, revision handling, invoice wording. Downloadable, rewritten each loop.',
    status: 'published',
    price: 350, trackId: null, loopId: null, instructorId: null,
    ageMin: 13, ageMax: 99, seats: 999, seatsTaken: 148,
    startDate: null, endDate: null,
    duration: 'Instant download · updated each loop',
    delivery: 'shipped', location: 'Download',
    highlights: ['60 prompts, grouped by job', 'Rewritten every loop', 'Works with any model'],
    color: 'brand',
  },
  {
    category: 'kit',
    name: 'Brand kit templates',
    summary: 'The Canva templates behind the 6-asset social kit, unlocked as editable files with the type and the grid already set.',
    status: 'published',
    price: 500, trackId: 'trk_brand', loopId: null, instructorId: 'ins_3',
    ageMin: 13, ageMax: 99, seats: 999, seatsTaken: 61,
    startDate: null, endDate: null,
    duration: 'Instant download',
    delivery: 'shipped', location: 'Download',
    highlights: ['6 social templates', 'Pitch-deck template', 'Type pairings that survive print'],
    color: 'gold',
  },
  {
    category: 'kit',
    name: 'Automation blueprint library',
    summary: 'Twelve n8n workflows that have been sold to real businesses, exported as JSON with the client brief that produced each one.',
    status: 'archived',
    price: 900, trackId: 'trk_auto', loopId: null, instructorId: 'ins_2',
    ageMin: 15, ageMax: 99, seats: 999, seatsTaken: 34,
    startDate: null, endDate: null,
    duration: 'Instant download',
    delivery: 'shipped', location: 'Download',
    highlights: ['12 importable workflows', 'The brief behind each one', 'What each one was charged at'],
    color: 'brand',
  },
]

export function buildProducts(): Product[] {
  return PRODUCT_SEED.map(p => ({
    ...p,
    id: uid('prd'),
    highlights: [...p.highlights],
    createdAt: iso(-int(40, 200)),
    updatedAt: iso(-int(1, 30)),
  }))
}
