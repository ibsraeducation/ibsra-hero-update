/* ==========================================================================
   Material — what the student opens, as their family sees it.

   The same three sections the student walks down (program → course →
   sessions) and the same progress on every card, read off the steps the
   child actually ticked. The difference is what a click does: a parent opens
   the folder to see what is in it, and stops at the session card. The
   session itself is the student's to work through, so there is no way in
   from here — and no answer key ever reaches this page.

   It is also where a family enrols. The first level is the training path the
   admin draws: a bright program is one this hero is on, and opens; a dimmed
   one is not yet, and opens the enrol dialog. The Marketplace is for kits.
   ========================================================================== */

import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  BookOpen, CheckCircle2, ChevronRight, Circle, Clock, FileText, Folder,
  ListChecks, Loader2, Lock, PlayCircle, Radio, User,
} from 'lucide-react'
import { sessionFlow } from '@/lib/store'
import { useGoBack } from '@/lib/backNav'
import { Badge, Empty } from '@/components/ui'
import { Cover, sessionCover, toneCover } from '@/components/Cover'
import { PageHeader } from '@/components/layout/PageHeader'
import { date, mins } from '@/lib/format'
import { ProgramOutcomes } from '@/components/ProgramOutcomes'
import { ProgramPicker } from '@/components/ProgramPicker'
import { hasProgramInfo } from '@/lib/programInfo'
import type { Loop, Session, Track } from '@/lib/types'
import { PromoRedeem } from './PromoRedeem'
import { ChildPicker } from './ChildPicker'
import { EnrollDialog } from '@/roles/marketplace/live/EnrollDialog'
import { released } from './feedbackModel'
import { useChildView, useFamily } from './useFamily'
import type { Done } from '@/lib/api/child'
import './family.css'
import './live.css'

/* ---------------- the numbers on the cards ---------------- */

const pct = (a: number, b: number) => (b <= 0 ? 0 : Math.round((a / b) * 100))

const sessionMinutes = (s: Session) => s.titles.reduce((a, t) => a + t.estimatedMin, 0)

function sessionPct(s: Session, done: Done): number {
  const steps = sessionFlow(s)
  if (steps.length === 0) return 0
  const hit = done[s.id] ?? []
  return pct(steps.filter(x => hit.includes(x.key)).length, steps.length)
}

/** Averaged over the sessions the child can actually open — a locked one is
 *  not work they have failed to do. */
function loopPct(sessions: Session[], done: Done): number {
  const open = sessions.filter(released)
  if (open.length === 0) return 0
  return Math.round(open.reduce((a, s) => a + sessionPct(s, done), 0) / open.length)
}

/* ---------------- the folder card, without a link in it ---------------- */

function FolderCard({ onOpen, locked, cover, eyebrow, name, blurb, facts, meter }: {
  onOpen?: () => void
  locked?: boolean
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
          {!locked && onOpen && <ChevronRight className="folder-go" />}
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

  if (locked || !onOpen) {
    return <div className="folder prod-card tree-card" data-locked={locked ? 'true' : undefined}>{body}</div>
  }
  return (
    <div className="folder prod-card tree-card" role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}>
      {body}
    </div>
  )
}

/* ---------------- one session, as far as a parent goes ---------------- */

function SessionCard({ session, index, tone, done }: {
  session: Session; index: number; tone: string; done: Done
}) {
  const open = released(session)
  const p = sessionPct(session, done)
  const steps = sessionFlow(session)
  const hit = done[session.id] ?? []
  const doneSteps = steps.filter(s => hit.includes(s.key)).length
  const videos = session.titles.filter(t => t.video?.state === 'ready').length
  const tasks = session.titles.reduce((a, t) => a + t.tasks.length, 0)
  const materials = session.titles.reduce((a, t) => a + t.materials.length, 0)
  const topicDone = (id: string) => {
    const own = steps.filter(s => s.titleId === id)
    return own.length > 0 && own.every(s => hit.includes(s.key))
  }

  return (
    <div className="folder prod-card tree-card ses-card" data-locked={open ? undefined : 'true'}>
      <Cover
        bg={sessionCover(session, tone)}
        icon={session.type === 'live' ? Radio : PlayCircle}
        dim={!open}
        tag={session.type === 'live' ? 'Live session' : 'Session'}
        big={String(index + 1).padStart(2, '0')}
        tail={!open
          ? <Badge tone="line"><Lock />{session.scheduledAt ? `Opens ${date(session.scheduledAt)}` : 'Not open'}</Badge>
          : p === 100 ? <Badge tone="teal"><CheckCircle2 />Done</Badge> : undefined}
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
            <span className={`meter${p === 100 ? ' teal' : ''}`}><i style={{ width: `${p}%` }} /></span>
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
        </span>
      </span>
    </div>
  )
}

/* ---------------- the page ---------------- */

export function ParentMaterial() {
  const { children, error, child, pick, reload } = useFamily()
  const view = useChildView(child)
  /* Where the family is in the folders rides in the URL (`?program=&course=`),
     so the browser's Back climbs back up them instead of leaving the page. */
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const at = { trackId: params.get('program') ?? undefined, loopId: params.get('course') ?? undefined }
  const urlFor = (next: { trackId?: string; loopId?: string }) => {
    const p = new URLSearchParams(params)
    p.delete('program'); p.delete('course')
    if (next.trackId) p.set('program', next.trackId)
    if (next.trackId && next.loopId) p.set('course', next.loopId)
    const s = p.toString()
    return s ? `${pathname}?${s}` : pathname
  }
  const setAt = (next: { trackId?: string; loopId?: string }) => navigate(urlFor(next))
  const upTo = (next: { trackId?: string }) => goBack(urlFor(next))
  /* A dimmed program, opened: the enrol dialog, over the path. */
  const [enrolling, setEnrolling] = useState<Track | null>(null)

  const name = child?.profile.name || child?.profile.email || 'your student'
  const first = name.split(' ')[0]

  const enrolled = useMemo(
    () => new Set((child?.enrollments ?? []).filter(e => e.status !== 'dropped').map(e => e.loop_id)),
    [child],
  )

  const track: Track | undefined = view.tracks.find(t => t.id === at.trackId)
  const loop: Loop | undefined = view.loops.find(l => l.id === at.loopId)

  const courses = useMemo(
    () => (track ? view.loops.filter(l => l.trackId === track.id).sort((a, b) => a.index - b.index) : []),
    [view.loops, track],
  )
  const sessionsOf = (loopId: string) =>
    view.sessions.filter(s => s.loopId === loopId).sort((a, b) => a.order - b.order)

  const programs = useMemo(() => view.tracks.map(t => {
    const ls = view.loops.filter(l => l.trackId === t.id)
    const per = ls.map(l => sessionsOf(l.id))
    const open = per.flat().filter(released).length
    const p = per.length === 0 ? 0
      : Math.round(per.reduce((a, ss) => a + loopPct(ss, view.done), 0) / per.length)
    return { track: t, courses: ls.length, open, pct: p }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [view.tracks, view.loops, view.sessions, view.done])

  /* The programs this child is actually on, by id — the map dims the rest
     rather than dropping them. */
  const byTrack = useMemo(() => new Map(programs.map(r => [r.track.id, r])), [programs])
  const onPath = useMemo(() => new Set(programs.map(r => r.track.id)), [programs])

  const crumbs: Array<{ label: string; go?: () => void }> = [
    { label: 'Material', go: at.trackId ? () => upTo({}) : undefined },
    ...(track ? [{ label: track.name, go: at.loopId ? () => upTo({ trackId: track.id }) : undefined }] : []),
    ...(loop ? [{ label: loop.name }] : []),
  ]

  /* The training path. Bright is this hero's and opens; dimmed is not yet
     and opens the enrol dialog — Material is where a family enrols now. */
  const pathMap = view.allTracks.length > 0 ? (
    <ProgramPicker
      tracks={view.allTracks}
      state={t => (onPath.has(t.id) ? 'on' : 'dim')}
      onOpen={t => (onPath.has(t.id) ? setAt({ trackId: t.id }) : setEnrolling(t))}
      facts={t => {
        const r = byTrack.get(t.id)
        if (r) return [`${r.courses} course${r.courses === 1 ? '' : 's'}`, `${r.open} session${r.open === 1 ? '' : 's'} open`]
        const n = view.allLoops.filter(l => l.trackId === t.id).length
        return [`${n} course${n === 1 ? '' : 's'}`, 'Open to enroll']
      }}
      tail={t => (byTrack.get(t.id)?.pct === 100
        ? <Badge tone="teal"><CheckCircle2 />Done</Badge>
        : onPath.has(t.id) ? <Badge tone="teal" dot>Open</Badge> : undefined)}
    />
  ) : null

  const enrollDialog = enrolling && (
    <EnrollDialog
      track={enrolling}
      courses={view.allLoops.filter(l => l.trackId === enrolling.id).sort((a, b) => a.index - b.index)}
      onClose={() => setEnrolling(null)}
      onDone={() => { setEnrolling(null); reload() }}
    />
  )

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
        <PageHeader title="Material" />
        <div className="card mb16">
          <Empty icon={<User />} title="Add your hero first" />
        </div>
        {pathMap}
        {enrollDialog}
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader title="Material" actions={child && (<PromoRedeem studentId={child.profile.id} heroName={first} onDone={reload} />)} />

      <ChildPicker kids={children} child={child} onPick={pick} />

      {(error || view.error) && (
        <div className="auth-alert mb12" role="alert">
          <span>{error || view.error}</span>
        </div>
      )}

      {crumbs.length > 1 && (
        <nav className="crumbs mb12" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <ChevronRight className="sepr" style={{ width: 13, height: 13 }} />}
              {c.go
                ? <button className="crumb-link" onClick={c.go}>{c.label}</button>
                : <b className="truncate">{c.label}</b>}
            </Fragment>
          ))}
        </nav>
      )}

      {view.loading ? (
        <div className="folder-grid">
          {[0, 1, 2].map(i => <div key={i} className="skel" style={{ height: 210 }} />)}
        </div>
      ) : programs.length === 0 && !pathMap ? (
        <div className="card">
          <Empty icon={<Folder />} title="No programs on the path yet" />
        </div>
      ) : loop ? (
        /* ---- section 3 · the sessions ---- */
        <>
          <ProgramHead eyebrow={`Course · ${track?.name ?? ''}`} title={loop.name}
            sub={`${date(loop.startDate)} – ${date(loop.endDate)} · ${sessionsOf(loop.id).filter(released).length} of ${sessionsOf(loop.id).length} sessions open to ${first}.`} />
          {sessionsOf(loop.id).length === 0 ? (
            <div className="card">
              <Empty icon={<BookOpen />} title="Nothing published yet" />
            </div>
          ) : (
            <div className="folder-grid">
              {sessionsOf(loop.id).map((s, i) => (
                <SessionCard key={s.id} session={s} index={i} tone={track?.color ?? 'brand'} done={view.done} />
              ))}
            </div>
          )}
        </>
      ) : track ? (
        /* ---- section 2 · the courses ---- */
        <>
          <ProgramHead eyebrow="Program" title={track.name}
            sub={hasProgramInfo(track) ? undefined : track.blurb} />
          <ProgramOutcomes track={track} />
          <div className="folder-grid">
            {(() => {
              const enrolledIndices = courses.filter(l => enrolled.has(l.id)).map(l => l.index)
              const activeIndex = enrolledIndices.length > 0 ? Math.max(...enrolledIndices) : 1
              return courses.map(l => {
                const ss = sessionsOf(l.id)
                const open = ss.filter(released)
                const mine = enrolled.has(l.id)
                const isNextInOrder = l.index > activeIndex
                const locked = !mine || isNextInOrder || !(l.listed ?? true) || !(track.listed ?? true)
                return (
                  <FolderCard
                    key={l.id}
                    onOpen={!locked ? () => setAt({ trackId: track.id, loopId: l.id }) : undefined}
                    locked={locked}
                    cover={
                      <Cover bg={toneCover(track.color, l.id)} icon={BookOpen} dim={locked}
                        tag={`Course · ${l.code}`} big={String(l.index).padStart(2, '0')}
                        tail={locked
                          ? <Badge tone="line"><Lock />Locked</Badge>
                          : open.length > 0 && loopPct(ss, view.done) === 100
                            ? <Badge tone="teal"><CheckCircle2 />Done</Badge>
                            : <Badge tone="brand">Enrolled</Badge>} />
                    }
                    eyebrow={locked ? 'Locked · comes next' : mine ? 'Enrolled' : 'Comes later'}
                    name={l.name}
                    blurb={`${date(l.startDate)} – ${date(l.endDate)} · ${l.code}`}
                    meter={!locked && mine ? loopPct(ss, view.done) : undefined}
                    facts={[
                      `${open.length} of ${ss.length} session${ss.length === 1 ? '' : 's'} open`,
                      `${mins(open.reduce((a, s) => a + sessionMinutes(s), 0))} of content`,
                    ]}
                  />
                )
              })
            })()}
          </div>
        </>
      ) : (
        /* ---- section 1 · the programs, on the path the admin drew ----
           Always the map, never a grid of what is already open: the dimmed
           programs are how a family enrols, so a view without them would be
           a dead end. */
        pathMap
      )}

      {enrollDialog}
    </div>
  )
}

function ProgramHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="stack g4 mb16" style={{ minWidth: 0 }}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="t-xl w-sb">{title}</h2>
      {sub && <p className="t-sm c-muted" style={{ maxWidth: 640 }}>{sub}</p>}
    </div>
  )
}
