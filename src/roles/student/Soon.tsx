import { Link } from 'react-router-dom'
import { LineChart, Target } from 'lucide-react'
import { Empty } from '@/components/ui'
import { PageHeader } from '@/components/layout/PageHeader'

/* Performance Analysis is routed so its button lands somewhere honest.
   Nothing is sketched in here on purpose. */

function Soon({ eyebrow, title, icon, body }: {
  eyebrow: string; title: string; icon: React.ReactNode; body: string
}) {
  return (
    <div className="page">
      <PageHeader title={title} />
      <div className="card">
        <div className="card-body">
          <Empty
            icon={icon}
            title="Not built yet"
            action={<Link className="btn primary" to="/student/missions"><Target />Go to missions</Link>}
          />
        </div>
      </div>
    </div>
  )
}

export const StudentPerformance = () => (
  <Soon
    eyebrow="Progress" title="Performance Analysis" icon={<LineChart />}
    body="Topic completion, mentor scores and where you are losing time. Wired up once submissions and grading exist." />
)
