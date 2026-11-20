import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BackLink, useGoBack } from '@/lib/backNav'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, Clock, ExternalLink, FileText, ImagePlus, ListChecks, Lock, Maximize2, Pause, Play,
  PlayCircle, Radio, Sparkles, Upload, Video as VideoIcon, Wrench, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import { sessionFlow, useStore } from '@/lib/store'
import { Badge, Empty, Splitter, usePaneSize } from '@/components/ui'
import { bytes, duration, mins } from '@/lib/format'
import {
  MATERIAL_META, STEP_TYPE_META, TASK_META, TITLE_KIND_META, isClip, titleKind, titleLabel,
  titleNumber, videoChecks, courseLocked,
} from '@/lib/types'
import type { Material, Session, Step, StepType, Task, Title } from '@/lib/types'
import { backendLive } from '@/lib/supabase'
import { useAuthStore } from '@/lib/authStore'
import { submitAnswer, subKey, useSubmissions } from '@/lib/api/submissions'
import { openFile, uploadSubmission } from '@/lib/api/storage'
import { toMessage } from '@/lib/api/errors'
import { IMAGE_ACCEPT, pickFile } from '@/roles/admin/editor/uploads'
import { VideoEmbed } from '@/components/VideoEmbed'
import { AnnotationCanvas } from './AnnotationCanvas'
import { Crumbs } from './Missions'
import { isOpen, sessionMinutes, useMe } from './useMe'
import { embedUrl, isHttp } from './media'
import { VideoCheckPrompt } from './VideoCheckPrompt'

const SUBMISSION_ACCEPT = '.pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.zip,.txt,.md,image/*'

/** Open a material (stored file or plain link), reporting failures as a toast. */
function openMaterial(url: string) {
  openFile(url).catch(e => useStore.getState().toast(toMessage(e), 'err'))
}

/* ------------------------------------------------------------------ *
   Session view — three regions, as designed:
     left    material, with a drawing surface on top
     middle  the one step the student picked
     right   the session's whole sequence as a contents list

   The middle column shows ONE step at a time — the one clicked in the rail,
   or the one Next moved to. The rail carries the running order; the middle
   carries the thing being worked on. Material still sits BESIDE the video
   rather than replacing it, because reading the workbook while the recording
   plays is the actual behaviour we are designing for. It closes, and the
   video takes the width back.
 * ------------------------------------------------------------------ */

/** A file plus the topic that owns it — the workbook needs both. */
interface FileRef { material: Material; title: Title }

/* ---------------- the mock document surface ---------------- */

function DocPage({ material, session, title, watermark, zoom }: {
  material: Material
  session: Session
  title: Title
  watermark: string
  zoom: number
}) {
  const bullets = useMemo(
    () => title.tasks.slice(0, 6).map(t => t.question).filter(Boolean),
    [title.tasks],
  )

  return (
    <div className="doc-scroll">
      <div className="doc-page" style={{ width: `${zoom}%` }}>
        <div className="doc-wm" aria-hidden>
          {Array.from({ length: 12 }, (_, i) => <span key={i}>{watermark}</span>)}
        </div>

        <div className="doc-ink">
          <h3 className="doc-h1">{session.name}</h3>
          <p className="doc-h2">{titleNumber(session.titles, title.id)}. {title.name}</p>
          <p className="doc-sub">{MATERIAL_META[material.kind].label} · {material.name}</p>

          <hr className="doc-rule" />

          {title.summary && <p className="doc-p">{title.summary}</p>}

          {bullets.length > 0 && (
            <>
              <p className="doc-h3">What this file covers</p>
              <ul className="doc-list">
                {bullets.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </>
          )}

          <p className="doc-h3">Before the next topic</p>
          <p className="doc-p">
            Work through the recording with this open. Highlight the two things you would
            actually charge a client for — those are the lines that go in your scope note.
          </p>

          <div className="doc-note">
            Pricing, scope and revision count get agreed with your mentor before you send
            anything to a client.
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- material panel ---------------- */

function MaterialPanel({ session, files, activeId, onActive, watermark, onClose }: {
  session: Session
  /** Every file in the session, in sequence order, with the topic that owns it. */
  files: FileRef[]
  activeId: string
  onActive: (id: string) => void
  watermark: string
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(100)
  const boxRef = useRef<HTMLElement>(null)

  /* Which file is open is owned by the view, because opening one is a step in
     the sequence — the student gets sent here from the flow, not the topic. */
  const active = files.find(f => f.material.id === activeId) ?? files[0]

  const fullscreen = () => {
    const el = boxRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }

  return (
    <aside className="sv-mat" ref={boxRef}>
      <header className="sv-mat-head">
        <span className="eyebrow">Material</span>
        <button className="btn ghost icon sm" onClick={onClose} aria-label="Close material">
          <X />
        </button>
      </header>

      {!active ? (
        <div className="grow" style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
          <Empty icon={<FileText />} title="No files in this session" />
        </div>
      ) : (
        <>
          <div className="sv-mat-bar">
            <div className="row g6 grow" style={{ overflowX: 'auto' }}>
              {files.map(({ material: m }) => (
                <button
                  key={m.id}
                  className="file-pill"
                  data-on={m.id === active.material.id}
                  onClick={() => onActive(m.id)}
                  title={m.name}
                >
                  <span className="k">{MATERIAL_META[m.kind].label}</span>
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </div>

            <div className="row g4" style={{ flex: 'none' }}>
              <button className="btn ghost icon sm" aria-label="Zoom out"
                disabled={zoom <= 60} onClick={() => setZoom(z => Math.max(60, z - 10))}>
                <ZoomOut />
              </button>
              <span className="t-xs c-muted2 tnum" style={{ minWidth: 34, textAlign: 'center' }}>{zoom}%</span>
              <button className="btn ghost icon sm" aria-label="Zoom in"
                disabled={zoom >= 180} onClick={() => setZoom(z => Math.min(180, z + 10))}>
                <ZoomIn />
              </button>
              <button className="btn sm" onClick={fullscreen}><Maximize2 />Full screen</button>
            </div>
          </div>

          {backendLive ? (
            /* Connected: the real file, opened in its own tab. */
            <div className="grow" style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
              <Empty icon={<FileText />} title={active.material.name || 'File'}
                action={active.material.url
                  ? <button className="btn primary" onClick={() => openMaterial(active.material.url)}>
                      <ExternalLink />Open file
                    </button>
                  : undefined} />
            </div>
          ) : (
            <AnnotationCanvas resetKey={`${active.title.id}:${active.material.id}`}>
              <DocPage material={active.material} session={session} title={active.title}
                watermark={watermark} zoom={zoom} />
            </AnnotationCanvas>
          )}
        </>
      )}
    </aside>
  )
}

/* ---------------- simulated player ---------------- */

function Player({ title, sessionId, onEnded }: {
  title: Title; sessionId: string; onEnded: () => void
}) {
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const total = title.video?.durationSec ?? 0

  /* Checkpoints: the recording stops at each mark and asks. One answered is
     never asked again in this sitting. */
  const checks = useMemo(() => videoChecks(title.video), [title.video])
  const [passed, setPassed] = useState<string[]>([])
  /* Embedded players run themselves — there is no playhead to read, so the
     student opens the checkpoint from the list under the video instead. */
  const [openId, setOpenId] = useState('')
  const due = backendLive
    ? checks.find(c => c.id === openId)
    : checks.find(c => !passed.includes(c.id) && c.atSec <= at)

  useEffect(() => { setPlaying(false); setAt(0); setPassed([]); setOpenId('') }, [title.id])

  /* A question on screen holds the recording where it is. */
  useEffect(() => { if (due) setPlaying(false) }, [due?.id])

  const clearCheck = (id: string) => {
    setPassed(p => (p.includes(id) ? p : [...p, id]))
    setOpenId('')
    if (!backendLive) setPlaying(true)
  }

  useEffect(() => {
    if (!playing || total === 0) return
    const id = window.setInterval(() => {
      setAt(v => {
        // The dev-stage player runs at 12× so the whole workflow — watch,
        // mark done, move on — can actually be walked through.
        const next = v + 12
        /* Never run past an unanswered checkpoint: stop exactly on its mark. */
        const mark = checks.find(c => !passed.includes(c.id) && c.atSec > v && c.atSec <= next)
        if (mark) { setPlaying(false); return mark.atSec }
        if (next >= total) { setPlaying(false); onEnded(); return total }
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [playing, total, onEnded, checks, passed])

  if (!title.video) {
    return (
      <div className="video-frame">
        <div className="stack g8" style={{ alignItems: 'center', position: 'relative', color: '#fff' }}>
          <VideoIcon style={{ width: 22, height: 22, opacity: 0.7 }} />
          <span className="t-sm">No recording on this {titleKind(title)} yet</span>
        </div>
      </div>
    )
  }

  const pctDone = total ? (at / total) * 100 : 0

  /* Connected: the recording is a YouTube / Vimeo / Drive link — embedded
     when the host allows it, and always one click away in its own tab. */
  if (backendLive) {
    const link = title.video.url
    const embed = isHttp(link) ? embedUrl(link) : null
    return (
      <div className="stack g8">
        <div className="video-frame">
          {embed ? (
            <iframe
              src={embed}
              title={title.name}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          ) : (
            <>
              <div className="bg" style={{ background: title.video.thumbnail }} />
              <div className="stack g8" style={{ alignItems: 'center', position: 'relative', color: '#fff' }}>
                <VideoIcon style={{ width: 22, height: 22, opacity: 0.8 }} />
                <span className="t-sm">{isHttp(link) ? 'This recording opens in a new tab' : 'The link to this recording is missing'}</span>
              </div>
            </>
          )}
        </div>
        {isHttp(link) && (
          <div className="row g8 wrap">
            <a className="btn sm" href={link} target="_blank" rel="noreferrer">
              <ExternalLink />Watch in a new tab
            </a>
            <span className="t-xs c-muted2">Tick the step when you have watched it.</span>
          </div>
        )}

        {checks.length > 0 && (
          <div className="stack g6">
            <span className="t-xs c-muted2">
              Answer each of these as you reach its point in the recording.
            </span>
            {checks.map(c => (
              <button key={c.id} type="button" className="btn sm" style={{ justifyContent: 'flex-start' }}
                onClick={() => setOpenId(c.id)}>
                {passed.includes(c.id) ? <Check /> : <Clock />}
                <span className="t-sm">{duration(c.atSec)} · {c.question || 'Checkpoint'}</span>
              </button>
            ))}
          </div>
        )}

        {due && (
          <VideoCheckPrompt check={due} sessionId={sessionId}
            onDone={() => clearCheck(due.id)} onSkip={() => clearCheck(due.id)} />
        )}
      </div>
    )
  }

  return (
    <div className="stack g8">
      <div className="video-frame">
        <div className="bg" style={{ background: title.video.thumbnail }} />
        <div className="vid-caption" aria-hidden>
          <span className="t-xs">{TITLE_KIND_META[titleKind(title)].one.toLowerCase()}</span>
          <span className="t-xl w-b">{title.name}</span>
        </div>
        <button className="play" aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => setPlaying(p => !p)}>
          {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </button>
        <span className="dur">{duration(at)} / {duration(total)}</span>
        <div className="vid-bar">
          <i style={{ width: `${pctDone}%` }} />
          {/* Where the recording will stop and ask. */}
          {total > 0 && checks.filter(c => c.atSec < total).map(c => (
            <span key={c.id} title={`Question at ${duration(c.atSec)}`} style={{
              position: 'absolute', top: -2, bottom: -2, width: 2,
              left: `${(c.atSec / total) * 100}%`,
              background: passed.includes(c.id) ? 'var(--teal-500)' : 'var(--gold-500)',
              borderRadius: 1,
            }} />
          ))}
        </div>
      </div>

      {due && (
        <VideoCheckPrompt check={due} sessionId={sessionId}
          onDone={() => clearCheck(due.id)} onSkip={() => clearCheck(due.id)} />
      )}

      <div className="row g8 wrap">
        <span className="lock-note">
          <Lock />
          <span>Content is view-only inside the platform. Downloads are not available.</span>
        </span>
        <span className="auto-s">
          <Badge tone="line" className="vid-note-badge">preview player · pipeline is stage 2</Badge>
        </span>
      </div>
    </div>
  )
}

/* ---------------- one Q&A task ---------------- */

function TaskCard({ task, sessionId, answered: answeredDemo, onAnswer }: {
  task: Task
  sessionId: string
  /** Demo only: answered in this visit. Connected, the server's record decides. */
  answered: boolean
  onAnswer: () => void
}) {
  const toast = useStore(s => s.toast)
  const studentId = useAuthStore(s => s.profile?.id)
  const sub = useSubmissions(s => s.mine[subKey(sessionId, task.id)])
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<string[]>(() => sub?.choice_ids ?? [])
  const [text, setText] = useState(() => sub?.answer_text ?? sub?.link_url ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const choiceTask = task.kind === 'mcq' || task.kind === 'multi'
  const live = backendLive
  const graded = sub?.status === 'graded'
  /* One try at a multiple-choice question; a written answer, a link or a file
     can be sent again until the mentor has graded it. */
  const locked = live && (choiceTask ? !!sub : graded)
  const answered = live ? !!sub : answeredDemo

  /* The server copy arrives (or changes) — show what was actually sent. */
  useEffect(() => {
    if (!sub) return
    setChoice(sub.choice_ids ?? [])
    setText(sub.answer_text ?? sub.link_url ?? '')
  }, [sub?.id, sub?.updated_at])

  /* An image + text answer owes both halves: the picture of the work, and
     what the student says about it. */
  const imageText = task.kind === 'imagetext'
  const canSubmit = choiceTask
    ? choice.length > 0
    : task.kind === 'upload'
      ? (live ? !!file : true)
      : imageText
        ? text.trim().length > 0 && (live ? !!file : true)
        : text.trim().length > 0

  const toggle = (id: string) => {
    if (locked) return
    if (task.kind === 'multi') setChoice(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]))
    else setChoice([id])
  }

  const submit = async () => {
    if (!live) { onAnswer(); toast('Answer sent to your mentor'); return }
    if (!studentId || busy) return
    setBusy(true)
    try {
      const filePath = (task.kind === 'upload' || imageText) && file
        ? await uploadSubmission(studentId, sessionId, task.id, file)
        : undefined
      const r = await submitAnswer(sessionId, task.id, {
        choiceIds: choiceTask ? choice : undefined,
        /* The picture and the words travel together — one submission. */
        text: task.kind === 'short' || task.kind === 'long' || imageText ? text : undefined,
        link: task.kind === 'link' ? text.trim() : undefined,
        filePath,
      })
      onAnswer()
      setFile(null)
      if (r.already) toast('You already answered this question', 'info')
      else if (r.locked) toast('Your mentor has already graded this answer', 'info')
      else if (choiceTask) toast(r.is_correct ? `Correct · ${r.score}/${r.points}` : `Not quite · 0/${r.points}`, r.is_correct ? 'ok' : 'info')
      else toast('Sent to your mentor')
    } catch (e) {
      toast(toMessage(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const pickUpload = async () => {
    const f = await pickFile(SUBMISSION_ACCEPT)
    if (f) setFile(f)
  }

  const pickImage = async () => {
    const f = await pickFile(IMAGE_ACCEPT)
    if (f) setFile(f)
  }

  return (
    <div className="qcard" data-open={open || undefined}>
      <div className="qcard-head" onClick={() => setOpen(o => !o)}>
        <div className="q-ico" data-done={answered || undefined}>
          {answered ? <Check /> : <ListChecks />}
        </div>
        <div className="grow stack g2" style={{ minWidth: 0 }}>
          <span className="t-sm w-med">{task.question || 'Untitled question'}</span>
          <span className="t-xs c-muted2">
            {TASK_META[task.kind].label} · {task.points} pts{task.required ? ' · required' : ''}
          </span>
        </div>
        <ChevronDown className="q-chev" data-open={open || undefined} />
      </div>

      {open && (
        <div className="qcard-body stack g10">
          {task.hint && <span className="hint">{task.hint}</span>}

          {task.refVideoUrl && (
            <a className="btn ghost sm" href={task.refVideoUrl} target="_blank" rel="noreferrer">
              <PlayCircle />Watch the reference video
            </a>
          )}

          {(task.kind === 'mcq' || task.kind === 'multi') && (
            <div className="stack g6">
              {task.options.map(o => (
                <button key={o.id} type="button" className="opt-pick" disabled={locked || busy}
                  data-on={choice.includes(o.id)} onClick={() => toggle(o.id)}>
                  <span className="tick" data-multi={task.kind === 'multi' || undefined}>
                    {choice.includes(o.id) && <Check />}
                  </span>
                  <span className="t-sm">{o.text}</span>
                </button>
              ))}
            </div>
          )}

          {(task.kind === 'short' || task.kind === 'link') && (
            <input className="inp" value={text} onChange={e => setText(e.target.value)} disabled={locked || busy}
              placeholder={task.kind === 'link' ? 'https://…' : 'Your answer'} />
          )}

          {task.kind === 'long' && (
            <textarea className="ta" value={text} onChange={e => setText(e.target.value)} disabled={locked || busy}
              placeholder="Write your answer" />
          )}

          {/* A picture of the work, and what the student says about it. */}
          {imageText && (
            <div className="stack g8">
              <textarea className="ta" value={text} onChange={e => setText(e.target.value)}
                disabled={locked || busy}
                placeholder="What did you do, and what would you change next time?" />
              {!locked && (
                <div className="dropzone"
                  onClick={() => void pickImage()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}>
                  <ImagePlus style={{ width: 20, height: 20 }} />
                  <span className="t-sm">{file ? file.name : 'Add a picture of your work'}</span>
                  <span className="t-xs c-muted2">
                    {file ? `${bytes(file.size)} · ready to send` : 'A photo or a screenshot'}
                  </span>
                </div>
              )}
            </div>
          )}

          {task.kind === 'upload' && (live ? (
            !locked && (
              <div className="dropzone"
                onClick={() => void pickUpload()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}>
                <Upload style={{ width: 20, height: 20 }} />
                <span className="t-sm">{file ? file.name : 'Drop your file here, or click to pick one'}</span>
                <span className="t-xs c-muted2">
                  {file ? `${bytes(file.size)} · ready to send` : 'PDF, Office, images or a ZIP · up to 25 MB'}
                </span>
              </div>
            )
          ) : (
            <div className="dropzone" onClick={() => void submit()}>
              <Upload style={{ width: 20, height: 20 }} />
              <span className="t-sm">Drop your file here, or click to pick one</span>
              <span className="t-xs c-muted2">Source file plus the export your client would open</span>
            </div>
          ))}

          {live && sub && (
            <div className="stack g4" role="status">
              {choiceTask ? (
                <Badge tone={sub.is_correct ? 'teal' : 'rose'}>
                  {sub.is_correct ? <CheckCircle2 /> : <X />}
                  {sub.is_correct ? 'Correct' : 'Not quite'} · {Number(sub.score ?? 0)}/{sub.points}
                </Badge>
              ) : graded ? (
                <Badge tone="teal"><CheckCircle2 />Reviewed · {Number(sub.score ?? 0)}/{sub.points}</Badge>
              ) : (
                <Badge tone="sky"><Clock />Sent · waiting for your mentor</Badge>
              )}
              {sub.feedback && <span className="t-sm c-ink2" style={{ lineHeight: 1.6 }}>{sub.feedback}</span>}
              {sub.file_path && (
                <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }}
                  onClick={() => openFile(sub.file_path!, 'submissions').catch(e => toast(toMessage(e), 'err'))}>
                  <ExternalLink />Your file
                </button>
              )}
            </div>
          )}

          <div className="row g8">
            {live ? (
              <button className="btn primary sm" disabled={!canSubmit || locked || busy} onClick={() => void submit()}>
                {busy ? 'Sending…'
                  : choiceTask ? (sub ? <><Check />Answered</> : 'Submit answer')
                  : graded ? <><Check />Reviewed</>
                  : sub ? 'Send again' : 'Submit'}
              </button>
            ) : (
              <button className="btn primary sm" disabled={!canSubmit || answered} onClick={() => void submit()}>
                {answered ? <><Check />Sent to your mentor</> : 'Submit'}
              </button>
            )}
            <span className="t-xs c-muted2">
              {live && choiceTask ? 'One try — marked straight away.' : 'Mentor review target is 72 hours.'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- one step's header ---------------- */

const STEP_ICON: Record<StepType, JSX.Element> = {
  video: <PlayCircle />,
  live: <Radio />,
  technical: <Wrench />,
  branding: <Sparkles />,
  mcq: <ListChecks />,
  imagetext: <ImagePlus />,
  material: <FileText />,
}

function StepHead({ index, type, sub, done, onToggle }: {
  index: number
  type: StepType
  sub: string
  done: boolean
  onToggle: () => void
}) {
  return (
    <div className="step-head">
      <span className="step-num tnum">{index}</span>
      <Badge tone={STEP_TYPE_META[type].tone}>{STEP_ICON[type]}{STEP_TYPE_META[type].label}</Badge>
      <span className="grow t-xs c-muted2 truncate">{sub}</span>
      {/* A toggle, not a one-way door — ticking the wrong step should not
          be permanent. */}
      <button className="step-done" data-on={done || undefined} onClick={onToggle}
        aria-label={done ? 'Mark not done' : 'Mark done'} title={done ? 'Done' : 'Mark done'}>
        <Check />
      </button>
    </div>
  )
}

/* ---------------- the view ---------------- */

export function SessionView() {
  const { sessionId = '' } = useParams()
  const goBack = useGoBack()
  const db = useStore(s => s.db)
  const toast = useStore(s => s.toast)
  const doneMap = useStore(s => s.done)
  const setDone = useStore(s => s.setDone)
  const { me } = useMe()

  const session = db.sessions.find(s => s.id === sessionId)
  const loop = db.loops.find(l => l.id === session?.loopId)
  const track = db.tracks.find(t => t.id === loop?.trackId)
  /* Back up the tree the session came from. */
  const areaBase = '/student/missions'
  const areaLabel = 'Missions'

  const [matOpen, setMatOpen] = useState(true)
  const [matId, setMatId] = useState('')
  const [railOpen, setRailOpen] = useState(true)
  /* Column widths the student dragged to, remembered per browser. */
  const [matW, setMatW] = usePaneSize('sv.mat')
  const [railW, setRailW] = usePaneSize('sv.rail')
  /** Topics the student folded away in the contents rail. */
  const [openT, setOpenT] = useState<Set<string>>(() => new Set())
  const toggleTopic = (id: string) => setOpenT(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const [learnOpen, setLearnOpen] = useState(false)
  const [answered, setAnswered] = useState<Set<string>>(() => new Set())
  const [activeKey, setActiveKey] = useState('')
  const mainRef = useRef<HTMLElement>(null)

  const titles = session?.titles ?? []
  const byTitle = useMemo(() => new Map(titles.map(t => [t.id, t])), [titles])

  /* The sequence the mentor arranged: video, file and question interleaved
     however this session actually teaches. It is the only running order. */
  const steps = useMemo(() => (session ? sessionFlow(session) : []), [session])

  /** Files in sequence order, so the workbook's pills read the same way. A
   *  live step is a class, not something to open in the workbook, and a
   *  recording is watched where it sits rather than opened beside itself. */
  const files = useMemo<FileRef[]>(() => steps.flatMap(s => {
    if (s.kind !== 'material' || s.type === 'live') return []
    const t = byTitle.get(s.titleId)
    const m = t?.materials.find(x => x.id === s.refId)
    return t && m && !isClip(m) ? [{ material: m, title: t }] : []
  }), [steps, byTitle])

  /* The contents rail, grouped by topic. Steps keep their number in the
     running order, so a hand-arranged session that jumps between topics
     still shows which one comes next. */
  const groups = useMemo(() => titles
    .map(t => ({
      title: t,
      items: steps.map((step, i) => ({ step, i })).filter(x => x.step.titleId === t.id),
    }))
    .filter(g => g.items.length > 0), [titles, steps])

  /* An accordion: topics start folded, and the one the student moves into
     opens by itself. Every topic folds on click — including the current one. */
  useEffect(() => {
    const id = steps.find(s => s.key === activeKey)?.titleId
    if (id) setOpenT(s => (s.has(id) ? s : new Set(s).add(id)))
  }, [activeKey, steps])

  /* Progress is held in the store, not in this component, so the Missions
     slicer and this rail read the same ticks. */
  const done = useMemo(() => new Set(doneMap[sessionId] ?? []), [doneMap, sessionId])
  const doneCount = steps.filter(s => done.has(s.key)).length

  useEffect(() => {
    setMatId('')
    setAnswered(new Set())
  }, [sessionId])

  /* Opening a session lands on the first step not yet finished, so coming back
     resumes rather than restarting. Progress is read once here rather than
     tracked, or ticking a step would bounce the student to the next one.
     The store is re-read on focus and on every notice, which rebuilds the
     steps — the step on screen stays put unless it no longer exists. */
  const landedOn = useRef('')
  useEffect(() => {
    if (landedOn.current === sessionId && steps.some(s => s.key === activeKey)) return
    if (steps.length === 0) return
    landedOn.current = sessionId
    const hit = useStore.getState().done[sessionId] ?? []
    const next = steps.find(s => !hit.includes(s.key)) ?? steps[0]
    setActiveKey(next?.key ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, steps])

  /* A new step is a new page, so it starts at the top. */
  useEffect(() => {
    const main = mainRef.current
    if (main) main.scrollTop = 0
  }, [activeKey])

  if (!session || !isOpen(session) || courseLocked(track, loop)) {
    return (
      <div className="page">
        <Empty
          icon={<Lock />}
          title={session ? (courseLocked(track, loop) ? 'This course is locked' : 'This session is not open yet') : 'Session not found'}
          action={<BackLink className="btn" to={areaBase}>Back to {areaLabel.toLowerCase()}</BackLink>}
        />
      </div>
    )
  }

  const backTo = track && loop ? `${areaBase}/${track.id}/${loop.id}` : areaBase
  const openFileId = matId || files[0]?.material.id || ''
  const matShown = matOpen && files.length > 0

  /* The one step on screen. Everything else in the session is reachable from
     the contents rail, not stacked underneath it. */
  const at = Math.max(0, steps.findIndex(s => s.key === activeKey))
  const step = steps[at]
  const topic = step ? byTitle.get(step.titleId) : undefined
  const stepDone = step ? done.has(step.key) : false
  const stepFile = step?.kind === 'material'
    ? topic?.materials.find(x => x.id === step.refId) : undefined
  const stepTask = step?.kind === 'task'
    ? topic?.tasks.find(x => x.id === step.refId) : undefined

  const label = (step: Step) => {
    const t = byTitle.get(step.titleId)
    if (step.kind === 'video') return t?.video?.name || t?.name || 'Recording'
    if (step.kind === 'material') return t?.materials.find(m => m.id === step.refId)?.name || 'File'
    return t?.tasks.find(k => k.id === step.refId)?.question || 'Question'
  }

  /** Swaps the middle column for that step — nothing else is on screen. */
  const jump = (key: string) => setActiveKey(key)

  const finish = () => {
    toast(doneCount === steps.length && steps.length > 0
      ? 'Session complete — nice work'
      : 'Progress saved')
    goBack(backTo)
  }

  return (
    <div className="page flush sv">
      <header className="sv-head">
        <div className="row g10 wrap mb8">
          <BackLink to={backTo} className="btn ghost sm">
            <ArrowLeft />Back to {loop?.name ?? 'course'}
          </BackLink>
          <span className="auto-s row g8">
            {session.type === 'live' && <Badge tone="rose"><Radio />Live session</Badge>}
            <Badge tone="line"><ListChecks />{steps.length} step{steps.length === 1 ? '' : 's'}</Badge>
            <Badge tone="line"><Clock />{mins(sessionMinutes(session))}</Badge>
            {files.length > 0 && (
              <button className="btn sm" data-on={matShown} onClick={() => setMatOpen(o => !o)}>
                <FileText />{matShown ? 'Hide material' : 'Material'}
              </button>
            )}
          </span>
        </div>

        {track && loop && (
          <Crumbs trail={[
            { label: areaLabel, to: areaBase },
            { label: track.name, to: `${areaBase}/${track.id}` },
            { label: loop.name, to: backTo },
            { label: session.name },
          ]} />
        )}

        <h1 className="t-2xl w-sb">{session.name}</h1>

        <button className="learn-toggle" onClick={() => setLearnOpen(o => !o)} aria-expanded={learnOpen}>
          What you'll learn
          <ChevronDown data-open={learnOpen || undefined} />
        </button>
        {learnOpen && (
          <div className="learn-body">
            <p className="t-sm c-muted mb8">{session.summary}</p>
            <ol className="learn-list">
              {titles.map(t => (
                <li key={t.id}>
                  <span className="t-sm w-med">
                    {t.name}
                    {/* A project is work to hand in, not a lecture — worth
                        saying before the student starts the session. */}
                    {titleKind(t) === 'project' && (
                      <Badge tone="teal" style={{ marginLeft: 6 }}>Project</Badge>
                    )}
                  </span>
                  <span className="t-xs c-muted2">{mins(t.estimatedMin)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </header>

      <div className="sv-body" data-mat={matShown || undefined} data-rail={railOpen || undefined}
        style={{
          ...(matW ? { '--mat-w': matW + 'px' } : {}),
          ...(railW ? { '--rail-w': railW + 'px' } : {}),
        } as React.CSSProperties}>
        {matShown && (
          <MaterialPanel
            session={session}
            files={files}
            activeId={openFileId}
            onActive={setMatId}
            watermark={me.name}
            onClose={() => setMatOpen(false)}
          />
        )}
        {matShown && (
          <Splitter side="before" min={280} max={900} label="Resize material"
            onChange={setMatW} onReset={() => setMatW(undefined)} />
        )}

        <main className="sv-main" id="sv-main" ref={mainRef}>
          {!step || !topic ? (
            <Empty icon={<VideoIcon />} title="This session has nothing in it yet" />
          ) : (
            <div className="sv-main-inner stack g20">
              <section key={step.key} className="sv-step stack g10">
                <StepHead
                  index={at + 1}
                  type={step.type}
                  sub={`${titleLabel(titles, topic.id)} · ${topic.name}`}
                  done={stepDone}
                  onToggle={() => setDone(sessionId, step.key, !stepDone)}
                />

                {step.kind === 'video' && (
                  <>
                    <h2 className="t-xl w-sb">{topic.video?.name || topic.name}</h2>
                    <Player title={topic} sessionId={sessionId}
                      onEnded={() => setDone(sessionId, step.key, true)} />
                    {topic.summary && (
                      <p className="t-sm c-muted" style={{ lineHeight: 1.7 }}>{topic.summary}</p>
                    )}
                  </>
                )}

                {/* A live step is a class, not a file: when it is, and the
                    link that gets the student into the room. */}
                {step.kind === 'material' && stepFile && step.type === 'live' && (
                  <div className="card stack g10" style={{ padding: 14 }}>
                    <div className="row g10 wrap">
                      <Badge tone="rose"><Radio />Live session</Badge>
                      {stepFile.startsAt && (
                        <Badge tone="line">
                          <Clock />{new Date(stepFile.startsAt).toLocaleString()}
                        </Badge>
                      )}
                      {stepFile.durationMin ? <Badge tone="line">{mins(stepFile.durationMin)}</Badge> : null}
                    </div>
                    <h2 className="t-lg w-sb">{stepFile.name || 'Live session'}</h2>
                    {stepFile.note && (
                      <p className="t-sm c-muted" style={{ lineHeight: 1.7 }}>{stepFile.note}</p>
                    )}
                    {stepFile.url ? (
                      <a className="btn primary" style={{ alignSelf: 'flex-start' }}
                        href={stepFile.url} target="_blank" rel="noreferrer"
                        onClick={() => setDone(sessionId, step.key, true)}>
                        <Radio />Join the class<ExternalLink />
                      </a>
                    ) : (
                      <span className="t-sm c-muted2">Your mentor has not posted the link yet.</span>
                    )}
                  </div>
                )}

                {/* An extra recording — a project's steps are one each. A
                    topic's own video is `step.kind === 'video'` above; this
                    is the other place a recording lives, and it plays here
                    rather than opening as a file, because a file panel is
                    not a thing you can watch. */}
                {step.kind === 'material' && stepFile && isClip(stepFile) && step.type !== 'live' && (
                  <div className="stack g10">
                    <h2 className="t-xl w-sb">{stepFile.name}</h2>
                    {stepFile.url ? (
                      <VideoEmbed url={stepFile.url} title={stepFile.name} />
                    ) : (
                      <div className="card" style={{ padding: 14 }}>
                        <span className="t-sm c-muted2">
                          Your mentor has not posted this recording yet.
                        </span>
                      </div>
                    )}
                    {stepFile.note && (
                      <p className="t-sm c-muted" style={{ lineHeight: 1.7 }}>{stepFile.note}</p>
                    )}
                  </div>
                )}

                {/* The file opens in the workbook beside the video rather than
                    inline, so it can be read while the recording plays and
                    drawn on. */}
                {step.kind === 'material' && stepFile && !isClip(stepFile) && step.type !== 'live' && (
                  <button className="sv-file"
                    data-on={(matShown && openFileId === stepFile.id) || undefined}
                    onClick={() => {
                      if (backendLive && stepFile.url) openMaterial(stepFile.url)
                      setMatOpen(true)
                      setMatId(stepFile.id)
                      setDone(sessionId, step.key, true)
                    }}>
                    <span className="mat-ico" style={{
                      background: 'var(--sky-100)', color: 'var(--sky-600)',
                    }}>
                      <FileText />
                    </span>
                    <span className="grow stack g2" style={{ minWidth: 0 }}>
                      <span className="t-sm w-med truncate">{stepFile.name}</span>
                      <span className="t-xs c-muted2 truncate">
                        {MATERIAL_META[stepFile.kind].label}
                        {stepFile.size ? ` · ${bytes(stepFile.size)}` : ''} · {backendLive ? 'opens in a new tab' : 'opens in the workbook'}
                      </span>
                    </span>
                    <span className="btn sm">
                      {matShown && openFileId === stepFile.id ? 'Showing' : 'Open it'}
                    </span>
                  </button>
                )}

                {step.kind === 'task' && stepTask && (
                  <TaskCard
                    key={stepTask.id}
                    task={stepTask}
                    sessionId={sessionId}
                    answered={answered.has(stepTask.id)}
                    onAnswer={() => {
                      setAnswered(a => new Set(a).add(stepTask.id))
                      setDone(sessionId, step.key, true)
                    }}
                  />
                )}
              </section>

              <div className="sv-foot">
                <button className="btn ghost sm" disabled={at === 0}
                  onClick={() => jump(steps[at - 1].key)}>
                  <ArrowLeft />Previous
                </button>
                <span className="t-xs c-muted2 auto-s sv-foot-count">
                  Step {at + 1} of {steps.length} · {doneCount} done
                </span>
                {/* Next only moves — ticking a step stays the student's call,
                    apart from the ones they plainly did (watched, opened, sent). */}
                {at < steps.length - 1 ? (
                  <button className="btn primary" onClick={() => jump(steps[at + 1].key)}>
                    Next step<ArrowRight />
                  </button>
                ) : (
                  <button className="btn primary" onClick={finish}>
                    Finish session<ArrowRight />
                  </button>
                )}
              </div>
            </div>
          )}
        </main>

        {railOpen && (
          <Splitter side="after" min={64} max={420} label="Resize contents"
            onChange={setRailW} onReset={() => setRailW(undefined)} />
        )}
        <aside className="sv-rail" data-open={railOpen || undefined}>
          <button className="rail-collapse" onClick={() => setRailOpen(o => !o)}
            aria-label={railOpen ? 'Collapse contents' : 'Expand contents'}>
            {railOpen ? <ChevronRight /> : <ChevronLeft />}
          </button>

          {railOpen && (
            <>
              <div className="rail-head">
                <span className="eyebrow">Contents</span>
                {groups.length > 1 && (() => {
                  const all = groups.every(g => openT.has(g.title.id))
                  return (
                    <button className="rail-fold" onClick={() =>
                      setOpenT(all ? new Set() : new Set(groups.map(g => g.title.id)))}>
                      {all ? 'Collapse all' : 'Expand all'}
                    </button>
                  )
                })()}
              </div>
              <div className="stack g6 grow" style={{ overflowY: 'auto' }}>
                {groups.map(({ title: t, items }) => {
                  const hit = items.filter(x => done.has(x.step.key)).length
                  const here = items.some(x => x.step.key === activeKey)
                  const open = openT.has(t.id)
                  return (
                    <div key={t.id} className="rail-group" data-here={here || undefined}>
                      <button
                        className="rail-topic"
                        aria-expanded={open}
                        onClick={() => toggleTopic(t.id)}
                        title={t.name}
                      >
                        <ChevronDown className="chev" data-open={open || undefined} />
                        <span className="grow stack" style={{ minWidth: 0 }}>
                          <span className="eyebrow" data-kind={titleKind(t)}>{titleLabel(titles, t.id)}</span>
                          <span className="t-sm w-sb truncate">
                            {t.name || TITLE_KIND_META[titleKind(t)].blank}
                          </span>
                        </span>
                        <span className="rail-topic-count tnum" data-done={hit === items.length || undefined}>
                          {hit === items.length ? <Check /> : null}{hit}/{items.length}
                        </span>
                      </button>

                      {open && (
                        <div className="rail-group-items">
                          {items.map(({ step, i }) => (
                            <button
                              key={step.key}
                              className="rail-row"
                              data-on={step.key === activeKey}
                              onClick={() => jump(step.key)}
                              title={label(step)}
                            >
                              <span className="step-num tnum">{i + 1}</span>
                              <span className="ico">{STEP_ICON[step.type]}</span>
                              <span className="grow truncate t-sm">{label(step)}</span>
                              {done.has(step.key) && <Check className="tick-done" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="rail-progress">
                <div className="meter teal">
                  <i style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }} />
                </div>
                <span className="t-xs c-muted2">{doneCount} of {steps.length} steps done</span>
              </div>
            </>
          )}

          {!railOpen && (
            <div className="stack g4" style={{ alignItems: 'center', overflowY: 'auto' }}>
              {groups.map(({ title: t, items }, gi) => (
                <div key={t.id} className="stack g4" style={{ alignItems: 'center' }}>
                  {/* a rule between topics keeps the grouping when folded to icons */}
                  {gi > 0 && <span className="rail-sep" aria-hidden />}
                  {/* T1 / P1 — folded to icons there is only room for a letter. */}
                  <span className="rail-dot-topic tnum" data-kind={titleKind(t)}
                    title={`${titleLabel(titles, t.id)} · ${t.name}`}>
                    {TITLE_KIND_META[titleKind(t)].one[0]}{titleNumber(titles, t.id)}
                  </span>
                  {items.map(({ step }) => (
                    <button key={step.key} className="rail-dot" data-on={step.key === activeKey}
                      title={label(step)} aria-label={label(step)} onClick={() => jump(step.key)}>
                      {done.has(step.key) ? <CheckCircle2 /> : STEP_ICON[step.type]}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
