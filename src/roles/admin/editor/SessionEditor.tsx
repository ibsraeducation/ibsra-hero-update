import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BackLink, useGoBack } from '@/lib/backNav'
import {
  AlertTriangle, Archive, ArrowLeft, CheckCircle2, ChevronLeft, Copy, FileText,
  Info, ListChecks, MoreHorizontal, Paperclip, Send, Settings2, Trash2, Video,
} from 'lucide-react'
import { readiness, sessionStats, useStore } from '@/lib/store'
import {
  Badge, Confirm, Drawer, Menu, MenuItem, MenuLabel, MenuSep, Splitter, Tabs, usePaneSize,
} from '@/components/ui'
import { mins, relative } from '@/lib/format'
import { STATUS_META, TITLE_KIND_META, titleKind, titleLabel, type StepKind } from '@/lib/types'
import { TitleRail } from './TitleRail'
import { SessionSettings } from './SessionSettings'
import { VideoPanel } from './VideoPanel'
import { MaterialsPanel } from './MaterialsPanel'
import { TasksPanel } from './TasksPanel'
import { TitleSettings } from './TitleSettings'
import { FlowPanel } from './FlowPanel'

type Pane = 'video' | 'materials' | 'tasks' | 'settings'

const PANES: Pane[] = ['video', 'materials', 'tasks', 'settings']

/** Which topic tab holds the thing a sequence row points at. */
const PANE_FOR: Record<StepKind, Pane> = {
  video: 'video', material: 'materials', task: 'tasks',
}

export default function SessionEditor() {
  const { trackId = '', loopId = '', sessionId = '' } = useParams()
  const [search] = useSearchParams()
  const nav = useNavigate()
  const goBack = useGoBack()
  const session = useStore(s => s.db.sessions.find(x => x.id === sessionId))
  const db = useStore(s => s.db)
  const setSessionStatus = useStore(s => s.setSessionStatus)
  const updateSession = useStore(s => s.updateSession)
  const updateTitle = useStore(s => s.updateTitle)
  const duplicateSession = useStore(s => s.duplicateSession)
  const deleteSessions = useStore(s => s.deleteSessions)

  /* Material links straight at one topic's recording, material or Q&A, so the
     landing pane is read off the URL once, on mount. */
  const deepTitle = search.get('title') ?? ''
  const deepPane = search.get('tab') as Pane | null

  /** '' means the session-level pane is showing — the sequence. */
  const [titleId, setTitleId] = useState(deepTitle)
  /* How wide the admin dragged the topics rail, remembered per browser. */
  const [railW, setRailW] = usePaneSize('editor.rail')
  const [pane, setPane] = useState<Pane>(deepPane && PANES.includes(deepPane) ? deepPane : 'video')
  const [confirmDel, setConfirmDel] = useState(false)
  /** Name, format, schedule, instructor — off the rail, one click from the header. */
  const [detailsOpen, setDetailsOpen] = useState(false)
  /** Mobile only: the title rail covers the editor until a title is picked. */
  const [railOpen, setRailOpen] = useState(!deepTitle)

  const title = useMemo(
    () => session?.titles.find(t => t.id === titleId),
    [session, titleId],
  )

  /* Selecting a title that vanished (deleted) falls back to session details. */
  useEffect(() => {
    if (titleId && session && !session.titles.some(t => t.id === titleId)) setTitleId('')
  }, [session, titleId])

  /* Every way out of the editor goes back up the Material steps. When the
     session is real its own loop and track win, so a stale URL still lands
     right. */
  const root = '/admin/material'
  const loop = db.loops.find(l => l.id === (session ? session.loopId : loopId))
  const track = db.tracks.find(t => t.id === (loop ? loop.trackId : trackId))
  const backTo = loop && track ? `${root}/${track.id}/${loop.id}` : root

  if (!session) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 80 }}>
          <div className="ico"><Video /></div>
          <span className="t-md w-sb">That session is gone</span>
          <BackLink to={backTo} className="btn"><ArrowLeft />Back to the course</BackLink>
        </div>
      </div>
    )
  }

  const gaps = readiness(session)
  const st = sessionStats(session)

  return (
    <div className="page flush">
      {/* ---------- header ---------- */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderBottom: '1px solid var(--line)', background: 'var(--surface)', flex: 'none',
      }}>
        <BackLink to={backTo} className="btn ghost icon sm" aria-label="Back to the course">
          <ArrowLeft />
        </BackLink>

        <div className="stack g2 grow" style={{ minWidth: 0 }}>
          <div className="row g8" style={{ minWidth: 0 }}>
            <input
              className="t-md w-sb"
              value={session.name}
              placeholder="Untitled session"
              aria-label="Session name"
              onChange={e => updateSession(session.id, { name: e.target.value })}
              onFocus={e => e.target.select()}
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                color: 'inherit', font: 'inherit', minWidth: 0, flex: '0 1 auto', width: '100%',
              }}
            />
            <span className="mono t-xs c-muted2 hide-sm">{session.code}</span>
          </div>
          <div className="crumbs">
            <BackLink to={track ? `${root}/${track.id}` : root}
              className="crumb-link truncate">{track?.name}</BackLink>
            <span className="sepr">/</span>
            <BackLink to={backTo} className="crumb-link truncate">{loop?.name}</BackLink>
            <span className="sepr">/</span>
            <span className="c-muted2">
              {st.topics} topic{st.topics === 1 ? '' : 's'}
              {st.projects > 0 && ` · ${st.projects} project${st.projects === 1 ? '' : 's'}`}
              {' · '}{mins(st.minutes)}
            </span>
          </div>
        </div>

        {gaps.length > 0 ? (
          <Menu align="end" trigger={p => (
            <button className="btn sm" {...p} style={{ borderColor: 'color-mix(in srgb, var(--gold-500) 45%, transparent)' }}>
              <AlertTriangle style={{ color: 'var(--gold-500)' }} />
              <span className="hide-sm">{gaps.length} to fix</span>
            </button>
          )}>
            <MenuLabel>Before publishing</MenuLabel>
            {gaps.map((g, i) => (
              <div key={i} className="menu-item" style={{ cursor: 'default' }}>
                <AlertTriangle style={{ color: 'var(--gold-500)' }} />
                <span style={{ whiteSpace: 'normal' }}>{g}</span>
              </div>
            ))}
          </Menu>
        ) : (
          <Badge tone="teal" className="hide-sm"><CheckCircle2 />Ready</Badge>
        )}

        <Badge tone={STATUS_META[session.status].tone} dot>{STATUS_META[session.status].label}</Badge>

        <span className="saving hide-sm">Saved {relative(session.updatedAt)}</span>

        <button className="btn ghost icon sm" aria-label="Session details" title="Session details"
          onClick={() => setDetailsOpen(true)}>
          <Settings2 />
        </button>

        {session.status !== 'published' ? (
          <button className="btn primary sm" disabled={gaps.length > 0}
            title={gaps.length ? 'Fix the gaps first' : 'Publish to enrolled cohorts'}
            onClick={() => setSessionStatus([session.id], 'published')}>
            <Send />Publish
          </button>
        ) : (
          <button className="btn sm" onClick={() => setSessionStatus([session.id], 'draft')}>
            <FileText />Unpublish
          </button>
        )}

        <Menu align="end" trigger={p => (
          <button className="btn ghost icon sm" {...p} aria-label="Session menu"><MoreHorizontal /></button>
        )}>
          <MenuLabel>{session.code}</MenuLabel>
          <MenuItem icon={<Copy />} onClick={() => {
            const c = duplicateSession(session.id)
            if (c) nav(`${backTo}/${c.id}`)
          }}>Duplicate session</MenuItem>
          <MenuItem icon={<Archive />} onClick={() => setSessionStatus([session.id], 'archived')}>Archive</MenuItem>
          <MenuSep />
          <MenuItem icon={<Trash2 />} danger onClick={() => setConfirmDel(true)}>Delete session</MenuItem>
        </Menu>
      </header>

      {/* ---------- body ---------- */}
      <div className="editor" data-rail={railOpen ? 'true' : undefined}
        style={{
          height: 'calc(100% - 57px)',
          ...(railW ? { '--editor-rail': railW + 'px' } : {}),
        } as React.CSSProperties}>
        <TitleRail
          session={session}
          selectedId={titleId}
          onSelect={id => { setTitleId(id); setPane('video'); setRailOpen(false) }}
          onGoFlow={() => { setTitleId(''); setRailOpen(false) }}
        />
        <Splitter side="before" min={220} max={520} label="Resize topics"
          onChange={setRailW} onReset={() => setRailW(undefined)} />

        <div className="editor-main">
          {!title ? (
            <FlowPanel
              session={session}
              onOpen={step => {
                setTitleId(step.titleId)
                setPane(PANE_FOR[step.kind])
                setRailOpen(false)
              }}
            />
          ) : (
            <>
              <div className="row g10" style={{
                padding: '10px 16px', borderBottom: '1px solid var(--line-soft)',
                background: 'var(--surface)', flex: 'none',
              }}>
                <button className="btn ghost icon sm rail-toggle" onClick={() => setRailOpen(true)}
                  aria-label="Back to topics"><ChevronLeft /></button>
                <Badge tone={TITLE_KIND_META[titleKind(title)].tone}>{titleLabel(session.titles, title.id)}</Badge>
                <input
                  className="t-md w-sb grow"
                  value={title.name}
                  placeholder={TITLE_KIND_META[titleKind(title)].blank}
                  aria-label={`${TITLE_KIND_META[titleKind(title)].one} name`}
                  onChange={e => updateTitle(session.id, title.id, { name: e.target.value })}
                  style={{
                    border: 'none', outline: 'none', background: 'transparent',
                    color: 'inherit', font: 'inherit', minWidth: 0,
                  }}
                />
                <span className="t-xs c-muted2 hide-sm">{mins(title.estimatedMin)} est.</span>
              </div>

              <Tabs
                value={pane}
                onChange={setPane}
                items={[
                  { value: 'video', label: 'Recording', icon: <Video /> },
                  { value: 'materials', label: 'Material', icon: <Paperclip />, count: title.materials.length },
                  { value: 'tasks', label: 'Q&A tasks', icon: <ListChecks />, count: title.tasks.length },
                  {
                    value: 'settings',
                    label: `${TITLE_KIND_META[titleKind(title)].one} settings`,
                    icon: <Settings2 />,
                  },
                ]}
              />

              <div className="editor-scroll">
                <div className="inner">
                  {pane === 'video' && <VideoPanel session={session} title={title} />}
                  {pane === 'materials' && <MaterialsPanel session={session} title={title} />}
                  {pane === 'tasks' && <TasksPanel session={session} title={title} />}
                  {pane === 'settings' && <TitleSettings session={session} title={title} />}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Drawer open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Session details">
        <SessionSettings session={session} />
      </Drawer>

      <Confirm
        open={confirmDel} onClose={() => setConfirmDel(false)}
        onConfirm={() => { deleteSessions([session.id]); goBack(backTo, { replace: true }) }}
        title={`Delete “${session.name}”?`}
        body={
          <>
            This removes {st.topics} topic{st.topics === 1 ? '' : 's'}
            {st.projects > 0 && `, ${st.projects} project${st.projects === 1 ? '' : 's'}`}, {st.videos} recording
            {st.videos === 1 ? '' : 's'}, {st.materials} material file{st.materials === 1 ? '' : 's'} and {st.tasks} question
            {st.tasks === 1 ? '' : 's'}. There is no undo in the dev build.
          </>
        }
      />
    </div>
  )
}

/** Small helper used by the panels for a consistent "why this exists" note. */
export function PanelNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rowtop g8 t-xs c-muted2" style={{
      padding: '9px 11px', background: 'var(--surface-2)',
      border: '1px solid var(--line-soft)', borderRadius: 'var(--r-md)', lineHeight: 1.55,
    }}>
      <Info style={{ width: 13, height: 13, flex: 'none', marginTop: 1 }} />
      <span>{children}</span>
    </div>
  )
}
