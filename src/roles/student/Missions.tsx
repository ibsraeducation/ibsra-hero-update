import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { BackLink } from '@/lib/backNav'
import {
  BookOpen, CheckCircle2, ChevronRight, Circle, Clock, FileText, Folder,
  GraduationCap, Hammer, ListChecks, Loader, Lock, PlayCircle, Radio, Store, Video,
} from 'lucide-react'
import { sessionFlow, useStore } from '@/lib/store'
import { Badge, Empty, Tabs } from '@/components/ui'
import { Cover, sessionCover, toneCover } from '@/components/Cover'
import { PageHeader } from '@/components/layout/PageHeader'
import { date, mins } from '@/lib/format'
import {
  isOpen, loopDone, loopPct, loopSessions, sessionDone, sessionMinutes,
  sessionPct, trackLoops, useMe,
} from './useMe'
import type { Done } from './useMe'
import { COURSE_KIND_META, courseKind, courseLocked, SESSION_KIND_META, sessionKind } from '@/lib/types'
import type { Loop, Session, Track } from '@/lib/types'
import { backendLive } from '@/lib/supabase'
import { ProgramOutcomes } from '@/components/ProgramOutcomes'
import { programBlurb, programEyebrow } from '@/lib/programInfo'
import { ProgramPicker } from '@/components/ProgramPicker'
import { ProgramViewToggle } from '@/components/ViewToggle'

/* ------------------------------------------------------------------ *
   Missions is a folder tree, three sections deep:
     Program → Course → Sessions (topics).
   Missions holds what the student is enrolled in — training courses and work
   courses alike, since Work stopped being a tree of its own. On the path view
   the rest of the programs are shown too, greyed and pointing at the
   MarketPlace — without them the path has no shape and a student cannot see
   where the program they own actually leads. The grid view still lists only
   theirs.

   Every section splits the same way, In progress / Finished, off the same
   derived progress — so the count on one level can never contradict the one
   above it.
 * ------------------------------------------------------------------ */

const STUDENT_BASE = '/student/missions'
const STUDENT_LABEL = 'Missions'

export function Crumbs({ trail }: { trail: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="crumbs mb12" aria-label="Breadcrumb">
      {trail.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="sepr" style={{ width: 13, height: 13 }} />}
          {c.to
            ? <BackLink to={c.to} className="crumb-link">{c.label}</BackLink>
            : <b className="truncate">{c.label}</b>}
        </Fragment>
      ))}
    </nav>
  )
}

/* ---------------- the slicer ---------------- */

type Slice = 'open' | 'done'

/** Horizontal slicer. Counts sit on the control so an empty side is never a
 *  surprise — the student can see there is nothing there before clicking. */
function Slicer({ value, onChange, open, done, unit }: {
  value: Slice
  onChange: (v: Slice) => void
  open: number
  done: number
  unit: string
}) {
  return (
    <div className="slicer">
      <Tabs<Slice>
        value={value}
        onChange={onChange}
        items={[
          { value: 'open', label: 'In progress', icon: <Loader />, count: open },
          { value: 'done', label: 'Finished', icon: <CheckCircle2 />, count: done },
        ]}
      />
      <span className="t-xs c-muted2 hide-sm">
        {open + done} {unit}{open + done === 1 ? '' : 's'} in total
      </span>
    </div>
  )
}

function NothingHere({ side, what }: { side: Slice; what: string }) {
  return side === 'done'
    ? <Empty icon={<CheckCircle2 />} title={`No ${what} finished yet`}
 />
    : <Empty icon={<Folder />} title={`Nothing in progress`}
 />
}

/* ---------------- the folder card ---------------- */

function FolderCard({ to, locked, cover, eyebrow, name, blurb, facts, meter }: {
  to: string
  locked?: boolean
  /** The art on top — built by the caller, since a program and a course
   *  are labelled differently. */
  cover: ReactNode
  eyebrow: string
  name: string
  blurb?: string
  facts: string[]
  meter?: number
}) {
  const body = (
    <>
      {cover}
      <span className="folder-body">
        <span className="row g10 mb8">
          <span className="grow stack g2" style={{ minWidth: 0 }}>
            <span className="eyebrow">{eyebrow}</span>
            <span className="t-md w-sb truncate">{name}</span>
          </span>
          {!locked && meter !== 100 && <ChevronRight className="folder-go" />}
        </span>

        {blurb && <span className="t-xs c-muted clamp2" style={{ lineHeight: 1.6 }}>{blurb}</span>}

        {meter !== undefined && (
          <span className="stack g4 mt8">
            <span className={`meter${meter === 100 ? ' teal' : ''}`}><i style={{ width: `${meter}%` }} /></span>
            <span className="t-xs c-muted2">{meter}% complete</span>
          </span>
        )}

        <span className="row g12 wrap mt8">
          {facts.map(f => <span key={f} className="t-xs c-muted2">{f}</span>)}
        </span>
      </span>
    </>
  )

  if (locked) return <div className="folder prod-card tree-card" data-locked="true">{body}</div>
  return <Link to={to} className="folder prod-card tree-card">{body}</Link>
}

/* ---------------- section 1 · program ---------------- */

export function Missions() {
  const db = useStore(s => s.db)
  const done = useStore(s => s.done)
  const { trackIds } = useMe()
  const base = STUDENT_BASE
  const [slice, setSlice] = useState<Slice>('open')

  const view = useStore(s => s.programView)

  /* Only what the student is enrolled in. Everything else is a thing to buy,
     not a thing to open, so it belongs in MarketPlace → Training Programs. */
  const rows = useMemo(() => db.tracks.filter(t => trackIds.includes(t.id)).map(t => {
    const loops = trackLoops(db.loops, t.id)
    const per = loops.map(l => loopSessions(db.sessions, l.id))
    const open = per.flat().filter(isOpen).length
    const pct = per.length === 0 ? 0
      : Math.round(per.reduce((a, ss) => a + loopPct(ss, done), 0) / per.length)
    return { track: t, courses: loops.length, open, pct, finished: per.every(ss => loopDone(ss, done)) }
  }), [db, trackIds, done])

  const shown = rows.filter(r => (slice === 'done' ? r.finished : !r.finished))
  const nDone = rows.filter(r => r.finished).length

  /* Every program, so the path keeps its shape. The ones the student does
     not own sit on it greyed, leading to where they are sold. */
  const all = db.tracks
  const mine = useMemo(() => new Map(rows.map(r => [r.track.id, r])), [rows])

  /** Where a card on the path goes: into the program when it is the
   *  student's, to where it is sold when it is not. */
  const openProgram = (t: Track) => {
    if (mine.has(t.id)) return `${base}/${t.id}`
    /* Live, a family enrols from their parent's Material — the program's
       own page here says so. The demo still points at its catalogue. */
    if (backendLive) return `${base}/${t.id}`
    const product = db.products.find(p => p.category === 'program' && p.trackId === t.id)
    return product ? `/student/marketplace/${product.id}` : '/student/marketplace'
  }

  const programFacts = (t: Track) => {
    const r = mine.get(t.id)
    if (!r && backendLive) return ['Not yours yet', 'Ask your parent']
    if (!r) return ['Not yours yet', db.products.some(p => p.category === 'program' && p.trackId === t.id)
      ? 'In the MarketPlace' : 'Ask your mentor']
    return [`${r.open} session${r.open === 1 ? '' : 's'} open`, `${r.pct}% done`]
  }

  if (rows.length === 0) {
    return (
      <div className="page">
        <PageHeader title="Your program" />
        {backendLive ? (
          <Empty
            icon={<Folder />}
            title="You are not enrolled in a course yet" />
        ) : (
          <Empty
            icon={<Folder />}
            title="You are not enrolled in a program yet"
            action={<Link className="btn primary" to="/student/marketplace"><Store />Browse training programs</Link>}
          />
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="Your program"
        actions={<ProgramViewToggle />}
      />

      {view === 'map' ? (
        <ProgramPicker
          tracks={all}
          state={t => (mine.has(t.id) ? 'on' : 'dim')}
          to={openProgram}
          facts={programFacts}
          tail={t => (mine.get(t.id)?.pct === 100
            ? <Badge tone="teal"><CheckCircle2 />Done</Badge>
            : undefined)}
        />
      ) : (
        <>
          <Slicer value={slice} onChange={setSlice} open={rows.length - nDone} done={nDone} unit="program" />

          {shown.length === 0 ? (
            <NothingHere side={slice} what="program" />
          ) : (
            <div className="folder-grid">
              {shown.map(r => (
                <FolderCard
                  key={r.track.id}
                  to={`${base}/${r.track.id}`}
                  cover={
                    <Cover bg={toneCover(r.track.color, r.track.id)} icon={GraduationCap}
                      tag="Program"
                      tail={r.pct === 100 ? <Badge tone="teal"><CheckCircle2 />Done</Badge> : undefined} />
                  }
                  eyebrow={programEyebrow(r.track)}
                  name={r.track.name}
                  blurb={programBlurb(r.track)}
                  meter={r.pct}
                  facts={[
                    `${r.courses} ${r.courses === 1 ? 'course' : 'courses'}`,
                    `${r.open} session${r.open === 1 ? '' : 's'} open`,
                  ]}
                />
              ))}
            </div>
          )}
        </>
      )}

      {!backendLive && (
        <div className="row g8 mt16 t-xs c-muted2">
          <Store style={{ width: 13, height: 13 }} />
          <span>
            Looking for a different skill?{' '}
            <Link className="crumb-link" to="/student/marketplace">Training programs in the MarketPlace</Link>
          </span>
        </div>
      )}
    </div>
  )
}

/* ---------------- section 2 · courses, or milestones, inside it ---------------- */

export function MissionTrack() {
  const { trackId = '' } = useParams()
  const db = useStore(s => s.db)
  const done = useStore(s => s.done)
  const { loopIds, trackIds } = useMe()
  const base = STUDENT_BASE
  const studentLabel = STUDENT_LABEL
  const [slice, setSlice] = useState<Slice>('open')

  const track: Track | undefined = db.tracks.find(t => t.id === trackId)
  const rows = useMemo(() => {
    if (!track) return []
    return trackLoops(db.loops, track.id).map((l: Loop) => {
      const sessions = loopSessions(db.sessions, l.id)
      const open = sessions.filter(isOpen)
      return { loop: l, sessions, open, pct: loopPct(sessions, done), finished: loopDone(sessions, done) }
    })
  }, [db.loops, db.sessions, track, done])

  const back = <BackLink className="btn" to={base}>Back to {studentLabel.toLowerCase()}</BackLink>

  if (!track) {
    return (
      <div className="page">
        <Empty icon={<Folder />} title="Program not found"
          action={back} />
      </div>
    )
  }

  /* Reached by URL rather than by a card — the program exists, it just is not
     theirs. Send them to where it can actually be joined. */
  if (!trackIds.includes(track.id)) {
    return (
      <div className="page">
        <Crumbs trail={[{ label: studentLabel, to: base }, { label: track.name }]} />
        {backendLive ? (
          <Empty icon={<Lock />} title={`Ask your parent to enroll you in ${track.name}`}
            action={back} />
        ) : (
          <Empty icon={<Lock />} title={`You are not enrolled in ${track.name}`}
            action={<Link className="btn primary" to="/student/marketplace"><Store />See it in the MarketPlace</Link>} />
        )}
      </div>
    )
  }

  const shown = rows.filter(r => (slice === 'done' ? r.finished : !r.finished))
  const nDone = rows.filter(r => r.finished).length

  return (
    <div className="page">
      <Crumbs trail={[{ label: studentLabel, to: base }, { label: track.name }]} />
      <PageHeader
        title={track.name}
      />

      <ProgramOutcomes track={track} />

      <Slicer value={slice} onChange={setSlice} open={rows.length - nDone} done={nDone} unit="course" />

      {rows.length === 0 ? (
        <Empty icon={<Folder />} title={`No courses yet`}
 />
      ) : shown.length === 0 ? (
        <NothingHere side={slice} what="course" />
      ) : (
        <div className="folder-grid">
          {shown.map(r => {
            const mine = loopIds.includes(r.loop.id)
            const locked = (r.open.length === 0 && !mine) || courseLocked(track, r.loop)
            return (
            <FolderCard
              key={r.loop.id}
              to={`${base}/${track.id}/${r.loop.id}`}
              locked={locked}
              cover={
                <Cover bg={toneCover(track.color, r.loop.id)} dim={locked}
                  icon={courseKind(r.loop) === 'work' ? Hammer : BookOpen}
                  tag={`${COURSE_KIND_META[courseKind(r.loop)].short} · ${r.loop.code}`}
                  big={String(r.loop.index).padStart(2, '0')}
                  tail={locked
                    ? <Badge tone="line"><Lock />Locked</Badge>
                    : r.open.length > 0 && r.pct === 100
                      ? <Badge tone="teal"><CheckCircle2 />Done</Badge>
                      : mine ? <Badge tone="brand">Enrolled</Badge> : undefined} />
              }
              eyebrow={mine ? 'Enrolled · in progress' : r.loop.status === 'planning' ? 'Not started' : 'Course'}
              name={r.loop.name}
              blurb={`${date(r.loop.startDate)} – ${date(r.loop.endDate)} · ${r.loop.code}`}
              meter={r.open.length > 0 ? r.pct : undefined}
              facts={[
                `${r.open.length} of ${r.sessions.length} session${r.sessions.length === 1 ? '' : 's'} open`,
                `${mins(r.open.reduce((a, s) => a + sessionMinutes(s), 0))} of content`,
              ]}
            />
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ---------------- section 3 · sessions (topics) inside a course ---------------- */

function SessionCard({ session, loop, index, tone, done }: {
  session: Session; loop: Loop; index: number; tone: string; done: Done
}) {
  /* A build week reads as one on the card. The course sets the default and
     the session overrides it, so this is right in a hybrid course too. */
  const kind = sessionKind(session, loop)
  const nav = useNavigate()
  const open = isOpen(session)
  const pct = sessionPct(session, done)
  const videos = session.titles.filter(t => t.video?.state === 'ready').length
  const tasks = session.titles.reduce((a, t) => a + t.tasks.length, 0)
  const materials = session.titles.reduce((a, t) => a + t.materials.length, 0)
  const hit = done[session.id] ?? []

  /* Progress counts steps, because that is what the student actually walks
     through — a topic is only ticked once all of its steps are. */
  const steps = useMemo(() => sessionFlow(session), [session])
  const doneSteps = steps.filter(s => hit.includes(s.key)).length
  const topicDone = (id: string) => {
    const own = steps.filter(s => s.titleId === id)
    return own.length > 0 && own.every(s => hit.includes(s.key))
  }
  const go = () => nav(`/student/session/${session.id}`)

  return (
    <div
      className="folder prod-card tree-card ses-card"
      data-locked={open ? undefined : 'true'}
      role={open ? 'button' : undefined}
      tabIndex={open ? 0 : undefined}
      onClick={() => open && go()}
      onKeyDown={e => {
        if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go() }
      }}
    >
      <Cover
        bg={sessionCover(session, tone)}
        icon={kind === 'work' ? Hammer : session.type === 'live' ? Radio : PlayCircle}
        dim={!open}
        tag={kind === 'work'
          ? SESSION_KIND_META.work.label
          : session.type === 'live' ? 'Live session' : 'Session'}
        big={String(index + 1).padStart(2, '0')}
        tail={!open
          ? <Badge tone="line"><Lock />{session.scheduledAt ? `Opens ${date(session.scheduledAt)}` : 'Not open'}</Badge>
          : pct === 100 ? <Badge tone="teal"><CheckCircle2 />Done</Badge> : undefined}
      />
      <span className="folder-body">
        <span className="row g10 mb8">
          <span className="grow stack g2" style={{ minWidth: 0 }}>
            <span className="eyebrow">
              {session.type === 'live' ? 'Live' : 'Recorded'} · {mins(sessionMinutes(session))}
            </span>
            <span className="t-md w-sb truncate">{session.name}</span>
          </span>
        </span>

        {session.summary && (
          <span className="t-xs c-muted clamp2" style={{ lineHeight: 1.6 }}>{session.summary}</span>
        )}

        {open && (
          <span className="stack g4 mt8">
            <span className={`meter${pct === 100 ? ' teal' : ''}`}><i style={{ width: `${pct}%` }} /></span>
            <span className="t-xs c-muted2">
              {doneSteps} of {steps.length} step{steps.length === 1 ? '' : 's'} done
            </span>
          </span>
        )}

        <span className="ses-topics">
          {session.titles.slice(0, 4).map(t => {
            const ok = topicDone(t.id)
            return (
              <span key={t.id} className="row g6 t-xs" style={{ color: ok ? 'var(--teal-600)' : 'var(--muted-2)' }}>
                {ok
                  ? <CheckCircle2 style={{ width: 11, height: 11, flex: 'none' }} />
                  : <Circle style={{ width: 8, height: 8, flex: 'none' }} />}
                <span className="truncate">{t.name}</span>
              </span>
            )
          })}
          {session.titles.length > 4 && (
            <span className="t-xs c-muted2" style={{ paddingInlineStart: 17 }}>
              +{session.titles.length - 4} more topics
            </span>
          )}
        </span>

        <span className="ses-meta">
          <span className="row g4"><PlayCircle style={{ width: 12, height: 12 }} />{videos}</span>
          <span className="row g4"><FileText style={{ width: 12, height: 12 }} />{materials}</span>
          <span className="row g4"><ListChecks style={{ width: 12, height: 12 }} />{tasks}</span>
          <span className="row g4"><Clock style={{ width: 12, height: 12 }} />{mins(sessionMinutes(session))}</span>
          {open && <ChevronRight className="folder-go" style={{ marginInlineStart: 'auto' }} />}
        </span>
      </span>
    </div>
  )
}

export function MissionLoop() {
  const { trackId = '', loopId = '' } = useParams()
  const db = useStore(s => s.db)
  const done = useStore(s => s.done)
  const [slice, setSlice] = useState<Slice>('open')
  const base = STUDENT_BASE
  const studentLabel = STUDENT_LABEL

  const track = db.tracks.find(t => t.id === trackId)
  const loop = db.loops.find(l => l.id === loopId)
  const sessions = useMemo(() => loopSessions(db.sessions, loopId), [db.sessions, loopId])

  if (!track || !loop) {
    return (
      <div className="page">
        <Empty icon={<Folder />} title={`Course not found`}
          action={<BackLink className="btn" to={base}>Back to {studentLabel.toLowerCase()}</BackLink>} />
      </div>
    )
  }

  /* A locked session is not finished — it is not even started, so it sits on
     the In progress side rather than vanishing into Finished. */
  const finished = (s: Session) => isOpen(s) && sessionDone(s, done)
  const shown = sessions.filter(s => (slice === 'done' ? finished(s) : !finished(s)))
  const nDone = sessions.filter(finished).length

  return (
    <div className="page">
      <Crumbs trail={[
        { label: studentLabel, to: base },
        { label: track.name, to: `${base}/${track.id}` },
        { label: loop.name },
      ]} />
      <PageHeader
        title={loop.name}
      />

      <Slicer value={slice} onChange={setSlice} open={sessions.length - nDone} done={nDone} unit="session" />

      {sessions.length === 0 ? (
        <Empty icon={<Video />} title="Nothing published yet" />
      ) : shown.length === 0 ? (
        <NothingHere side={slice} what="session" />
      ) : (
        <div className="folder-grid">
          {shown.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              loop={loop}
              index={sessions.indexOf(s)}
              tone={track.color}
              done={done}
            />
          ))}
        </div>
      )}
    </div>
  )
}
