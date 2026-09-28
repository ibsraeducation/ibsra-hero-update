/* ==========================================================================
   Admin · Mentor feedback

   The daily note a parent reads on the performance report — one per
   student, per program, per report page (overview, scores, learning, assets,
   return), per day — and the parent ↔ mentor thread. Posting writes today's
   note and stamps it with the time; earlier days stay, and the parent can
   slide back through them.
   ========================================================================== */

import { useMemo, useState } from 'react'
import { CalendarCheck, History, MessageSquare, Search, Send, UserRound } from 'lucide-react'
import { useStore } from '@/lib/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Empty, Field } from '@/components/ui'
import { dateTime } from '@/lib/format'
import {
  FEEDBACK_PAGES, dayLabel, notesFor, noteOn, today, useMentor, type FeedbackPage,
} from '@/lib/mentorNotes'
import '@/roles/parent/insight.css'

export default function MentorFeedback() {
  const db = useStore(s => s.db)
  const toast = useStore(s => s.toast)
  const notes = useMentor(s => s.notes)
  const msgs = useMentor(s => s.msgs)
  const postNote = useMentor(s => s.postNote)
  const send = useMentor(s => s.send)
  const day = today()

  const [q, setQ] = useState('')
  const students = useMemo(() => db.people
    .filter(p => p.role === 'student')
    .filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [db.people, q])

  /* A parent message waiting for a reply. */
  const waiting = (id: string) => {
    const mine = msgs.filter(m => m.studentId === id)
    return mine[mine.length - 1]?.from === 'parent'
  }

  const [pickedId, setPickedId] = useState('')
  const student = students.find(s => s.id === pickedId)
    ?? students.find(s => waiting(s.id)) ?? students[0]

  const mentorOf = (id: string | undefined) => {
    const st = db.people.find(p => p.id === id)
    const cohort = db.cohorts.find(c => c.id === st?.cohortId)
    return db.people.find(p => p.id === cohort?.instructorId)
  }

  /* A student's programs: their own track, plus any program already carrying a note. */
  const tracksOf = (id: string, own?: string) => {
    const ids = new Set<string>(own ? [own] : [])
    Object.values(notes).forEach(x => { if (x.studentId === id) ids.add(x.trackId) })
    return db.tracks.filter(t => ids.has(t.id))
  }

  const tracks = student ? tracksOf(student.id, student.trackId) : []
  const [trackPick, setTrackPick] = useState('')
  const track = tracks.find(t => t.id === trackPick) ?? tracks[0]
  const mentor = mentorOf(student?.id)

  /* Each page of the parent's report carries its own note, one per day. */
  const [page, setPage] = useState<FeedbackPage>('overview')
  const pageMeta = FEEDBACK_PAGES.find(p => p.key === page)!
  const todayOn = (p: FeedbackPage) => (student && track ? noteOn(notes, student.id, track.id, p, day) : undefined)
  const note = todayOn(page)
  const postedToday = (p: FeedbackPage) => {
    const x = todayOn(p)
    return !!x && !x.seeded
  }
  const earlier = student && track
    ? notesFor(notes, student.id, track.id, page).filter(x => x.day !== day).slice(0, 7)
    : []

  const [text, setText] = useState('')
  const [focus, setFocus] = useState('')
  const [editing, setEditing] = useState('')
  /* The form follows today's note for the picked page — reloaded on every pick. */
  const formKey = `${student?.id}:${track?.id}:${page}:${day}`
  if (editing !== formKey) {
    setEditing(formKey)
    setText(note && !note.seeded ? note.text : '')
    setFocus(note && !note.seeded ? note.focus : '')
  }

  const thread = student ? msgs.filter(m => m.studentId === student.id) : []
  const [reply, setReply] = useState('')

  const post = () => {
    if (!student || !track || !text.trim()) return
    postNote(student.id, track.id, page, { text, focus }, mentor?.name ?? 'Mentor')
    toast(`Posted on ${pageMeta.label} — ${student.name.split(' ')[0]}'s parent sees it with today's date`)
  }

  return (
    <div className="page">
      <PageHeader
        title="Mentor feedback" />

      <div className="mf-layout">
        {/* ---------- students ---------- */}
        <aside className="card mf-list">
          <label className="mf-search">
            <Search />
            <input className="inp ghost" value={q} placeholder="Find a student" onChange={e => setQ(e.target.value)} />
          </label>
          <div className="stack g2" style={{ overflowY: 'auto' }}>
            {students.map(s => {
              /* How many of the five report pages got today's note, on their own program. */
              const count = s.trackId
                ? FEEDBACK_PAGES.filter(p => {
                    const x = noteOn(notes, s.id, s.trackId!, p.key, day)
                    return x && !x.seeded
                  }).length
                : 0
              const done = count === FEEDBACK_PAGES.length
              return (
                <button key={s.id} className="mf-row" data-on={s.id === student?.id || undefined}
                  onClick={() => { setPickedId(s.id); setTrackPick('') }}>
                  <span className="grow stack g2" style={{ minWidth: 0 }}>
                    <span className="t-sm w-med truncate">{s.name}</span>
                    <span className="t-xs c-muted2 truncate">
                      {db.tracks.find(t => t.id === s.trackId)?.name ?? 'No program'}
                    </span>
                  </span>
                  {waiting(s.id) && <Badge tone="rose" dot>message</Badge>}
                  <Badge tone={done ? 'teal' : 'gold'} dot>{count}/{FEEDBACK_PAGES.length} today</Badge>
                </button>
              )
            })}
          </div>
        </aside>

        {!student ? (
          <div className="card"><Empty icon={<UserRound />} title="No students match" /></div>
        ) : (
          <div className="stack g16" style={{ minWidth: 0 }}>
            {/* ---------- today's note ---------- */}
            <section className="card">
              <header className="ins-head">
                <span className="ins-ico" data-tone="teal"><CalendarCheck /></span>
                <div className="stack g2 grow" style={{ minWidth: 0 }}>
                  <span className="t-md w-sb">Today's note · {pageMeta.label} · {student.name}</span>
                  <span className="t-xs c-muted2">Mentor: {mentor?.name ?? 'not assigned'}</span>
                </div>
                <Badge tone={postedToday(page) ? 'teal' : 'gold'} dot>
                  {postedToday(page) ? 'Posted today' : 'Due today'}
                </Badge>
              </header>

              <div className="card-body stack g14">
                {tracks.length > 1 && (
                  <Field label="Program">
                    <select className="sel" value={track?.id} onChange={e => setTrackPick(e.target.value)}>
                      {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                )}
                {!track ? (
                  <span className="t-sm c-muted">This student is not on a program yet.</span>
                ) : (
                  <>
                    <Field label="Report page">
                      <div className="row g6 wrap" role="tablist">
                        {FEEDBACK_PAGES.map(p => (
                          <button key={p.key} role="tab" aria-selected={p.key === page}
                            className="chip-q mf-page" data-on={p.key === page || undefined}
                            onClick={() => setPage(p.key)}>
                            <span className="mf-dot" data-done={postedToday(p.key) || undefined} />
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Summary for the parent">
                      <textarea className="ta" rows={4} value={text}
                        placeholder={`e.g. ${student.name.split(' ')[0]} finished the hook exercise and the brief was clean…`}
                        onChange={e => setText(e.target.value)} />
                    </Field>
                    <Field label="Focus next">
                      <input className="inp" value={focus} placeholder="Hand in the open piece before Thursday's class"
                        onChange={e => setFocus(e.target.value)} />
                    </Field>
                    <div className="row g10 wrap">
                      <button className="btn primary" disabled={!text.trim()} onClick={post}>
                        <Send />Post today's note
                      </button>
                      <span className="t-xs c-muted2">
                        {note && !note.seeded
                          ? `Today's note was posted ${dateTime(note.updatedAt)} — posting again replaces it.`
                          : 'Nothing posted for today on this page yet.'}
                      </span>
                    </div>

                    {earlier.length > 0 && (
                      <div className="mf-earlier">
                        <span className="eyebrow row g6"><History style={{ width: 12, height: 12 }} />Earlier notes on {pageMeta.label}</span>
                        <ul>
                          {earlier.map(x => (
                            <li key={x.day}>
                              <b>{dayLabel(x.day)}</b>
                              <span className="grow truncate" title={x.text}>{x.text}</span>
                              {x.seeded && <Badge tone="line">demo</Badge>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* ---------- parent questions ---------- */}
            <section className="card">
              <header className="ins-head">
                <span className="ins-ico" data-tone="brand"><MessageSquare /></span>
                <div className="stack g2 grow">
                  <span className="t-md w-sb">Parent messages</span>
                  <span className="t-xs c-muted2">Replies go out as {mentor?.name ?? 'the mentor'}.</span>
                </div>
                {waiting(student.id) && <Badge tone="rose" dot>waiting for a reply</Badge>}
              </header>
              <div className="mc-log" style={{ maxHeight: 360 }}>
                {thread.length === 0 ? (
                  <span className="t-sm c-muted2" style={{ padding: 4 }}>No messages from this family yet.</span>
                ) : thread.map(m => (
                  <div key={m.id} className="chat-msg" data-role={m.from === 'mentor' ? 'user' : 'assistant'}>
                    <div className="chat-bubble">
                      <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
                      {m.context && (
                        <details className="mc-ctx">
                          <summary>Their conversation with the assistant · {m.context.length} messages</summary>
                          <ul>
                            {m.context.map((c, i) => (
                              <li key={i}><b>{c.role === 'user' ? 'Parent' : 'Assistant'}:</b> {c.text}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <span className="chat-src">{m.from === 'parent' ? 'Parent' : 'You'} · {dateTime(m.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mc-compose">
                <form className="chat-compose" onSubmit={e => {
                  e.preventDefault()
                  if (!reply.trim()) return
                  send({ studentId: student.id, from: 'mentor', text: reply.trim() })
                  setReply('')
                }}>
                  <textarea className="ta" rows={2} value={reply} placeholder="Reply to the parent…"
                    onChange={e => setReply(e.target.value)} />
                  <button className="btn primary" type="submit" disabled={!reply.trim()}><Send />Reply</button>
                </form>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
