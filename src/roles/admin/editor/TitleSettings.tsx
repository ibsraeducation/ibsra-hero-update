import { Copy, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { Field } from '@/components/ui'
import { TITLE_KINDS, TITLE_KIND_META, titleKind } from '@/lib/types'
import type { Session, Title, TitleKind } from '@/lib/types'

export function TitleSettings({ session, title }: { session: Session; title: Title }) {
  const update = useStore(s => s.updateTitle)
  const del = useStore(s => s.deleteTitle)
  const dup = useStore(s => s.duplicateTitle)
  const set = (patch: Partial<Title>) => update(session.id, title.id, patch)

  return (
    <div className="stack g16">
      <section className="card">
        <div className="card-head"><h2 className="t-md w-sb">Title</h2></div>
        <div className="card-body stack g16">
          {/* Changing this relabels the same box — the recording, the files
              and the questions inside it all stay where they are. */}
          <Field label="What this is">
            <select className="sel" style={{ width: 180 }} value={titleKind(title)}
              onChange={e => set({ kind: e.target.value as TitleKind })}>
              {TITLE_KINDS.map(k => (
                <option key={k} value={k}>{TITLE_KIND_META[k].one}</option>
              ))}
            </select>
          </Field>

          <Field label="Name">
            <input className="inp" value={title.name} placeholder="e.g. The 3-second hook"
              onChange={e => set({ name: e.target.value })} />
          </Field>

          <Field label="Summary">
            <textarea className="ta" rows={2} value={title.summary ?? ''}
              placeholder="What this covers and what they build afterwards."
              onChange={e => set({ summary: e.target.value })} />
          </Field>

          <Field label="Estimated student time">
            <input className="inp tnum" type="number" min={0} step={5} style={{ width: 120 }}
              value={title.estimatedMin}
              onChange={e => set({ estimatedMin: Number(e.target.value) })} />
          </Field>

          <Field label="Position">
            <select className="sel" style={{ width: 140 }} value={title.order}
              onChange={e => {
                const target = session.titles[Number(e.target.value)]
                if (target) useStore.getState().moveTitle(session.id, title.id, target.id)
              }}>
              {session.titles.map((_, i) => (
                <option key={i} value={i}>{i + 1} of {session.titles.length}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="card" style={{ borderColor: 'color-mix(in srgb, var(--rose-500) 26%, var(--line))' }}>
        <div className="card-head"><h2 className="t-md w-sb">Danger zone</h2></div>
        <div className="card-body row g10 wrap">
          <button className="btn" onClick={() => dup(session.id, title.id)}>
            <Copy />Duplicate this topic
          </button>
          <button className="btn danger" onClick={() => del(session.id, title.id)}>
            <Trash2 />Delete topic
          </button>
          <span className="hint grow" style={{ minWidth: 220 }}>
            Deleting removes its recording, {title.materials.length} material file
            {title.materials.length === 1 ? '' : 's'} and {title.tasks.length} question
            {title.tasks.length === 1 ? '' : 's'}.
          </span>
        </div>
      </section>
    </div>
  )
}
