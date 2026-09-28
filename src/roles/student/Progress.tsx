/* ==========================================================================
   Student · My Progress

   The student's own record of the courses they are enrolled in, read off
   progressModel.ts: the headline figures, the projects themselves — built,
   being built, and still to start — and what the mentor said about them.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CalendarCheck, CheckCircle2, ChevronRight, Circle,
  Library, Loader2, MessageSquare, Target,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Empty } from '@/components/ui'
import { date, dateFull } from '@/lib/format'
import { backendLive } from '@/lib/supabase'
import { fetchMentorFeedback } from '@/lib/api/mentorFeedback'
import { toMessage } from '@/lib/api/errors'
import type { MentorFeedbackRow } from '@/lib/api/rows'
import { dayLabel, notesFor, useMentor } from '@/lib/mentorNotes'
import { AREA_NOUNS } from '@/lib/area'
import { PROJECT_STATE_META } from '@/lib/types'
import { useAreaProgress, type AreaProgress, type ProjectMark } from './progressModel'
import { useMe } from './useMe'
import './progress.css'

const PROJECT = {
  done: { word: PROJECT_STATE_META.done.label, tone: 'teal', fill: 'var(--teal-500)', icon: <CheckCircle2 /> },
  building: { word: PROJECT_STATE_META.building.label, tone: 'brand', fill: 'var(--brand)', icon: <Target /> },
  soon: { word: PROJECT_STATE_META.soon.label, tone: 'sky', fill: 'var(--sky-500)', icon: <Circle /> },
} as const

/** A score reads green when it is strong, amber in the middle, rose below
 *  half — the same three bands the rest of the app marks work with. */
const scoreTone = (v: number) => (v >= 80 ? 'var(--teal-500)' : v >= 50 ? 'var(--gold-500)' : 'var(--rose-500)')

/* ---------------- small pieces ---------------- */

function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub: string; tone?: string
}) {
  return (
    <div className="sp-tile">
      <span className="eyebrow">{label}</span>
      <b style={tone ? { color: tone } : undefined}>{value}</b>
      <span className="t-xs c-muted2">{sub}</span>
    </div>
  )
}

function Panel({ title, icon, children }: {
  title: string; icon: JSX.Element; children: React.ReactNode
}) {
  return (
    <section className="card sp-panel">
      <h2 className="sp-panel-head">{icon}{title}</h2>
      {children}
    </section>
  )
}

/* ---------------- the project lists ---------------- */

function ProjectList({ state, items }: { state: ProjectMark['state']; items: ProjectMark[] }) {
  const meta = PROJECT[state]
  return (
    <div className="sp-plist" data-state={state}>
      <div className="row g8 between">
        <span className="row g6 t-sm w-med">
          <span className="sp-pmark">{meta.icon}</span>{meta.word}
        </span>
        <Badge tone={meta.tone} dot>{items.length}</Badge>
      </div>

      {items.length === 0 ? (
        <span className="t-xs c-muted2">
          {state === 'done' ? 'Nothing finished yet.'
            : state === 'building' ? 'Nothing open right now.'
            : 'Nothing queued up.'}
        </span>
      ) : (
        <ul className="sp-pitems">
          {items.map(p => (
            <li key={p.key}>
              <Link to={`/student/session/${p.sessionId}`} className="sp-pitem">
                <span className="stack g2 grow" style={{ minWidth: 0 }}>
                  <span className="t-sm w-med truncate">{p.name}</span>
                  <span className="t-xs c-muted2 truncate">
                    {p.loopName}{p.loopName && p.sessionName ? ' · ' : ''}{p.sessionName}
                  </span>
                  {state === 'building' && (
                    <span className="meter" style={{ maxWidth: 150 }}><i style={{ width: `${p.progress}%` }} /></span>
                  )}
                </span>
                <span className="t-xs c-muted2 tnum" style={{ flex: 'none' }}>
                  {state === 'done' ? 'Done' : state === 'building' ? `${p.progress}%` : (p.when ? date(p.when) : 'Ahead')}
                </span>
                <ChevronRight className="sp-go" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ---------------- the mentor's notes ---------------- */

interface Note {
  id: string
  day: string
  body: string
  focus: string
}

/** Live, the notes come from the server; on the demo store they are the ones
 *  an admin wrote in this browser. Either way they are read the same. */
function useMentorNotes(studentId: string, trackIds: string[]): {
  notes: Note[] | null; error: string | null
} {
  const [rows, setRows] = useState<MentorFeedbackRow[] | null>(backendLive ? null : [])
  const [error, setError] = useState<string | null>(null)
  const demo = useMentor(s => s.notes)

  useEffect(() => {
    if (!backendLive || !studentId) return
    let live = true
    setRows(null)
    void (async () => {
      try {
        const got = await fetchMentorFeedback(studentId)
        if (live) { setRows(got); setError(null) }
      } catch (e) {
        if (live) { setRows([]); setError(toMessage(e)) }
      }
    })()
    return () => { live = false }
  }, [studentId])

  const notes = useMemo<Note[] | null>(() => {
    if (!backendLive) {
      /* One note per page per day in the demo store — the overview page is
         the one written about the student as a whole. */
      return trackIds
        .flatMap(id => notesFor(demo, studentId, id, 'overview'))
        .sort((a, b) => b.day.localeCompare(a.day))
        .map(n => ({ id: `${n.trackId}:${n.day}`, day: n.day, body: n.text, focus: n.focus }))
    }
    if (rows === null) return null
    /* A note written about one program belongs to that program's tab; one
       written about the student as a whole shows on both. */
    return rows
      .filter(r => !r.track_id || trackIds.includes(r.track_id))
      .map(r => ({
        id: r.id, day: r.day, body: r.body, focus: r.focus,
      }))
  }, [rows, demo, studentId, trackIds])

  return { notes, error }
}

function MentorNotes({ notes, error, empty }: {
  notes: Note[] | null; error: string | null; empty: string
}) {
  if (error) {
    return <div className="sp-alert" role="alert"><AlertTriangle /><span>{error}</span></div>
  }
  if (notes === null) {
    return <span className="row g8 c-muted t-sm"><Loader2 className="spin" />Loading your mentor&apos;s notes…</span>
  }
  if (notes.length === 0) {
    return <Empty icon={<MessageSquare />} title="No note yet" />
  }
  return (
    <div className="stack g12">
      {notes.map((n, i) => (
        <article key={n.id} className="sp-note" data-latest={i === 0 || undefined}>
          <header className="row g8 wrap" style={{ justifyContent: 'space-between' }}>
            <span className="row g6 eyebrow">
              <CalendarCheck style={{ width: 13, height: 13 }} />
              {backendLive ? dateFull(n.day) : dayLabel(n.day)}
            </span>
            {i === 0 && <Badge tone="teal" dot>Latest</Badge>}
          </header>

          {n.body && <p className="t-sm" style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{n.body}</p>}

          {n.focus && (
            <p className="sp-focus t-sm">
              <ChevronRight style={{ width: 14, height: 14, flex: 'none' }} />
              <span><b>Work on next:</b> {n.focus}</span>
            </p>
          )}

        </article>
      ))}
    </div>
  )
}

/* ---------------- one tab ---------------- */

function AreaPanels({ progress }: { progress: AreaProgress }) {
  const { me } = useMe()
  const nouns = AREA_NOUNS.material
  const { projects, totals, courses } = progress
  const { notes, error } = useMentorNotes(me.id, progress.tracks.map(t => t.id))

  const byState = (s: ProjectMark['state']) => projects.filter(p => p.state === s)

  if (progress.loops.length === 0) {
    return (
      <div className="card">
        <Empty
          icon={<Library />}
          title="No course yet"
          action={<Link className="btn primary" to="/student/missions">Open Missions</Link>}
        />
      </div>
    )
  }

  return (
    <div className="sp-stackcol">
      {/* ---- the headline figures ---- */}
      <div className="sp-tiles">
        <Tile
          label="Attendance"
          value={totals.opened ? `${totals.attendancePct}%` : '—'}
          sub={totals.opened
            ? `${totals.attended} of ${totals.opened} session${totals.opened === 1 ? '' : 's'} opened`
            : 'No session has opened yet'}
          tone={totals.opened ? scoreTone(totals.attendancePct) : undefined}
        />
        <Tile
          label="Session score"
          value={totals.score === null ? '—' : `${totals.score}%`}
          sub={totals.score === null
            ? 'Nothing marked yet'
            : `averaged over ${totals.scored} marked session${totals.scored === 1 ? '' : 's'}`}
          tone={totals.score === null ? undefined : scoreTone(totals.score)}
        />
        <Tile
          label="Work handed in"
          value={totals.tasksTotal ? `${totals.tasksPct}%` : '—'}
          sub={totals.tasksTotal
            ? `${totals.tasksAnswered} of ${totals.tasksTotal} question${totals.tasksTotal === 1 ? '' : 's'} answered`
            : 'Nothing asked yet'}
        />
        <Tile
          label="Projects built"
          value={totals.projects ? `${totals.done}` : '—'}
          sub={totals.projects ? `of ${totals.projects} on your path` : 'None on your path yet'}
          tone={totals.done > 0 ? PROJECT.done.fill : undefined}
        />
      </div>

      {/* ---- 2 · the projects themselves ---- */}
      {totals.projects > 0 && (
        <Panel
          title="Your projects"
          icon={<Target />}
 >
          <div className="sp-plists">
            <ProjectList state="done" items={byState('done')} />
            <ProjectList state="building" items={byState('building')} />
            <ProjectList state="soon" items={byState('soon')} />
          </div>
        </Panel>
      )}

      {/* ---- the courses behind the numbers ---- */}
      {courses.length > 1 && (
        <Panel
          title={`Your ${nouns.loopPlural}`}
          icon={<Library />}
        >
          <div className="sp-courses">
            {courses.map(c => (
              <div key={c.loop.id} className="sp-course">
                <span className="stack g2 grow" style={{ minWidth: 0 }}>
                  <span className="t-sm w-med truncate">{c.loop.name}</span>
                  <span className="t-xs c-muted2">
                    {c.marks.filter(m => m.released).length} of {c.marks.length} sessions open
                  </span>
                </span>
                <span className="sp-course-figs">
                  <span className="sp-fig"><b className="tnum">{c.attendancePct}%</b><i>attendance</i></span>
                  <span className="sp-fig">
                    <b className="tnum">{c.score === null ? '—' : `${c.score}%`}</b><i>score</i>
                  </span>
                  <span className="sp-fig"><b className="tnum">{c.walked}%</b><i>walked through</i></span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ---- 3 · the mentor ---- */}
      <Panel
        title="What your mentor says"
        icon={<MessageSquare />}
 >
        <MentorNotes
          notes={notes}
          error={error}
          empty={`Your mentor writes a note about how you are getting on. It appears here the day they post it.`}
        />
      </Panel>
    </div>
  )
}

/* ---------------- the page ---------------- */

export function StudentProgress() {
  const progress = useAreaProgress('material')

  return (
    <div className="page">
      <PageHeader title="My Progress" />
      <AreaPanels progress={progress} />
    </div>
  )
}

export default StudentProgress
