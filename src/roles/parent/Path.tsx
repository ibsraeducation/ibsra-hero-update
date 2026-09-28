/* ==========================================================================
   Parent · The training path

   The whole path in one picture: the program every child starts on, the
   specializations that follow it, and the one they all lead to. It answers
   the question a family asks before any number matters — where does this go?

   Read-only and deliberately plain: stage names and where the child is,
   nothing counted and nothing priced. The summary keeps its own line of
   folders; this page is the shape behind it.
   ========================================================================== */

import { Link } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { Badge, Empty } from '@/components/ui'
import { Cover, toneCover } from '@/components/Cover'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProgramMap } from '@/components/ProgramMap'
import { useStore } from '@/lib/store'
import { inArea } from '@/lib/area'
import { programEyebrow } from '@/lib/programInfo'
import type { Track } from '@/lib/types'
import { useParent } from './data'
import { programPath, stageMeta } from './stages'

export default function ParentPath() {
  const db = useStore(s => s.db)
  const { child, journey } = useParent()

  /* Only the teaching programs: Work is where the child builds their own
     assets inside a program, not a step on the path. */
  const tracks = db.tracks.filter(inArea('material'))

  /* Where the child stands on each program, from the same reading the
     summary uses — so the two pages can never say different things. */
  const where = new Map(journey.map(p => [p.track.id, p.stage]))

  const first = child.name.split(' ')[0]

  if (tracks.length === 0) {
    return (
      <div className="page">
        <PageHeader title="The path" />
        <Empty icon={<GraduationCap />} title="No programs to show yet" />
      </div>
    )
  }

  const node = (t: Track) => {
    const stage = where.get(t.id)
    const meta = stage ? stageMeta(stage) : undefined
    return (
      <Link to={programPath(t.id)} className="folder prod-card tree-card">
        <Cover bg={toneCover(t.color, t.id)} icon={GraduationCap} height={72}
          tag="Program" dim={!stage} />
        <span className="folder-body">
          <span className="stack g2" style={{ minWidth: 0 }}>
            <span className="eyebrow truncate">{programEyebrow(t)}</span>
            <span className="t-md w-sb truncate">{t.name}</span>
          </span>
          <span className="row g8 mt8">
            {meta
              ? <Badge tone={meta.tone}>{meta.label}</Badge>
              : <span className="t-xs c-muted2">Not on {first}'s path yet</span>}
          </span>
        </span>
      </Link>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="Where this goes" />

      <ProgramMap
        tracks={tracks}
        state={t => (where.has(t.id) ? 'on' : 'dim')}
        node={node}
      />
    </div>
  )
}
