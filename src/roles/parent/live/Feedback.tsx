/* ==========================================================================
   Student feedback — how the sessions actually went, what has been built,
   and what the mentor says about it.

   Three things, in that order. The bars are the record: one column per
   session, three readings each — did they turn up, did they hand the work
   in, and how much of the session they walked through. Under them the
   projects, in the order the child meets them: the ones already built, and
   the ones still ahead. Last, the mentor's own words, typed or recorded.

   Everything on this page is derived from rows the child wrote themselves
   (see feedbackModel.ts) or from a note a mentor posted. Nothing is
   estimated, and nothing here is a promise about what comes next.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarCheck, CheckCircle2, ChevronRight, Circle, Hammer, ListChecks,
  Loader2, MessageSquare, Target, User,
} from 'lucide-react'
import { fetchMentorFeedback } from '@/lib/api/mentorFeedback'
import { toMessage } from '@/lib/api/errors'
import { dateFull } from '@/lib/format'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Empty } from '@/components/ui'
import type { MentorFeedbackRow } from '@/lib/api/rows'
import { ChildPicker } from './ChildPicker'
import { markProjects, markSessions, summary, type SessionMark } from './feedbackModel'
import { useChildView, useFamily } from './useFamily'
import './family.css'
import './live.css'

/* ---------------- the bars ---------------- */

const SERIES = [
  { key: 'attendancePct', label: 'Attendance', tone: 'var(--teal-600)' },
  { key: 'tasksPct', label: 'Tasks done', tone: 'var(--brand)' },
  { key: 'focus', label: 'Focus', tone: 'var(--gold-600)' },
] as const

function SessionBars({ marks }: { marks: SessionMark[] }) {
  /* Only the sessions that have opened: a session still to come has nothing
     to say about how a child is doing. */
  const open = marks.filter(m => m.attendance !== 'upcoming')
  const shown = open.slice(-14)

  if (shown.length === 0) {
    return (
      <Empty icon={<ListChecks />} title="No session has opened yet" />
    )
  }

  return (
    <div className="stack g12">
      <div className="fb-legend">
        {SERIES.map(s => (
          <span key={s.key} className="fb-key">
            <i style={{ background: s.tone }} />{s.label}
          </span>
        ))}
      </div>

      <div className="fb-chart" role="img"
        aria-label={`Attendance, tasks done and focus for the last ${shown.length} sessions`}>
        {shown.map(m => (
          <div key={m.sessionId} className="fb-col"
            title={`${m.name}\nAttendance: ${m.attendance === 'attended' ? 'attended' : 'missed'}\nTasks: ${m.tasksDone} of ${m.tasksTotal}\nFocus: ${m.focus}%`}>
            <div className="fb-bars">
              {SERIES.map(s => (
                <span key={s.key} className="fb-bar"
                  style={{ height: `${Math.max(2, m[s.key])}%`, background: s.tone }} />
              ))}
            </div>
            <span className="fb-x" data-missed={m.attendance === 'missed' || undefined}>{m.short}</span>
          </div>
        ))}
      </div>

      {open.length > shown.length && (
        <span className="t-xs c-muted2">
          The last {shown.length} sessions of {open.length}.
        </span>
      )}
    </div>
  )
}

/* ---------------- the page ---------------- */

export function ParentFeedback() {
  const { children, error, child, pick } = useFamily()
  const view = useChildView(child)

  const [notes, setNotes] = useState<MentorFeedbackRow[] | null>(null)
  const [noteError, setNoteError] = useState<string | null>(null)

  const studentId = child?.profile.id ?? ''
  useEffect(() => {
    if (!studentId) { setNotes([]); return }
    let live = true
    setNotes(null)
    void (async () => {
      try {
        const rows = await fetchMentorFeedback(studentId)
        if (live) { setNotes(rows); setNoteError(null) }
      } catch (e) {
        if (live) { setNotes([]); setNoteError(toMessage(e)) }
      }
    })()
    return () => { live = false }
  }, [studentId])

  const name = child?.profile.name || child?.profile.email || 'your student'
  const first = name.split(' ')[0]

  const marks = useMemo(
    () => markSessions(view.sessions, view.loops, view.done, view.submissions),
    [view.sessions, view.loops, view.done, view.submissions],
  )
  const totals = useMemo(() => summary(marks), [marks])
  const projects = useMemo(
    () => markProjects(view.sessions, view.loops, view.done),
    [view.sessions, view.loops, view.done],
  )
  const built = projects.filter(p => p.state === 'done')
  const ahead = projects.filter(p => p.state !== 'done')

  if (children === null) {
    return (
      <div className="page">
        <div className="card" style={{ padding: 28 }}>
          <span className="row g8 c-muted t-sm"><Loader2 className="spin" />Loading your students…</span>
        </div>
      </div>
    )
  }

  if (children.length === 0) {
    return (
      <div className="page">
        <PageHeader title="Student feedback" />
        <div className="card">
          <Empty icon={<User />} title="Add your student first" />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="Student feedback" />

      <ChildPicker kids={children} child={child} onPick={pick} />

      {(error || view.error) && (
        <div className="auth-alert mb12" role="alert"><AlertTriangle /><span>{error || view.error}</span></div>
      )}

      <div className="fam-stack">
        {/* ---- 1 · the sessions ---- */}
        <section className="card">
          <div className="pd-col">
            <h2 className="pd-col-head"><ListChecks />Session by session</h2>
            <p className="t-xs c-muted2" style={{ lineHeight: 1.6 }}>
              One column per session: whether {first} turned up, how much of the work was handed
              in, and how much of the session they walked through — half of that last number is
              what the graded answers scored.
            </p>

            {view.loading ? (
              <div className="skel" style={{ height: 180 }} />
            ) : (
              <>
                <div className="fb-tiles">
                  <div className="fb-tile">
                    <span className="eyebrow">Attendance</span>
                    <b>{totals.attendancePct}%</b>
                    <span className="t-xs c-muted2">{totals.attended} of {totals.sessions} sessions opened</span>
                  </div>
                  <div className="fb-tile">
                    <span className="eyebrow">Tasks done</span>
                    <b>{totals.tasksPct}%</b>
                    <span className="t-xs c-muted2">{totals.tasksDone} of {totals.tasksTotal} handed in</span>
                  </div>
                  <div className="fb-tile">
                    <span className="eyebrow">Focus score</span>
                    <b>{totals.focus}%</b>
                    <span className="t-xs c-muted2">averaged over the sessions that opened</span>
                  </div>
                </div>

                <SessionBars marks={marks} />

                {totals.upcoming > 0 && (
                  <span className="t-xs c-muted2">
                    {totals.upcoming} session{totals.upcoming === 1 ? '' : 's'} still ahead — they are
                    not counted against {first}.
                  </span>
                )}
              </>
            )}
          </div>
        </section>

        {/* ---- 2 · the projects ---- */}
        <section className="card">
          <div className="pd-col">
            <h2 className="pd-col-head"><Hammer />Projects built, and what comes next</h2>
            {view.loading ? (
              <div className="skel" style={{ height: 120 }} />
            ) : projects.length === 0 ? (
              <Empty icon={<Hammer />} title="No project on this path yet" />
            ) : (
              <>
                <div className="row g10 wrap">
                  <Badge tone="teal" dot>{built.length} built</Badge>
                  <Badge tone="line" dot>{ahead.length} still to build</Badge>
                </div>

                <ol className="fb-seq">
                  {projects.map(p => (
                    <li key={`${p.sessionId}:${p.id}`} className="fb-step" data-state={p.state}>
                      <span className="fb-step-mark">
                        {p.state === 'done'
                          ? <CheckCircle2 />
                          : p.state === 'building' ? <Target /> : <Circle />}
                      </span>
                      <span className="stack g2 grow" style={{ minWidth: 0 }}>
                        <span className="t-sm w-med truncate">{p.name}</span>
                        <span className="t-xs c-muted2 truncate">
                          {p.loopName}{p.loopName && p.sessionName ? ' · ' : ''}{p.sessionName}
                        </span>
                        {p.state === 'building' && (
                          <span className="meter" style={{ maxWidth: 160 }}>
                            <i style={{ width: `${p.progress}%` }} />
                          </span>
                        )}
                      </span>
                      <span className="t-xs c-muted2" style={{ flex: 'none' }}>
                        {p.state === 'done' ? 'Done' : p.state === 'building' ? `${p.progress}%` : 'Scheduled'}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </section>

        {/* ---- 3 · the mentor ---- */}
        <section className="card">
          <div className="pd-col">
            <h2 className="pd-col-head"><MessageSquare />What the mentor says</h2>
            {noteError && (
              <div className="auth-alert" role="alert"><AlertTriangle /><span>{noteError}</span></div>
            )}
            {notes === null ? (
              <span className="row g8 c-muted t-sm"><Loader2 className="spin" />Loading the mentor's notes…</span>
            ) : notes.length === 0 ? (
              <Empty icon={<MessageSquare />} title="No note yet" />
            ) : (
              <div className="stack g12">
                {notes.map((n, i) => (
                  <article key={n.id} className="fb-note" data-latest={i === 0 || undefined}>
                    <header className="row g8 wrap" style={{ justifyContent: 'space-between' }}>
                      <span className="row g6 eyebrow">
                        <CalendarCheck style={{ width: 13, height: 13 }} />{dateFull(n.day)}
                      </span>
                      {i === 0 && <Badge tone="teal" dot>Latest</Badge>}
                    </header>

                    {n.body && (
                      <p className="t-sm" style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{n.body}</p>
                    )}

                    {n.focus && (
                      <p className="fb-focus t-sm">
                        <ChevronRight style={{ width: 14, height: 14, flex: 'none' }} />
                        <span><b>Focus next:</b> {n.focus}</span>
                      </p>
                    )}

                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
