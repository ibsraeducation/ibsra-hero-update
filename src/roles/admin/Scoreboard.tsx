/* ==========================================================================
   Students · feedback — every hero's session, what it scored, and what the
   mentor wrote about it.

   Read intake by intake, because an intake is the group a mentor actually
   teaches: one fold per batch, shut until it is asked for. The four
   measures come from lib/scores.ts, the same arithmetic the hero and their
   family see, so nothing here is a second opinion.

   The note written in this table is the note on the family's feedback page.
   There is one table, not a mentor's copy and a parent's copy.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ChevronDown, Layers, Loader2, MessageSquare, Search, Send,
} from 'lucide-react'
import { Badge, Empty } from '@/components/ui'
import { listStudents, type StudentRow } from '@/lib/api/students'
import { listAllSubmissions } from '@/lib/api/submissions'
import { fetchBatches, fetchBookings } from '@/lib/api/schedule'
import {
  dayOf, listMentorFeedback, postMentorFeedback,
} from '@/lib/api/mentorFeedback'
import { toMessage } from '@/lib/api/errors'
import { useStore } from '@/lib/store'
import { useAuthStore } from '@/lib/authStore'
import { asPct, scoreSession, type ScoredSubmission, type SessionScores } from '@/lib/scores'
import { regionLabel } from '@/lib/region'
import type {
  CourseBatchRow, MentorFeedbackRow, SessionBookingRow, SubmissionRow,
} from '@/lib/api/rows'
import type { Session } from '@/lib/types'

const RANGE_DAYS_BACK = 400
const RANGE_DAYS_FWD = 200
const NO_BATCH = 'none'

interface Row {
  key: string
  studentId: string
  hero: string
  trackId: string | null
  program: string
  course: string
  session: Session
  scores: SessionScores
  note: MentorFeedbackRow | null
}

interface Group {
  id: string
  name: string
  meta: string
  rows: Row[]
}

const Pct = ({ value }: { value: number | null }) => (
  value === null
    ? <span className="t-xs c-muted2">—</span>
    : <b className="t-sm tnum" style={{
        color: value >= 80 ? 'var(--teal-600)' : value >= 50 ? 'var(--gold-700)' : 'var(--rose-600)',
      }}>{value}%</b>
)

function NoteCell({ row, onSaved }: { row: Row; onSaved: (n: MentorFeedbackRow) => void }) {
  const toast = useStore(s => s.toast)
  const authorId = useAuthStore(s => s.profile?.id)
  const [value, setValue] = useState(row.note?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  const dirty = value.trim() !== (row.note?.body ?? '').trim()
  const today = row.note?.day === dayOf()

  const save = async () => {
    if (!value.trim()) { toast('Write a line first', 'info'); return }
    setBusy(true)
    try {
      const saved = await postMentorFeedback({
        studentId: row.studentId,
        trackId: row.trackId,
        sessionId: row.session.id,
        body: value,
        authorId,
      })
      onSaved(saved)
      setOpen(false)
      toast(`${row.hero}'s family sees this on their feedback page`)
    } catch (e) {
      toast(toMessage(e), 'err')
    }
    setBusy(false)
  }

  if (!open) {
    return (
      <button className="btn sm ghost" style={{ maxWidth: 260, justifyContent: 'flex-start' }}
        onClick={() => setOpen(true)}>
        <MessageSquare />
        <span className="truncate">
          {row.note?.body ? row.note.body : 'Write a note'}
        </span>
      </button>
    )
  }

  return (
    <span className="stack g6" style={{ minWidth: 240 }}>
      <textarea className="ta" rows={3} value={value} autoFocus
        placeholder="What happened in this session, in a line the family can read."
        onChange={e => setValue(e.target.value)} />
      <span className="row g6">
        <button className="btn sm primary" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? <Loader2 className="spin" /> : <Send />}{row.note ? 'Replace' : 'Post'}
        </button>
        <button className="btn sm ghost" onClick={() => { setValue(row.note?.body ?? ''); setOpen(false) }}>
          Cancel
        </button>
        {row.note && (
          <span className="t-xs c-muted2">{today ? 'Posted today' : `Last written ${row.note.day}`}</span>
        )}
      </span>
    </span>
  )
}

export function ScoreboardPanel() {
  const db = useStore(s => s.db)
  const [students, setStudents] = useState<StudentRow[] | null>(null)
  const [subs, setSubs] = useState<SubmissionRow[]>([])
  const [bookings, setBookings] = useState<SessionBookingRow[]>([])
  const [batches, setBatches] = useState<CourseBatchRow[]>([])
  const [notes, setNotes] = useState<MentorFeedbackRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [shut, setShut] = useState<Record<string, boolean>>({})
  const [find, setFind] = useState('')

  const load = useCallback(async () => {
    try {
      setError(null)
      const from = new Date(Date.now() - RANGE_DAYS_BACK * 86_400_000).toISOString()
      const to = new Date(Date.now() + RANGE_DAYS_FWD * 86_400_000).toISOString()
      const [people, answers, sittings, bs, ns] = await Promise.all([
        listStudents(), listAllSubmissions(), fetchBookings({ from, to }),
        fetchBatches(), listMentorFeedback(),
      ])
      setStudents(people)
      setSubs(answers)
      setBookings(sittings)
      setBatches(bs)
      setNotes(ns)
    } catch (e) {
      setError(toMessage(e))
      setStudents([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const groups = useMemo((): Group[] => {
    if (!students) return []

    const batchOf = new Map(batches.map(b => [b.id, b]))
    const sessionsOf = new Map<string, Session[]>()
    for (const s of db.sessions) {
      const list = sessionsOf.get(s.loopId)
      if (list) list.push(s)
      else sessionsOf.set(s.loopId, [s])
    }

    const noteAt = new Map<string, MentorFeedbackRow>()
    for (const n of notes) {
      if (!n.session_id) continue
      const key = `${n.student_id}|${n.session_id}`
      if (!noteAt.has(key)) noteAt.set(key, n)
    }

    const held: Record<string, Group> = {}
    const put = (id: string, row: Row) => {
      const at = held[id]
      if (at) { at.rows.push(row); return }
      const b = batchOf.get(id)
      const course = b ? db.loops.find(l => l.id === b.loop_id) : null
      held[id] = {
        id,
        name: b?.name ?? 'No intake yet',
        meta: b
          ? [course?.name, regionLabel(b.region), `${b.seats} seats`].filter(Boolean).join(' · ')
          : 'Heroes booked before intakes, or by hand',
        rows: [row],
      }
    }

    const mine = (studentId: string): ScoredSubmission[] =>
      subs.filter(s => s.student_id === studentId)

    for (const person of students) {
      const hero = person.name || person.email
      if (find && !hero.toLowerCase().includes(find.toLowerCase())) continue

      for (const e of person.enrollments) {
        if (e.status === 'dropped') continue
        const loop = db.loops.find(l => l.id === e.loop_id)
        if (!loop) continue
        const track = db.tracks.find(t => t.id === loop.trackId)

        const theirs = bookings.filter(b => b.student_id === person.id && b.loop_id === loop.id)
        const batchId = theirs.find(b => b.batch_id)?.batch_id ?? NO_BATCH

        for (const session of (sessionsOf.get(loop.id) ?? []).filter(s => s.status === 'published')) {
          const sittings = theirs
            .filter(b => b.session_id === session.id)
            .map(b => ({ attended: b.attended, endsAt: b.ends_at }))

          put(batchId, {
            key: `${person.id}|${session.id}`,
            studentId: person.id,
            hero,
            trackId: track?.id ?? null,
            program: track?.name ?? '—',
            course: loop.name,
            session,
            scores: scoreSession(session, mine(person.id), sittings),
            note: noteAt.get(`${person.id}|${session.id}`) ?? null,
          })
        }
      }
    }

    const order = [...batches.map(b => b.id), NO_BATCH]
    return order.filter(id => held[id]).map(id => held[id])
  }, [students, batches, bookings, subs, notes, db, find])

  const total = groups.reduce((n, g) => n + g.rows.length, 0)

  const remember = (n: MentorFeedbackRow) =>
    setNotes(all => [n, ...all.filter(x => x.id !== n.id)])

  if (students === null) return <div className="skel" style={{ height: 360 }} />

  return (
    <div className="stack g14">
      {error && (
        <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>
      )}

      <div className="row g10 wrap between">
        <span className="row g8">
          <Search style={{ width: 15, height: 15, color: 'var(--muted-2)' }} />
          <input className="inp" value={find} placeholder="Find a hero"
            style={{ maxWidth: 240, height: 32 }} aria-label="Find a hero"
            onChange={e => setFind(e.target.value)} />
        </span>
        <span className="t-xs c-muted2 tnum">
          {total} session{total === 1 ? '' : 's'} across {groups.length} intake{groups.length === 1 ? '' : 's'}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="card">
          <Empty icon={<MessageSquare />}
            title={find ? 'No hero by that name' : 'Nothing to report on yet'} />
        </div>
      ) : groups.map(g => {
        const closed = shut[g.id]
        return (
          <section key={g.id} className="card" style={{ overflow: 'hidden' }}>
            <button type="button" className="card-head sb-fold" aria-expanded={!closed}
              onClick={() => setShut(s => ({ ...s, [g.id]: !s[g.id] }))}>
              <span className="stack g2 grow" style={{ minWidth: 0 }}>
                <span className="t-md w-sb row g8">
                  <Layers className="ico-xs" style={{ color: 'var(--muted-2)' }} />{g.name}
                </span>
                <span className="t-xs c-muted2">{g.meta}</span>
              </span>
              <Badge tone="brand" dot>{g.rows.length}</Badge>
              <ChevronDown style={{
                width: 16, height: 16, flex: 'none',
                transform: closed ? undefined : 'rotate(180deg)',
                transition: 'transform var(--fast)',
              }} />
            </button>

            {!closed && (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Hero</th>
                      <th>Program</th>
                      <th>Course</th>
                      <th>Session</th>
                      <th>Tasks</th>
                      <th>Activities</th>
                      <th>Focus</th>
                      <th>Attendance</th>
                      <th>Mentor feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map(r => (
                      <tr key={r.key}>
                        <td><span className="t-sm w-med nowrap">{r.hero}</span></td>
                        <td><span className="t-xs c-muted2">{r.program}</span></td>
                        <td><span className="t-xs c-muted2">{r.course}</span></td>
                        <td>
                          <span className="stack g2" style={{ minWidth: 0 }}>
                            <span className="t-sm truncate">{r.session.name}</span>
                            {r.scores.topics.length > 0 && (
                              <span className="t-xs c-muted2">
                                {r.scores.topics.map(t => `${t.name}: ${t.pct === null ? '—' : `${t.pct}%`}`).join(' · ')}
                              </span>
                            )}
                          </span>
                        </td>
                        <td><Pct value={asPct(r.scores.tasks)} /></td>
                        <td><Pct value={asPct(r.scores.activities)} /></td>
                        <td><Pct value={asPct(r.scores.focus)} /></td>
                        <td><Pct value={asPct(r.scores.attendance)} /></td>
                        <td><NoteCell row={r} onSaved={remember} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
