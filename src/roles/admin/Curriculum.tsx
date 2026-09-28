import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Layers, Plus, Radio, Video } from 'lucide-react'
import { useStore, sessionStats } from '@/lib/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Empty } from '@/components/ui'
import { date, mins } from '@/lib/format'
import { STATUS_META } from '@/lib/types'

const LOOP_TONE = { planning: 'line', running: 'teal', closed: '' } as const

export default function Curriculum() {
  const db = useStore(s => s.db)
  const createSession = useStore(s => s.createSession)
  const nav = useNavigate()

  const byTrack = useMemo(() => db.tracks.map(t => ({
    track: t,
    loops: db.loops.filter(l => l.trackId === t.id).map(l => {
      const sessions = db.sessions.filter(s => s.loopId === l.id).sort((a, b) => a.order - b.order)
      const cohorts = db.cohorts.filter(c => c.loopId === l.id)
      return {
        loop: l,
        sessions,
        cohorts,
        students: cohorts.reduce((a, c) => a + c.studentIds.length, 0),
        minutes: sessions.reduce((a, s) => a + sessionStats(s).minutes, 0),
        published: sessions.filter(s => s.status === 'published').length,
      }
    }),
  })), [db])

  return (
    <div className="page">
      <PageHeader
        title="Tracks & loops" />

      <div className="stack g20">
        {byTrack.map(({ track, loops }) => (
          <section key={track.id} className="card">
            <div className="card-head">
              <div className="row g10" style={{ minWidth: 0 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 3, flex: 'none',
                  background: `var(--${track.color}-500, var(--brand))`,
                }} />
                <div className="stack g2" style={{ minWidth: 0 }}>
                  <h2 className="t-md w-sb">{track.name}</h2>
                  <span className="t-xs c-muted2 truncate">{track.blurb}</span>
                </div>
              </div>
              <div className="row g8" style={{ flex: 'none' }}>
                <Badge tone="line">{track.tier}</Badge>
                <Badge tone="line">{loops.length} loop{loops.length === 1 ? '' : 's'}</Badge>
              </div>
            </div>

            {loops.length === 0 ? (
              <Empty icon={<Layers />} title="No loops on this track yet" />
            ) : (
              <div className="divide">
                {loops.map(({ loop, sessions, cohorts, students, minutes, published }) => (
                  <div key={loop.id} style={{ padding: '14px 16px' }}>
                    <div className="between mb12 wrap g10">
                      <div className="row g10 wrap">
                        <span className="mono t-xs c-muted2">{loop.code}</span>
                        <span className="t-sm w-sb">{loop.name}</span>
                        <Badge tone={LOOP_TONE[loop.status]} dot>{loop.status}</Badge>
                        <span className="t-xs c-muted2">{date(loop.startDate)} → {date(loop.endDate)}</span>
                      </div>
                      <div className="row g10 t-xs c-muted2">
                        <span>{cohorts.length} cohort{cohorts.length === 1 ? '' : 's'}</span>
                        <span>{students} students</span>
                        <span>{published}/{sessions.length} published</span>
                        <span>{mins(minutes)}</span>
                      </div>
                    </div>

                    {sessions.length === 0 ? (
                      <button className="btn sm" onClick={() => {
                        const s = createSession({ loopId: loop.id })
                        nav(`/admin/sessions/${s.id}`)
                      }}><Plus />Add the first session</button>
                    ) : (
                      <div className="stack g6">
                        {sessions.map(s => {
                          const st = sessionStats(s)
                          return (
                            <Link key={s.id} to={`/admin/sessions/${s.id}`} className="mat-row">
                              <div className="mat-ico" style={{
                                background: s.type === 'live' ? 'var(--rose-100)' : 'var(--brand-weak)',
                                color: s.type === 'live' ? 'var(--rose-500)' : 'var(--brand)',
                              }}>
                                {s.type === 'live' ? <Radio /> : <Video />}
                              </div>
                              <div className="grow stack g2" style={{ minWidth: 0 }}>
                                <span className="t-sm w-med truncate">{s.name}</span>
                                <span className="t-xs c-muted2">
                                  {st.topics} topics{st.projects > 0 && ` · ${st.projects} projects`}
                                  {' · '}{st.videos}/{st.topics} recordings · {st.tasks} questions
                                </span>
                              </div>
                              <Badge tone={STATUS_META[s.status].tone} dot>{STATUS_META[s.status].label}</Badge>
                              <span className="mono t-xs c-muted2 hide-sm">{s.code}</span>
                              <ArrowUpRight style={{ width: 14, height: 14, color: 'var(--muted-2)', flex: 'none' }} />
                            </Link>
                          )
                        })}
                        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => {
                          const s = createSession({ loopId: loop.id })
                          nav(`/admin/sessions/${s.id}`)
                        }}><Plus />Add session to {loop.code}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
