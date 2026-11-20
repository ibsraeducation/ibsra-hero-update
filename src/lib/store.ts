/* ==========================================================================
   In-memory store with debounced localStorage persistence.
   Every mutation is synchronous ΓÇö no fake latency anywhere, so the UI is a
   fair test of how the real thing should feel.
   ========================================================================== */

import { create } from 'zustand'
import { buildDB, buildProducts } from './seed'
import { backendLive } from './supabase'
import { LEGACY_NEXT } from './programs'
import { videoLinkProblem } from './video'
import {
  DB_VERSION, PRODUCT_CATEGORY_META, STEP_TYPE_META, TITLE_KIND_META, VIEW_ROLES, isClip, titleKind,
} from './types'
import { fetchBatches } from './api/schedule'
import type { CourseBatchRow } from './api/rows'
import type {
  DB, Loop, Track, Material, MaterialKind, Person, Product, ProductCategory,
  ProductStatus, Session, SessionType, Step, StepType, Task, TaskKind, Title, TitleKind, ViewRole,
} from './types'

const KEY = 'ibsra.db.v1'
const UI_KEY = 'ibsra.ui.v1'

/* Ids are made here, before anything reaches the server, so they carry
   enough randomness never to collide across browsers. */
const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`

const TONES = ['brand', 'gold', 'teal', 'rose', 'sky']
const slugEmail = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, '').split(' ').join('.') + '@ibsra.dev'

/** Carry a saved DB forward instead of discarding it: authored sessions are
 *  the expensive thing in here, and a new collection is not a reason to lose
 *  them. Only the missing parts are filled from the seed. */
const PROGRAM_FIELDS = [
  'description', 'skill', 'pricePerCourse', 'installments', 'deposit', 'upfrontDiscount',
] as const

/** A saved program from before v3 has no financial or description values.
 *  For the seeded ones, fill only the fields that are missing from the seed
 *  row for the same track ΓÇö never overwrite what the admin has entered. */
function backfillPrograms(products: Product[]): Product[] {
  if (!products.some(p => p.category === 'program' && p.installments === undefined)) return products
  const seeded = new Map(buildProducts().filter(p => p.category === 'program').map(p => [p.trackId, p]))
  return products.map(p => {
    const src = p.category === 'program' && p.installments === undefined ? seeded.get(p.trackId) : undefined
    if (!src) return p
    const fill: Partial<Product> = {}
    for (const k of PROGRAM_FIELDS) {
      if (p[k] === undefined) (fill as Record<string, unknown>)[k] = src[k]
    }
    return { ...p, ...fill }
  })
}

function migrate(db: DB): DB {
  const current = db.version === DB_VERSION && Array.isArray(db.products)
  if (current && !db.products.some(p => p.category === 'program' && p.installments === undefined)) return db
  const products = Array.isArray(db.products) ? db.products : buildProducts()
  return {
    ...db,
    version: DB_VERSION,
    /* v4 moved "what comes after this program" out of a hard-coded table and
       onto the program itself, so the admin can draw it. A database saved
       before that keeps the path it already had. */
    tracks: db.tracks.map(t => (t.nextIds ? t : { ...t, nextIds: LEGACY_NEXT[t.id] ?? [] })),
    /* v3 retired camps, workshops, single courses and diplomas: only what is
       still a category survives, so nothing is left without a tab to sit in. */
    products: backfillPrograms(products.filter(p => p.category in PRODUCT_CATEGORY_META)),
  }
}

function load(): DB {
  /* With a backend, programs, courses, listings and the people on them all
     come from the server ΓÇö tracks/loops/sessions after sign-in (lib/sync),
     products through `reloadCatalogue()` the moment a catalogue-reading page
     mounts. Nothing seeded ever reaches a real screen: an admin's
     "Instructor" picker, the daily feedback list and any page that still
     reads `db.people`/`db.products` directly all read real rows or nothing,
     never a demo one standing in for it. */
  if (backendLive) {
    return { ...buildDB(), tracks: [], loops: [], sessions: [], people: [], cohorts: [], products: [] }
  }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DB
      if (parsed?.version >= 1 && Array.isArray(parsed.sessions)) return migrate(parsed)
    }
  } catch { /* fall through to a fresh seed */ }
  return buildDB()
}

let saveTimer: number | undefined
function persist(db: DB) {
  if (backendLive) return
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* quota ΓÇö ignore in dev */ }
  }, 260)
}

/* ------------------------------------------------------------------ */

export type ToastKind = 'ok' | 'err' | 'info'
export interface Toast { id: string; kind: ToastKind; text: string }

interface State {
  db: DB
  role: ViewRole
  theme: 'light' | 'dark'
  railCollapsed: boolean
  /** How the programs page is read: the path as a shape, or the plain grid.
   *  The map opens first ΓÇö the shape is the thing a reader needs first, and
   *  the grid is one click away when they want the facts. */
  programView: 'map' | 'grid'
  /** Topics the student has marked done, keyed by session id. Local to the
   *  browser ΓÇö it is the student's own reading progress, not a graded record,
   *  so it lives with the UI prefs rather than in the content DB. */
  done: Record<string, string[]>
  /** Listings the reader has flagged interest in. Local to the browser like
   *  `done`, because it is a note to the mentor rather than an order ΓÇö and it
   *  lives in the store, not in a page, so the catalogue and the detail page
   *  can never disagree about what has been asked for. */
  interest: string[]
  toasts: Toast[]
  /** Bumps on every write so "Saved ┬╖ just now" can render honestly. */
  savedAt: number
  /** All course batches, shared across every panel so adding one in Programs
   *  is immediately visible in Calendar, Scoreboard, AvailabilityEditor and
   *  the enrolment dialog ΓÇö no per-page re-fetch needed. */
  batches: CourseBatchRow[]

  /* infra */
  toast: (text: string, kind?: ToastKind) => void
  dropToast: (id: string) => void
  setRole: (r: ViewRole) => void
  toggleTheme: () => void
  toggleRail: () => void
  setProgramView: (v: 'map' | 'grid') => void
  setDone: (sessionId: string, titleId: string, on: boolean) => void
  toggleInterest: (productId: string) => void
  resetDemo: () => void
  /** Re-fetch all batches from the server and update every subscriber. */
  reloadBatches: () => Promise<void>

  /* sessions */
  createSession: (patch?: Partial<Session>) => Session
  updateSession: (id: string, patch: Partial<Session>) => void
  deleteSessions: (ids: string[]) => void
  duplicateSession: (id: string) => Session | undefined
  setSessionStatus: (ids: string[], status: Session['status']) => void
  reorderSessions: (loopId: string, fromId: string, toId: string) => void

  /* titles */
  addTitle: (sessionId: string, name?: string, kind?: TitleKind) => Title | undefined
  updateTitle: (sessionId: string, titleId: string, patch: Partial<Title>) => void
  deleteTitle: (sessionId: string, titleId: string) => void
  duplicateTitle: (sessionId: string, titleId: string) => void
  moveTitle: (sessionId: string, fromId: string, toId: string) => void

  /* materials */
  addMaterial: (sessionId: string, titleId: string, patch?: Partial<Material>) => void
  updateMaterial: (sessionId: string, titleId: string, matId: string, patch: Partial<Material>) => void
  deleteMaterial: (sessionId: string, titleId: string, matId: string) => void

  /* tasks */
  addTask: (sessionId: string, titleId: string, kind?: TaskKind) => Task | undefined
  updateTask: (sessionId: string, titleId: string, taskId: string, patch: Partial<Task>) => void
  deleteTask: (sessionId: string, titleId: string, taskId: string) => void
  duplicateTask: (sessionId: string, titleId: string, taskId: string) => void
  moveTask: (sessionId: string, titleId: string, fromId: string, toId: string) => void

  /* the student-facing sequence */
  moveStep: (sessionId: string, fromKey: string, toKey: string) => void
  resetFlow: (sessionId: string) => void
  /** Add one step straight into the sequence, with its own type. */
  addStep: (sessionId: string, titleId: string, type: StepType) => Step | undefined
  /** Re-label a step ΓÇö what it is has nothing to do with where it sits. */
  setStepType: (sessionId: string, step: Step, type: StepType) => void
  /** Delete the item behind a step: the recording, the file or the question. */
  deleteStep: (sessionId: string, step: Step) => void

  /* programs and courses ΓÇö the folders sessions live in */
  createTrack: (patch?: Partial<Track>) => Track
  updateTrack: (id: string, patch: Partial<Track>) => void
  /** Only a program with no courses left in it. */
  deleteTrack: (id: string) => void
  /** The program, its courses and every session in them, in one go. */
  deleteProgram: (id: string) => void
  toggleProgramLink: (fromId: string, toId: string) => void
  createLoop: (trackId: string, patch?: Partial<Loop>) => Loop
  updateLoop: (id: string, patch: Partial<Loop>) => void
  deleteLoop: (id: string) => void

  /* marketplace products */
  createProduct: (patch?: Partial<Product>) => Product
  updateProduct: (id: string, patch: Partial<Product>) => void
  deleteProducts: (ids: string[]) => void
  duplicateProduct: (id: string) => Product | undefined
  setProductStatus: (ids: string[], status: ProductStatus) => void

  /* people */
  updatePerson: (id: string, patch: Partial<Person>) => void
  /** A parent registering another child of theirs. Not a signup ΓÇö just a
   *  record the mentor can then enrol into a cohort. */
  addChild: (parentId: string, patch: { name: string; age?: number }) => Person | undefined
  /** Put a child in the cohort a course actually runs in ΓÇö moving them out
   *  of whichever cohort they were in before, so a student is never counted
   *  as taking two courses of the same program at once. */
  enrollChild: (studentId: string, loopId: string) => void
}

/** Immutably map one session, keeping every other reference stable so React
 *  re-renders only the branch that actually changed. */
function mapSession(db: DB, id: string, fn: (s: Session) => Session): DB {
  let hit = false
  const sessions = db.sessions.map(s => {
    if (s.id !== id) return s
    hit = true
    return { ...fn(s), updatedAt: new Date().toISOString() }
  })
  return hit ? { ...db, sessions } : db
}

function mapTitle(s: Session, titleId: string, fn: (t: Title) => Title): Session {
  return { ...s, titles: s.titles.map(t => (t.id === titleId ? fn(t) : t)) }
}

function reindex<T extends { order: number }>(arr: T[]): T[] {
  return arr.map((x, i) => (x.order === i ? x : { ...x, order: i }))
}

function moveById<T extends { id: string; order: number }>(arr: T[], fromId: string, toId: string): T[] {
  const from = arr.findIndex(x => x.id === fromId)
  const to = arr.findIndex(x => x.id === toId)
  if (from < 0 || to < 0 || from === to) return arr
  const next = arr.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return reindex(next)
}

/* ------------------------------------------------------------------ */

const uiPrefs = (() => {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') } catch { return {} }
})() as {
  role?: ViewRole; theme?: 'light' | 'dark'; railCollapsed?: boolean
  programView?: 'map' | 'grid'
  done?: Record<string, string[]>
  interest?: string[]
}

function saveUI(p: Partial<typeof uiPrefs>) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ ...uiPrefs, ...p }))
    Object.assign(uiPrefs, p)
  } catch { /* ignore */ }
}

export const useStore = create<State>((set, get) => {
  /** Write helper: applies the change, stamps savedAt, schedules persistence. */
  const write = (fn: (db: DB) => DB) => {
    set(st => {
      const db = fn(st.db)
      if (db === st.db) return st
      persist(db)
      return { db, savedAt: Date.now() }
    })
  }

  return {
    db: load(),
    /* A browser that last sat in the old instructor workspace lands on Admin
       rather than on a role with no nav behind it. */
    role: uiPrefs.role && VIEW_ROLES.includes(uiPrefs.role) ? uiPrefs.role : 'admin',
    theme: uiPrefs.theme ?? 'light',
    railCollapsed: uiPrefs.railCollapsed ?? false,
    programView: uiPrefs.programView ?? 'map',
    done: backendLive ? {} : uiPrefs.done ?? {},
    interest: uiPrefs.interest ?? [],
    toasts: [],
    savedAt: 0,
    batches: [],

    toast: (text, kind = 'ok') => {
      const id = uid('t')
      set(st => ({ toasts: [...st.toasts, { id, kind, text }] }))
      window.setTimeout(() => get().dropToast(id), 3200)
    },
    dropToast: id => set(st => ({ toasts: st.toasts.filter(t => t.id !== id) })),

    reloadBatches: async () => {
      try {
        const bs = await fetchBatches()
        set({ batches: bs })
      } catch { /* leave the existing list in place on failure */ }
    },

    setRole: role => { saveUI({ role }); set({ role }) },
    toggleTheme: () => set(st => {
      const theme = st.theme === 'light' ? 'dark' : 'light'
      saveUI({ theme })
      document.documentElement.dataset.theme = theme
      return { theme }
    }),
    toggleRail: () => set(st => {
      const railCollapsed = !st.railCollapsed
      saveUI({ railCollapsed })
      return { railCollapsed }
    }),
    setProgramView: programView => { saveUI({ programView }); set({ programView }) },

    setDone: (sessionId, titleId, on) => set(st => {
      const was = st.done[sessionId] ?? []
      if (on === was.includes(titleId)) return st
      const next = on ? [...was, titleId] : was.filter(id => id !== titleId)
      const done = { ...st.done, [sessionId]: next }
      if (!backendLive) saveUI({ done })
      return { done }
    }),
    toggleInterest: productId => set(st => {
      const on = st.interest.includes(productId)
      const interest = on
        ? st.interest.filter(id => id !== productId)
        : [...st.interest, productId]
      saveUI({ interest })
      get().toast(
        on
          ? 'Interest withdrawn ΓÇö your mentor will not see it'
          : 'Flagged for your mentor. Nothing is reserved and nothing is charged.',
        on ? 'info' : 'ok',
      )
      return { interest }
    }),
    resetDemo: () => {
      /* Rebuilding the store would read as "delete everything" to the sync. */
      if (backendLive) { get().toast('Demo reset is off while connected to the server', 'info'); return }
      const db = buildDB()
      persist(db)
      saveUI({ done: {}, interest: [] })
      set({ db, done: {}, interest: [], savedAt: Date.now() })
      get().toast('Demo data restored')
    },

    /* ---------------- sessions ---------------- */
    createSession: patch => {
      const db = get().db
      const loopId = patch?.loopId ?? db.loops[0].id
      const loop = db.loops.find(l => l.id === loopId)!
      const siblings = db.sessions.filter(s => s.loopId === loopId)
      const nowIso = new Date().toISOString()

      const session: Session = {
        id: uid('ses'),
        code: `${loop.code}-S${String(siblings.length + 1).padStart(2, '0')}`,
        loopId,
        name: 'Untitled session',
        summary: '',
        type: 'recorded',
        status: 'draft',
        order: siblings.length,
        instructorId: db.cohorts.find(c => c.loopId === loopId)?.instructorId ?? null,
        scheduledAt: null,
        durationMin: 0,
        titles: [],
        createdAt: nowIso,
        updatedAt: nowIso,
        ...patch,
      }
      write(d => ({ ...d, sessions: [...d.sessions, session] }))
      return session
    },

    updateSession: (id, patch) => write(db => mapSession(db, id, s => ({ ...s, ...patch }))),

    deleteSessions: ids => {
      const set_ = new Set(ids)
      write(db => ({ ...db, sessions: db.sessions.filter(s => !set_.has(s.id)) }))
      get().toast(`${ids.length} session${ids.length > 1 ? 's' : ''} deleted`, 'info')
    },

    duplicateSession: id => {
      const src = get().db.sessions.find(s => s.id === id)
      if (!src) return
      const nowIso = new Date().toISOString()
      /* Every id is fresh in the copy, so the step keys are rewritten with it
         ΓÇö otherwise the duplicate would silently lose its sequence. */
      const remap = new Map<string, string>()
      const fresh = (p: string, old: string) => {
        const next = uid(p)
        remap.set(old, next)
        return next
      }
      const copy: Session = {
        ...structuredClone(src),
        id: uid('ses'),
        code: src.code + '-COPY',
        name: src.name + ' (copy)',
        status: 'draft',
        order: src.order + 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        titles: src.titles.map(t => ({
          ...structuredClone(t),
          id: fresh('ttl', t.id),
          materials: t.materials.map(m => ({ ...m, id: fresh('mat', m.id) })),
          tasks: t.tasks.map(k => ({
            ...k, id: fresh('tsk', k.id),
            options: k.options.map(o => ({ ...o, id: uid('opt') })),
          })),
        })),
        flowOrder: src.flowOrder?.map(k => {
          const [prefix, oldId] = [k.slice(0, 2), k.slice(2)]
          const next = remap.get(oldId)
          return next ? prefix + next : k
        }),
      }
      write(db => ({ ...db, sessions: [...db.sessions, copy] }))
      get().toast('Session duplicated as a draft')
      return copy
    },

    setSessionStatus: (ids, status) => {
      const set_ = new Set(ids)
      write(db => ({
        ...db,
        sessions: db.sessions.map(s =>
          set_.has(s.id) ? { ...s, status, updatedAt: new Date().toISOString() } : s),
      }))
      get().toast(`${ids.length} session${ids.length > 1 ? 's' : ''} ΓåÆ ${status}`)
    },

    reorderSessions: (loopId, fromId, toId) => write(db => {
      const inLoop = db.sessions.filter(s => s.loopId === loopId).sort((a, b) => a.order - b.order)
      const moved = moveById(inLoop, fromId, toId)
      if (moved === inLoop) return db
      const byId = new Map(moved.map(s => [s.id, s]))
      return { ...db, sessions: db.sessions.map(s => byId.get(s.id) ?? s) }
    }),

    /* ---------------- titles ---------------- */
    addTitle: (sessionId, name, kind = 'topic') => {
      const s = get().db.sessions.find(x => x.id === sessionId)
      if (!s) return
      /* Named after its own kind's count, so adding a project never makes it
         look like the topics were renumbered. */
      const nth = s.titles.filter(t => titleKind(t) === kind).length + 1
      const title: Title = {
        id: uid('ttl'), order: s.titles.length,
        name: name ?? `${TITLE_KIND_META[kind].one} ${nth}`,
        kind,
        estimatedMin: 20, video: null, materials: [], tasks: [],
      }
      write(db => mapSession(db, sessionId, ss => ({ ...ss, titles: [...ss.titles, title] })))
      return title
    },

    updateTitle: (sessionId, titleId, patch) =>
      write(db => mapSession(db, sessionId, s => mapTitle(s, titleId, t => ({ ...t, ...patch })))),

    deleteTitle: (sessionId, titleId) => {
      const gone = get().db.sessions.find(x => x.id === sessionId)?.titles.find(t => t.id === titleId)
      write(db => mapSession(db, sessionId, s => ({
        ...s, titles: reindex(s.titles.filter(t => t.id !== titleId)),
      })))
      get().toast(`${gone ? TITLE_KIND_META[titleKind(gone)].one : 'Topic'} deleted`, 'info')
    },

    duplicateTitle: (sessionId, titleId) => write(db => mapSession(db, sessionId, s => {
      const i = s.titles.findIndex(t => t.id === titleId)
      if (i < 0) return s
      const src = s.titles[i]
      const copy: Title = {
        ...structuredClone(src),
        id: uid('ttl'),
        name: src.name + ' (copy)',
        materials: src.materials.map(m => ({ ...m, id: uid('mat') })),
        tasks: src.tasks.map(k => ({
          ...k, id: uid('tsk'), options: k.options.map(o => ({ ...o, id: uid('opt') })),
        })),
      }
      const titles = s.titles.slice()
      titles.splice(i + 1, 0, copy)
      return { ...s, titles: reindex(titles) }
    })),

    moveTitle: (sessionId, fromId, toId) =>
      write(db => mapSession(db, sessionId, s => ({ ...s, titles: moveById(s.titles, fromId, toId) }))),

    /* ---------------- materials ---------------- */
    addMaterial: (sessionId, titleId, patch) =>
      write(db => mapSession(db, sessionId, s => mapTitle(s, titleId, t => ({
        ...t,
        materials: [...t.materials, {
          id: uid('mat'), order: t.materials.length,
          kind: (patch?.kind ?? 'pdf') as MaterialKind,
          name: patch?.name ?? 'Untitled material',
          url: patch?.url ?? '', size: patch?.size ?? 0, ...patch,
        }],
      })))),

    updateMaterial: (sessionId, titleId, matId, patch) =>
      write(db => mapSession(db, sessionId, s => mapTitle(s, titleId, t => ({
        ...t, materials: t.materials.map(m => (m.id === matId ? { ...m, ...patch } : m)),
      })))),

    deleteMaterial: (sessionId, titleId, matId) =>
      write(db => mapSession(db, sessionId, s => mapTitle(s, titleId, t => ({
        ...t, materials: reindex(t.materials.filter(m => m.id !== matId)),
      })))),

    /* ---------------- tasks ---------------- */
    addTask: (sessionId, titleId, kind = 'mcq') => {
      const s = get().db.sessions.find(x => x.id === sessionId)
      const t = s?.titles.find(x => x.id === titleId)
      if (!s || !t) return
      const task: Task = {
        id: uid('tsk'), order: t.tasks.length, kind, question: '',
        options: kind === 'mcq' || kind === 'multi'
          ? [
              { id: uid('opt'), text: '', correct: true },
              { id: uid('opt'), text: '', correct: false },
            ]
          : [],
        points: kind === 'upload' || kind === 'link' || kind === 'imagetext' ? 20
          : kind === 'long' ? 15 : 5,
        required: true,
      }
      write(db => mapSession(db, sessionId, ss => mapTitle(ss, titleId, tt => ({
        ...tt, tasks: [...tt.tasks, task],
      }))))
      return task
    },

    updateTask: (sessionId, titleId, taskId, patch) =>
      write(db => mapSession(db, sessionId, s => mapTitle(s, titleId, t => ({
        ...t, tasks: t.tasks.map(k => (k.id === taskId ? { ...k, ...patch } : k)),
      })))),

    deleteTask: (sessionId, titleId, taskId) =>
      write(db => mapSession(db, sessionId, s => mapTitle(s, titleId, t => ({
        ...t, tasks: reindex(t.tasks.filter(k => k.id !== taskId)),
      })))),

    duplicateTask: (sessionId, titleId, taskId) =>
      write(db => mapSession(db, sessionId, s => mapTitle(s, titleId, t => {
        const i = t.tasks.findIndex(k => k.id === taskId)
        if (i < 0) return t
        const copy: Task = {
          ...structuredClone(t.tasks[i]), id: uid('tsk'),
          options: t.tasks[i].options.map(o => ({ ...o, id: uid('opt') })),
        }
        const tasks = t.tasks.slice()
        tasks.splice(i + 1, 0, copy)
        return { ...t, tasks: reindex(tasks) }
      }))),

    moveTask: (sessionId, titleId, fromId, toId) =>
      write(db => mapSession(db, sessionId, s => mapTitle(s, titleId, t => ({
        ...t, tasks: moveById(t.tasks, fromId, toId),
      })))),

    /* ---------------- the sequence ---------------- */
    moveStep: (sessionId, fromKey, toKey) => write(db => mapSession(db, sessionId, s => {
      const flow = sessionFlow(s)
      const from = flow.findIndex(x => x.key === fromKey)
      const to = flow.findIndex(x => x.key === toKey)
      if (from < 0 || to < 0 || from === to) return s
      const next = flow.slice()
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      /* Written back in full, which also prunes keys whose item is gone. */
      return { ...s, flowOrder: next.map(x => x.key) }
    })),

    resetFlow: sessionId => {
      write(db => mapSession(db, sessionId, s => ({ ...s, flowOrder: undefined })))
      get().toast('Sequence back to topic order')
    },

    addStep: (sessionId, titleId, type) => {
      const s = get().db.sessions.find(x => x.id === sessionId)
      const t = s?.titles.find(x => x.id === titleId)
      const meta = STEP_TYPE_META[type]
      if (!s || !t) return

      /* Built here rather than inside the write so the caller gets the step
         back and can open it straight away. */
      const before = sessionFlow(s).map(x => x.key)
      let key: string
      let add: (ss: Session) => Session

      if (meta.kind === 'material' || type === 'video') {
        /* An extra recording is a video file in the topic ΓÇö the topic's own
           recording slot holds only the first one. */
        /* A live step is a link with a time on it ΓÇö the class the student
           joins, sitting in the sequence where it actually happens. */
        const live = type === 'live'
        const m: Material = {
          id: uid('mat'), order: t.materials.length,
          kind: type === 'video' ? 'video' : (live || type === 'branding') ? 'link' : 'pdf',
          name: live ? 'Live session' : '', url: '', size: 0, category: type,
          ...(live ? { durationMin: 60 } : {}),
        }
        key = `m:${m.id}`
        add = ss => mapTitle(ss, titleId, tt => ({ ...tt, materials: [...tt.materials, m] }))
      } else {
        const mcq = type === 'mcq'
        /* An image + text question is answered with a picture of the work and
           a written note about it ΓÇö mentor-graded, like the rest. */
        const img = type === 'imagetext'
        /* Technical and branding tasks are a reference video plus a text
           answer ΓÇö same shape either way, just what the work is about. */
        const k: Task = {
          id: uid('tsk'), order: t.tasks.length,
          kind: mcq ? 'mcq' : img ? 'imagetext' : 'long',
          question: '', category: type,
          refVideoUrl: mcq || img ? undefined : '',
          options: mcq
            ? [
                { id: uid('opt'), text: '', correct: true },
                { id: uid('opt'), text: '', correct: false },
              ]
            : [],
          points: mcq ? 5 : img ? 20 : 15,
          required: true,
        }
        key = `t:${k.id}`
        add = ss => mapTitle(ss, titleId, tt => ({ ...tt, tasks: [...tt.tasks, k] }))
      }

      /* Appended to the order explicitly, so a new step lands at the end of
         the sequence rather than back beside the rest of its topic. */
      write(db => mapSession(db, sessionId, ss => ({ ...add(ss), flowOrder: [...before, key] })))
      get().toast(`${meta.label} added at the end`)
      return {
        key,
        kind: key.startsWith('m:') ? 'material' as const : 'task' as const,
        type, titleId, refId: key.slice(2),
      }
    },

    deleteStep: (sessionId, step) => {
      write(db => mapSession(db, sessionId, s => {
        const next = mapTitle(s, step.titleId, t => {
          if (step.kind === 'video') return { ...t, video: null }
          if (step.kind === 'material') {
            return { ...t, materials: reindex(t.materials.filter(m => m.id !== step.refId)) }
          }
          return { ...t, tasks: reindex(t.tasks.filter(k => k.id !== step.refId)) }
        })
        /* Dropped from the saved order too ΓÇö sessionFlow() would ignore a dead
           key anyway, but there is no reason to keep carrying it. */
        return s.flowOrder
          ? { ...next, flowOrder: s.flowOrder.filter(k => k !== step.key) }
          : next
      }))
      get().toast(
        step.kind === 'video'
          ? 'Recording removed from the topic'
          : `${STEP_TYPE_META[step.type].label} deleted`,
        'info',
      )
    },

    setStepType: (sessionId, step, type) => {
      /* Only a material can count as a video ΓÇö an extra recording in the
         topic. A task cannot, and the topic's own recording stays what it is. */
      if (step.kind === 'video' || (type === 'video' && step.kind !== 'material')) return
      write(db => mapSession(db, sessionId, s => mapTitle(s, step.titleId, t => {
        if (step.kind === 'material') {
          return {
            ...t,
            materials: t.materials.map(m => (m.id === step.refId
              ? {
                  ...m, category: type,
                  ...(type === 'video' ? { kind: 'video' as MaterialKind } : {}),
                  ...(type === 'live' ? { kind: 'link' as MaterialKind, durationMin: m.durationMin ?? 60 } : {}),
                }
              : m)),
          }
        }
        return {
          ...t,
          tasks: t.tasks.map(k => {
            if (k.id !== step.refId) return k
            /* Becoming an MCQ has to mean it can be answered as one. Going the
               other way leaves the options alone ΓÇö nothing is thrown away. */
            const toMcq = type === 'mcq' && k.kind !== 'mcq' && k.kind !== 'multi'
            /* Same discipline for image + text: the type and the way it is
               answered are never allowed to disagree. */
            const toImg = type === 'imagetext' && k.kind !== 'imagetext'
            /* Technical and branding work is a reference video plus a text
               answer ΓÇö becoming either has to mean it can be answered that way. */
            const toText = (type === 'technical' || type === 'branding')
              && k.kind !== 'short' && k.kind !== 'long'
            return {
              ...k,
              /* The guard above keeps 'video' out of the task branch. */
              category: type as Exclude<StepType, 'video'>,
              kind: toMcq ? ('mcq' as TaskKind)
                : toImg ? ('imagetext' as TaskKind)
                : toText ? ('long' as TaskKind) : k.kind,
              refVideoUrl: toText ? (k.refVideoUrl ?? '') : k.refVideoUrl,
              options: toMcq && k.options.length === 0
                ? [
                    { id: uid('opt'), text: '', correct: true },
                    { id: uid('opt'), text: '', correct: false },
                  ]
                : k.options,
            }
          }),
        }
      })))
    },

    /* ---------------- programs and courses ---------------- */
    createTrack: patch => {
      const track: Track = {
        id: uid('trk'),
        name: 'Untitled program',
        skill: '',
        tier: 'T2',
        color: 'brand',
        blurb: '',
        /* What Material holds is what the Marketplace sells: a program is
           listed from the moment it is added, and the switch on it is how it
           comes off sale. */
        listed: true,
        ...patch,
      }
      write(db => ({ ...db, tracks: [...db.tracks, track] }))
      return track
    },

    updateTrack: (id, patch) => write(db => ({
      ...db, tracks: db.tracks.map(t => (t.id === id ? { ...t, ...patch } : t)),
    })),

    /* One line on the program map, drawn or rubbed out. A program never
       leads to itself, and the same line is never stored twice. */
    toggleProgramLink: (fromId, toId) => {
      if (fromId === toId) return
      let added = false
      write(db => {
        if (!db.tracks.some(t => t.id === fromId) || !db.tracks.some(t => t.id === toId)) return db
        return {
          ...db,
          tracks: db.tracks.map(t => {
            if (t.id !== fromId) return t
            const next = t.nextIds ?? []
            added = !next.includes(toId)
            return { ...t, nextIds: added ? [...next, toId] : next.filter(id => id !== toId) }
          }),
        }
      })
      get().toast(added ? 'Connected' : 'Connection removed', added ? 'ok' : 'info')
    },

    deleteTrack: id => write(db => (db.loops.some(l => l.trackId === id)
      ? db
      : {
          ...db,
          /* The lines into it go with it ΓÇö a connection to a program that is
             no longer there would just be a line into empty space. */
          tracks: db.tracks
            .filter(t => t.id !== id)
            .map(t => (t.nextIds?.includes(id) ? { ...t, nextIds: t.nextIds.filter(x => x !== id) } : t)),
        })),

    /* Deleting the folder straight from the grid, without opening it: the
       program takes its courses and their sessions with it, in one write. */
    deleteProgram: id => {
      write(db => {
        if (!db.tracks.some(t => t.id === id)) return db
        const loopIds = new Set(db.loops.filter(l => l.trackId === id).map(l => l.id))
        return {
          ...db,
          tracks: db.tracks
            .filter(t => t.id !== id)
            .map(t => (t.nextIds?.includes(id) ? { ...t, nextIds: t.nextIds.filter(x => x !== id) } : t)),
          loops: db.loops.filter(l => l.trackId !== id),
          sessions: db.sessions.filter(s => !loopIds.has(s.loopId)),
          products: db.products.map(p => (
            p.trackId === id || (p.loopId && loopIds.has(p.loopId))
              ? { ...p, trackId: null, loopId: null }
              : p
          )),
        }
      })
      get().toast('Program deleted', 'info')
    },

    createLoop: (trackId, patch) => {
      const db = get().db
      const track = db.tracks.find(t => t.id === trackId)
      const siblings = db.loops.filter(l => l.trackId === trackId)
      const index = siblings.reduce((m, l) => Math.max(m, l.index), 0) + 1
      /* A course follows the one before it: it starts the week after the
         previous one ends, and runs nine weeks ΓÇö the middle of 8ΓÇô10. */
      const prevEnd = siblings.reduce<string | null>(
        (m, l) => (!m || l.endDate > m ? l.endDate : m), null)
      const start = prevEnd ? new Date(new Date(prevEnd).getTime() + 7 * 864e5) : new Date()
      const end = new Date(start.getTime() + 63 * 864e5)
      const stem = (track?.name ?? 'PRG').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'PRG'
      const loop: Loop = {
        id: uid('lp'),
        code: `${stem}-L${index}`,
        trackId,
        name: `Course ${index}`,
        index,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        status: 'planning',
        cohortIds: [],
        /* A course belongs to its program's listing from the start; selling
           it on its own is the extra decision, and it needs a price of its
           own before a family is ever offered it. */
        listed: true,
        priceEgp: null,
        ...patch,
      }
      write(d => ({ ...d, loops: [...d.loops, loop] }))
      return loop
    },

    updateLoop: (id, patch) => write(db => ({
      ...db, loops: db.loops.map(l => (l.id === id ? { ...l, ...patch } : l)),
    })),

    /* A course owns its sessions, so they go with it; the courses after it
       close ranks so the order stays 1, 2, 3 with no gap. */
    deleteLoop: id => {
      const loop = get().db.loops.find(l => l.id === id)
      if (!loop) return
      write(db => {
        const loops = db.loops
          .filter(l => l.id !== id)
          .map(l => (l.trackId === loop.trackId && l.index > loop.index ? { ...l, index: l.index - 1 } : l))
        return {
          ...db,
          loops,
          sessions: db.sessions.filter(s => s.loopId !== id),
          products: db.products.map(p => (p.loopId === id ? { ...p, loopId: null } : p)),
        }
      })
      get().toast('Course deleted', 'info')
    },

    /* ---------------- marketplace products ---------------- */
    createProduct: patch => {
      const nowIso = new Date().toISOString()
      const category = (patch?.category ?? 'program') as ProductCategory
      const product: Product = {
        id: uid('prd'),
        category,
        name: '',
        summary: '',
        status: 'draft',
        /* null, not 0 ΓÇö an undecided price must never render as "Free". */
        price: null,
        trackId: null,
        loopId: null,
        instructorId: null,
        ageMin: 14,
        ageMax: 22,
        seats: 20,
        seatsTaken: 0,
        startDate: null,
        endDate: null,
        duration: '',
        delivery: category === 'kit' ? 'shipped' : 'online',
        location: '',
        highlights: [],
        description: '',
        skill: '',
        pricePerCourse: null,
        installments: 1,
        deposit: 0,
        upfrontDiscount: 0,
        /* Empty on purpose: the card falls back to a cover generated from the
           colour, so a new listing looks finished before anyone finds art. */
        thumbnail: '',
        color: PRODUCT_CATEGORY_META[category].tone,
        createdAt: nowIso,
        updatedAt: nowIso,
        ...patch,
      }
      write(db => ({ ...db, products: [...db.products, product] }))
      return product
    },

    updateProduct: (id, patch) => write(db => {
      let hit = false
      const products = db.products.map(p => {
        if (p.id !== id) return p
        hit = true
        return { ...p, ...patch, updatedAt: new Date().toISOString() }
      })
      return hit ? { ...db, products } : db
    }),

    deleteProducts: ids => {
      const set_ = new Set(ids)
      write(db => ({ ...db, products: db.products.filter(p => !set_.has(p.id)) }))
      get().toast(`${ids.length} listing${ids.length > 1 ? 's' : ''} deleted`, 'info')
    },

    duplicateProduct: id => {
      const src = get().db.products.find(p => p.id === id)
      if (!src) return
      const nowIso = new Date().toISOString()
      const copy: Product = {
        ...structuredClone(src),
        id: uid('prd'),
        name: src.name + ' (copy)',
        /* A copy never inherits a listing: it has to be reviewed and
           published on its own, or the same thing is sold twice by accident. */
        status: 'draft',
        seatsTaken: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      }
      write(db => ({ ...db, products: [...db.products, copy] }))
      get().toast('Duplicated as a draft')
      return copy
    },

    setProductStatus: (ids, status) => {
      const set_ = new Set(ids)
      write(db => ({
        ...db,
        products: db.products.map(p =>
          set_.has(p.id) ? { ...p, status, updatedAt: new Date().toISOString() } : p),
      }))
      get().toast(
        status === 'published'
          ? `${ids.length} listing${ids.length > 1 ? 's' : ''} live in the marketplace`
          : `${ids.length} listing${ids.length > 1 ? 's' : ''} ΓåÆ ${status}`,
      )
    },

    /* ---------------- people ---------------- */
    updatePerson: (id, patch) => write(db => ({
      ...db, people: db.people.map(p => (p.id === id ? { ...p, ...patch } : p)),
    })),

    addChild: (parentId, patch) => {
      const db = get().db
      const parent = db.people.find(p => p.id === parentId && p.role === 'parent')
      if (!parent) return
      const name = patch.name.trim()
      if (!name) return
      const nowIso = new Date().toISOString()
      const siblings = db.people.filter(p => p.parentId === parentId)
      const child: Person = {
        id: uid('per'),
        role: 'student',
        name,
        email: slugEmail(`${name} ${siblings.length + 1}`),
        age: patch.age,
        parentId,
        avatarTone: TONES[siblings.length % TONES.length],
        createdAt: nowIso,
        feesPaid: 0,
        verifiedIncome: 0,
        portfolioPieces: 0,
        progress: 0,
      }
      write(d => ({
        ...d,
        people: [...d.people, child].map(p =>
          p.id === parentId ? { ...p, childIds: [...(p.childIds ?? []), child.id] } : p),
      }))
      get().toast(`${name} added to your family`)
      return child
    },

    enrollChild: (studentId, loopId) => {
      const db = get().db
      const student = db.people.find(p => p.id === studentId)
      const loop = db.loops.find(l => l.id === loopId)
      if (!student || !loop) return

      /* The cohort a seat is actually taken in: whichever the course's
         cohorts still has room, or the first one if every one is full ΓÇö
         a mentor sorts a genuine overflow, this just never loses the ask. */
      const cohorts = db.cohorts.filter(c => c.loopId === loopId)
      const cohort = cohorts.find(c => c.studentIds.length < c.seats) ?? cohorts[0]

      write(d => ({
        ...d,
        people: d.people.map(p => (p.id === studentId
          ? { ...p, trackId: loop.trackId, cohortId: cohort?.id }
          : p)),
        cohorts: d.cohorts.map(c => {
          if (c.id === cohort?.id) return { ...c, studentIds: [...new Set([...c.studentIds, studentId])] }
          /* Drop them from whatever cohort they were sitting in before ΓÇö
             a student is enrolled in one course of a program at a time. */
          return c.studentIds.includes(studentId)
            ? { ...c, studentIds: c.studentIds.filter(id => id !== studentId) }
            : c
        }),
      }))
      get().toast(
        cohort
          ? `${student.name} enrolled in ${loop.name}`
          : `${student.name} enrolled in ${loop.name} ΓÇö no cohort scheduled yet, a mentor will place them`,
      )
    },
  }
})

/* ---------------- selectors ---------------- */

export const useDB = () => useStore(s => s.db)
export const useToast = () => useStore(s => s.toast)

export const useSession = (id: string | undefined) =>
  useStore(s => (id ? s.db.sessions.find(x => x.id === id) : undefined))

/** A question's own type: the label set by hand wins, and without one it is
 *  read off the question ΓÇö an MCQ is an MCQ, anything else is technical work. */
export const taskType = (k: Task): StepType =>
  k.category ?? (k.kind === 'mcq' || k.kind === 'multi' ? 'mcq'
    : k.kind === 'imagetext' ? 'imagetext'
    : 'technical')

/** A file's own type. Unlabelled is just a file. */
export const materialType = (m: Material): StepType => m.category ?? 'material'

/** Default order when nobody has arranged one: topic by topic, and inside a
 *  topic the recording first, then its files, then its questions. */
function defaultFlow(s: Session): Step[] {
  const out: Step[] = []
  for (const t of s.titles) {
    if (t.video) out.push({ key: `v:${t.id}`, kind: 'video', type: 'video', titleId: t.id, refId: '' })
    for (const m of t.materials) {
      out.push({ key: `m:${m.id}`, kind: 'material', type: materialType(m), titleId: t.id, refId: m.id })
    }
    for (const k of t.tasks) {
      out.push({ key: `t:${k.id}`, kind: 'task', type: taskType(k), titleId: t.id, refId: k.id })
    }
  }
  return out
}

/** Everything in a session, in the order the student meets it.
 *
 *  The saved order is a hint, never the source of truth: keys whose item was
 *  deleted drop out, and an item added later slots in beside the rest of its
 *  own topic rather than falling off the end. So content can never go missing
 *  from the student view just because the sequence was not re-saved. */
export function sessionFlow(s: Session): Step[] {
  const def = defaultFlow(s)
  const saved = s.flowOrder
  if (!saved?.length) return def

  const byKey = new Map(def.map(x => [x.key, x]))
  const out: Step[] = []
  const placed = new Set<string>()

  for (const key of saved) {
    const step = byKey.get(key)
    if (step && !placed.has(key)) { out.push(step); placed.add(key) }
  }
  for (const step of def) {
    if (placed.has(step.key)) continue
    const after = out.map(x => x.titleId).lastIndexOf(step.titleId)
    if (after >= 0) out.splice(after + 1, 0, step)
    else out.push(step)
    placed.add(step.key)
  }
  return out
}

/** Whether this session has been arranged by hand. */
export const hasCustomFlow = (s: Session) => !!s.flowOrder?.length

/** Where a session lives in the admin: program ΓåÆ course ΓåÆ session. */
export function materialPath(db: DB, s: Session): string {
  const loop = db.loops.find(l => l.id === s.loopId)
  return loop ? `/admin/material/${loop.trackId}/${loop.id}/${s.id}` : '/admin/material'
}

export function sessionStats(s: Session) {
  let videos = 0, materials = 0, tasks = 0, minutes = 0, missingVideo = 0, projects = 0
  for (const t of s.titles) {
    if (titleKind(t) === 'project') projects++
    if (t.video && t.video.state === 'ready') videos++
    /* A project is not missing anything by having no recording ΓÇö a brief is
       not a lecture. Only topics are counted short. */
    else if (titleKind(t) === 'topic') missingVideo++
    materials += t.materials.length
    tasks += t.tasks.length
    minutes += t.estimatedMin
  }
  return {
    titles: s.titles.length, topics: s.titles.length - projects, projects,
    videos, materials, tasks, minutes, missingVideo,
  }
}

/** What still blocks this session from being published. */
export function readiness(s: Session): string[] {
  const gaps: string[] = []
  if (!s.name.trim() || s.name === 'Untitled session') gaps.push('Session needs a name')
  if (s.titles.length === 0) gaps.push('No topics added yet')
  /* A project owes a brief and work handed in, not a recording. */
  const noVideo = s.titles.filter(t => !t.video && titleKind(t) === 'topic')
  if (noVideo.length) gaps.push(`${noVideo.length} topic${noVideo.length > 1 ? 's' : ''} without a recording`)
  const emptyProject = s.titles.filter(t => titleKind(t) === 'project'
    && t.materials.length === 0 && t.tasks.length === 0)
  if (emptyProject.length) gaps.push(`${emptyProject.length} project${emptyProject.length > 1 ? 's' : ''} with nothing in it`)
  const processing = s.titles.filter(t => t.video?.state === 'processing')
  if (processing.length) gaps.push(`${processing.length} video${processing.length > 1 ? 's' : ''} still processing`)
  /* Connected, a recording is a link that has to actually embed ΓÇö a wrong
     link or a link pasted under the wrong provider would open nothing. */
  const badLink = backendLive
    ? s.titles.filter(t => t.video && t.video.provider !== 'upload' && videoLinkProblem(t.video.url, t.video.provider))
    : []
  if (badLink.length) gaps.push(`${badLink.length} recording${badLink.length > 1 ? 's' : ''} with a bad link`)
  const noLength = backendLive
    ? s.titles.filter(t => t.video && t.video.url.trim() && t.video.durationSec === 0)
    : []
  if (noLength.length) gaps.push(`${noLength.length} recording${noLength.length > 1 ? 's' : ''} without a length`)
  const noTasks = s.titles.filter(t => t.tasks.length === 0 && titleKind(t) === 'topic')
  if (noTasks.length) gaps.push(`${noTasks.length} topic${noTasks.length > 1 ? 's' : ''} without Q&A`)
  const blankQ = s.titles.flatMap(t => t.tasks).filter(t => !t.question.trim())
  if (blankQ.length) gaps.push(`${blankQ.length} question${blankQ.length > 1 ? 's' : ''} left blank`)
  /* An extra recording ΓÇö a project's steps are one each ΓÇö is as empty as a
     topic with no video until somebody posts the link. Counted here for the
     same reason: the card should say what is still missing, not let a
     session go out with ten blank players in it. */
  const blankClip = s.titles.flatMap(t => t.materials).filter(m => isClip(m) && !m.url.trim())
  if (blankClip.length) {
    gaps.push(`${blankClip.length} video step${blankClip.length > 1 ? 's' : ''} without a recording`)
  }
  /* A live step inside a topic owes the same two things a live session does. */
  const liveSteps = s.titles.flatMap(t => t.materials).filter(m => m.category === 'live')
  const liveNoLink = liveSteps.filter(m => !m.url.trim())
  if (liveNoLink.length) gaps.push(`${liveNoLink.length} live step${liveNoLink.length > 1 ? 's' : ''} without a meeting link`)
  const liveNoDate = liveSteps.filter(m => !m.startsAt)
  if (liveNoDate.length) gaps.push(`${liveNoDate.length} live step${liveNoDate.length > 1 ? 's' : ''} without a date`)
  if (s.type === 'live' && !s.meetingUrl) gaps.push('Live session has no meeting link')
  if (s.type === 'live' && !s.scheduledAt) gaps.push('Live session has no date')
  return gaps
}

/* ---------------- marketplace selectors ---------------- */

export const useProducts = () => useStore(s => s.db.products)

/** What still blocks a listing from going live. Same discipline as a session:
 *  nothing reaches a family until the thing they would be paying for is
 *  actually described, dated and priced. */
export function productReadiness(p: Product): string[] {
  const gaps: string[] = []
  if (!p.name.trim()) gaps.push('Needs a name')
  if (!p.summary.trim()) gaps.push('Needs a summary ΓÇö this is what the family reads')
  if (p.price === null) gaps.push('Price not set')
  if (p.price !== null && p.price < 0) gaps.push('Price cannot be negative')
  if (!p.duration.trim()) gaps.push('Needs a duration')
  if (p.seats <= 0) gaps.push('No seats offered')
  if (p.ageMin > p.ageMax) gaps.push('Age range runs backwards')
  if (p.startDate && p.endDate && p.startDate > p.endDate) gaps.push('Ends before it starts')
  if ((p.deposit ?? 0) > 0 && p.price !== null && (p.deposit ?? 0) > p.price) gaps.push('Deposit is more than the price')
  if (p.category === 'program' && !p.trackId) gaps.push('No content yet ΓÇö save it to build its courses in Material')
  /* A kit ships; everything else is taught on a date, so it needs one. */
  if (p.category !== 'kit' && !p.startDate) gaps.push('No start date')
  return gaps
}

export const seatsLeft = (p: Product) => Math.max(0, p.seats - p.seatsTaken)
export const isSoldOut = (p: Product) => seatsLeft(p) === 0

/** Content facts read off the real curriculum for a listing that points at
 *  one, so a program's course count can never drift from what is authored.
 *  A listing with no link returns nothing rather than an invented number. */
export function productContent(db: DB, p: Product): {
  courses: number; sessions: number; topics: number; minutes: number
} | null {
  if (p.loopId) {
    const open = db.sessions.filter(s => s.loopId === p.loopId && s.status === 'published')
    return {
      courses: 1,
      sessions: open.length,
      topics: open.reduce((a, s) => a + s.titles.length, 0),
      minutes: open.reduce((a, s) => a + sessionStats(s).minutes, 0),
    }
  }
  if (p.trackId) {
    const loops = db.loops.filter(l => l.trackId === p.trackId)
    const ids = new Set(loops.map(l => l.id))
    const open = db.sessions.filter(s => ids.has(s.loopId) && s.status === 'published')
    return {
      courses: loops.length,
      sessions: open.length,
      topics: open.reduce((a, s) => a + s.titles.length, 0),
      minutes: open.reduce((a, s) => a + sessionStats(s).minutes, 0),
    }
  }
  return null
}

/** The courses behind a listing, with the sessions a student would actually
 *  open. Only published sessions count ΓÇö a detail page must not advertise
 *  content that is still a draft in the CMS. Empty for an unlinked listing,
 *  which is the honest answer rather than an invented syllabus. */
export function productCourses(db: DB, p: Product): Array<{ loop: Loop; sessions: Session[] }> {
  const loops = p.loopId
    ? db.loops.filter(l => l.id === p.loopId)
    : p.trackId
      ? db.loops.filter(l => l.trackId === p.trackId).sort((a, b) => a.index - b.index)
      : []
  return loops.map(loop => ({
    loop,
    sessions: db.sessions
      .filter(s => s.loopId === loop.id && s.status === 'published')
      .sort((a, b) => a.order - b.order),
  }))
}
