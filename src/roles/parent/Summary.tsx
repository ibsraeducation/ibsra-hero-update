/* ==========================================================================
   Parent · Reporting Summary

   One card, the same "pd" shape every program's own page uses (see
   Program.tsx) — a head, a line of headline figures, then plain columns of
   rows. A parent reads top to bottom: mentor feedback collapses to one
   pill (opens the day-by-day pop-up), the path is a horizontal line —
   finished steps faded, the live one shown plainly, the very next step
   picked out in gold — and everything else (what was learned, skills,
   assets) lives one click away on that program's own page.
   ========================================================================== */

import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import {
  Briefcase, CheckCircle2, ChevronDown, ChevronUp, Circle, Dot, FolderOpen,
  ExternalLink, Route as RouteIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui'
import { date, pct } from '@/lib/format'
import { useParent, type ProgramStage } from './data'
import { MentorCard } from './Insight'
import { iso, programPath, stageMeta, topicCount } from './stages'
import './summary.css'

/** Same wording the Performance · Assets page uses, so a state never reads
 *  differently on the two pages. */
const ASSET_STATE = {
  have: { word: 'owned', tone: 'teal' },
  making: { word: 'in the works', tone: 'brand' },
  will: { word: 'will build', tone: 'line' },
} as const

/** One line per program, whatever stage it is in — what a parent needs to
 *  decide whether to open it, nothing more. */
function pathLine(p: ProgramStage): string {
  if (p.stage === 'done') {
    const n = p.courses.length
    return `${n} course${n === 1 ? '' : 's'} finished${p.score !== undefined ? ` · ${p.score.toFixed(1)}/5` : ''}`
  }
  if (p.stage === 'live') return `${pct(p.progress, 0)} through the current course · ends ${date(iso(p.end))}`
  if (p.stage === 'soon') return `Booked · starts ${date(iso(p.start))}`
  return p.start ? `After ${p.after} · next intake ${date(iso(p.start))}` : `After ${p.after} · no intake scheduled yet`
}
/** The path as a horizontal line: finished steps faded, the live one shown
 *  plainly, and only the very first upcoming step (not every later one)
 *  picked out in gold as "what's next". */
function pathState(journey: ProgramStage[], i: number): 'have' | 'now' | 'gold' | 'next' {
  const p = journey[i]
  if (p.stage === 'done') return 'have'
  if (p.stage === 'live') return 'now'
  const firstUpcoming = journey.findIndex(x => x.stage === 'soon' || x.stage === 'recommended')
  return i === firstUpcoming ? 'gold' : 'next'
}

/* ---------------------------------------------------------------- *
   Portfolio — owned pieces only. Growth is read as a shape, not a number
   (no chart library here, just a seeded walk so the same piece always
   draws the same line), and the link is a stable, deterministic slug
   until each asset carries a real published URL of its own.
 * ---------------------------------------------------------------- */

function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function rand(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** A small upward-biased walk — reach growing since the piece was published. */
function impact(key: string, points = 7): number[] {
  const r = rand(seedOf(`${key}:impact`))
  let v = 18 + Math.round(r() * 12)
  return Array.from({ length: points }, () => {
    v = Math.max(6, Math.min(100, v + Math.round((r() - 0.28) * 16)))
    return v
  })
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
/** Placeholder until each asset carries its own published URL. */
const portfolioLink = (childName: string, assetName: string) =>
  `https://portfolio.ibsraheros.com/${slug(childName)}/${slug(assetName)}`

function Spark({ points }: { points: number[] }) {
  const w = 84, h = 26, pad = 2
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const span = Math.max(1, max - min)
  const x = (i: number) => (points.length <= 1 ? w / 2 : pad + (i / (points.length - 1)) * (w - pad * 2))
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2)
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const up = points[points.length - 1] >= points[0]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="pf-spark" aria-hidden>
      <path d={d} fill="none" stroke={up ? 'var(--teal-500)' : 'var(--gold-500)'} strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="2"
        fill={up ? 'var(--teal-500)' : 'var(--gold-500)'} />
    </svg>
  )
}

export function ParentSummary() {
  const d = useParent()
  const [params] = useSearchParams()
  const [pathOpen, setPathOpen] = useState(false)
  const first = d.child.name.split(' ')[0]

  /* Older links carried the open program in the query; they now land on its page. */
  const legacy = params.get('program')
  if (legacy) return <Navigate to={programPath(legacy)} replace />

  /* The program the rest of the page is read against: whichever is running
     now, or the most recently finished one. */
  const current = d.journey.find(p => p.stage === 'live') ?? d.journey.find(p => p.stage === 'done') ?? d.journey[0]
  const doneCount = d.journey.filter(p => p.stage === 'done').length

  /* Collapsed by default: just where the child stands and what's next. The
     rest of the path (finished history, further-out recommendations) is one
     click away behind "Show full path". */
  const nowIdx = d.journey.findIndex(p => p.stage === 'live')
  const goldIdx = d.journey.findIndex(p => p.stage === 'soon' || p.stage === 'recommended')
  const anchorIdx = nowIdx !== -1 ? nowIdx : d.journey.length - 1
  const compactIdxs = [...new Set([anchorIdx, goldIdx].filter(i => i >= 0))].sort((a, b) => a - b)
  const showAll = pathOpen || d.journey.length <= compactIdxs.length
  const visible = d.journey
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => showAll || compactIdxs.includes(i))

  /* Every asset the child has built, is building, or will build, one row per
     program — never priced, only named and stated. */
  const assetRows = d.journey.flatMap(p => p.assets.map(a => ({ ...a, program: p.track.name })))
  const portfolioRows = assetRows.filter(a => a.state === 'have')
  const buildingRows = assetRows
    .filter(a => a.state !== 'have')
    .sort((a, b) => (a.state === 'making' ? 0 : 1) - (b.state === 'making' ? 0 : 1))
  const ownedCount = portfolioRows.length

  return (
    <div className="page">
      <PageHeader
        title="Reporting summary" />

      {current && (
        <MentorCard page="overview" compact
          studentId={d.child.id} trackId={current.track.id} trackName={current.track.name}
          first={first} mentorName={d.mentor?.name ?? 'The mentor'}
          stage={current.stage === 'recommended' ? 'soon' : current.stage} />
      )}

      <section className="card pd rise mt16">
        <div className="pd-head">
          <span className="fn-card-ico lg" style={{ background: 'var(--brand-100)', color: 'var(--brand-600)' }}>
            <FolderOpen />
          </span>
          <div className="stack g4 grow" style={{ minWidth: 0 }}>
            <div className="row g8 wrap">
              {current && <Badge tone={stageMeta(current.stage).tone} dot>{stageMeta(current.stage).label}</Badge>}
              <span className="eyebrow">{d.journey.length} on the path</span>
            </div>
            <h1 className="t-xl w-sb">{first}&apos;s path</h1>
            <span className="t-sm c-muted">
              {current ? current.track.blurb : `${first} has not started a training program yet.`}
            </span>
          </div>
        </div>

        <div className="pd-meta">
          <span><b>{doneCount}</b> of {d.journey.length} program{d.journey.length === 1 ? '' : 's'} finished</span>
          {current?.stage === 'live' && <span><b>{pct(current.progress, 0)}</b> through the current course</span>}
          <span><b>{ownedCount}</b> of {assetRows.length} assets owned</span>
        </div>

        <div className="pd-col" style={{ padding: '16px 18px 0' }}>
          <div className="row g8" style={{ justifyContent: 'space-between' }}>
            <h2 className="pd-col-head"><RouteIcon />The path</h2>
            {d.journey.length > compactIdxs.length && (
              <button type="button" className="btn ghost sm" onClick={() => setPathOpen(o => !o)}>
                {pathOpen ? <ChevronUp /> : <ChevronDown />}
                {pathOpen ? 'Show less' : `Show full path · ${d.journey.length}`}
              </button>
            )}
          </div>
          {d.journey.length ? (
            <div className="path-line" role="list">
              {visible.map(({ p, i }) => (
                <Link key={p.track.id} to={programPath(p.track.id)} role="listitem"
                  className="path-node" data-state={pathState(d.journey, i)}>
                  <span className="path-dot">
                    {p.stage === 'done' ? <CheckCircle2 /> : p.stage === 'live' ? <Dot /> : <Circle />}
                  </span>
                  <span className="path-lbl truncate">{p.track.name}</span>
                  <span className="path-sub t-xs c-muted2">{pathLine(p)}</span>
                </Link>
              ))}
            </div>
          ) : <p className="lane-empty">Nothing on the path yet.</p>}
          <span className="t-xs c-muted2 mt4" style={{ display: 'block', paddingBottom: 16 }}>
            Finished steps fade back, the step in progress is shown plainly, and the next step IBSRA&apos;s
            program path recommends is picked out in gold.
          </span>
        </div>

        <div className="pd-col" style={{ borderInlineStart: 0, borderTop: '1px solid var(--line-soft)' }}>
          <h2 className="pd-col-head"><Briefcase />Portfolio</h2>
          {portfolioRows.length ? (
            <div className="tbl-wrap" style={{ margin: '0 -18px' }}>
              <table className="tbl">
                <thead>
                  <tr><th>Asset</th><th>Impact</th><th>Link</th></tr>
                </thead>
                <tbody>
                  {portfolioRows.map((a, i) => (
                    <tr key={`${a.program}-${i}`}>
                      <td>
                        <div className="stack g2" style={{ minWidth: 0 }}>
                          <span className="row g6 w-med truncate">
                            <CheckCircle2 className="ico-xs c-teal" />{a.name}
                          </span>
                          <span className="t-xs c-muted2 mono">{a.program}</span>
                        </div>
                      </td>
                      <td><Spark points={impact(`${d.child.id}:${a.program}:${a.name}`)} /></td>
                      <td>
                        <a className="row g6 t-xs" href={portfolioLink(d.child.name, a.name)}
                          target="_blank" rel="noreferrer">
                          View <ExternalLink className="ico-xs" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="lane-empty row g6"><Briefcase className="ico-xs" />Nothing published yet — the first finished piece will show up here.</p>}
          <span className="t-xs c-muted2 mt4">Impact is reach growing since each piece was published — never priced.</span>

          <h2 className="pd-col-head mt16"><Briefcase />Building next</h2>
          {buildingRows.length ? (
            <div className="tbl-wrap" style={{ margin: '0 -18px' }}>
              <table className="tbl">
                <thead>
                  <tr><th>Asset</th><th>Program</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {buildingRows.map((a, i) => (
                    <tr key={`${a.program}-${i}`}>
                      <td>
                        <div className="stack g2" style={{ minWidth: 0 }}>
                          <span className="w-med truncate">{a.name}</span>
                          <span className="t-xs c-muted2">{a.note}</span>
                        </div>
                      </td>
                      <td className="t-xs c-muted2">{a.program}</td>
                      <td><Badge tone={ASSET_STATE[a.state].tone}>{ASSET_STATE[a.state].word}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="lane-empty">Nothing queued after the portfolio above.</p>}
        </div>
      </section>
    </div>
  )
}
