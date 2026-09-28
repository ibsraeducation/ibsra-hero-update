/* ==========================================================================
   The fields a program, a course and a session share.

   One shape for all three, on purpose: the admin learns the form once. It
   is the program form's block — a price, and the seven "values and skills"
   lists as tabs over one outline editor with a greyed example — lifted out
   so the course form and the session editor render the very same thing
   rather than a resemblance of it.

   The lists are held as raw Markdown while the form is open, and cleaned
   once on save (`savedLists`), which also fills `skills` from the three
   skill tabs — exactly what the program form has always done.
   ========================================================================== */

import { useRef, useState } from 'react'
import { Field } from '@/components/ui'
import { ProgramTabs } from '@/components/ProgramTabs'
import { cleanList, listText, PROGRAM_LISTS, skillsFromLists, type ListKey } from '@/lib/programInfo'
import { countPoints, parseOutline } from '@/lib/outline'
import type { TrackSkill, ValueLists } from '@/lib/types'
import { OutlineEditor } from './OutlineEditor'
import { VideoField } from './VideoField'

export type Lists = Record<ListKey, string>

/** The seven lists as the form starts with them: what was saved, or nothing. */
export function listsOf(src?: ValueLists | null): Lists {
  const out = {} as Lists
  for (const l of PROGRAM_LISTS) out[l.key] = src ? listText(src, l.key) : ''
  return out
}

/** The seven lists as they go into the store, with `skills` read off the
 *  three skill tabs. */
export function savedLists(lists: Lists): ValueLists & { skills: TrackSkill[] } {
  const saved = {} as Lists
  for (const l of PROGRAM_LISTS) saved[l.key] = cleanList(lists[l.key])
  return { ...saved, skills: skillsFromLists(saved) }
}

/** A blank price box means "not for sale", never 0. */
export function priceFromInput(v: string): number | null {
  if (v.trim() === '') return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(0, n) : null
}

export const priceToInput = (egp: number | null | undefined) => (egp == null ? '' : String(egp))

/* ---------------- price ---------------- */

export function PriceField({ label, value, onChange }: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={label}>
      <input className="inp" type="number" min={0} step={50} value={value} placeholder="Not for sale"
        style={{ maxWidth: 200 }} onChange={e => onChange(e.target.value)} />
    </Field>
  )
}

/* ---------------- values and skills ---------------- */

export function ValuesFields({
  lists, onChange, label = 'Values and skills', fill = false, videos = {}, onVideosChange,
}: {
  lists: Lists
  onChange: (next: Lists) => void
  /** The heading over the tabs. `null` when the card around it already says it. */
  label?: string | null
  /** Fill the pane around it — the tabbed program and course forms. */
  fill?: boolean
  /** A video per list — see `TabVideos.lists`. Left out, no video row shows. */
  videos?: Record<string, string>
  onVideosChange?: (next: Record<string, string>) => void
}) {
  const [tab, setTab] = useState<ListKey>('technical')
  const current = PROGRAM_LISTS.find(l => l.key === tab) ?? PROGRAM_LISTS[0]

  /* One tab's count per keystroke, not seven: a keystroke changes one list,
     so the six untouched ones keep the count they already have. */
  const counted = useRef({} as Partial<Record<ListKey, { md: string; n: number }>>).current
  const counts: Partial<Record<ListKey, number>> = {}
  for (const l of PROGRAM_LISTS) {
    const md = lists[l.key]
    let hit = counted[l.key]
    if (hit?.md !== md) hit = counted[l.key] = { md, n: countPoints(parseOutline(md)) }
    counts[l.key] = hit.n
  }

  return (
    <div className={`field${fill ? ' pf-fill' : ''}`}>
      {label && <label className="label">{label}</label>}
      <ProgramTabs value={tab} onChange={setTab} counts={counts} />
      {/* The video a family watches while this tab is open; empty falls back
          to the program's own introduction video. */}
      {onVideosChange && (
        <div className="mt12">
          <VideoField label="Video for this tab"
            value={videos[current.key] ?? ''}
            onChange={v => onVideosChange({ ...videos, [current.key]: v })} />
        </div>
      )}
      <div className="mt8">
        <OutlineEditor
          key={current.key}
          label={current.tab}
          placeholder={current.placeholder}
          value={lists[current.key]}
          onChange={md => onChange({ ...lists, [current.key]: md })}
          fill={fill}
        />
      </div>
    </div>
  )
}
