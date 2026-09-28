import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone, ShieldCheck, Wallet } from 'lucide-react'
import { useStore } from '@/lib/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar, Badge, Drawer, Empty, SearchInput } from '@/components/ui'
import { dateFull, median, money, moneyShort, pct } from '@/lib/format'
import type { Person, Role } from '@/lib/types'

const COPY: Record<Exclude<Role, 'admin'>, { title: string; sub: string }> = {
  student: {
    title: 'Students',
    sub: 'Every row carries what the student built and what they actually earned — the dataset no competitor has.',
  },
  instructor: {
    title: 'Instructors',
    sub: 'Mentors who earn from the skill they teach. Review SLA is the number that must not slip.',
  },
  parent: {
    title: 'Parents',
    sub: 'The payer. They see assets, income and cashflow — never a promise.',
  },
}

export default function People({ role }: { role: Exclude<Role, 'admin'> }) {
  const db = useStore(s => s.db)
  const [q, setQ] = useState('')
  const [cohort, setCohort] = useState('')
  const [open, setOpen] = useState<Person | null>(null)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return db.people
      .filter(p => p.role === role)
      .filter(p => !cohort || p.cohortId === cohort)
      .filter(p => !needle || p.name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [db.people, role, q, cohort])

  const summary = useMemo(() => {
    if (role !== 'student') return null
    const active = rows.filter(r => (r.progress ?? 0) > 0)
    const earners = active.filter(r => (r.verifiedIncome ?? 0) > 0)
    return {
      n: active.length,
      earners: earners.length,
      rate: active.length ? (earners.length / active.length) * 100 : 0,
      medianIncome: median(earners.map(r => r.verifiedIncome ?? 0)),
      zero: active.length - earners.length,
    }
  }, [rows, role])

  const copy = COPY[role]

  return (
    <div className="page">
      <PageHeader title={copy.title} />

      {summary && (
        <div className="card mb16" style={{ padding: '12px 16px' }}>
          <div className="row g24 wrap t-sm">
            <span><b className="tnum">{summary.n}</b> <span className="c-muted">active</span></span>
            <span><b className="tnum">{summary.earners}</b> <span className="c-muted">earning</span></span>
            <span><b className="tnum">{pct(summary.rate, 0)}</b> <span className="c-muted">conversion</span></span>
            <span><b className="tnum c-gold">{summary.medianIncome ? moneyShort(summary.medianIncome) : '—'}</b> <span className="c-muted">median (of earners)</span></span>
            <span><b className="tnum">{summary.zero}</b> <span className="c-muted">earning zero</span></span>
            <span className="auto-s t-xs c-muted2">n, median and zero-count always shown together</span>
          </div>
        </div>
      )}

      <div className="card mb16" style={{ padding: 10 }}>
        <div className="row g8 wrap">
          <SearchInput value={q} onChange={setQ} placeholder={`Search ${copy.title.toLowerCase()}…`} className="grow" />
          {role === 'student' && (
            <select className="sel" style={{ width: 'auto', minWidth: 170 }} value={cohort}
              onChange={e => setCohort(e.target.value)}>
              <option value="">All cohorts</option>
              {db.cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <Empty icon={<ShieldCheck />} title="Nobody matches" />
        ) : (
          <div className="tbl-wrap" style={{ maxHeight: 'calc(100dvh - 320px)' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 220 }}>Contact</th>
                  {role === 'student' && <>
                    <th style={{ width: 60 }}>Age</th>
                    <th style={{ width: 190 }}>Cohort</th>
                    <th style={{ width: 150 }}>Progress</th>
                    <th className="num" style={{ width: 120 }}>Verified income</th>
                    <th className="num" style={{ width: 90 }}>Payback</th>
                  </>}
                  {role === 'instructor' && <>
                    <th>Expertise</th>
                    <th className="num" style={{ width: 110 }}>Review SLA</th>
                    <th className="num" style={{ width: 90 }}>Cohorts</th>
                  </>}
                  {role === 'parent' && <>
                    <th style={{ width: 200 }}>Child</th>
                    <th className="num" style={{ width: 120 }}>Fees paid</th>
                    <th className="num" style={{ width: 130 }}>Child income</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {rows.map(p => {
                  const child = p.childIds?.length ? db.people.find(x => x.id === p.childIds![0]) : undefined
                  const payback = (p.feesPaid ?? 0) > 0 ? (p.verifiedIncome ?? 0) / (p.feesPaid ?? 1) : 0
                  const co = db.cohorts.find(c => c.id === p.cohortId)

                  return (
                    <tr key={p.id} onClick={() => setOpen(p)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div className="row g8">
                          <Avatar name={p.name} tone={p.avatarTone} size="sm" />
                          <span className="t-sm w-med truncate">{p.name}</span>
                        </div>
                      </td>
                      <td><span className="t-xs c-muted truncate">{p.email}</span></td>

                      {role === 'student' && <>
                        <td className="tnum t-sm">{p.age}</td>
                        <td><span className="t-xs c-muted truncate">{co?.name ?? '—'}</span></td>
                        <td>
                          <div className="row g8">
                            <div className="meter grow" style={{ maxWidth: 74 }}>
                              <i style={{ width: `${p.progress ?? 0}%` }} />
                            </div>
                            <span className="t-xs tnum c-muted2">{p.progress ?? 0}%</span>
                          </div>
                        </td>
                        <td className="num tnum t-sm">
                          {p.verifiedIncome ? <b className="c-gold">{money(p.verifiedIncome)}</b> : <span className="c-muted2">—</span>}
                        </td>
                        <td className="num tnum t-sm">
                          {payback > 0
                            ? <Badge tone={payback >= 0.5 ? 'teal' : 'line'}>{payback.toFixed(2)}×</Badge>
                            : <span className="c-muted2">—</span>}
                        </td>
                      </>}

                      {role === 'instructor' && <>
                        <td><span className="t-xs c-muted truncate">{p.expertise?.join(' · ')}</span></td>
                        <td className="num">
                          <Badge tone={(p.reviewSlaHours ?? 0) <= 72 ? 'teal' : 'rose'} dot>{p.reviewSlaHours}h</Badge>
                        </td>
                        <td className="num tnum t-sm">{p.cohortIds?.length ?? 0}</td>
                      </>}

                      {role === 'parent' && <>
                        <td><span className="t-xs c-muted truncate">{child?.name ?? '—'}</span></td>
                        <td className="num tnum t-sm c-muted">{child?.feesPaid ? money(child.feesPaid) : '—'}</td>
                        <td className="num tnum t-sm">
                          {child?.verifiedIncome ? <b className="c-gold">{money(child.verifiedIncome)}</b> : <span className="c-muted2">—</span>}
                        </td>
                      </>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt12 t-xs c-muted2">{rows.length} {copy.title.toLowerCase()}</div>

      <PersonDrawer person={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function PersonDrawer({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const db = useStore(s => s.db)
  if (!person) return null

  const cohort = db.cohorts.find(c => c.id === person.cohortId)
  const track = db.tracks.find(t => t.id === person.trackId)
  const parent = person.parentId ? db.people.find(p => p.id === person.parentId) : undefined
  const children = person.childIds?.map(id => db.people.find(p => p.id === id)).filter(Boolean) as Person[] | undefined
  const payback = (person.feesPaid ?? 0) > 0 ? (person.verifiedIncome ?? 0) / (person.feesPaid ?? 1) : 0

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="between" style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <span className="t-sm c-muted">{k}</span>
      <span className="t-sm w-med" style={{ textAlign: 'end' }}>{v}</span>
    </div>
  )

  return (
    <Drawer open onClose={onClose} title={person.name}>
      <div className="row g12 mb20">
        <Avatar name={person.name} tone={person.avatarTone} size="lg" />
        <div className="stack g2 grow">
          <span className="t-md w-sb">{person.name}</span>
          <span className="t-xs c-muted2">{person.email}</span>
        </div>
        <Badge tone="brand">{person.role}</Badge>
      </div>

      <div className="row g8 mb20 wrap">
        <a className="btn sm" href={`mailto:${person.email}`}><Mail />Email</a>
        {person.phone && <a className="btn sm" href={`tel:${person.phone}`}><Phone />{person.phone}</a>}
      </div>

      {person.role === 'student' && (
        <>
          <div className="grid g-2 mb20">
            <div className="card stat">
              <span className="eyebrow">Verified income</span>
              <span className="val c-gold">{money(person.verifiedIncome ?? 0)}</span>
              <span className="sub">Logged by the mentor, after the fact</span>
            </div>
            <div className="card stat">
              <span className="eyebrow">Education payback</span>
              <span className="val">{payback.toFixed(2)}×</span>
              <span className="sub">Income ÷ {money(person.feesPaid ?? 0)} in fees</span>
            </div>
          </div>

          <Row k="Age" v={person.age} />
          <Row k="City" v={person.city} />
          <Row k="Track" v={track?.name ?? '—'} />
          <Row k="Cohort" v={cohort?.name ?? '—'} />
          <Row k="Loop progress" v={`${person.progress ?? 0}%`} />
          <Row k="Portfolio pieces" v={person.portfolioPieces ?? 0} />
          <Row k="Parent" v={parent?.name ?? '—'} />
          <Row k="Joined" v={dateFull(person.createdAt)} />
        </>
      )}

      {person.role === 'instructor' && (
        <>
          <Row k="City" v={person.city} />
          <Row k="Expertise" v={person.expertise?.join(', ')} />
          <Row k="Review SLA" v={<Badge tone={(person.reviewSlaHours ?? 0) <= 72 ? 'teal' : 'rose'} dot>{person.reviewSlaHours}h</Badge>} />
          <Row k="Cohorts" v={person.cohortIds?.length ?? 0} />
          <Row k="Joined" v={dateFull(person.createdAt)} />
          <div className="mt16 stack g8">
            <span className="eyebrow">Cohorts</span>
            {person.cohortIds?.map(id => {
              const c = db.cohorts.find(x => x.id === id)
              return c ? (
                <div key={id} className="mat-row">
                  <span className="grow t-sm w-med">{c.name}</span>
                  <Badge tone="line">{c.studentIds.length}/{c.seats}</Badge>
                </div>
              ) : null
            })}
          </div>
        </>
      )}

      {person.role === 'parent' && children && (
        <>
          <Row k="City" v={person.city} />
          <Row k="Joined" v={dateFull(person.createdAt)} />
          <div className="mt20 stack g10">
            <span className="eyebrow">Children enrolled</span>
            {children.map(c => {
              const cb = (c.feesPaid ?? 0) > 0 ? (c.verifiedIncome ?? 0) / (c.feesPaid ?? 1) : 0
              return (
                <div key={c.id} className="card card-body stack g10">
                  <div className="row g10">
                    <Avatar name={c.name} tone={c.avatarTone} size="sm" />
                    <span className="grow t-sm w-sb">{c.name}</span>
                    <Badge tone="line">{c.age}</Badge>
                  </div>
                  <div className="between t-sm">
                    <span className="c-muted row g4"><Wallet style={{ width: 13, height: 13 }} />Verified income</span>
                    <b className="c-gold tnum">{money(c.verifiedIncome ?? 0)}</b>
                  </div>
                  <div className="between t-sm">
                    <span className="c-muted">Fees paid</span>
                    <span className="tnum">{money(c.feesPaid ?? 0)}</span>
                  </div>
                  <div className="between t-sm">
                    <span className="c-muted">Payback</span>
                    <Badge tone={cb >= 0.5 ? 'teal' : 'line'}>{cb.toFixed(2)}×</Badge>
                  </div>
                  <Link to="/admin/students" className="btn sm block">Open student record</Link>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Drawer>
  )
}
