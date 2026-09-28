/* ==========================================================================
   Parent-only presentation pieces.

   These live here rather than in components/ui because each one encodes a
   reporting rule as well as a look: the disclosure block cannot be rendered
   without n / median / % earning nothing, and the cashflow chart cannot be
   rendered past today.
   ========================================================================== */

import { useId, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Badge } from '@/components/ui'
import { count, initials, money, moneyShort } from '@/lib/format'
import type { CohortContext } from './data'

/* ---------- portrait ---------- */

export function Portrait({ name, tone = 'brand', photoUrl, size = 76 }: {
  name: string; tone?: string; photoUrl?: string; size?: number
}) {
  return (
    <span className="portrait" style={{
      width: size, height: size,
      background: `var(--${tone}-100)`,
      color: `var(--${tone}-600)`,
      borderColor: `color-mix(in srgb, var(--${tone}-500) 34%, transparent)`,
      fontSize: Math.round(size / 2.9),
    }}>
      {photoUrl
        ? <img src={photoUrl} alt={name} />
        : <span aria-hidden>{initials(name)}</span>}
      <span className="sr-only">{name}</span>
    </span>
  )
}

/* ---------- progress ring ---------- */

export function Ring({ value, size = 78, stroke = 8, tone = 'var(--brand)', label, sub }: {
  value: number; size?: number; stroke?: number; tone?: string; label?: string; sub?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="ring-wrap">
      <div className="ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${(clamped / 100) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray var(--med)' }}
          />
        </svg>
        <span className="ring-val tnum" style={{ fontSize: Math.round(size / 4.6) }}>
          {label ?? `${Math.round(clamped)}%`}
        </span>
      </div>
      {sub && <span className="ring-sub">{sub}</span>}
    </div>
  )
}

/* ---------- labelled metric row with a meter ---------- */

export function MeterRow({ label, value, pct, tone = 'var(--brand)', note }: {
  label: string; value: ReactNode; pct: number; tone?: string; note?: string
}) {
  return (
    <div className="stack g6">
      <div className="between g12">
        <span className="t-sm c-ink2 truncate">{label}</span>
        <span className="t-sm w-sb tnum" style={{ flex: 'none' }}>{value}</span>
      </div>
      <div className="meter"><i style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: tone }} /></div>
      {note && <span className="t-xs c-muted2">{note}</span>}
    </div>
  )
}

/* ---------- score out of 5 ---------- */

export function ScoreDots({ score, tone = 'var(--brand)' }: { score: number; tone?: string }) {
  return (
    <span className="dots" aria-label={`${score} out of 5`}>
      {[0, 1, 2, 3, 4].map(i => (
        <i key={i} style={{ background: i < Math.round(score) ? tone : 'var(--surface-3)' }} />
      ))}
    </span>
  )
}

/* ---------- cashflow: fees paid against verified income ----------
   Draws only up to the current week. There is no dotted continuation, no
   trend arrow and no shaded forecast cone — the chart stops where the
   evidence stops. */

export function Cashflow({ weeks, elapsed, height = 168 }: {
  weeks: Array<{ label: string; fees: number; income: number }>
  elapsed: number
  height?: number
}) {
  const gid = useId().replace(/:/g, '')
  const w = 560
  const padB = 22
  const padT = 12
  const inner = height - padB - padT

  const fees = weeks[0]?.fees ?? 0
  const peak = Math.max(fees, ...weeks.map(p => p.income), 1)
  const y = (v: number) => padT + inner - (v / peak) * inner
  const x = (i: number) => (i / Math.max(1, weeks.length - 1)) * w

  const shown = weeks.slice(0, Math.max(2, elapsed))
  /* Income is a step: it does not change between client payments. */
  const step = shown.flatMap((p, i) => (i === 0
    ? [`M0 ${y(p.income).toFixed(1)}`]
    : [`L${x(i).toFixed(1)} ${y(shown[i - 1].income).toFixed(1)}`, `L${x(i).toFixed(1)} ${y(p.income).toFixed(1)}`]))
    .join(' ')
  const lastX = x(shown.length - 1)
  const area = `${step} L${lastX.toFixed(1)} ${y(0)} L0 ${y(0)} Z`
  const feeY = y(fees)
  const gap = Math.max(0, fees - (shown[shown.length - 1]?.income ?? 0))

  return (
    <div className="stack g10">
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none"
        role="img" aria-label="Verified income against fees paid, week by week">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold-500)" stopOpacity=".34" />
            <stop offset="100%" stopColor="var(--gold-500)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* the money already spent — a flat, unmoving line the income must reach */}
        <line x1="0" y1={feeY} x2={w} y2={feeY} stroke="var(--muted-2)" strokeWidth="1.5"
          strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={y(0)} x2={w} y2={y(0)} stroke="var(--line)" strokeWidth="1"
          vectorEffect="non-scaling-stroke" />

        <path d={area} fill={`url(#${gid})`} />
        <path d={step} fill="none" stroke="var(--gold-500)" strokeWidth="2"
          strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        {/* today — a marker, drawn light enough not to read as data */}
        <line x1={lastX} y1={padT} x2={lastX} y2={y(0)} stroke="var(--line)" strokeWidth="1"
          strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <circle cx={lastX} cy={y(shown[shown.length - 1]?.income ?? 0)} r="3.5"
          fill="var(--surface)" stroke="var(--gold-500)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="row g16 wrap between">
        <div className="row g14 wrap">
          <span className="lg-key"><i className="bar" style={{ background: 'var(--gold-500)' }} />Verified income {money(shown[shown.length - 1]?.income ?? 0)}</span>
          <span className="lg-key"><i className="dash" />Fees paid {money(fees)}</span>
        </div>
        <span className="t-xs c-muted2">
          {gap > 0 ? `${moneyShort(gap)} still to earn before fees are returned` : 'Fees returned'}
          {' · week '}{shown.length} of {weeks.length}
        </span>
      </div>
    </div>
  )
}

/* ---------- the disclosure that must travel with every income figure ---------- */

export function IncomeDisclosure({ cohort, compact }: { cohort: CohortContext; compact?: boolean }) {
  return (
    <div className="discl" data-compact={compact ? 'true' : 'false'}>
      <Info aria-hidden />
      <div className="stack g6" style={{ minWidth: 0 }}>
        <span className="t-xs w-sb">How to read any income figure on this page</span>
        <div className="row g6 wrap">
          <Badge tone="line">n = {count(cohort.n)} students</Badge>
          <Badge tone="line">median {money(cohort.median)}</Badge>
          <Badge tone="line">{cohort.zeroPct}% earned nothing</Badge>
          <Badge tone="line">{cohort.earningPct}% earned something</Badge>
        </div>
        <span className="t-xs c-muted2" style={{ lineHeight: 1.65 }}>
          Across every student in {cohort.label}, reported after a mentor verified the client
          payment. We publish the median and the share who earned nothing, never an average and
          never a best case. Income is semi-passive and is never guaranteed.
        </span>
      </div>
    </div>
  )
}

/* ---------- small titled block used across all three pages ---------- */

export function Panel({ title, aside, children, foot, className = '' }: {
  title: ReactNode; aside?: ReactNode; children: ReactNode; foot?: ReactNode; className?: string
}) {
  return (
    <section className={`card ${className}`}>
      <div className="card-head">
        <h2 className="t-md w-sb truncate">{title}</h2>
        {aside}
      </div>
      <div className="card-body">{children}</div>
      {foot && <div className="card-foot t-xs c-muted2">{foot}</div>}
    </section>
  )
}
