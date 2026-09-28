import { Outline } from '@/components/Outline'
import { countPoints, parseOutline } from '@/lib/outline'
import type { Loop } from '@/lib/types'

/* What a course covers, as bullets and sub-bullets from its Markdown —
   the read-only twin of the outline editor in the course form, and the
   course-level match of ProgramOutcomes. Shows nothing for a course that
   has not been described yet. */
export function CourseOverview({ loop }: { loop: Loop }) {
  const nodes = parseOutline(loop.overview ?? '')
  if (!nodes.length) return null
  const points = countPoints(nodes) || nodes.length

  return (
    <div className="card mb16">
      <div className="card-body stack g12">
        <span className="eyebrow">
          What this course covers · {points} point{points === 1 ? '' : 's'}
        </span>
        <Outline nodes={nodes} />
      </div>
    </div>
  )
}
