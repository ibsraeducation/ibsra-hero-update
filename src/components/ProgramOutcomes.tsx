import { useState } from 'react'
import { Outline } from '@/components/Outline'
import { ProgramTabs } from '@/components/ProgramTabs'
import { countPoints, parseOutline, type OutlineNode } from '@/lib/outline'
import { listText, PROGRAM_LISTS, type ListKey } from '@/lib/programInfo'
import type { ValueLists } from '@/lib/types'

/* A program's values and skills, one tab each — only the tabs with something
   in them — as bullets and sub-bullets from their Markdown. Shows nothing for
   a program that has none of these. */
export function ProgramOutcomes({ track }: { track: ValueLists }) {
  const [tab, setTab] = useState<ListKey>('technical')

  const nodes = {} as Record<ListKey, OutlineNode[]>
  const counts: Partial<Record<ListKey, number>> = {}
  for (const l of PROGRAM_LISTS) {
    nodes[l.key] = parseOutline(listText(track, l.key))
    counts[l.key] = countPoints(nodes[l.key]) || nodes[l.key].length
  }

  const filled = PROGRAM_LISTS.map(l => l.key).filter(key => (counts[key] ?? 0) > 0)
  if (!filled.length) return null
  const shown = filled.includes(tab) ? tab : filled[0]

  return (
    <div className="card mb16">
      <div className="card-body stack g12">
        <ProgramTabs value={shown} onChange={setTab} counts={counts} hideEmpty />
        <Outline nodes={nodes[shown]} />
      </div>
    </div>
  )
}
