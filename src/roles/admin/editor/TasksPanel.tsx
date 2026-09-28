import { useState } from 'react'
import {
  ChevronDown, Circle, CircleCheck, Copy, GripVertical, ImagePlus, ListChecks, Plus,
  Trash2, Upload, Link2, MessageSquare, AlignLeft, Star,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { Badge, Field, Menu, MenuItem, MenuLabel, Switch } from '@/components/ui'
import { TASK_META, type Option, type Session, type Task, type TaskKind, type Title } from '@/lib/types'
import { PanelNote } from './SessionEditor'

const KIND_ICON: Record<TaskKind, React.ReactNode> = {
  mcq: <CircleCheck />,
  multi: <ListChecks />,
  short: <MessageSquare />,
  long: <AlignLeft />,
  upload: <Upload />,
  link: <Link2 />,
  imagetext: <ImagePlus />,
}

export function TasksPanel({ session, title }: { session: Session; title: Title }) {
  const addTask = useStore(s => s.addTask)
  const moveTask = useStore(s => s.moveTask)
  const [open, setOpen] = useState<string>(title.tasks[0]?.id ?? '')
  const [dragId, setDragId] = useState('')
  const [overId, setOverId] = useState('')

  const total = title.tasks.reduce((a, t) => a + t.points, 0)

  const add = (kind: TaskKind) => {
    const t = addTask(session.id, title.id, kind)
    if (t) setOpen(t.id)
  }

  return (
    <div className="stack g16">
      <div className="row g8 wrap">
        <Menu align="start" trigger={p => (
          <button className="btn primary" {...p}><Plus />Add question<ChevronDown /></button>
        )}>
          <MenuLabel>Auto-graded</MenuLabel>
          <MenuItem icon={KIND_ICON.mcq} onClick={() => add('mcq')} tail="1 correct">Single choice</MenuItem>
          <MenuItem icon={KIND_ICON.multi} onClick={() => add('multi')} tail="many">Multiple choice</MenuItem>
          <MenuLabel>Mentor-graded</MenuLabel>
          <MenuItem icon={KIND_ICON.short} onClick={() => add('short')}>Short answer</MenuItem>
          <MenuItem icon={KIND_ICON.long} onClick={() => add('long')}>Long answer</MenuItem>
          <MenuLabel>Proof of work</MenuLabel>
          <MenuItem icon={KIND_ICON.imagetext} onClick={() => add('imagetext')} tail="picture + words">
            Image + text answer
          </MenuItem>
          <MenuItem icon={KIND_ICON.upload} onClick={() => add('upload')}>File upload</MenuItem>
          <MenuItem icon={KIND_ICON.link} onClick={() => add('link')}>Published link</MenuItem>
        </Menu>

        <span className="auto-s row g10 t-xs c-muted2">
          <span>{title.tasks.length} question{title.tasks.length === 1 ? '' : 's'}</span>
          <span className="row g4"><Star style={{ width: 12, height: 12 }} />{total} points</span>
        </span>
      </div>

      {title.tasks.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="ico"><ListChecks /></div>
            <div className="stack g4">
              <span className="t-md w-sb" style={{ color: 'var(--ink)' }}>No Q&amp;A on this topic yet</span>
              <span className="t-sm c-muted2" style={{ maxWidth: 400 }}>
                Every topic needs at least one. Auto-graded questions check understanding;
                a link or upload task is what becomes the portfolio piece.
              </span>
            </div>
            <div className="row g8 mt4">
              <button className="btn" onClick={() => add('mcq')}>{KIND_ICON.mcq}Single choice</button>
              <button className="btn primary" onClick={() => add('link')}>{KIND_ICON.link}Published link</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="stack g10">
          {title.tasks.map(t => (
            <div
              key={t.id}
              draggable
              onDragStart={() => setDragId(t.id)}
              onDragEnd={() => { setDragId(''); setOverId('') }}
              onDragOver={e => { e.preventDefault(); if (t.id !== overId) setOverId(t.id) }}
              onDrop={e => {
                e.preventDefault()
                if (dragId && dragId !== t.id) moveTask(session.id, title.id, dragId, t.id)
                setDragId(''); setOverId('')
              }}
              style={{
                opacity: dragId === t.id ? 0.35 : 1,
                boxShadow: overId === t.id && dragId && dragId !== t.id
                  ? 'inset 0 2px 0 0 var(--brand)' : undefined,
                borderRadius: 'var(--r-md)',
              }}
            >
              <TaskCard
                session={session} title={title} task={t}
                open={open === t.id}
                onToggle={() => setOpen(o => (o === t.id ? '' : t.id))}
              />
            </div>
          ))}
        </div>
      )}

      <PanelNote>
        Mentor-graded and proof-of-work answers land in the instructor review queue. That queue
        is what the 72-hour SLA is measured against.
      </PanelNote>
    </div>
  )
}

/* ------------------------------------------------------------------ */

export function TaskCard({ session, title, task, open, onToggle }: {
  session: Session; title: Title; task: Task; open: boolean; onToggle: () => void
}) {
  const update = useStore(s => s.updateTask)
  const del = useStore(s => s.deleteTask)
  const dup = useStore(s => s.duplicateTask)
  const set = (patch: Partial<Task>) => update(session.id, title.id, task.id, patch)

  const isChoice = task.kind === 'mcq' || task.kind === 'multi'
  /* Technical and branding work is always answered in text — the point is
     the reference video plus what the student did, not how it is marked. */
  const isRefWork = task.category === 'technical' || task.category === 'branding'
  const meta = TASK_META[task.kind]

  const setOption = (id: string, patch: Partial<Option>) =>
    set({ options: task.options.map(o => (o.id === id ? { ...o, ...patch } : o)) })

  const pickCorrect = (id: string) =>
    set({
      options: task.options.map(o => ({
        ...o,
        correct: task.kind === 'mcq' ? o.id === id : o.id === id ? !o.correct : o.correct,
      })),
    })

  const addOption = () =>
    set({
      options: [...task.options, {
        id: `opt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        text: '', correct: false,
      }],
    })

  const changeKind = (kind: TaskKind) => {
    const nextChoice = kind === 'mcq' || kind === 'multi'
    set({
      kind,
      options: nextChoice && task.options.length === 0
        ? [
            { id: `opt_${Date.now().toString(36)}a`, text: '', correct: true },
            { id: `opt_${Date.now().toString(36)}b`, text: '', correct: false },
          ]
        : nextChoice ? task.options : [],
      points: kind === 'upload' || kind === 'link' || kind === 'imagetext' ? 20
        : kind === 'long' ? 15 : 5,
    })
  }

  /* Everything a mentor reads and marks by hand — the note below is for
     them, not the student. */
  const isWritten = task.kind === 'short' || task.kind === 'long' || task.kind === 'imagetext'
  const isProof = task.kind === 'upload' || task.kind === 'link' || task.kind === 'imagetext'

  return (
    <div className="qcard" data-open={open}>
      <div className="qcard-head" onClick={onToggle}>
        <span className="grip" style={{ opacity: .5, cursor: 'grab', marginTop: 2 }}
          onClick={e => e.stopPropagation()}>
          <GripVertical style={{ width: 14, height: 14 }} />
        </span>

        <span className="idx" style={{
          display: 'grid', placeItems: 'center', width: 20, height: 20, flex: 'none', marginTop: 1,
          borderRadius: 5, background: 'var(--surface-3)', color: 'var(--muted)',
          fontSize: 10.5, fontWeight: 700,
        }}>{task.order + 1}</span>

        <div className="grow stack g4" style={{ minWidth: 0 }}>
          <span className={`t-sm ${task.question ? 'w-med' : 'c-muted2'} clamp2`}>
            {task.question || 'Untitled question — click to write it'}
          </span>
          <div className="row g8 t-xs c-muted2">
            <Badge tone={isProof ? 'gold' : 'line'}>{meta.label}</Badge>
            <span>{task.points} pts</span>
            {task.required && <span>· required</span>}
            {isChoice && <span>· {task.options.length} options</span>}
          </div>
        </div>

        <div className="row g4" onClick={e => e.stopPropagation()}>
          <button className="btn ghost icon sm" aria-label="Duplicate"
            onClick={() => dup(session.id, title.id, task.id)}><Copy /></button>
          <button className="btn ghost icon sm" aria-label="Delete"
            onClick={() => del(session.id, title.id, task.id)}><Trash2 /></button>
          <button className="btn ghost icon sm" aria-label={open ? 'Collapse' : 'Expand'} onClick={onToggle}>
            <ChevronDown style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform var(--fast)' }} />
          </button>
        </div>
      </div>

      {open && (
        <div className="qcard-body stack g14">
          <Field label="Question">
            <textarea className="ta" rows={2} value={task.question}
              placeholder="Ask something a student can only answer after doing the work."
              onChange={e => set({ question: e.target.value })} />
          </Field>

          {isRefWork && (
            <Field label="Reference video">
              <input className="inp mono" value={task.refVideoUrl ?? ''} placeholder="https://…"
                onChange={e => set({ refVideoUrl: e.target.value })} />
            </Field>
          )}

          <div className="grid g-3">
            {isRefWork ? (
              <Field label="Answer length">
                <select className="sel" value={task.kind}
                  onChange={e => set({ kind: e.target.value as TaskKind })}>
                  <option value="short">One line</option>
                  <option value="long">Paragraph</option>
                </select>
              </Field>
            ) : (
              <Field label="Type">
                <select className="sel" value={task.kind}
                  onChange={e => changeKind(e.target.value as TaskKind)}>
                  {Object.entries(TASK_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Points">
              <input className="inp tnum" type="number" min={0} value={task.points}
                onChange={e => set({ points: Number(e.target.value) })} />
            </Field>
            <Field label="Required">
              <div className="row g8" style={{ height: 32 }}>
                <Switch on={task.required} onChange={v => set({ required: v })} label="Required" />
                <span className="t-sm c-muted">{task.required ? 'Must be answered' : 'Optional'}</span>
              </div>
            </Field>
          </div>

          {isChoice && (
            <div className="stack g8">
              <div className="between">
                <span className="label">Options</span>
                <span className="hint">
                  {task.kind === 'mcq' ? 'Click a circle to mark the correct one' : 'Mark every correct option'}
                </span>
              </div>
              {task.options.map(o => (
                <div key={o.id} className="opt" data-correct={o.correct}>
                  <button className="btn ghost icon sm" aria-label="Mark correct"
                    onClick={() => pickCorrect(o.id)}>
                    {o.correct
                      ? <CircleCheck style={{ color: 'var(--teal-500)' }} />
                      : <Circle style={{ color: 'var(--muted-2)' }} />}
                  </button>
                  <input className="inp ghost grow" value={o.text} placeholder="Option text"
                    onChange={e => setOption(o.id, { text: e.target.value })} />
                  <button className="btn ghost icon sm" aria-label="Remove option"
                    disabled={task.options.length <= 2}
                    onClick={() => set({ options: task.options.filter(x => x.id !== o.id) })}>
                    <Trash2 />
                  </button>
                </div>
              ))}
              <button className="btn sm" onClick={addOption}><Plus />Add option</button>
            </div>
          )}

          {task.kind === 'imagetext' && (
            <div className="rowtop g8 t-xs" style={{
              padding: '9px 11px', background: 'var(--sky-100)',
              borderRadius: 'var(--r-md)', color: 'var(--sky-700)', lineHeight: 1.55,
            }}>
              <ImagePlus style={{ width: 13, height: 13, flex: 'none', marginTop: 1 }} />
              <span>
                The student sends a picture of the work <b>and</b> writes about it. Both
                arrive together in the mentor's review queue.
              </span>
            </div>
          )}

          {isWritten && (
            <Field label="Grading note">
              <textarea className="ta" rows={2} value={task.modelAnswer ?? ''}
                placeholder="What a passing answer must contain."
                onChange={e => set({ modelAnswer: e.target.value })} />
            </Field>
          )}

          {(task.kind === 'upload' || task.kind === 'link') && (
            <div className="rowtop g8 t-xs" style={{
              padding: '9px 11px', background: 'var(--gold-100)',
              borderRadius: 'var(--r-md)', color: 'var(--gold-700)', lineHeight: 1.55,
            }}>
              <Star style={{ width: 13, height: 13, flex: 'none', marginTop: 1 }} />
              <span>
                This is the task that becomes a portfolio piece. It goes to the mentor for approval
                before it is published under the student's own name.
              </span>
            </div>
          )}

          <Field label="Hint">
            <input className="inp" value={task.hint ?? ''} placeholder="Nudge, not the answer."
              onChange={e => set({ hint: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  )
}
