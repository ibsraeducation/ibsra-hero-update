import { useMemo } from 'react'
import { CalendarClock, Users } from 'lucide-react'
import { useStore } from '@/lib/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar, Badge } from '@/components/ui'
import { date, median, moneyShort, pct } from '@/lib/format'

export default function Cohorts() {
  const db = useStore(s => s.db)

  const rows = useMemo(() => db.cohorts.map(c => {
    const loop = db.loops.find(l => l.id === c.loopId)
    const track = db.tracks.find(t => t.id === loop?.trackId)
    const ins = db.people.find(p => p.id === c.instructorId)
    const students = c.studentIds
      .map(id => db.people.find(p => p.id === id))
      .filter(Boolean) as NonNullable<ReturnType<typeof db.people.find>>[]
    const earners = students.filter(s => (s.verifiedIncome ?? 0) > 0)
    return {
      cohort: c, loop, track, ins, students,
      fill: c.seats ? (c.studentIds.length / c.seats) * 100 : 0,
      avgProgress: students.length
        ? students.reduce((a, s) => a + (s.progress ?? 0), 0) / students.length : 0,
      conversion: students.length ? (earners.length / students.length) * 100 : 0,
      medianIncome: median(earners.map(s => s.verifiedIncome ?? 0)),
    }
  }), [db])

  return (
    <div className="page">
      <PageHeader
        title="Cohorts" />

      <div className="grid g-2">
        {rows.map(r => (
          <section key={r.cohort.id} className="card">
            <div className="card-head">
              <div className="stack g2" style={{ minWidth: 0 }}>
                <h2 className="t-md w-sb truncate">{r.cohort.name}</h2>
                <span className="t-xs c-muted2 truncate">{r.track?.name} · {r.loop?.code}</span>
              </div>
              <Badge tone={r.fill >= 90 ? 'rose' : r.fill >= 60 ? 'teal' : 'line'}>
                {r.cohort.studentIds.length}/{r.cohort.seats}
              </Badge>
            </div>

            <div className="card-body stack g14">
              <div className="row g10">
                {r.ins ? <Avatar name={r.ins.name} tone={r.ins.avatarTone} size="sm" /> : null}
                <div className="stack g2 grow" style={{ minWidth: 0 }}>
                  <span className="t-sm w-med">{r.ins?.name ?? 'Unassigned mentor'}</span>
                  <span className="t-xs c-muted2 row g6">
                    <CalendarClock style={{ width: 11, height: 11 }} />{r.cohort.schedule}
                  </span>
                </div>
                {r.loop && (
                  <span className="t-xs c-muted2" style={{ flex: 'none' }}>
                    {date(r.loop.startDate)} → {date(r.loop.endDate)}
                  </span>
                )}
              </div>

              <div>
                <div className="between mb8">
                  <span className="t-xs c-muted">Seats filled</span>
                  <span className="t-xs tnum w-sb">{pct(r.fill, 0)}</span>
                </div>
                <div className="meter"><i style={{ width: `${r.fill}%` }} /></div>
              </div>

              <div>
                <div className="between mb8">
                  <span className="t-xs c-muted">Median loop progress</span>
                  <span className="t-xs tnum w-sb">{pct(r.avgProgress, 0)}</span>
                </div>
                <div className="meter teal"><i style={{ width: `${r.avgProgress}%` }} /></div>
              </div>

              <div className="row g24 wrap t-xs" style={{
                paddingTop: 12, borderTop: '1px solid var(--line-soft)',
              }}>
                <span className="stack g2">
                  <span className="c-muted2">Income conversion</span>
                  <b className="t-sm tnum" style={{ color: r.conversion >= 40 ? 'var(--teal-600)' : 'var(--gold-600)' }}>
                    {pct(r.conversion, 0)}
                  </b>
                </span>
                <span className="stack g2">
                  <span className="c-muted2">Median (of earners)</span>
                  <b className="t-sm tnum c-gold">{r.medianIncome ? moneyShort(r.medianIncome) : '—'}</b>
                </span>
                <span className="stack g2 auto-s" style={{ textAlign: 'end' }}>
                  <span className="c-muted2">n</span>
                  <b className="t-sm tnum">{r.students.length}</b>
                </span>
              </div>

              <div className="row g4 wrap">
                {r.students.slice(0, 10).map(s => (
                  <Avatar key={s.id} name={s.name} tone={s.avatarTone} size="sm" />
                ))}
                {r.students.length > 10 && (
                  <span className="avatar sm" style={{ background: 'var(--surface-3)', color: 'var(--muted)', borderColor: 'var(--line)' }}>
                    +{r.students.length - 10}
                  </span>
                )}
                {r.students.length === 0 && (
                  <span className="t-xs c-muted2 row g6"><Users style={{ width: 12, height: 12 }} />No students enrolled</span>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
