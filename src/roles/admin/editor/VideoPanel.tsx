import { useState } from 'react'
import {
  Captions, CheckCircle2, ChevronDown, Link2, Loader2, Play, RefreshCw, Trash2, UploadCloud,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { Badge, Field, Switch } from '@/components/ui'
import { duration } from '@/lib/format'
import { videoChecks, type Session, type Title, type VideoAsset } from '@/lib/types'
import { backendLive } from '@/lib/supabase'
import { PanelNote } from './SessionEditor'
import { VideoChecks } from './VideoChecks'

/* Connected to the server there is no video upload pipeline yet: a
   recording is a YouTube (unlisted), Vimeo or Google Drive link. */
const PROVIDERS: Array<[VideoAsset['provider'], string]> = ([
  ['upload', 'Uploaded file'],
  ['youtube', 'YouTube'],
  ['vimeo', 'Vimeo'],
  ['drive', 'Google Drive'],
] as Array<[VideoAsset['provider'], string]>).filter(([p]) => !backendLive || p !== 'upload')

const THUMBS = [
  'linear-gradient(135deg,#4F3BD9,#8574F0)',
  'linear-gradient(135deg,#C07A0B,#F5C978)',
  'linear-gradient(135deg,#0C7367,#38C6B2)',
  'linear-gradient(135deg,#B41B41,#F2678A)',
  'linear-gradient(135deg,#1F6AAE,#61AEEC)',
]

export function VideoPanel({ session, title }: { session: Session; title: Title }) {
  const updateTitle = useStore(s => s.updateTitle)
  const toast = useStore(s => s.toast)
  const [over, setOver] = useState(false)
  /* The details are written once and then in the way: the panel opens with
     them folded, and the checkpoints below stay in reach. */
  const [details, setDetails] = useState(false)
  const v = title.video

  const setVideo = (patch: Partial<VideoAsset> | null) => {
    if (patch === null) { updateTitle(session.id, title.id, { video: null }); return }
    updateTitle(session.id, title.id, {
      video: {
        provider: 'upload', url: '', durationSec: 0, captions: false,
        state: 'ready', thumbnail: THUMBS[title.order % THUMBS.length],
        ...v, ...patch,
      },
    })
  }

  /* Dev stage: "attaching" is instant — this is a UI/workflow build, not a
     transcoding pipeline. The processing state is still modelled so the
     publish gate can be designed against it. */
  const attach = (provider: VideoAsset['provider']) => {
    setVideo({
      provider,
      url: provider === 'upload'
        ? `https://cdn.ibsra.dev/v/${title.id}.m3u8`
        : '',
      durationSec: provider === 'upload' ? 11 * 60 + 24 : 0,
      state: 'ready',
      thumbnail: THUMBS[title.order % THUMBS.length],
    })
    toast('Recording attached to this topic')
  }

  if (!v) {
    return (
      <div className="stack g16">
        {backendLive ? (
          <div className="stack g4">
            <span className="t-md w-sb">Link the recording</span>
            <span className="t-sm c-muted2">
              Upload it to YouTube (unlisted), Vimeo or Google Drive, pick where it lives, then paste its link.
            </span>
          </div>
        ) : (
          <>
            <div
              className="dropzone"
              data-over={over}
              onDragOver={e => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); attach('upload') }}
              onClick={() => attach('upload')}
            >
              <UploadCloud style={{ width: 26, height: 26 }} />
              <div className="stack g2">
                <span className="t-md w-sb" style={{ color: 'var(--ink)' }}>Drop the recording here</span>
                <span className="t-sm c-muted2">MP4 or MOV up to 4 GB · or click to pick a file</span>
              </div>
            </div>

            <div className="row g10">
              <div className="sep grow" />
              <span className="t-xs c-muted2">or link an existing one</span>
              <div className="sep grow" />
            </div>
          </>
        )}

        <div className="row g8 wrap">
          {PROVIDERS.filter(([p]) => p !== 'upload').map(([p, label]) => (
            <button key={p} className="btn grow" onClick={() => attach(p)}>
              <Link2 />{label}
            </button>
          ))}
        </div>

        <PanelNote>
          A topic without a recording blocks the whole session from publishing. That gate is
          deliberate — a published session should never open on an empty player.
        </PanelNote>
      </div>
    )
  }

  const processing = v.state === 'processing'
  const checks = videoChecks(v)

  return (
    <div className="stack g16">
      <div className="video-frame">
        <div className="bg" style={{ background: v.thumbnail }} />
        {processing ? (
          <div className="stack g10" style={{ alignItems: 'center', position: 'relative', color: '#fff' }}>
            <Loader2 className="spin" style={{ width: 24, height: 24 }} />
            <span className="t-sm">Processing · usually 3–6 minutes</span>
          </div>
        ) : (
          <button className="play" aria-label="Preview"
            onClick={() => (backendLive && /^https?:\/\//.test(v.url)
              ? window.open(v.url, '_blank', 'noopener')
              : toast(backendLive ? 'Paste the video link below first' : 'Player preview is stage 2 — the pipeline is not wired yet', 'info'))}>
            <Play fill="currentColor" />
          </button>
        )}
        {!processing && v.durationSec > 0 && <span className="dur">{duration(v.durationSec)}</span>}
      </div>

      <div className="row g8 wrap">
        <Badge tone={processing ? 'gold' : 'teal'} dot>
          {processing ? 'Processing' : v.state === 'failed' ? 'Failed' : 'Ready'}
        </Badge>
        <Badge tone="line">{PROVIDERS.find(p => p[0] === v.provider)?.[1] ?? v.provider}</Badge>
        {backendLive && !v.url && <Badge tone="gold">No link yet</Badge>}
        {v.captions
          ? <Badge tone="sky"><Captions />Captions on</Badge>
          : <Badge tone="line"><Captions />No captions</Badge>}
        {checks.length > 0 && (
          <Badge tone="brand">
            {checks.length} checkpoint{checks.length === 1 ? '' : 's'}
          </Badge>
        )}
        <span className="auto-s row g6">
          {processing && (
            <button className="btn sm" onClick={() => setVideo({ state: 'ready' })}>
              <CheckCircle2 />Mark ready
            </button>
          )}
          <button className="btn sm" onClick={() => attach(v.provider)}><RefreshCw />Replace</button>
          <button className="btn sm danger" onClick={() => setVideo(null)}><Trash2 />Remove</button>
        </span>
      </div>

      <section className="card">
        <div className="card-head" style={{ cursor: 'pointer' }}
          onClick={() => setDetails(d => !d)}>
          <div className="stack g2 grow" style={{ minWidth: 0 }}>
            <h2 className="t-md w-sb">Recording details</h2>
            {!details && (
              <span className="hint clamp2">
                {v.name?.trim() || 'Unnamed'} · {PROVIDERS.find(p => p[0] === v.provider)?.[1] ?? v.provider}
                {v.captions ? ' · captions on' : ''}
              </span>
            )}
          </div>
          <button className="btn ghost icon sm" aria-label={details ? 'Fold the details' : 'Open the details'}
            aria-expanded={details} onClick={e => { e.stopPropagation(); setDetails(d => !d) }}>
            <ChevronDown style={{
              transform: details ? 'rotate(180deg)' : undefined,
              transition: 'transform var(--fast)',
            }} />
          </button>
        </div>
        {details && (
        <div className="card-body stack g16">
          <Field label="Name">
            <input className="inp" value={v.name ?? ''} placeholder="e.g. Setting your first target"
              onChange={e => setVideo({ name: e.target.value })} />
          </Field>

          <Field label="Source">
            <select className="sel" value={v.provider}
              onChange={e => setVideo({ provider: e.target.value as VideoAsset['provider'] })}>
              {PROVIDERS.map(([p, label]) => <option key={p} value={p}>{label}</option>)}
            </select>
          </Field>

          <Field label={v.provider === 'upload' ? 'File URL' : 'Video URL'}
>
            <input className="inp mono" value={v.url} placeholder="https://…"
              onChange={e => setVideo({ url: e.target.value })} />
          </Field>

          <div className="row g10" style={{
            padding: '10px 12px', border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)', background: 'var(--surface-2)',
          }}>
            <Switch on={v.captions} onChange={c => setVideo({ captions: c })} label="Captions" />
            <div className="stack g2 grow">
              <span className="t-sm w-med">Arabic + English captions attached</span>
              <span className="hint">
                Most of this audience watches on a phone with the sound off. Treat captions as
                part of the recording, not an extra.
              </span>
            </div>
          </div>
        </div>
        )}
      </section>

      <VideoChecks video={v} onChange={checks => setVideo({ checks })} />
    </div>
  )
}
