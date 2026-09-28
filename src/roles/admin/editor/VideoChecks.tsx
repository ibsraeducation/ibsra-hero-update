import { useState } from 'react'
import {
  ChevronDown, Circle, CircleCheck, Clock, ImagePlus, Plus, Trash2, Wrench,
} from 'lucide-react'
import { Badge, Field, Menu, MenuItem, MenuLabel, Switch } from '@/components/ui'
import { duration } from '@/lib/format'
import { videoChecks, type Option, type VideoAsset, type VideoCheck, type VideoCheckKind } from '@/lib/types'
import { IMAGE_ACCEPT, pickFile, readImageAsDataUrl } from './uploads'
import { PanelNote } from './SessionEditor'

/* Checkpoints: questions the recording stops for. The student cannot watch
   past the mark until this is answered, so the authoring here is deliberately
   the same shape as a topic's Q&A — a question, a picture, and either options
   to pick from or work to go and do. */

const KIND_META: Record<VideoCheckKind, { label: string; hint: string; tone: string }> = {
  mcq: { label: 'MCQ question', hint: 'Pick one of the options', tone: 'brand' },
  technical: { label: 'Technical task', hint: 'Do the work, then write what happened', tone: 'gold' },
}

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

const blankOptions = (): Option[] => [
  { id: uid('opt'), text: '', correct: true },
  { id: uid('opt'), text: '', correct: false },
]

export function VideoChecks({ video, onChange }: {
  video: VideoAsset
  onChange: (checks: VideoCheck[]) => void
}) {
  const checks = videoChecks(video)
  const [open, setOpen] = useState('')

  /* A new one lands after the last mark, or a minute in on an empty
     recording — never on top of the one before it. */
  const nextMark = () => {
    const last = checks[checks.length - 1]?.atSec ?? -60
    const mark = last + 60
    return video.durationSec > 0 ? Math.min(mark, Math.max(0, video.durationSec - 5)) : mark
  }

  const add = (kind: VideoCheckKind) => {
    const c: VideoCheck = {
      id: uid('chk'),
      atSec: nextMark(),
      kind,
      question: '',
      options: kind === 'mcq' ? blankOptions() : [],
      points: 5,
      required: true,
    }
    onChange([...checks, c])
    setOpen(c.id)
  }

  const set = (id: string, patch: Partial<VideoCheck>) =>
    onChange(checks.map(c => (c.id === id ? { ...c, ...patch } : c)))

  const remove = (id: string) => onChange(checks.filter(c => c.id !== id))

  return (
    <section className="card">
      <div className="card-head">
        <div className="stack g2 grow">
          <h2 className="t-md w-sb">Checkpoint questions</h2>
          <span className="hint">
            The recording pauses at the mark and asks. Nobody watches past an unanswered one.
          </span>
        </div>
        <Menu align="end" trigger={p => (
          <button className="btn sm primary" {...p}><Plus />Add checkpoint<ChevronDown /></button>
        )}>
          <MenuLabel>Asked at a mark in this recording</MenuLabel>
          <MenuItem icon={<CircleCheck />} onClick={() => add('mcq')} tail="pick one">MCQ question</MenuItem>
          <MenuItem icon={<Wrench />} onClick={() => add('technical')} tail="do the work">Technical task</MenuItem>
        </Menu>
      </div>

      <div className="card-body stack g10">
        {checks.length === 0 ? (
          <div className="rowtop g8 t-xs" style={{
            padding: '9px 11px', background: 'var(--surface-2)',
            border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
            color: 'var(--muted)', lineHeight: 1.55,
          }}>
            <Clock style={{ width: 13, height: 13, flex: 'none', marginTop: 1 }} />
            <span>
              No checkpoints yet. This recording plays start to finish without stopping.
            </span>
          </div>
        ) : (
          checks.map(c => (
            <CheckCard
              key={c.id}
              check={c}
              durationSec={video.durationSec}
              open={open === c.id}
              onToggle={() => setOpen(o => (o === c.id ? '' : c.id))}
              onChange={patch => set(c.id, patch)}
              onRemove={() => remove(c.id)}
            />
          ))
        )}

        {checks.length > 0 && (
          <PanelNote>
            Marks past the end of the recording are never reached. Keep them inside
            {video.durationSec > 0 ? ` ${duration(video.durationSec)}` : ' the running time'}.
          </PanelNote>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

function CheckCard({ check, durationSec, open, onToggle, onChange, onRemove }: {
  check: VideoCheck
  durationSec: number
  open: boolean
  onToggle: () => void
  onChange: (patch: Partial<VideoCheck>) => void
  onRemove: () => void
}) {
  const [busy, setBusy] = useState(false)
  const meta = KIND_META[check.kind]
  const isMcq = check.kind === 'mcq'
  const past = durationSec > 0 && check.atSec >= durationSec

  const mm = Math.floor(check.atSec / 60)
  const ss = check.atSec % 60
  const setMark = (minutes: number, seconds: number) =>
    onChange({ atSec: Math.max(0, Math.round(minutes) * 60 + Math.round(seconds)) })

  const changeKind = (kind: VideoCheckKind) =>
    onChange({
      kind,
      options: kind === 'mcq' ? (check.options.length ? check.options : blankOptions()) : [],
    })

  const setOption = (id: string, patch: Partial<Option>) =>
    onChange({ options: check.options.map(o => (o.id === id ? { ...o, ...patch } : o)) })

  const attachImage = async () => {
    const file = await pickFile(IMAGE_ACCEPT)
    if (!file) return
    setBusy(true)
    try { onChange({ image: await readImageAsDataUrl(file, 900) }) } finally { setBusy(false) }
  }

  return (
    <div className="qcard" data-open={open}>
      <div className="qcard-head" onClick={onToggle}>
        <span className="row g4 t-xs w-sb" style={{
          flex: 'none', marginTop: 1, padding: '3px 7px', borderRadius: 5,
          background: past ? 'var(--gold-100)' : 'var(--surface-3)',
          color: past ? 'var(--gold-700)' : 'var(--muted)',
        }}>
          <Clock style={{ width: 11, height: 11 }} />{duration(check.atSec)}
        </span>

        <div className="grow stack g4" style={{ minWidth: 0 }}>
          <span className={`t-sm ${check.question ? 'w-med' : 'c-muted2'} clamp2`}>
            {check.question || 'Untitled checkpoint — click to write the question'}
          </span>
          <div className="row g8 t-xs c-muted2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {isMcq && <span>· {check.options.length} choices</span>}
            {check.image && <span className="row g4">· <ImagePlus style={{ width: 11, height: 11 }} />picture</span>}
            <span>· {check.points ?? 0} marks</span>
            {check.required ? <span>· must answer</span> : <span>· can skip</span>}
            {past && <span style={{ color: 'var(--gold-700)' }}>· past the end</span>}
          </div>
        </div>

        <div className="row g4" onClick={e => e.stopPropagation()}>
          <button className="btn ghost icon sm" aria-label="Delete" onClick={onRemove}><Trash2 /></button>
          <button className="btn ghost icon sm" aria-label={open ? 'Collapse' : 'Expand'} onClick={onToggle}>
            <ChevronDown style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform var(--fast)' }} />
          </button>
        </div>
      </div>

      {open && (
        <div className="qcard-body stack g14">
          <div className="grid g-4">
            <Field label="Stops at · minute">
              <input className="inp tnum" type="number" min={0} value={mm}
                onChange={e => setMark(Number(e.target.value) || 0, ss)} />
            </Field>
            <Field label="and second">
              <input className="inp tnum" type="number" min={0} max={59} value={ss}
                onChange={e => setMark(mm, Math.min(59, Number(e.target.value) || 0))} />
            </Field>
            <Field label="Type">
              <select className="sel" value={check.kind}
                onChange={e => changeKind(e.target.value as VideoCheckKind)}>
                {Object.entries(KIND_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Worth">
              <input className="inp tnum" type="number" min={0} max={100}
                value={check.points ?? 0}
                onChange={e => onChange({ points: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
            </Field>
          </div>

          <Field label="Question">
            <textarea className="ta" rows={2} value={check.question}
              placeholder={isMcq
                ? 'Ask something only someone who watched this part can answer.'
                : 'Tell them what to build, measure or try before they carry on.'}
              onChange={e => onChange({ question: e.target.value })} />
          </Field>

          <div className="stack g8">
            <div className="between">
              <span className="label">Picture</span>
              <span className="hint">Optional. Shown above the question.</span>
            </div>
            {check.image ? (
              <div className="row g8">
                <img src={check.image} alt="" style={{
                  width: 108, height: 68, objectFit: 'cover', flex: 'none',
                  borderRadius: 'var(--r-md)', border: '1px solid var(--line)',
                }} />
                <div className="row g6">
                  <button className="btn sm" disabled={busy} onClick={attachImage}>
                    <ImagePlus />Replace
                  </button>
                  <button className="btn sm danger" onClick={() => onChange({ image: undefined })}>
                    <Trash2 />Remove
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn sm" disabled={busy} onClick={attachImage}>
                <ImagePlus />{busy ? 'Adding…' : 'Add a picture'}
              </button>
            )}
          </div>

          {isMcq ? (
            <div className="stack g8">
              <div className="between">
                <span className="label">Choices</span>
                <span className="hint">Click a circle to mark the correct one</span>
              </div>
              {check.options.map(o => (
                <div key={o.id} className="opt" data-correct={o.correct}>
                  <button className="btn ghost icon sm" aria-label="Mark correct"
                    onClick={() => onChange({
                      options: check.options.map(x => ({ ...x, correct: x.id === o.id })),
                    })}>
                    {o.correct
                      ? <CircleCheck style={{ color: 'var(--teal-500)' }} />
                      : <Circle style={{ color: 'var(--muted-2)' }} />}
                  </button>
                  <input className="inp ghost grow" value={o.text} placeholder="Choice text"
                    onChange={e => setOption(o.id, { text: e.target.value })} />
                  <button className="btn ghost icon sm" aria-label="Remove choice"
                    disabled={check.options.length <= 2}
                    onClick={() => onChange({ options: check.options.filter(x => x.id !== o.id) })}>
                    <Trash2 />
                  </button>
                </div>
              ))}
              <button className="btn sm"
                onClick={() => onChange({ options: [...check.options, { id: uid('opt'), text: '', correct: false }] })}>
                <Plus />Add choice
              </button>
            </div>
          ) : (
            <div className="row g10" style={{
              padding: '10px 12px', border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)', background: 'var(--surface-2)',
            }}>
              <Switch on={!!check.wantsImage} onChange={v => onChange({ wantsImage: v })}
                label="Picture of the work" />
              <div className="stack g2 grow">
                <span className="t-sm w-med">Answer with a picture and words</span>
                <span className="hint">
                  On: the student sends a photo of what they did as well as writing about it.
                  Off: words only.
                </span>
              </div>
            </div>
          )}

          <div className="row g10" style={{
            padding: '10px 12px', border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)', background: 'var(--surface-2)',
          }}>
            <Switch on={check.required} onChange={v => onChange({ required: v })} label="Must answer" />
            <div className="stack g2 grow">
              <span className="t-sm w-med">
                {check.required ? 'The recording will not go on' : 'They can skip it and keep watching'}
              </span>
              <span className="hint">
                A checkpoint that can be skipped is a prompt, not a gate.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
