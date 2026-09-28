/* ==========================================================================
   Mentor feedback and the parent ↔ mentor thread.

   Kept in a store of its own (localStorage `ibsra.mentor.v1`) rather than in
   the content DB: it is written daily by the mentor/admin and read by the
   parent, and it has nothing to do with the curriculum. No backend — the
   thread lives in this browser, which is enough to walk the workflow:
   parent asks → admin replies as the mentor → parent sees the reply.

   Feedback is one note per student, per program, per page of the
   performance report, per DAY. Posting again on the same day replaces that
   day's note; earlier days stay, so a parent can slide back through them.
   ========================================================================== */

import { create } from 'zustand'

export type FeedbackPage = 'overview' | 'scores' | 'learning' | 'character' | 'portfolio' | 'assets' | 'return'

export const FEEDBACK_PAGES: Array<{ key: FeedbackPage; label: string; hint: string }> = [
  { key: 'overview', label: 'Overview', hint: 'The big picture this week' },
  { key: 'scores', label: 'Scores', hint: 'Coming to class and handing work in' },
  { key: 'learning', label: 'Learning', hint: 'What they understood, what comes next' },
  { key: 'character', label: 'Character', hint: 'Work habits a mentor can watch directly' },
  { key: 'portfolio', label: 'Portfolio', hint: 'The published work’s worth, and its reach' },
  { key: 'assets', label: 'Assets', hint: 'The finished pieces of work they own' },
  { key: 'return', label: 'Return', hint: 'Client work and money — never a promise' },
]

export interface MentorNote {
  studentId: string
  trackId: string
  page: FeedbackPage
  /** Local calendar day, yyyy-mm-dd — one note per day. */
  day: string
  /** The day's summary, in the mentor's words. */
  text: string
  /** One line: what to work on next. */
  focus: string
  author: string
  /** ISO. When it was posted — shown on the parent's card. */
  updatedAt: string
  /** Placeholder written by the demo seed, not by a person. */
  seeded?: boolean
}

export interface ThreadMsg {
  id: string
  studentId: string
  from: 'parent' | 'mentor'
  text: string
  at: string
  /** The assistant conversation a parent brought along with the question. */
  context?: Array<{ role: 'user' | 'assistant'; text: string }>
}

interface MentorState {
  notes: Record<string, MentorNote>
  msgs: ThreadMsg[]
  /** Writes today's note for that page, replacing today's if there is one. */
  postNote: (studentId: string, trackId: string, page: FeedbackPage,
    patch: { text: string; focus: string }, author: string) => void
  /** Demo only: fills empty days before today with placeholders. Never
   *  touches a day that already has a note. */
  seedHistory: (base: { studentId: string; trackId: string; page: FeedbackPage; author: string },
    days: number, make: (daysAgo: number) => { text: string; focus: string }) => void
  send: (msg: Omit<ThreadMsg, 'id' | 'at'>) => void
}

const KEY = 'ibsra.mentor.v1'

const pad = (n: number) => String(n).padStart(2, '0')
/** Local yyyy-mm-dd — a note belongs to the day it was written where the mentor is. */
export const dayOf = (d: Date | string | number) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}
export const today = () => dayOf(new Date())
export const isToday = (iso: string) => dayOf(iso) === today()

/** "Today", "Yesterday", or "Wed 9 Sep". */
export function dayLabel(day: string): string {
  if (day === today()) return 'Today'
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (day === dayOf(y)) return 'Yesterday'
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export const noteKey = (studentId: string, trackId: string, page: FeedbackPage, day: string) =>
  `${studentId}:${trackId}:${page}:${day}`

/** Every note for one page of one child's report, newest day first. */
export function notesFor(notes: Record<string, MentorNote>, studentId: string, trackId: string, page: FeedbackPage) {
  return Object.values(notes)
    .filter(n => n.studentId === studentId && n.trackId === trackId && n.page === page)
    .sort((a, b) => b.day.localeCompare(a.day))
}

export const noteOn = (notes: Record<string, MentorNote>, studentId: string, trackId: string, page: FeedbackPage, day: string) =>
  notes[noteKey(studentId, trackId, page, day)] as MentorNote | undefined

function load(): Pick<MentorState, 'notes' | 'msgs'> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    /* Older notes were keyed without a page or a day — re-key them by the
       day they were posted. A real note beats a placeholder on the same day. */
    const notes: Record<string, MentorNote> = {}
    for (const n of Object.values((raw.notes ?? {}) as Record<string, Partial<MentorNote>>)) {
      if (!n.studentId || !n.trackId || !n.updatedAt) continue
      const m = { ...n, page: n.page ?? 'overview', day: n.day ?? dayOf(n.updatedAt) } as MentorNote
      const k = noteKey(m.studentId, m.trackId, m.page, m.day)
      if (!notes[k] || (notes[k].seeded && !m.seeded)) notes[k] = m
    }
    return { notes, msgs: raw.msgs ?? [] }
  } catch {
    return { notes: {}, msgs: [] }
  }
}

function save(s: Pick<MentorState, 'notes' | 'msgs'>) {
  try { localStorage.setItem(KEY, JSON.stringify({ notes: s.notes, msgs: s.msgs })) } catch { /* private mode */ }
}

const uid = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const useMentor = create<MentorState>()((set, get) => ({
  ...load(),

  postNote: (studentId, trackId, page, patch, author) => {
    const day = today()
    const notes = {
      ...get().notes,
      [noteKey(studentId, trackId, page, day)]: {
        studentId, trackId, page, day, author,
        text: patch.text.trim(), focus: patch.focus.trim(),
        updatedAt: new Date().toISOString(),
      },
    }
    set({ notes }); save({ ...get(), notes })
  },

  seedHistory: (base, days, make) => {
    const cur = get().notes
    const add: Record<string, MentorNote> = {}
    for (let i = 1; i <= days; i++) {
      const at = new Date(); at.setDate(at.getDate() - i); at.setHours(18, 30, 0, 0)
      const day = dayOf(at)
      const k = noteKey(base.studentId, base.trackId, base.page, day)
      if (cur[k]) continue
      add[k] = { ...base, day, updatedAt: at.toISOString(), seeded: true, ...make(i) }
    }
    /* Nothing new — no write, so a render that calls this cannot loop. */
    if (!Object.keys(add).length) return
    const notes = { ...cur, ...add }
    set({ notes }); save({ ...get(), notes })
  },

  send: msg => {
    const msgs = [...get().msgs, { ...msg, id: uid(), at: new Date().toISOString() }]
    set({ msgs }); save({ ...get(), msgs })
  },
}))
