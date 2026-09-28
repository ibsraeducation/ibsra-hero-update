/* ==========================================================================
   "What it covers" — the admin's own tabs.

   Add a tab, name it, write its bullets. That is the whole form: the tab
   names and the bullets are what a family reads when they enrol, in exactly
   these tabs (see EnrollDialog).

   What is saved is still one Markdown document — `## name` per tab — so
   nothing downstream has to know this editor exists, and an outline written
   by hand before it did opens here as tabs (see lib/covers).
   ========================================================================== */

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { TabScroller } from '@/components/TabScroller'
import { coversToMarkdown, coversVideos, newSection, parseCovers, type CoverSection } from '@/lib/covers'
import { countPoints, parseOutline } from '@/lib/outline'
import { OutlineEditor } from './OutlineEditor'
import { VideoField } from './VideoField'
import './programForm.css'

const BODY_EXAMPLE = [
  '- Reads a circuit diagram',
  '  - Ohm’s law',
  '  - Series and parallel',
  '- Solders a clean joint',
].join('\n')

export function CoversEditor({ value, videos, onChange, noun = 'program' }: {
  value: string
  /** One video per tab, in tab order — see `TabVideos.covers`. */
  videos: string[]
  onChange: (md: string, videos: string[]) => void
  /** "program" or "course" — only used in the empty state's wording. */
  noun?: string
}) {
  /* The tabs are this editor's own state: the document is written out on
     every change, never read back, so nothing the admin is typing is
     re-parsed underneath them. */
  const [tabs, setTabs] = useState<CoverSection[]>(() => {
    const parsed = parseCovers(value, videos)
    return parsed.length ? parsed : [newSection()]
  })
  const [sel, setSel] = useState(() => tabs[0].id)

  const current = tabs.find(t => t.id === sel) ?? tabs[0]

  const write = (next: CoverSection[]) => {
    setTabs(next)
    onChange(coversToMarkdown(next), coversVideos(next))
  }

  const patch = (id: string, part: Partial<CoverSection>) =>
    write(tabs.map(t => (t.id === id ? { ...t, ...part } : t)))

  const add = () => {
    const born = newSection()
    write([...tabs, born])
    setSel(born.id)
  }

  const remove = () => {
    if (tabs.length === 1) {
      /* The last tab is emptied rather than removed: an editor with no tab
         at all has nothing to type into. */
      write([{ ...tabs[0], name: '', body: '' }])
      return
    }
    const at = tabs.findIndex(t => t.id === sel)
    const next = tabs.filter(t => t.id !== sel)
    write(next)
    setSel(next[Math.min(at, next.length - 1)].id)
  }

  return (
    <div className="cv">
      <div className="ptabs cv-bar">
        <TabScroller activeKey={sel}>
          <div className="tabs" role="tablist">
            {tabs.map(t => {
              const name = t.name.trim()
              return (
                <button key={t.id} role="tab" className="tab" data-on={t.id === sel}
                  title={name || 'Untitled tab'} onClick={() => setSel(t.id)}>
                  <span className="tab-label">{name || 'Untitled tab'}</span>
                  <span className="cnt tnum">{countPoints(parseOutline(t.body))}</span>
                </button>
              )
            })}
          </div>
          <button type="button" className="cv-add" onClick={add}><Plus />Add tab</button>
        </TabScroller>
      </div>

      <div className="cv-head">
        <input
          className="inp"
          value={current.name}
          placeholder="Tab name — e.g. Electronics"
          aria-label="Tab name"
          onChange={e => patch(current.id, { name: e.target.value })}
        />
        <button type="button" className="btn sm ghost" style={{ color: 'var(--rose-600)' }}
          title={tabs.length === 1 ? 'Clear this tab' : 'Remove this tab'} onClick={remove}>
          <Trash2 />{tabs.length === 1 ? 'Clear' : 'Remove tab'}
        </button>
      </div>

      {/* The same field as the introduction video on About — one video
         control in the whole form. Left empty, the introduction plays. */}
      <VideoField label="Video for this tab" value={current.video}
        onChange={v => patch(current.id, { video: v })} />

      <OutlineEditor
        fill
        key={current.id}
        label={current.name.trim() || `What this ${noun} covers`}
        placeholder={BODY_EXAMPLE}
        value={current.body}
        onChange={md => patch(current.id, { body: md })}
      />
    </div>
  )
}
