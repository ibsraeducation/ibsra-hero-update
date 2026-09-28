import { useMemo } from 'react'
import { AlertTriangle, Download, ShieldAlert } from 'lucide-react'
import { useStore } from '@/lib/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Bars, Stat } from '@/components/ui'
import { median, money, moneyShort, pct } from '@/lib/format'

/** Income bands in EGP — reported as a distribution, never as an average. */
const BANDS: Array<[string, number, number]> = [
  ['0', 0, 0],
  ['1–1k', 1, 1000],
  ['1k–2k', 1001, 2000],
  ['2k–3k', 2001, 3000],
  ['3k–5k', 3001, 5000],
  ['5k+', 5001, Infinity],
]

export default function Outcomes() {
  const db = useStore(s => s.db)
  const toast = useStore(s => s.toast)

  const m = useMemo(() => {
    const active = db.people.filter(p => p.role === 'student' && (p.progress ?? 0) > 0)
    const incomes = active.map(s => s.verifiedIncome ?? 0)
    const earners = incomes.filter(v => v > 0)

    const dist = BANDS.map(([label, lo, hi]) => ({
      label,
      n: incomes.filter(v => (lo === 0 && hi === 0 ? v === 0 : v >= lo && v <= hi)).length,
    }))

    const paybacks = active
      .filter(s => (s.feesPaid ?? 0) > 0)
      .map(s => (s.verifiedIncome ?? 0) / (s.feesPaid ?? 1))
      .sort((a, b) => a - b)
    const topQuartile = paybacks.length
      ? paybacks[Math.floor(paybacks.length * 0.75)] : 0

    const byAge = [
      ['14–15', 14, 15], ['16–17', 16, 17], ['18–19', 18, 19], ['20–22', 20, 22],
    ].map(([label, lo, hi]) => {
      const grp = active.filter(s => (s.age ?? 0) >= (lo as number) && (s.age ?? 0) <= (hi as number))
      const e = grp.filter(s => (s.verifiedIncome ?? 0) > 0)
      return {
        label: label as string, n: grp.length, earners: e.length,
        rate: grp.length ? (e.length / grp.length) * 100 : 0,
        med: median(e.map(s => s.verifiedIncome ?? 0)),
      }
    })

    const byMentor = db.people.filter(p => p.role === 'instructor').map(ins => {
      const cohortIds = new Set(ins.cohortIds ?? [])
      const grp = active.filter(s => s.cohortId && cohortIds.has(s.cohortId))
      const e = grp.filter(s => (s.verifiedIncome ?? 0) > 0)
      return {
        ins, n: grp.length, earners: e.length,
        rate: grp.length ? (e.length / grp.length) * 100 : 0,
        med: median(e.map(s => s.verifiedIncome ?? 0)),
      }
    }).sort((a, b) => b.rate - a.rate)

    return {
      active, earners, dist, byAge, byMentor,
      conversion: active.length ? (earners.length / active.length) * 100 : 0,
      medianEarner: median(earners),
      medianAll: median(incomes),
      zeroPct: active.length ? ((active.length - earners.length) / active.length) * 100 : 0,
      total: incomes.reduce((a, b) => a + b, 0),
      fees: active.reduce((a, s) => a + (s.feesPaid ?? 0), 0),
      medianPayback: median(paybacks),
      topQuartile,
    }
  }, [db])

  return (
    <div className="page">
      <PageHeader
        title="Income & ROI"
        actions={
          <button className="btn" onClick={() => toast('Export lands with the substantiation file in stage 3', 'info')}>
            <Download />Export substantiation file
          </button>
        }
      />

      {/* legal guardrail — sits above the numbers on purpose */}
      <div className="card mb20" style={{
        borderColor: 'color-mix(in srgb, var(--gold-500) 40%, var(--line))',
        background: 'var(--gold-100)',
      }}>
        <div className="rowtop g10" style={{ padding: '12px 16px' }}>
          <ShieldAlert style={{ width: 16, height: 16, flex: 'none', color: 'var(--gold-600)', marginTop: 1 }} />
          <div className="stack g4">
            <span className="t-sm w-sb" style={{ color: 'var(--gold-700)' }}>
              Reported after the fact. Never promised.
            </span>
            <span className="t-xs" style={{ color: 'var(--gold-700)', lineHeight: 1.6, opacity: .9 }}>
              Any external use of these figures must publish n, median and % earning zero together —
              never an average, never a best case. Income claims carry real exposure: FTC permanent bans,
              Egypt CPL fines of EGP 50k–2m, and an ASCI precedent forcing a competitor to pull ads over
              a fabricated child success story.
            </span>
          </div>
        </div>
      </div>

      <div className="grid g-4 mb20">
        <Stat label="Income conversion (KM-1)" value={pct(m.conversion, 0)}
          sub={`n=${m.active.length} · target ≥ 40%`}
          delta={{ value: `${m.earners.length} earning`, up: m.conversion >= 40 }} />
        <Stat label="Median · earners only" value={moneyShort(m.medianEarner)}
          sub={`${m.earners.length} students with any verified income`} tone="var(--gold-500)" />
        <Stat label="Median · everyone" value={moneyShort(m.medianAll)}
          sub={`${pct(m.zeroPct, 0)} earned zero — shown by policy`} tone="var(--gold-500)" />
        <Stat label="Education payback (KM-3)" value={`${m.medianPayback.toFixed(2)}×`}
          sub={`Top quartile ${m.topQuartile.toFixed(2)}× · target ≥ 0.5 median`}
          delta={{ value: m.medianPayback >= 0.5 ? 'on target' : 'below', up: m.medianPayback >= 0.5 }} />
      </div>

      <div className="grid g-2a mb20">
        <section className="card">
          <div className="card-head">
            <div className="stack g2">
              <h2 className="t-md w-sb">Income distribution</h2>
              <span className="t-xs c-muted2">Verified income this loop, EGP. The zero bar stays visible.</span>
            </div>
          </div>
          <div className="card-body">
            <Bars data={m.dist.map(d => d.n)} labels={m.dist.map(d => d.label)}
              h={150} tone="var(--gold-500)" />
          </div>
          <div className="card-foot between t-xs c-muted2">
            <span>n = {m.active.length} active students</span>
            <span>{moneyShort(m.total)} verified against {moneyShort(m.fees)} in fees</span>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2 className="t-md w-sb">By age band</h2></div>
          <div className="divide">
            {m.byAge.map(a => (
              <div key={a.label} className="row g12" style={{ padding: '11px 16px' }}>
                <span className="t-sm w-med" style={{ width: 52 }}>{a.label}</span>
                <div className="meter grow">
                  <i style={{ width: `${a.rate}%`, background: a.rate >= 40 ? 'var(--teal-500)' : 'var(--gold-500)' }} />
                </div>
                <span className="t-xs tnum c-muted" style={{ width: 34, textAlign: 'end' }}>{pct(a.rate, 0)}</span>
                <span className="t-xs tnum c-muted2" style={{ width: 30, textAlign: 'end' }}>n={a.n}</span>
              </div>
            ))}
          </div>
          <div className="card-foot t-xs c-muted2">
            T1 (10–13) is deliberately absent — no income outcome, and Egypt bars work under 15.
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div className="stack g2">
            <h2 className="t-md w-sb">By mentor</h2>
            <span className="t-xs c-muted2">
              Which mentors get students earning. Feeds mentor selection, not public marketing.
            </span>
          </div>
          <Badge tone="line"><AlertTriangle />internal only</Badge>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Mentor</th>
                <th>Expertise</th>
                <th className="num">Students</th>
                <th className="num">Earning</th>
                <th style={{ width: 180 }}>Conversion</th>
                <th className="num">Median (earners)</th>
                <th className="num">Review SLA</th>
              </tr>
            </thead>
            <tbody>
              {m.byMentor.map(r => (
                <tr key={r.ins.id}>
                  <td className="w-med">{r.ins.name}</td>
                  <td><span className="t-xs c-muted">{r.ins.expertise?.join(' · ')}</span></td>
                  <td className="num tnum c-muted">{r.n}</td>
                  <td className="num tnum">{r.earners}</td>
                  <td>
                    <div className="row g8">
                      <div className="meter grow" style={{ maxWidth: 100 }}>
                        <i style={{ width: `${r.rate}%`, background: r.rate >= 40 ? 'var(--teal-500)' : 'var(--gold-500)' }} />
                      </div>
                      <span className="t-xs tnum w-sb" style={{ minWidth: 32 }}>{pct(r.rate, 0)}</span>
                    </div>
                  </td>
                  <td className="num tnum c-gold w-med">{r.med ? money(r.med) : '—'}</td>
                  <td className="num">
                    <Badge tone={(r.ins.reviewSlaHours ?? 0) <= 72 ? 'teal' : 'rose'} dot>{r.ins.reviewSlaHours}h</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-foot t-xs c-muted2">
          Roughly 12–18 months of this data is the real defensibility. Zero of ~50 reviewed competitors
          report student income at all.
        </div>
      </section>
    </div>
  )
}
