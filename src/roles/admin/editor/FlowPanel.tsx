import { useMemo, useState } from 'react'
import {
  ArrowDown, ArrowUp, BookOpen, ChevronDown, ChevronRight, Copy, ExternalLink, GripVertical,
  Hammer, ImagePlus, Target, ListChecks, MoreHorizontal, Paperclip, Plus, Radio, RotateCcw, Sparkles,
  Trash2, UploadCloud, Video, Wrench,
} from 'lucide-react'
import { hasCustomFlow, sessionFlow, useStore } from '@/lib/store'
import { Badge, Field, Menu, MenuItem, MenuLabel, MenuSep } from '@/components/ui'
import { mins } from '@/lib/format'
import {
  ADDABLE_TYPES, MATERIAL_META, PROJECT_STATE_META, PROJECT_STATES, STEP_TYPE_META,
  TASK_META, TITLE_KIND_META, TITLE_KINDS, titleState,
  TYPES_FOR, titleKind,
} from '@/lib/types'
import type {
  Material, MaterialKind, Session, Step, StepType, Title, TitleKind,
} from '@/lib/types'
import { backendLive } from '@/lib/supabase'
import { isStored, openFile, uploadMaterial } from '@/lib/api/storage'
import { toMessage } from '@/lib/api/errors'
import { VideoPanel } from './VideoPanel'
import { TaskCard } from './TasksPanel'
import { MATERIAL_ACCEPT, pickFile } from './uploads'

export const TYPE_ICON: Record<StepType, JSX.Element> = {
  video: <Video />,
  live: <Radio />,
  technical: <Wrench />,
  branding: <Sparkles />,
  mcq: <ListChecks />,
  imagetext: <ImagePlus />,
  material: <Paperclip />,
}

/** A topic is taught; a project is built. Same box, two labels. */
export const TITLE_KIND_ICON: Record<TitleKind, JSX.Element> = {
  topic: <BookOpen />,
  project: <Hammer />,
}

/** `<input type="datetime-local">` speaks local wall-clock, the store speaks
 *  ISO. These two keep them honest in both directions. */
export const toLocalInput = (iso: string | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '')

/** Everything a row needs to describe itself, resolved once per render. */
function describe(session: Session, step: Step) {
  const title = session.titles.find(t => t.id === step.titleId)
  if (step.kind === 'video') {
    return {
      title,
      name: title?.video?.name ?? '',
      placeholder: 'Untitled recording',
      sub: title?.video
        ? `${title.video.provider} · ${mins(title.estimatedMin)}`
        : 'Recording',
    }
  }
  if (step.kind === 'material') {
    const m = title?.materials.find(x => x.id === step.refId)
    /* A live step is a class, not a file — it says when it is, not what it is. */
    if (m && step.type === 'live') {
      return {
        title,
        name: m.name,
        placeholder: 'Live session',
        sub: m.startsAt
          ? `Live · ${new Date(m.startsAt).toLocaleString()}${m.durationMin ? ` · ${mins(m.durationMin)}` : ''}`
          : 'Live · no date yet',
      }
    }
    return {
      title,
      name: m?.name ?? '',
      placeholder: 'Untitled file',
      sub: m ? `${MATERIAL_META[m.kind].label}${m.note ? ` · ${m.note}` : ''}` : 'File',
    }
  }
  const k = title?.tasks.find(x => x.id === step.refId)
  return {
    title,
    name: k?.question ?? '',
    placeholder: 'Untitled question',
    sub: k ? `${TASK_META[k.kind].label} · ${k.points} pts${k.required ? ' · required' : ''}` : 'Question',
  }
}

/* ---------------- one file, edited in place ---------------- */

function MaterialEditor({ session, title, material: m }: {
  session: Session; title: Title; material: Material
}) {
  const update = useStore(s => s.updateMaterial)
  const toast = useStore(s => s.toast)
  const set = (patch: Partial<Material>) => update(session.id, title.id, m.id, patch)
  const [busy, setBusy] = useState(false)

  /* Dev stage: the upload is instant, same as the Material tab. */
  const fakeUpload = () => set({
    url: `https://cdn.ibsra.dev/m/${m.id}.${m.kind === 'link' ? 'pdf' : m.kind}`,
    size: 1_240_000,
    kind: m.kind === 'link' ? 'pdf' : m.kind,
  })

  const upload = async () => {
    if (!backendLive) { fakeUpload(); return }
    const file = await pickFile(MATERIAL_ACCEPT)
    if (!file) return
    setBusy(true)
    try {
      const up = await uploadMaterial(session.id, file)
      set({ url: up.url, size: up.size, kind: up.kind, name: m.name.trim() ? m.name : up.name })
      toast('File uploaded')
    } catch (e) {
      toast(toMessage(e), 'err')
    } finally {
      setBusy(false)
    }
  }
  const stored = isStored(m.url)

  /* A live step carries a meeting link and a time, never a file. */
  if (m.category === 'live') {
    return (
      <div className="stack g14">
        <Field label="What the class is">
          <input className="inp" value={m.name} placeholder="e.g. Live build along"
            onChange={e => set({ name: e.target.value })} />
        </Field>

        <Field label="Meeting link">
          <div className="row g6">
            <input className="inp mono grow" value={m.url} placeholder="https://…"
              onChange={e => set({ url: e.target.value })} />
            {m.url && (
              <a className="btn ghost icon" href={m.url} target="_blank" rel="noreferrer"
                aria-label="Open" title="Open in a new tab"><ExternalLink /></a>
            )}
          </div>
        </Field>

        <div className="grid g-2">
          <Field label="Starts at">
            <input className="inp" type="datetime-local" value={toLocalInput(m.startsAt)}
              onChange={e => set({ startsAt: fromLocalInput(e.target.value) })} />
          </Field>
          <Field label="Runs for (minutes)">
            <input className="inp tnum" type="number" min={0} step={15} value={m.durationMin ?? 60}
              onChange={e => set({ durationMin: Number(e.target.value) })} />
          </Field>
        </div>

        <Field label="Note">
          <input className="inp" value={m.note ?? ''} placeholder="Have your board ready"
            onChange={e => set({ note: e.target.value })} />
        </Field>
      </div>
    )
  }

  return (
    <div className="stack g14">
      <div className="grid g-2">
        <Field label="Name">
          <input className="inp" value={m.name} placeholder="e.g. Session workbook"
            onChange={e => set({ name: e.target.value })} />
        </Field>
        <Field label="Kind">
          <select className="sel" value={m.kind}
            onChange={e => set({ kind: e.target.value as MaterialKind })}>
            {Object.entries(MATERIAL_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={m.kind === 'link' ? 'Link' : 'File'}
>
        <div className="row g6">
          {stored ? (
            <input className="inp grow" value="Uploaded file · private to enrolled students" readOnly />
          ) : (
            <input className="inp mono grow" value={m.url} placeholder="https://…"
              onChange={e => set({ url: e.target.value })} />
          )}
          {m.kind !== 'link' && (
            <button className="btn" onClick={() => void upload()} disabled={busy}>
              <UploadCloud />{busy ? 'Uploading…' : m.url ? 'Replace' : 'Upload'}
            </button>
          )}
          {m.url && (stored ? (
            <button className="btn ghost icon" aria-label="Open" title="Open in a new tab"
              onClick={() => { openFile(m.url).catch(e => toast(toMessage(e), 'err')) }}><ExternalLink /></button>
          ) : (
            <a className="btn ghost icon" href={m.url} target="_blank" rel="noreferrer"
              aria-label="Open" title="Open in a new tab"><ExternalLink /></a>
          ))}
        </div>
      </Field>

      <Field label="Note">
        <input className="inp" value={m.note ?? ''} placeholder="Read before the recording"
          onChange={e => set({ note: e.target.value })} />
      </Field>
    </div>
  )
}

/* ==========================================================================
   Sequence — the one thing that decides what the student meets, and when,
   and now the one place a session can be built end to end. Every row opens
   its own editor in place — the recording, the file, the question — so the
   mentor fills, reorders and deletes without leaving the running order.
   Topics are managed from here too.
   ========================================================================== */

export function FlowPanel({ session, onOpen }: {
  session: Session
  /** Jump into the item's own editor pane — still there for the full view. */
  onOpen: (step: Step) => void
}) {
  const moveStep = useStore(s => s.moveStep)
  const resetFlow = useStore(s => s.resetFlow)
  const addStep = useStore(s => s.addStep)
  const setStepType = useStore(s => s.setStepType)
  const deleteStep = useStore(s => s.deleteStep)
  const updateTitle = useStore(s => s.updateTitle)
  const updateMaterial = useStore(s => s.updateMaterial)
  const updateTask = useStore(s => s.updateTask)
  const moveTitle = useStore(s => s.moveTitle)
  const deleteTitle = useStore(s => s.deleteTitle)
  const duplicateTitle = useStore(s => s.duplicateTitle)
  const addTitle = useStore(s => s.addTitle)
  const toast = useStore(s => s.toast)

  const [dragKey, setDragKey] = useState('')
  const [overKey, setOverKey] = useState('')
  /** The row asking to be confirmed before it goes. Deleting is not undoable. */
  const [armKey, setArmKey] = useState('')
  /** The topic asking to be confirmed before it goes, same reason. */
  const [armTopic, setArmTopic] = useState('')
  /** The row whose editor is open underneath it. One at a time keeps the order readable. */
  const [openKey, setOpenKey] = useState('')
  /** Which topic groups are collapsed — a long session reads better folded. */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleGroup = (id: string) => setCollapsed(c => ({ ...c, [id]: !c[id] }))

  const flow = useMemo(() => sessionFlow(session), [session])
  const custom = hasCustomFlow(session)

  /* The sequence, grouped by topic — one section per topic, in topic order.
     Inside a topic, the recording always leads and its material always
     follows right behind it — a file belongs with the video that assigned
     it, not floating wherever a drag left it — then the questions. A step's
     number still reflects its true position in the whole session. */
  const KIND_RANK: Record<Step['kind'], number> = { video: 0, material: 1, task: 2 }
  const groups = useMemo(() => {
    const indexByKey = new Map(flow.map((s, i) => [s.key, i]))
    /* Topics and projects each count from one, so the numbers on screen read
       "Topic 1, Topic 2, Project 1" rather than one run of mixed things. */
    const nth: Record<TitleKind, number> = { topic: 0, project: 0 }
    return session.titles.map(t => {
      const kind = titleKind(t)
      nth[kind] += 1
      return {
        title: t,
        kind,
        label: `${TITLE_KIND_META[kind].one} ${nth[kind]}`,
        steps: flow.filter(s => s.titleId === t.id).slice().sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]),
        indexByKey,
      }
    })
  }, [session.titles, flow])

  const counts = useMemo(() => {
    const by = {} as Record<StepType, number>
    for (const s of flow) by[s.type] = (by[s.type] ?? 0) + 1
    return by
  }, [flow])

  /* Reordering stays inside a topic's own steps — once the sequence is
     grouped by topic, an arrow or a drag jumping to another topic's slot
     would just look like a bug. */
  const nudge = (steps: Step[], i: number, by: -1 | 1) => {
    const to = steps[i + by]
    if (to) moveStep(session.id, steps[i].key, to.key)
  }

  /** Gives a topic its recording — the one step type that lives on the topic. */
  const attachVideo = (t: Title) => {
    updateTitle(session.id, t.id, {
      video: backendLive
        /* Connected: a recording is a link, pasted in the editor below. */
        ? {
            provider: 'youtube', url: '', durationSec: 0, captions: false, state: 'ready',
            thumbnail: 'linear-gradient(135deg,#4F3BD9,#8574F0)',
          }
        : {
            provider: 'upload', url: `https://cdn.ibsra.dev/v/${t.id}.m3u8`,
            durationSec: 11 * 60 + 24, captions: false, state: 'ready',
            thumbnail: 'linear-gradient(135deg,#4F3BD9,#8574F0)',
          },
    })
    setOpenKey(`v:${t.id}`)
    toast(backendLive ? 'Recording added — paste its link below' : 'Recording attached — fill it in below')
  }

  /** Adds one step straight into a known topic — used by each topic's own
   *  "add" menu, where there is no picking a target, just this topic. */
  const addTo = (t: Title, type: StepType) => {
    /* The first recording lives on the topic; every one after it is a video
       step among the topic's files. */
    if (type === 'video' && !t.video) {
      attachVideo(t)
      return
    }
    const step = addStep(session.id, t.id, type)
    if (step) setOpenKey(step.key)
  }

  /** The editor under a row, picked by what the step is made of. */
  const editor = (step: Step) => {
    const t = session.titles.find(x => x.id === step.titleId)
    if (!t) return null
    if (step.kind === 'video') return <VideoPanel session={session} title={t} />
    if (step.kind === 'material') {
      const m = t.materials.find(x => x.id === step.refId)
      return m ? <MaterialEditor session={session} title={t} material={m} /> : null
    }
    const k = t.tasks.find(x => x.id === step.refId)
    return k
      ? <TaskCard session={session} title={t} task={k} open onToggle={() => setOpenKey('')} />
      : null
  }

  return (
    <div className="editor-scroll">
      <div className="inner stack g16">
        <div className="between g12 wrap">
          <div className="stack g4">
            <h2 className="t-lg w-sb">Sequence</h2>
            <span className="t-xs c-muted2">
              {flow.length} step{flow.length === 1 ? '' : 's'}
              {(['video', ...ADDABLE_TYPES] as StepType[])
                .filter(t => counts[t])
                .map(t => ` · ${counts[t]} ${STEP_TYPE_META[t].short.toLowerCase()}`)
                .join('')}
            </span>
          </div>
          <div className="row g8">
            <Badge tone={custom ? 'brand' : 'line'}>
              {custom ? 'Arranged by hand' : 'Topic order'}
            </Badge>
            {custom && (
              <button className="btn sm" onClick={() => resetFlow(session.id)}>
                <RotateCcw />Reset
              </button>
            )}
          </div>
        </div>

        {session.titles.length === 0 ? (
          <div className="empty">
            <div className="ico"><ListChecks /></div>
            <span className="t-md w-sb">Nothing in this session yet</span>
            <span className="t-xs c-muted2" style={{ maxWidth: 380, lineHeight: 1.6 }}>
              A topic is something taught — a recording, its material and its Q&amp;A.
              A project is something built — the brief, its material and the work
              handed in. Both show everything you add to them right here.
            </span>
            <div className="row g8 mt4">
              <button className="btn primary sm" onClick={() => addTitle(session.id, undefined, 'topic')}>
                <BookOpen />Add a topic
              </button>
              <button className="btn sm" onClick={() => addTitle(session.id, undefined, 'project')}>
                <Hammer />Add a project
              </button>
            </div>
          </div>
        ) : (
          <div className="stack g20">
            {groups.map((g, gi) => {
              const isCollapsed = !!collapsed[g.title.id]
              return (
              <div key={g.title.id} className="flow-group" data-kind={g.kind}>
                <div className="flow-group-head">
                  <button className="btn ghost icon sm" aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${g.label}`}
                    onClick={() => toggleGroup(g.title.id)}>
                    {isCollapsed ? <ChevronRight /> : <ChevronDown />}
                  </button>
                  <Badge tone={TITLE_KIND_META[g.kind].tone} title={TITLE_KIND_META[g.kind].hint}>
                    {TITLE_KIND_ICON[g.kind]}{g.label}
                  </Badge>
                  <input
                    className="t-sm w-sb grow"
                    value={g.title.name}
                    placeholder={TITLE_KIND_META[g.kind].blank}
                    aria-label={`Name of ${g.label.toLowerCase()}`}
                    onChange={e => updateTitle(session.id, g.title.id, { name: e.target.value })}
                    style={{
                      border: 'none', outline: 'none', background: 'transparent',
                      color: 'inherit', font: 'inherit', minWidth: 0,
                    }}
                  />
                  {armTopic === g.title.id ? (
                    <span className="row g6" style={{ flex: 'none' }}>
                      <span className="t-xs w-med" style={{ color: 'var(--rose-600)' }}>Delete with everything in it?</span>
                      <button className="btn danger sm" onClick={() => { deleteTitle(session.id, g.title.id); setArmTopic('') }}>
                        <Trash2 />Delete
                      </button>
                      <button className="btn ghost sm" onClick={() => setArmTopic('')}>Keep</button>
                    </span>
                  ) : (
                    <>
                      <span className="t-xs c-muted2 hide-sm">
                        {g.steps.length} step{g.steps.length === 1 ? '' : 's'}
                      </span>
                      <Menu align="end" trigger={p => (
                        <button className="btn ghost icon sm" {...p}
                          aria-label={`Add to this ${g.kind}`} title={`Add to this ${g.kind}`}>
                          <Plus />
                        </button>
                      )}>
                        <MenuLabel>Add to “{g.title.name || TITLE_KIND_META[g.kind].blank}”</MenuLabel>
                        {(['video', ...ADDABLE_TYPES] as StepType[]).map(t => {
                          const m = STEP_TYPE_META[t]
                          const taken = t === 'video' && !!g.title.video
                          return (
                            <MenuItem key={t} icon={TYPE_ICON[t]} onClick={() => addTo(g.title, t)}>
                              {taken ? `${m.label} (another one)` : m.label}
                            </MenuItem>
                          )
                        })}
                      </Menu>
                      <Menu align="end" trigger={p => (
                        <button className="btn ghost icon sm" {...p}
                          aria-label={`${g.label} menu`} title={`${g.label} menu`}>
                          <MoreHorizontal />
                        </button>
                      )}>
                        <MenuLabel>{g.label}</MenuLabel>
                        {gi > 0 && (
                          <MenuItem icon={<ArrowUp />} onClick={() => moveTitle(session.id, g.title.id, groups[gi - 1].title.id)}>
                            Move up
                          </MenuItem>
                        )}
                        {gi < groups.length - 1 && (
                          <MenuItem icon={<ArrowDown />} onClick={() => moveTitle(session.id, g.title.id, groups[gi + 1].title.id)}>
                            Move down
                          </MenuItem>
                        )}
                        {g.kind === 'project' && (
                          <>
                            <MenuSep />
                            <MenuLabel>Where it stands</MenuLabel>
                            {PROJECT_STATES.filter(st => st !== titleState(g.title)).map(st => (
                              <MenuItem key={st} icon={<Target />}
                                onClick={() => updateTitle(session.id, g.title.id, { state: st })}>
                                Move to {PROJECT_STATE_META[st].label}
                              </MenuItem>
                            ))}
                          </>
                        )}
                        <MenuSep />
                        {/* The same box, relabelled — nothing inside it moves. */}
                        {TITLE_KINDS.filter(k => k !== g.kind).map(k => (
                          <MenuItem key={k} icon={TITLE_KIND_ICON[k]}
                            onClick={() => updateTitle(session.id, g.title.id, { kind: k })}>
                            Make it a {k}
                          </MenuItem>
                        ))}
                        <MenuItem icon={<Copy />} onClick={() => duplicateTitle(session.id, g.title.id)}>Duplicate</MenuItem>
                        <MenuSep />
                        <MenuItem icon={<Trash2 />} danger onClick={() => setArmTopic(g.title.id)}>
                          Delete {g.kind}
                        </MenuItem>
                      </Menu>
                    </>
                  )}
                </div>

                {g.steps.length === 0 && !isCollapsed && (
                  <div className="flow-group-empty">
                    {g.kind === 'project'
                      ? 'Nothing in this project yet — use the “+” above to add its brief, a file or the work to hand in.'
                      : 'Nothing in this topic yet — use the “+” above to add its recording, a file or a question.'}
                  </div>
                )}

                {!isCollapsed && (
                <div className="stack g6">
                  {g.steps.map((step, si) => {
                    const d = describe(session, step)
                    const meta = STEP_TYPE_META[step.type]
                    const options = TYPES_FOR[step.kind]
                    const open = openKey === step.key
                    const i = g.indexByKey.get(step.key) ?? si
                    return (
                      <div
                        key={step.key}
                        className="flow-item"
                        data-open={open || undefined}
                        draggable={!open}
                        onDragStart={() => setDragKey(step.key)}
                        onDragEnd={() => { setDragKey(''); setOverKey('') }}
                        onDragOver={e => {
                          if (dragKey && step.titleId !== g.title.id) return
                          e.preventDefault()
                          if (step.key !== overKey) setOverKey(step.key)
                        }}
                        onDrop={e => {
                          e.preventDefault()
                          if (dragKey && dragKey !== step.key) moveStep(session.id, dragKey, step.key)
                          setDragKey(''); setOverKey('')
                        }}
                      >
                        <div
                          className="flow-row"
                          data-drag={dragKey === step.key || undefined}
                          data-over={overKey === step.key && dragKey && dragKey !== step.key ? true : undefined}
                        >
                          <span className="grip"><GripVertical /></span>
                          <span className="flow-idx tnum">{i + 1}</span>

                          <span className="mat-ico" style={{
                            background: `var(--${meta.tone}-100, var(--brand-weak))`,
                            color: `var(--${meta.tone}-600, var(--brand))`,
                          }}>
                            {TYPE_ICON[step.type]}
                          </span>

                          <span className="grow stack g2" style={{ minWidth: 0 }}>
                            {/* A video step is named by its topic; a file by its
                                name; a question by the question itself. */}
                            <input
                              className="t-sm w-med"
                              value={d.name}
                              placeholder={d.placeholder}
                              aria-label="Step name"
                              onChange={e => {
                                const name = e.target.value
                                if (step.kind === 'video') {
                                  if (d.title?.video) updateTitle(session.id, step.titleId, { video: { ...d.title.video, name } })
                                } else if (step.kind === 'material') updateMaterial(session.id, step.titleId, step.refId, { name })
                                else updateTask(session.id, step.titleId, step.refId, { question: name })
                              }}
                              draggable
                              onDragStart={e => { e.preventDefault(); e.stopPropagation() }}
                              style={{
                                border: 'none', outline: 'none', background: 'transparent',
                                color: 'inherit', font: 'inherit', minWidth: 0, width: '100%',
                              }}
                            />
                            <button className="flow-open" style={{ minWidth: 0, textAlign: 'left' }}
                              onClick={() => setOpenKey(open ? '' : step.key)} aria-expanded={open}>
                              <span className="t-xs c-muted2 truncate">{d.sub}</span>
                            </button>
                          </span>

                          {/* What this step is — its own call, not the topic's. */}
                          {armKey === step.key ? null : options.length > 1 ? (
                            <select
                              className="sel sm hide-sm" style={{ flex: 'none', maxWidth: 150 }}
                              aria-label="Step type"
                              title={meta.hint}
                              value={step.type}
                              onChange={e => setStepType(session.id, step, e.target.value as StepType)}
                            >
                              {options.map(t => (
                                <option key={t} value={t}>{STEP_TYPE_META[t].label}</option>
                              ))}
                            </select>
                          ) : (
                            <Badge tone={meta.tone} className="hide-sm">{meta.label}</Badge>
                          )}

                          {/* Deleting takes the real thing with it — the recording, the
                              file, the question — so it asks first. */}
                          {armKey === step.key ? (
                            <div className="row g6" style={{ flex: 'none' }}>
                              <span className="t-xs w-med" style={{ color: 'var(--rose-600)' }}>
                                {step.kind === 'video' ? 'Remove the recording?' : 'Delete it?'}
                              </span>
                              <button className="btn danger sm" onClick={() => {
                                deleteStep(session.id, step)
                                setArmKey('')
                                if (open) setOpenKey('')
                              }}>
                                <Trash2 />Delete
                              </button>
                              <button className="btn ghost sm" onClick={() => setArmKey('')}>Keep</button>
                            </div>
                          ) : (
                            <div className="row g4" style={{ flex: 'none' }}>
                              <button className="btn ghost icon sm" aria-label="Move up within the topic"
                                disabled={si === 0} onClick={() => nudge(g.steps, si, -1)}><ArrowUp /></button>
                              <button className="btn ghost icon sm" aria-label="Move down within the topic"
                                disabled={si === g.steps.length - 1} onClick={() => nudge(g.steps, si, 1)}><ArrowDown /></button>
                              <button className="btn ghost icon sm danger" aria-label="Delete this step"
                                title="Delete this step" onClick={() => setArmKey(step.key)}><Trash2 /></button>
                              <button className="btn ghost icon sm" aria-label={open ? 'Close editor' : 'Edit here'}
                                title={open ? 'Close' : 'Edit here'} onClick={() => setOpenKey(open ? '' : step.key)}>
                                <ChevronDown className="flow-chev" data-open={open || undefined} />
                              </button>
                            </div>
                          )}
                        </div>

                        {open && (
                          <div className="flow-edit">
                            {editor(step)}
                            <div className="row g8 mt12">
                              <button className="btn sm" onClick={() => setOpenKey('')}>Done</button>
                              <button className="btn ghost sm auto-s" onClick={() => onOpen(step)}>
                                Open in its topic tab
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
              )
            })}
            <div className="row g8">
              {TITLE_KINDS.map(k => (
                <button key={k} className="btn grow" title={TITLE_KIND_META[k].hint}
                  onClick={() => addTitle(session.id, undefined, k)}>
                  {TITLE_KIND_ICON[k]}Add {k === 'topic' ? 'a topic' : 'a project'}
                </button>
              ))}
            </div>
          </div>
        )}

        {flow.length > 0 && (
          <p className="hint" style={{ textAlign: 'center' }}>
            Drag a row, or use the arrows. Saves as you go.
          </p>
        )}
      </div>
    </div>
  )
}
