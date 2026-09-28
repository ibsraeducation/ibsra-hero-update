/* ==========================================================================
   Pick a training program — one view, for everybody.

   The admin draws the path here and the student and their family read the
   same picture: same three columns, same cards, same lines. What differs is
   only what a card opens and what it is allowed to do — an admin's card
   carries a ⋯ and an empty column carries an "add here"; a family's carries
   neither, and a program nobody on the account has is dimmed rather than
   hidden, because that is where the path goes next.

   Keeping this in one component is the point: three copies of the map would
   be three designs to keep in step, and the columns would start disagreeing
   about which program sits where.
   ========================================================================== */

import type { ReactNode } from 'react'
import { GraduationCap } from 'lucide-react'
import { Badge } from './ui'
import { Cover, toneCover } from './Cover'
import { PickCard } from './PickCard'
import { ProgramMap } from './ProgramMap'
import { stageOf } from '@/lib/programs'
import { programBlurb, programEyebrow } from '@/lib/programInfo'
import { PROGRAM_STAGE_META, type ProgramStage, type Track } from '@/lib/types'

export interface ProgramPickerProps {
  /** Every program on the path, including the ones the viewer does not have. */
  tracks: Track[]
  /** Where a card goes when it is opened. */
  to?: (t: Track) => string
  /** For a page that walks its own levels rather than routing. */
  onOpen?: (t: Track) => void
  /** The short lines under the name. The map shows the first two. */
  facts: (t: Track) => string[]
  /** The corner of the cover — "3 live" for an admin, progress for a family. */
  tail?: (t: Track) => ReactNode
  /** Dim a program the viewer does not have: still on the path, plainly not theirs. */
  state?: (t: Track) => 'on' | 'dim'
  /** Admin only: the ⋯ on a card. */
  menu?: (t: Track) => ReactNode
  /** Admin only: add a program straight into a column. */
  onAdd?: (stage: ProgramStage) => void
  /** Admin only: draw and remove the lines. */
  onConnect?: (fromId: string, toId: string) => void
  footnote?: ReactNode
}

export function ProgramPicker({
  tracks, to, onOpen, facts, tail, state, menu, onAdd, onConnect, footnote,
}: ProgramPickerProps) {
  return (
    <ProgramMap
      tracks={tracks}
      state={state}
      onAdd={onAdd}
      onConnect={onConnect}
      node={t => {
        const stage = PROGRAM_STAGE_META[stageOf(t, tracks)]
        return (
          <PickCard
            compact
            to={to?.(t)}
            onOpen={onOpen && (() => onOpen(t))}
            chip={<Badge tone={stage.tone}>{stage.one}</Badge>}
            cover={
              <Cover bg={toneCover(t.color, t.id)} icon={GraduationCap} height={72}
                tag="Program" dim={state?.(t) === 'dim'} tail={tail?.(t)} />
            }
            eyebrow={programEyebrow(t)}
            name={t.name}
            blurb={programBlurb(t)}
            facts={facts(t)}
            menu={menu?.(t)}
          />
        )
      }}
    />
  )
}
