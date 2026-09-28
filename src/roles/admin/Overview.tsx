import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowUpRight, CalendarClock, CircleDollarSign, Clock,
  Plus, Radio, TrendingUp, Users, Video,
} from 'lucide-react'
import { useStore, readiness, sessionStats } from '@/lib/store'
import { PageHeader, SectionHead } from '@/components/layout/PageHeader'
import { Avatar, Badge, Bars, Empty, Stat } from '@/components/ui'
import { count, dateTime, median, moneyShort, pct, relative } from '@/lib/format'
import { STATUS_META } from '@/lib/types'

export default function Overview() {
  const db = useStore(s => s.db)
  const createSession = useStore(s => s.createSession)
  const nav = useNavigate()

  const m = useMemo(() => {
    const students = db.people.filter(p => p.role === 'student')
    const active = students.filter(s => (s.progress ?? 0) > 0)
    const incomes = active.map(s => s.verifiedIncome ?? 0)
    const earners = incomes.filter(v => v > 0)

    /* KM-1 — % of active students with any verified income */
    const km1 = active.length ? (earners.length / active.length) * 100 : 0

    /* KM-3 — median cumulative verified income ÷ cumulative fees */
    const paybacks = active
      .filter(s => (s.feesPaid ?? 0) > 0)
      .map(s => (s.verifiedIncome ?? 0) / (s.feesPaid ?? 1))
      .sort((a, b) => a - b)
    // Below 50% conversion the median is genuinely 0, so the top quartile is
    // reported next to it — otherwise the tile reads as a broken number.
    const km3 = median(paybacks)
    const km3Top = paybacks.length ? paybacks[Math.floor(paybacks.length * 0.75)] : 0

    const totalIncome = incomes.reduce((a, b) => a + b, 0)
    const totalFees = active.reduce((a, s) => a + (s.feesPaid ?? 0), 0)

    const drafts = db.sessions.filter(s => s.status === 'draft')
    const blocked = db.sessions
      .map(s => ({ s, gaps: readiness(s) }))
      .filter(x => x.gaps.length > 0 && x.s.status !== 'archived')
      .sort((a, b) => b.gaps.length - a.gaps.length)

    const upcoming = db.sessions
      .filter(s => s.scheduledAt && new Date(s.scheduledAt).getTime() > Date.now())
      .sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1))
      .slice(0, 5)

    const library = db.sessions.reduce(
      (acc, s) => {
        const st = sessionStats(s)
        acc.titles += st.titles; acc.videos += st.videos
        acc.materials += st.materials; acc.tasks += st.tasks
        acc.minutes += st.minutes
        return acc
      },
      { titles: 0, videos: 0, materials: 0, tasks: 0, minutes: 0 },
    )

    /* per-track income distribution — the dataset nobody else has */
    const byTrack = db.tracks.map(t => {
      const inTrack = active.filter(s => s.trackId === t.id)
      const earning = inTrack.filter(s => (s.verifiedIncome ?? 0) > 0)
      return {
        track: t,
        n: inTrack.length,
        earners: earning.length,
        rate: inTrack.length ? (earning.length / inTrack.length) * 100 : 0,
        medianIncome: median(earning.map(s => s.verifiedIncome ?? 0)),
      }
    }).sort((a, b) => b.rate - a.rate)

    return {
      students, active, earners, km1, km3, km3Top, totalIncome, totalFees,
      drafts, blocked, upcoming, library, byTrack,
      zeroPct: active.length ? ((active.length - earners.length) / active.length) * 100 : 0,
    }
  }, [db])

  return (
    <div className="page">
      <PageHeader
        title="Overview"
        actions={
          <>
            <Link to="/admin/sessions" className="btn"><Video />Session library</Link>
            <button className="btn primary" onClick={() => { const s = createSession(); nav(`/admin/sessions/${s.id}`) }}>
              <Plus />New session
            </button>
          </>
        }
      />

      {/* ---- key metrics ---- */}
      <div className="grid g-4 mb20">
        <Stat
          label="KM-1 · Loop income conversion"
          value={pct(m.km1, 0)}
          sub={<>Target ≥ 40% · n={m.active.length} · {pct(m.zeroPct, 0)} earning zero</>}
          delta={{ value: `${m.earners.length} earning`, up: m.km1 >= 40 }}
          spark={[28, 31, 30, 36, 34, 39, 41, Math.round(m.km1)]}
        />
        <Stat
          label="KM-2 · Loop-to-loop retention"
          value="67%"
          sub={<>Placeholder — needs loop purchase history · target ≥ 65%</>}
          delta={{ value: 'not live', up: true }}
          spark={[52, 55, 58, 57, 61, 63, 65, 67]}
          tone="var(--teal-500)" />
        <Stat
          label="KM-3 · Education payback"
          value={m.km3.toFixed(2) + '×'}
          sub={m.km1 < 50
            ? <>Median is 0 while under half earn · top quartile {m.km3Top.toFixed(2)}×</>
            : <>Median income ÷ fees · top quartile {m.km3Top.toFixed(2)}×</>}
          delta={{ value: m.km3 >= 0.5 ? 'on target' : 'below target', up: m.km3 >= 0.5 }}
          spark={[0.08, 0.12, 0.19, 0.24, 0.31, 0.38, 0.44, Math.max(m.km3, m.km3Top)]}
          tone="var(--gold-500)" />
        <Stat
          label="Verified student income"
          value={moneyShort(m.totalIncome)}
          sub={<>Against {moneyShort(m.totalFees)} in fees · reported after the fact</>}
          icon={<CircleDollarSign style={{ width: 15, height: 15, color: 'var(--gold-500)' }} />}
          spark={[4, 9, 14, 22, 30, 41, 52, 68]}
          tone="var(--gold-500)" />
      </div>

      <div className="grid g-2a mb20">
        {/* ---- content blocked ---- */}
        <section className="card">
          <div className="card-head">
            <div className="stack g2">
              <h2 className="t-md w-sb">Blocked from publishing</h2>
              <span className="t-xs c-muted2">{m.blocked.length} session{m.blocked.length === 1 ? '' : 's'} with gaps</span>
            </div>
            <Link to="/admin/sessions" className="btn sm ghost">Open library<ArrowUpRight /></Link>
          </div>

          {m.blocked.length === 0 ? (
            <Empty icon={<Video />} title="Everything is publishable" />
          ) : (
            <div className="divide">
              {m.blocked.slice(0, 6).map(({ s, gaps }) => {
                const loop = db.loops.find(l => l.id === s.loopId)
                return (
                  <Link key={s.id} to={`/admin/sessions/${s.id}`}
                    className="rowtop g12" style={{ padding: '11px 16px' }}>
                    <div className="mat-ico" style={{ background: 'var(--rose-100)', color: 'var(--rose-500)' }}>
                      <AlertTriangle />
                    </div>
                    <div className="grow stack g4">
                      <div className="row g8 wrap">
                        <span className="t-sm w-sb truncate">{s.name}</span>
                        <span className="mono t-xs c-muted2">{s.code}</span>
                        <Badge tone={STATUS_META[s.status].tone} dot>{STATUS_META[s.status].label}</Badge>
                      </div>
                      <span className="t-xs c-muted">{loop?.name} · {gaps[0]}{gaps.length > 1 ? ` · +${gaps.length - 1} more` : ''}</span>
                    </div>
                    <span className="t-xs c-muted2" style={{ flex: 'none' }}>{relative(s.updatedAt)}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* ---- upcoming ---- */}
        <section className="card">
          <div className="card-head">
            <h2 className="t-md w-sb">Next up</h2>
            <Badge tone="line"><CalendarClock />{m.upcoming.length}</Badge>
          </div>
          {m.upcoming.length === 0 ? (
            <Empty icon={<CalendarClock />} title="Nothing scheduled" />
          ) : (
            <div className="divide">
              {m.upcoming.map(s => (
                <Link key={s.id} to={`/admin/sessions/${s.id}`} className="rowtop g10" style={{ padding: '11px 16px' }}>
                  <div className="mat-ico" style={{
                    background: s.type === 'live' ? 'var(--rose-100)' : 'var(--brand-weak)',
                    color: s.type === 'live' ? 'var(--rose-500)' : 'var(--brand)',
                  }}>
                    {s.type === 'live' ? <Radio /> : <Video />}
                  </div>
                  <div className="grow stack g2">
                    <span className="t-sm w-med truncate">{s.name}</span>
                    <span className="t-xs c-muted2">{dateTime(s.scheduledAt)}</span>
                  </div>
                  <Badge tone={s.type === 'live' ? 'rose' : ''}>{s.type}</Badge>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ---- which skill actually pays ---- */}
      <section className="card mb20">
        <div className="card-head">
          <div className="stack g2">
            <h2 className="t-md w-sb">Which skill actually pays</h2>
            <span className="t-xs c-muted2">
              Verified income by track. Median only — never an average, never a best case.
            </span>
          </div>
          <Link to="/admin/outcomes" className="btn sm ghost">Full dataset<ArrowUpRight /></Link>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Track</th><th>Tier</th>
                <th className="num">Students</th>
                <th className="num">Earning</th>
                <th style={{ width: 170 }}>Conversion</th>
                <th className="num">Median income</th>
              </tr>
            </thead>
            <tbody>
              {m.byTrack.map(r => (
                <tr key={r.track.id}>
                  <td>
                    <div className="row g8">
                      <span style={{
                        width: 8, height: 8, borderRadius: 3, flex: 'none',
                        background: `var(--${r.track.color}-500, var(--brand))`,
                      }} />
                      <span className="w-med">{r.track.name}</span>
                    </div>
                  </td>
                  <td><Badge tone="line">{r.track.tier}</Badge></td>
                  <td className="num tnum c-muted">{r.n}</td>
                  <td className="num tnum">{r.earners}</td>
                  <td>
                    <div className="row g8">
                      <div className="meter grow" style={{ maxWidth: 90 }}>
                        <i style={{ width: `${r.rate}%`, background: r.rate >= 40 ? 'var(--teal-500)' : 'var(--gold-500)' }} />
                      </div>
                      <span className="t-xs tnum w-sb" style={{ minWidth: 34 }}>{pct(r.rate, 0)}</span>
                    </div>
                  </td>
                  <td className="num tnum w-med c-gold">
                    {r.medianIncome ? moneyShort(r.medianIncome) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-foot t-xs c-muted2">
          Reported after the fact, never promised. Any external use of these numbers must publish n, median and
          % earning zero together.
        </div>
      </section>

      <div className="grid g-3">
        {/* library */}
        <section className="card">
          <div className="card-head"><h2 className="t-md w-sb">Content library</h2></div>
          <div className="card-body stack g12">
            {([
              ['Sessions', count(db.sessions.length), Video],
              ['Titles', count(m.library.titles), null],
              ['Recordings ready', count(m.library.videos), null],
              ['Materials', count(m.library.materials), null],
              ['Q&A tasks', count(m.library.tasks), null],
              ['Total runtime', `${Math.round(m.library.minutes / 60)}h`, Clock],
            ] as const).map(([k, v]) => (
              <div key={k} className="between">
                <span className="t-sm c-muted">{k}</span>
                <span className="t-sm w-sb tnum">{v}</span>
              </div>
            ))}
          </div>
        </section>

        {/* enrolment */}
        <section className="card">
          <div className="card-head"><h2 className="t-md w-sb">Enrolment by cohort</h2></div>
          <div className="card-body">
            <Bars
              data={db.cohorts.map(c => c.studentIds.length)}
              labels={db.cohorts.map(c => c.name.split(' · ')[0].slice(0, 4))}
              h={110}
            />
            <div className="between mt16 t-xs c-muted2">
              <span>{db.cohorts.length} cohorts</span>
              <span>{m.students.length} students · {db.cohorts.reduce((a, c) => a + c.seats, 0)} seats</span>
            </div>
          </div>
        </section>

        {/* instructors */}
        <section className="card">
          <div className="card-head">
            <h2 className="t-md w-sb">Mentor review SLA</h2>
            <Badge tone="line">72h target</Badge>
          </div>
          <div className="divide">
            {db.people.filter(p => p.role === 'instructor').map(p => {
              const h = p.reviewSlaHours ?? 0
              const ok = h <= 72
              return (
                <div key={p.id} className="row g10" style={{ padding: '10px 16px' }}>
                  <Avatar name={p.name} tone={p.avatarTone} size="sm" />
                  <div className="grow stack" style={{ minWidth: 0 }}>
                    <span className="t-sm w-med truncate">{p.name}</span>
                    <span className="t-xs c-muted2 truncate">{p.expertise?.join(' · ')}</span>
                  </div>
                  <Badge tone={ok ? 'teal' : 'rose'} dot>{h}h</Badge>
                </div>
              )
            })}
          </div>
          <div className="card-foot row g6 t-xs c-muted2">
            <TrendingUp style={{ width: 12, height: 12 }} />
            Mentorship is the product — this is the number never to cut.
          </div>
        </section>
      </div>

      <div className="row g8 mt24 t-xs c-muted2">
        <Users style={{ width: 13, height: 13 }} />
        Dev stage · all data is local to this browser · no authentication layer yet
      </div>
    </div>
  )
}
