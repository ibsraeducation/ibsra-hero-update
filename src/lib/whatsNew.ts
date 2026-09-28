/* ==========================================================================
   What's new — built from rows that already exist, nothing extra stored.

   Alerts stay inside the app (no email): a parent or a student who acts and
   waits — files a top-up, asks for a program, hands in an answer — is told
   what happened to it the next time they open a page that carries this
   strip, not by a message arriving. Every item here traces back to a
   timestamp another table already writes: `payments.reviewed_at` /
   `fulfilled_at`, `access_requests.answered_at`, `enrollments.enrolled_at`,
   `submissions.graded_at`, `mentor_feedback.day`.

   Pure and framework-free, so it is tested on its own; the fetching that
   feeds it lives next to the pages that render it.
   ========================================================================== */

export type NewsKind = 'topup' | 'kit' | 'request' | 'enrolment' | 'grade' | 'note'

export interface NewsItem {
  /** Stable across a rebuild, so `unseen` and React keys agree. */
  id: string
  /** ISO timestamp — what the feed sorts and cuts on. */
  at: string
  kind: NewsKind
  text: string
  /** Where tapping the item takes you. */
  to: string
}

const byNewest = (a: NewsItem, b: NewsItem) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)

/* ---------------- parent ---------------- */

interface ParentPayment {
  id: string
  kind?: 'topup' | 'program' | 'kit' | null
  status: 'pending' | 'approved' | 'rejected'
  amount_egp: number
  program_name: string
  student_id: string | null
  reviewed_at: string | null
  fulfilled_at?: string | null
  review_note: string | null
}

interface ParentRequest {
  id: string
  status: 'pending' | 'approved' | 'declined'
  answered_at: string | null
  answer_note: string
  student_id: string
  track_id: string | null
  loop_id: string | null
}

interface ParentEnrollment {
  student_id: string
  loop_id: string
  enrolled_at: string
}

interface ParentSubmission {
  id: string
  student_id: string
  status: 'submitted' | 'graded'
  graded_at: string | null
  score: number | null
  points: number
}

interface ParentNote {
  student_id: string | null
  day: string
}

export interface ParentNewsInput {
  /** student_id → the name a parent reads on their own hero card. */
  childNameOf: Record<string, string>
  /** loop_id → its name, for "opened <course>". */
  loopNameOf: Record<string, string>
  /** track_id → its name, for "asked for <program>". */
  trackNameOf: Record<string, string>
  payments: ParentPayment[]
  requests: ParentRequest[]
  enrollments: ParentEnrollment[]
  submissions: ParentSubmission[]
  notes: ParentNote[]
}

const money = (egp: number) => `${egp.toLocaleString('en-US')} EGP`

export function buildParentNews(input: ParentNewsInput): NewsItem[] {
  const { childNameOf, loopNameOf, trackNameOf, payments, requests, enrollments, submissions, notes } = input
  const childName = (id: string | null) => (id && childNameOf[id]) || 'your hero'
  const items: NewsItem[] = []

  for (const p of payments) {
    if (p.status === 'pending') continue
    if (p.kind === 'topup') {
      if (p.status === 'approved' && p.reviewed_at) {
        items.push({
          id: `pay:${p.id}:approved`, at: p.reviewed_at, kind: 'topup',
          text: `Your wallet was credited with ${money(p.amount_egp)}.`, to: '/parent/wallet',
        })
      } else if (p.status === 'rejected' && p.reviewed_at) {
        items.push({
          id: `pay:${p.id}:rejected`, at: p.reviewed_at, kind: 'topup',
          text: `Your top-up wasn't accepted${p.review_note ? ` — ${p.review_note}` : '.'}`,
          to: '/parent/wallet',
        })
      }
    } else if (p.kind === 'kit' && p.fulfilled_at) {
      items.push({
        id: `pay:${p.id}:handed`, at: p.fulfilled_at, kind: 'kit',
        text: `${p.program_name} is ready — handed over to ${childName(p.student_id)}.`,
        to: '/parent/payments?tab=history',
      })
    }
  }

  /* An enrolment that a request already explains is not a second story —
     it is dropped so a family reads "your ask was opened" exactly once. */
  const explainedByRequest = new Set<string>()
  for (const r of requests) {
    if (r.status === 'pending' || !r.answered_at) continue
    const what = r.loop_id ? loopNameOf[r.loop_id] : trackNameOf[r.track_id ?? '']
    const name = what || 'that program';
    if (r.status === 'approved') {
      items.push({
        id: `req:${r.id}`, at: r.answered_at, kind: 'request',
        text: `Your ask for ${name} was opened for ${childName(r.student_id)}.`, to: '/parent/material',
      })
      if (r.loop_id) explainedByRequest.add(`${r.student_id}:${r.loop_id}`)
    } else {
      items.push({
        id: `req:${r.id}`, at: r.answered_at, kind: 'request',
        text: `Your ask for ${name} wasn't opened this time${r.answer_note ? ` — ${r.answer_note}` : '.'}`,
        to: '/parent/material',
      })
    }
  }

  for (const e of enrollments) {
    if (explainedByRequest.has(`${e.student_id}:${e.loop_id}`)) continue
    const name = loopNameOf[e.loop_id] || 'a course'
    items.push({
      id: `enr:${e.student_id}:${e.loop_id}`, at: e.enrolled_at, kind: 'enrolment',
      text: `${name} opened for ${childName(e.student_id)}.`, to: '/parent/material',
    })
  }

  for (const s of submissions) {
    if (s.status !== 'graded' || !s.graded_at) continue
    items.push({
      id: `sub:${s.id}`, at: s.graded_at, kind: 'grade',
      text: `${childName(s.student_id)}'s answer was marked — ${s.score ?? 0}/${s.points}.`,
      to: '/parent/material',
    })
  }

  for (const n of notes) {
    items.push({
      id: `note:${n.student_id ?? 'x'}:${n.day}`, at: `${n.day}T12:00:00`, kind: 'note',
      text: `A new note from your mentor about ${childName(n.student_id)}.`, to: '/parent/feedback',
    })
  }

  return items.sort(byNewest).slice(0, 20)
}

/* ---------------- student ---------------- */

interface StudentEnrollment {
  loop_id: string
  enrolled_at: string
}

interface StudentSubmission {
  id: string
  session_id: string
  status: 'submitted' | 'graded'
  graded_at: string | null
  score: number | null
  points: number
}

interface StudentNote {
  day: string
}

export interface StudentNewsInput {
  loopNameOf: Record<string, string>
  enrollments: StudentEnrollment[]
  submissions: StudentSubmission[]
  notes: StudentNote[]
}

export function buildStudentNews(input: StudentNewsInput): NewsItem[] {
  const { loopNameOf, enrollments, submissions, notes } = input
  const items: NewsItem[] = []

  for (const e of enrollments) {
    const name = loopNameOf[e.loop_id] || 'A new course'
    items.push({
      id: `enr:${e.loop_id}`, at: e.enrolled_at, kind: 'enrolment',
      text: `${name} opened for you.`, to: '/student/missions',
    })
  }

  for (const s of submissions) {
    if (s.status !== 'graded' || !s.graded_at) continue
    items.push({
      id: `sub:${s.id}`, at: s.graded_at, kind: 'grade',
      text: `Your answer was marked — ${s.score ?? 0}/${s.points}.`,
      to: `/student/session/${s.session_id}`,
    })
  }

  for (const n of notes) {
    items.push({
      id: `note:${n.day}`, at: `${n.day}T12:00:00`, kind: 'note',
      text: 'A new note from your mentor.', to: '/student/progress',
    })
  }

  return items.sort(byNewest).slice(0, 20)
}

/* ---------------- read / unread, kept per browser ---------------- */

export const seenKey = (role: 'parent' | 'student', userId: string) => `ibsra.seen.${role}.${userId}`

export function readSeen(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

export function markSeen(key: string, at: string): void {
  try { localStorage.setItem(key, at) } catch { /* a per-viewer convenience only */ }
}

/** Items newer than the last time this viewer marked the feed read. With no
 *  mark yet, everything is unseen — a first visit should show what has
 *  already happened, not hide it. */
export function unseen(items: NewsItem[], since: string | null): NewsItem[] {
  if (!since) return items
  return items.filter(i => i.at > since)
}
