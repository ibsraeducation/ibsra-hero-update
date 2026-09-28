import { useState } from 'react'
import {
  Code2, Database, ExternalLink, FileSpreadsheet, FileText, Image as ImageIcon,
  Link2, Paperclip, Plus, Presentation, Trash2, UploadCloud, Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useStore } from '@/lib/store'
import { Badge, Field, Modal } from '@/components/ui'
import { bytes } from '@/lib/format'
import { MATERIAL_META, type MaterialKind, type Session, type Title } from '@/lib/types'
import { backendLive } from '@/lib/supabase'
import { isStored, openFile, uploadMaterial } from '@/lib/api/storage'
import { toMessage } from '@/lib/api/errors'
import { PanelNote } from './SessionEditor'
import { MATERIAL_ACCEPT, pickFile } from './uploads'

const ICONS: Record<MaterialKind, LucideIcon> = {
  pdf: FileText,
  slides: Presentation,
  sheet: FileSpreadsheet,
  link: Link2,
  code: Code2,
  image: ImageIcon,
  dataset: Database,
  video: Video,
}

export function MaterialsPanel({ session, title }: { session: Session; title: Title }) {
  const addMaterial = useStore(s => s.addMaterial)
  const updateMaterial = useStore(s => s.updateMaterial)
  const deleteMaterial = useStore(s => s.deleteMaterial)
  const toast = useStore(s => s.toast)

  const [over, setOver] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')

  const [busy, setBusy] = useState(false)

  const fakeUpload = () => {
    addMaterial(session.id, title.id, {
      kind: 'pdf',
      name: 'Session workbook.pdf',
      url: `https://cdn.ibsra.dev/m/${title.id}-${Date.now().toString(36)}.pdf`,
      size: 1_240_000,
    })
    toast('Material added')
  }

  /* Live: the chosen (or dropped) file really goes to storage first. */
  const upload = async (dropped?: File | null) => {
    if (!backendLive) { fakeUpload(); return }
    if (busy) return
    const file = dropped ?? await pickFile(MATERIAL_ACCEPT)
    if (!file) return
    setBusy(true)
    try {
      const up = await uploadMaterial(session.id, file)
      addMaterial(session.id, title.id, { kind: up.kind, name: up.name, url: up.url, size: up.size })
      toast('File uploaded')
    } catch (e) {
      toast(toMessage(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const open = (url: string) => { openFile(url).catch(e => toast(toMessage(e), 'err')) }

  const addLink = () => {
    if (!linkUrl.trim()) return
    addMaterial(session.id, title.id, {
      kind: 'link',
      name: linkName.trim() || linkUrl.replace(/^https?:\/\//, '').slice(0, 40),
      url: linkUrl.trim(),
      size: 0,
    })
    setLinkOpen(false); setLinkName(''); setLinkUrl('')
    toast('Link added')
  }

  return (
    <div className="stack g16">
      <div className="row g8 wrap">
        <button className="btn primary" onClick={() => void upload()} disabled={busy}>
          <Plus />{busy ? 'Uploading…' : 'Upload file'}
        </button>
        <button className="btn" onClick={() => setLinkOpen(true)}><Link2 />Add a link</button>
        <span className="auto-s t-xs c-muted2">
          {title.materials.length} item{title.materials.length === 1 ? '' : 's'}
        </span>
      </div>

      {title.materials.length === 0 ? (
        <div
          className="dropzone"
          data-over={over}
          onDragOver={e => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files[0]) }}
          onClick={() => void upload()}
        >
          <UploadCloud style={{ width: 24, height: 24 }} />
          <div className="stack g2">
            <span className="t-md w-sb" style={{ color: 'var(--ink)' }}>No material on this topic yet</span>
            <span className="t-sm c-muted2">
              Workbook, starter files, a dataset, a reference link — whatever the student needs to build.
            </span>
          </div>
        </div>
      ) : (
        <div className="stack g8">
          {title.materials.map(m => {
            const Icon = ICONS[m.kind]
            const meta = MATERIAL_META[m.kind]
            return (
              <div key={m.id} className="mat-row">
                <div className="mat-ico" style={{
                  background: `var(--${meta.tone}-100, var(--surface-3))`,
                  color: `var(--${meta.tone}-600, var(--muted))`,
                }}>
                  <Icon />
                </div>

                <div className="grow stack g2" style={{ minWidth: 0 }}>
                  <input
                    className="inp ghost t-sm w-med"
                    value={m.name}
                    placeholder="Name this file"
                    onChange={e => updateMaterial(session.id, title.id, m.id, { name: e.target.value })}
                    style={{ height: 22, padding: '0 4px', marginInlineStart: -4 }}
                  />
                  <span className="t-xs c-muted2 truncate" style={{ paddingInlineStart: 0 }}>
                    {isStored(m.url) ? 'Uploaded file · private to enrolled students' : m.url || 'no destination set'}
                  </span>
                </div>

                <select
                  className="sel sm hide-sm" style={{ width: 108 }}
                  value={m.kind}
                  onChange={e => updateMaterial(session.id, title.id, m.id, { kind: e.target.value as MaterialKind })}
                >
                  {Object.entries(MATERIAL_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>

                <Badge tone="line" className="hide-sm">{m.size ? bytes(m.size) : 'link'}</Badge>

                {m.url && (isStored(m.url) ? (
                  <button className="btn ghost icon sm" aria-label="Open" title="Open in a new tab"
                    onClick={() => open(m.url)}><ExternalLink /></button>
                ) : (
                  <a className="btn ghost icon sm" href={m.url} target="_blank" rel="noreferrer"
                    aria-label="Open" title="Open in a new tab"><ExternalLink /></a>
                ))}
                <button className="btn ghost icon sm" aria-label="Delete"
                  onClick={() => deleteMaterial(session.id, title.id, m.id)}>
                  <Trash2 />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {title.materials.length > 0 && (
        <div
          className="dropzone" data-over={over} style={{ padding: 16 }}
          onDragOver={e => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files[0]) }}
          onClick={() => void upload()}
        >
          <span className="row g6 t-sm">
            <Paperclip style={{ width: 14, height: 14 }} />{busy ? 'Uploading…' : 'Drop another file'}
          </span>
        </div>
      )}

      <PanelNote>
        Material is optional — a topic can publish without it. The publish gate only insists on a
        recording and at least one Q&amp;A task.
      </PanelNote>

      <Modal
        open={linkOpen} onClose={() => setLinkOpen(false)}
        title="Add a link"
        description="Anything hosted elsewhere — a tool, a template, a reference board."
        footer={
          <>
            <button className="btn" onClick={() => setLinkOpen(false)}>Cancel</button>
            <button className="btn primary" onClick={addLink} disabled={!linkUrl.trim()}>Add link</button>
          </>
        }
      >
        <div className="stack g14">
          <Field label="URL">
            <input className="inp" placeholder="https://…" value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addLink() }} />
          </Field>
          <Field label="Label">
            <input className="inp" placeholder="Canva brand kit template" value={linkName}
              onChange={e => setLinkName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addLink() }} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
