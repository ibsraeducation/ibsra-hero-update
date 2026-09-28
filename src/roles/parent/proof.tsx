/* ==========================================================================
   Parent · performance — "See the proof".

   Every card on the performance pages opens a pop-up that shows where its
   number comes from: the pieces it was built from, as charts, and a few
   plain-English lines on how it is worked out. Nothing here is a new figure —
   every chart reads the same slice the card reads, so the proof can never
   disagree with the claim.

   Charts are hand-rolled (SVG and plain HTML), like the rest of the app.
   Colours come from --pc-* in proof.css: one validated trio for the three
   habits, the brand for single series, and greys for "not yet" / "missed".
   ========================================================================== */

import { useState, type ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'
import { ArrowRight, BarChart3 } from 'lucide-react'
import { Modal } from '@/components/ui'
import { date, mins, money } from '@/lib/format'
import type { CohortContext } from './data'
import { IncomeDisclosure } from './ui'
import {
  PAYBACK_TARGET, markOf,
  type AssetRow, type SessionRow, type TaskRow, type TopicRow,
} from './performanceModel'
import './proof.css'

/** The slice fields the proofs read — a structural subset of the page's slice. */
export interface ProofFacts {
  first: string
  title: string
  level: 'program' | 'course' | 'session'
  units: Array<{ key: string; label: string; rows: SessionRow[] }>
  sessions: SessionRow[]
  att: { live: number; held: number; attended: number; missed: number; upcoming: number }
  tasks: TaskRow[]
  due: TaskRow[]
  marked: TaskRow[]
  mark: number | null
  topics: TopicRow[]
  learned: TopicRow[]
  ahead: TopicRow[]
  assets: AssetRow[]
  assetsHeld: AssetRow[]
  assetsMaking: AssetRow[]
  roiRows: AssetRow[]
  fees: number
  income: number
  payback: number | null
  cohort: CohortContext & { medianPayback: number }
}

export type ProofKind =
  | 'commitment' | 'projects' | 'learned' | 'ahead'
  | 'assetsHave' | 'assetsBuilding' | 'returnAssets' | 'return'

const TITLE: Record<ProofKind, string> = {
  commitment: 'Commitment Score',
  projects: 'Projects score',
  learned: 'What was learned',
  ahead: 'What comes next',
  assetsHave: 'Finished work owned',
  assetsBuilding: 'Work being built',
  returnAssets: 'Money from each piece',
  return: 'Return against the goal',
}

const T = {
  main: 'var(--pc-main)', a: 'var(--pc-1)', b: 'var(--pc-2)', c: 'var(--pc-3)',
  off: 'var(--pc-off)', soft: 'var(--pc-soft)',
}
const pct = (v: number) => `${Math.round(v)}%`
const count = (v: number) => String(Math.round(v))
const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`

/* ---------------- Commitment Score ----------------
   The average of three habits. A habit with nothing to measure yet is left
   out rather than counted as zero, so a child is never marked down for a
   class that has not happened. */

export interface Habit { key: 'att' | 'in' | 'time'; label: string; value: number | null; detail: string }

export function commitmentOf(c: Pick<ProofFacts, 'att' | 'due' | 'marked'>): { score: number | null; habits: Habit[] } {
  const onTimeN = c.marked.filter(t => t.onTime).length
  const habits: Habit[] = [
    {
      key: 'att', label: 'Came to live classes',
      value: c.att.held ? (c.att.attended / c.att.held) * 100 : null,
      detail: c.att.held ? `${c.att.attended} of ${n(c.att.held, 'class', 'classes')}` : c.att.live ? 'no class held yet' : 'no live classes here',
    },
    {
      key: 'in', label: 'Handed homework in',
      value: c.due.length ? (c.marked.length / c.due.length) * 100 : null,
      detail: c.due.length ? `${c.marked.length} of ${n(c.due.length, 'task')}` : 'nothing due yet',
    },
    {
      key: 'time', label: 'Handed it in on time',
      value: c.marked.length ? (onTimeN / c.marked.length) * 100 : null,
      detail: c.marked.length ? `${onTimeN} of ${c.marked.length} on time` : 'nothing handed in yet',
    },
  ]
  const have = habits.filter(h => h.value !== null)
  return {
    score: have.length ? Math.round(have.reduce((a, h) => a + (h.value as number), 0) / have.length) : null,
    habits,
  }
}

/* ================= chart pieces ================= */

function Legend({ items }: { items: Array<{ name: string; tone: string; text?: ReactNode }> }) {
  return (
    <div className="proof-legend">
      {items.map(i => (
        <span key={i.name}><i style={{ background: i.tone }} />{i.name}{i.text !== undefined && <b className="tnum">{i.text}</b>}</span>
      ))}
    </div>
  )
}

interface Col { label: string; value: number | null; note?: string; tone?: string }

/** Columns from one baseline. Hover (or focus) a column to read it out. */
function Columns({ items, max, fmt = pct, reference, caption, h = 176 }: {
  items: Col[]; max?: number; fmt?: (v: number) => string
  reference?: { value: number; label: string }; caption: string; h?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  if (!items.length) return <p className="proof-empty">Nothing to chart here yet.</p>
  const top = max ?? Math.max(1, ...items.map(i => i.value ?? 0), reference?.value ?? 0)
  const W = Math.max(600, items.length * 56)
  const PL = 38, PR = 10, PT = 18, PB = 30
  const plotH = h - PT - PB
  const band = (W - PL - PR) / items.length
  const bw = Math.min(24, band * 0.56)
  const y = (v: number) => PT + (1 - Math.min(v, top) / top) * plotH
  const maxChars = Math.max(4, Math.floor(band / 6.4))
  const cut = (s: string) => (s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s)
  const shown = hover !== null ? items[hover] : null

  return (
    <figure className="proof-fig">
      <div className="proof-scroll">
        <svg viewBox={`0 0 ${W} ${h}`} className="proof-svg" style={{ minWidth: items.length * 48 }}
          role="img" aria-label={caption}>
          {[0, top / 2, top].map(t => (
            <g key={t}>
              <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} className="proof-grid" />
              <text x={PL - 8} y={y(t) + 3.5} className="proof-tick" textAnchor="end">{fmt(t)}</text>
            </g>
          ))}
          {items.map((it, i) => {
            const cx = PL + band * i + band / 2
            const x = cx - bw / 2
            const base = y(0)
            const topY = it.value === null ? base : y(it.value)
            const hh = base - topY
            const r = Math.min(4, hh, bw / 2)
            const d = hh <= 0 ? '' : `M${x} ${base} V${topY + r} Q${x} ${topY} ${x + r} ${topY} H${x + bw - r} Q${x + bw} ${topY} ${x + bw} ${topY + r} V${base} Z`
            return (
              <g key={i} className="proof-hit" tabIndex={0}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                aria-label={`${it.label}: ${it.value === null ? 'nothing to measure yet' : fmt(it.value)}`}>
                <rect x={cx - band / 2} y={PT} width={band} height={plotH + PB} fill="transparent" />
                {d && <path d={d} fill={it.tone ?? T.main} opacity={hover === null || hover === i ? 1 : 0.45} />}
                {(it.value === null || items.length <= 12) && (
                  <text x={cx} y={(it.value === null ? base : topY) - 6} className="proof-val" textAnchor="middle">
                    {it.value === null ? '—' : fmt(it.value)}
                  </text>
                )}
                <text x={cx} y={h - 10} className="proof-tick" textAnchor="middle">{cut(it.label)}</text>
              </g>
            )
          })}
          {reference && (
            <g>
              <line x1={PL} x2={W - PR} y1={y(reference.value)} y2={y(reference.value)} className="proof-ref" />
              <text x={W - PR} y={y(reference.value) - 6} className="proof-ref-text" textAnchor="end">{reference.label}</text>
            </g>
          )}
        </svg>
      </div>
      <figcaption className="proof-cap">
        {shown
          ? <><b>{shown.label}</b> · {shown.value === null ? 'nothing to measure yet' : fmt(shown.value)}{shown.note ? ` · ${shown.note}` : ''}</>
          : caption}
      </figcaption>
    </figure>
  )
}

interface HRow { label: string; sub?: string; parts: Array<{ name: string; value: number; tone: string }>; valueText: string }

/** Horizontal bars — for long names (lessons, pieces of work). */
function HBars({ rows, max, legend, caption, limit = 10 }: {
  rows: HRow[]; max?: number; legend?: Array<{ name: string; tone: string }>; caption: string; limit?: number
}) {
  const [all, setAll] = useState(false)
  if (!rows.length) return <p className="proof-empty">Nothing to chart here yet.</p>
  const top = max ?? Math.max(1, ...rows.map(r => r.parts.reduce((a, p) => a + p.value, 0)))
  const list = all ? rows : rows.slice(0, limit)
  return (
    <figure className="proof-fig">
      {legend && legend.length > 1 && <Legend items={legend} />}
      <div className="proof-hbars" role="img" aria-label={caption}>
        {list.map((r, i) => (
          <div key={i} className="proof-hrow" title={`${r.label}: ${r.valueText}`}>
            <span className="proof-hlabel">
              <span className="truncate">{r.label}</span>
              {r.sub && <span className="proof-hsub truncate">{r.sub}</span>}
            </span>
            <span className="proof-htrack">
              {r.parts.filter(p => p.value > 0).map((p, j) => (
                <i key={j} style={{ width: `${(p.value / top) * 100}%`, background: p.tone }} />
              ))}
            </span>
            <b className="proof-hval tnum">{r.valueText}</b>
          </div>
        ))}
      </div>
      {rows.length > limit && (
        <button type="button" className="proof-more" onClick={() => setAll(a => !a)}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
      <figcaption className="proof-cap">{caption}</figcaption>
    </figure>
  )
}

/** One bar split into parts of a whole, with a legend that carries the counts. */
function Stack({ parts, caption }: { parts: Array<{ name: string; value: number; tone: string; text?: string }>; caption: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0)
  if (!total) return <p className="proof-empty">{caption} Nothing yet.</p>
  return (
    <figure className="proof-fig">
      <div className="proof-stack" role="img" aria-label={`${caption} ${parts.map(p => `${p.name}: ${p.value}`).join(', ')}`}>
        {parts.filter(p => p.value > 0).map(p => (
          <i key={p.name} style={{ flexGrow: p.value, background: p.tone }} title={`${p.name}: ${p.text ?? p.value}`} />
        ))}
      </div>
      <Legend items={parts.map(p => ({ name: p.name, tone: p.tone, text: p.text ?? p.value }))} />
      <figcaption className="proof-cap">{caption}</figcaption>
    </figure>
  )
}

type DotState = 'yes' | 'no' | 'later'

/** One dot per event, in order — hover or focus a dot to read it. */
function Dots({ items, words, caption }: {
  items: Array<{ label: string; sub?: string; state: DotState }>
  words: Record<DotState, string>
  caption: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover !== null ? items[hover] : null
  const tally = (s: DotState) => items.filter(i => i.state === s).length
  return (
    <figure className="proof-fig">
      <div className="proof-dots">
        {items.map((d, i) => (
          <span key={i} className="proof-dot" data-state={d.state} tabIndex={0}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            aria-label={`${d.label}: ${words[d.state]}`} />
        ))}
      </div>
      <div className="proof-legend">
        {(['yes', 'no', 'later'] as DotState[]).filter(s => tally(s)).map(s => (
          <span key={s}><i className="proof-dot" data-state={s} />{words[s]}<b className="tnum">{tally(s)}</b></span>
        ))}
      </div>
      <figcaption className="proof-cap">
        {shown ? <><b>{shown.label}</b> · {words[shown.state]}{shown.sub ? ` · ${shown.sub}` : ''}</> : caption}
      </figcaption>
    </figure>
  )
}

/** The child's return, the goal and the middle student on one scale. */
function Bullet({ you, target, median, first }: { you: number; target: number; median: number; first: string }) {
  const top = Math.max(1.25, you * 1.1, median * 1.1)
  const at = (v: number) => `${Math.min(100, (v / top) * 100)}%`
  return (
    <figure className="proof-fig">
      <div className="proof-bullet" role="img"
        aria-label={`${first}: ${you.toFixed(2)}×, goal ${target}×, middle student ${median.toFixed(2)}×`}>
        <i className="proof-bullet-fill" style={{ width: at(you) }} />
        <span className="proof-bullet-tick" style={{ left: at(target) }} />
        <span className="proof-bullet-dot" style={{ left: at(median) }} />
      </div>
      <div className="proof-legend">
        <span><i style={{ background: T.main }} />{first}<b className="tnum">{you.toFixed(2)}×</b></span>
        <span><i className="proof-key-tick" />Goal<b className="tnum">{target}×</b></span>
        <span><i className="proof-key-dot" />Middle student<b className="tnum">{median.toFixed(2)}×</b></span>
      </div>
      <figcaption className="proof-cap">1× means client money has paid back all the fees.</figcaption>
    </figure>
  )
}

/* ================= the proofs ================= */

function Head({ value, label, line }: { value: string; label: string; line?: string }) {
  return (
    <div className="proof-head">
      <span className="proof-num">{value}</span>
      <span className="stack g2">
        <span className="t-sm w-sb">{label}</span>
        {line && <span className="t-xs c-muted2">{line}</span>}
      </span>
    </div>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return <div className="proof-part"><h4 className="proof-part-h">{title}</h4>{children}</div>
}

function How({ items }: { items: string[] }) {
  return (
    <div className="proof-how">
      <span className="eyebrow">How this is worked out</span>
      <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  )
}

const unitTopics = (u: ProofFacts['units'][number]) => u.rows.flatMap(r => r.topics)
const unitTasks = (u: ProofFacts['units'][number]) => u.rows.flatMap(r => r.tasks)
const partWord = (c: ProofFacts) => (c.level === 'program' ? 'course' : 'session')

function Body({ kind, c }: { kind: ProofKind; c: ProofFacts }) {
  switch (kind) {
    case 'commitment': {
      const cm = commitmentOf(c)
      const lives = c.sessions.filter(s => s.live)
      return (
        <>
          <Head value={cm.score === null ? '—' : `${cm.score}%`} label="Commitment Score" line="The average of three habits." />
          <Columns
            items={cm.habits.map((h, i) => ({ label: h.label, value: h.value, note: h.detail, tone: [T.a, T.b, T.c][i] }))}
            max={100}
            reference={cm.score === null ? undefined : { value: cm.score, label: `Score ${cm.score}%` }}
            caption="Each bar is one habit. The line is their average — that is the score." />
          <Part title="Every live class">
            {lives.length ? (
              <Dots
                items={lives.map(s => ({
                  label: `S${s.order + 1} · ${s.name}`, sub: s.when ? date(s.when) : undefined,
                  state: s.attendance === 'attended' ? 'yes' : s.attendance === 'missed' ? 'no' : 'later',
                }))}
                words={{ yes: 'came', no: 'missed', later: 'still to come' }}
                caption="One dot per live class, in order. Hover a dot to see which class." />
            ) : <p className="proof-empty">No live classes here — the lessons are recorded videos.</p>}
          </Part>
          <Part title={`Homework handed in, by ${partWord(c)}`}>
            <Columns
              items={c.units.map(u => {
                const du = unitTasks(u).filter(t => t.status !== 'open')
                const got = du.filter(t => t.status === 'marked').length
                return { label: u.label, value: du.length ? (got / du.length) * 100 : null, note: du.length ? `${got} of ${du.length} handed in` : 'nothing due yet' }
              })}
              max={100}
              caption="The share of homework that was due and got handed in." />
          </Part>
          <How items={[
            'Each bar at the top is one habit, out of 100%.',
            'The score is the average of those bars. A habit with nothing to measure yet is left out, not counted as zero.',
            `Classes that have not happened yet are never counted against ${c.first}.`,
          ]} />
        </>
      )
    }

    case 'projects': {
      const missing = c.due.filter(t => t.status === 'missing').length
      const open = c.tasks.length - c.due.length
      const onTimeN = c.marked.filter(t => t.onTime).length
      const cols: Col[] = c.level === 'session'
        ? (c.sessions[0]?.tasks ?? []).map((t, i) => ({
            label: `Task ${i + 1}`,
            value: t.status === 'marked' ? t.mark ?? 0 : null,
            note: t.status === 'marked' ? `${t.points} points${t.onTime ? '' : ' · late'}` : t.status === 'missing' ? 'not handed in' : 'not due yet',
          }))
        : c.units.map(u => {
            const ts = unitTasks(u)
            const got = ts.filter(t => t.status === 'marked').length
            return { label: u.label, value: markOf(ts), note: `${got} marked` }
          })
      return (
        <>
          <Head value={c.mark === null ? '—' : `${Math.round(c.mark)}%`} label="Average mark"
            line={`Across ${n(c.marked.length, 'marked task')}.`} />
          <Columns items={cols} max={100}
            caption={c.level === 'session' ? 'The mark for each task, out of 100.' : `The average mark for each ${partWord(c)}, out of 100.`} />
          <Part title="Handed in">
            <Stack caption="All the homework in this part, by where it stands."
              parts={[
                { name: 'Handed in and marked', value: c.marked.length, tone: T.main },
                { name: 'Not handed in', value: missing, tone: T.off },
                { name: 'Not due yet', value: open, tone: T.soft },
              ]} />
          </Part>
          <Part title="On time">
            <Stack caption="Of the work handed in, how much came in on time."
              parts={[
                { name: 'On time', value: onTimeN, tone: T.a },
                { name: 'Late', value: c.marked.length - onTimeN, tone: T.off },
              ]} />
          </Part>
          <How items={[
            'Each task is marked out of 100 by the mentor, within 72 hours.',
            'Bigger tasks (more points) count more in the average.',
            'Only handed-in work gets a mark. Work not handed in shows in the grey part of the bar above.',
            'Work that is not due yet is left out.',
          ]} />
        </>
      )
    }

    case 'learned': {
      const leveled = c.learned.filter(t => t.level !== undefined)
      return (
        <>
          <Head value={`${c.learned.length}/${c.topics.length}`} label="Lessons learned" />
          <Columns
            items={c.units.map(u => {
              const ts = unitTopics(u)
              const have = ts.filter(t => t.state === 'have').length
              return { label: u.label, value: ts.length ? (have / ts.length) * 100 : null, note: `${have} of ${n(ts.length, 'lesson')}` }
            })}
            max={100}
            caption={`The share of lessons covered in each ${partWord(c)}.`} />
          <Part title="The mentor's level for each lesson">
            <HBars max={100}
              rows={leveled.map(t => ({ label: t.name, parts: [{ name: 'Level', value: t.level!, tone: T.main }], valueText: `${t.level}/100` }))}
              caption="How well each covered lesson was understood, out of 100, as judged by the mentor." />
          </Part>
          <How items={[
            'A lesson counts as learned once it has been covered.',
            'The level beside each lesson is the mentor\'s own judgement, out of 100.',
          ]} />
        </>
      )
    }

    case 'ahead': {
      const coming = c.sessions.flatMap(s => s.topics.filter(t => t.state !== 'have').map(t => ({ t, s })))
      return (
        <>
          <Head value={String(c.ahead.length)} label="Lessons still to come" />
          <Columns fmt={count}
            items={c.units.map(u => {
              const ts = unitTopics(u)
              const left = ts.filter(t => t.state !== 'have').length
              return { label: u.label, value: left, note: `${left} of ${n(ts.length, 'lesson')} left` }
            })}
            caption={`How many lessons are left in each ${partWord(c)}.`} />
          <Part title="How long each coming lesson takes">
            <HBars
              rows={coming.map(({ t, s }) => ({
                label: t.name, sub: `S${s.order + 1}`,
                parts: [{ name: 'Minutes', value: t.minutes, tone: T.main }], valueText: mins(t.minutes),
              }))}
              caption="Watching plus doing, in minutes." />
          </Part>
          <How items={['Only lessons that are already built are listed — nothing here is a plan that might change.']} />
        </>
      )
    }

    case 'assetsHave':
    case 'assetsBuilding': {
      const will = c.assets.filter(a => a.state === 'will').length
      const split = (
        <Stack caption="Every piece of work in this part, by where it stands."
          parts={[
            { name: 'Owned', value: c.assetsHeld.length, tone: T.main },
            { name: 'Being made', value: c.assetsMaking.length, tone: T.b },
            { name: 'Will build', value: will, tone: T.soft },
          ]} />
      )
      if (kind === 'assetsBuilding') {
        const building = [...c.assets.filter(a => a.state === 'making'), ...c.assets.filter(a => a.state === 'will')]
        return (
          <>
            <Head value={String(building.length)} label="Pieces being built" />
            {split}
            <Part title="In order">
              <ul className="proof-list">
                {building.map(a => (
                  <li key={a.id}><i className="proof-dot" data-state={a.state === 'making' ? 'yes' : 'later'} />
                    <span className="grow">{a.name}</span><span className="t-xs c-muted2">{a.state === 'making' ? 'being made' : 'will build'} · {a.courseCode}</span></li>
                ))}
              </ul>
            </Part>
            <How items={['"Being made" means started and not yet approved by the mentor.', '"Will build" means planned later in a course already paid for.']} />
          </>
        )
      }
      const valued = c.assetsHeld.filter(a => a.value !== null)
      return (
        <>
          <Head value={`${c.assetsHeld.length}/${c.assets.length}`} label="Finished pieces owned" />
          {split}
          <Part title="How much each piece is wanted">
            <HBars max={100}
              legend={[{ name: 'People who bought or enrolled', tone: T.a }, { name: 'Client star ratings', tone: T.c }]}
              rows={valued.map(a => ({
                label: a.name,
                sub: `${n(a.demand, 'person', 'people')}${a.rating !== null ? ` · ★ ${a.rating.toFixed(1)}` : ' · no ratings yet'}`,
                parts: [
                  { name: 'People', value: Math.min(1, a.demand / 12) * 60, tone: T.a },
                  { name: 'Ratings', value: a.rating === null ? 0 : ((a.rating - 1) / 4) * 40, tone: T.c },
                ],
                valueText: `${a.value}/100`,
              }))}
              caption="A score out of 100, not a price." />
          </Part>
          <How items={[
            'A piece counts as owned once the mentor approves it and it is published under the student\'s own name.',
            'Up to 60 points come from people who bought or enrolled (12 people gives the full 60).',
            'Up to 40 points come from client star ratings. With no ratings yet, only the people part counts.',
          ]} />
        </>
      )
    }

    case 'returnAssets': {
      const owned = c.roiRows.filter(a => a.state === 'have')
      return (
        <>
          <Head value={money(c.income)} label="Money from real clients" line={`Against ${money(c.fees)} of fees paid.`} />
          <HBars
            rows={owned.map(a => ({
              label: a.name, sub: a.feeShare ? `built with ${money(a.feeShare)} of fees` : undefined,
              parts: [{ name: 'Money earned', value: a.income, tone: T.main }], valueText: money(a.income),
            }))}
            caption="Verified money each finished piece has brought in." />
          <Part title="This month and last month">
            <HBars
              rows={owned.map(a => ({
                label: a.name,
                parts: [{ name: 'Last 30 days', value: a.last30, tone: T.a }],
                valueText: `${money(a.last30)} · before: ${money(a.prev30)}`,
              }))}
              caption="Money in the last 30 days (the bar), and the 30 days before (the number after 'before')." />
          </Part>
          <IncomeDisclosure cohort={c.cohort} compact />
        </>
      )
    }

    case 'return': {
      if (c.payback === null) {
        return <p className="proof-empty">No fees have been paid for this part yet, so there is nothing to pay back.</p>
      }
      return (
        <>
          <Head value={`${c.payback.toFixed(2)}×`} label="Of the fees paid back by client money"
            line={`${money(c.income)} from clients against ${money(c.fees)} of fees.`} />
          <Bullet you={c.payback} target={PAYBACK_TARGET} median={c.cohort.medianPayback} first={c.first} />
          {c.cohort.buckets.length > 0 && (
            <Part title={`All ${c.cohort.n} students in ${c.cohort.label}`}>
              <Columns fmt={count}
                items={c.cohort.buckets.map(b => ({
                  label: b.label, value: b.n, tone: b.holdsMe ? T.main : T.soft,
                  note: b.holdsMe ? `${c.first} is in this group` : undefined,
                }))}
                caption={`How many students earned each amount. ${c.first} is in the darker bar.`} />
            </Part>
          )}
          <How items={[
            'Return = verified money from clients ÷ fees paid.',
            `The ${PAYBACK_TARGET}× goal is a promise about the program, not about ${c.first}. Money from clients is never guaranteed.`,
          ]} />
          <IncomeDisclosure cohort={c.cohort} compact />
        </>
      )
    }
  }
}

/* ================= the pop-up ================= */

export function ProofModal({ kinds, goTo, c, onClose }: {
  kinds: ProofKind[] | null
  /** Overview cards: the page this proof summarises. */
  goTo?: { label: string; to: To }
  c: ProofFacts
  onClose: () => void
}) {
  const many = (kinds?.length ?? 0) > 1
  return (
    <Modal
      open={!!kinds}
      onClose={onClose}
      wide
      title={<span className="row g8"><BarChart3 style={{ width: 17, height: 17, color: 'var(--brand)' }} />
        {goTo && many ? goTo.label : kinds ? TITLE[kinds[0]] : ''}</span>}
      description={`Where this number comes from · ${c.title}`}
      footer={goTo && (
        <Link className="btn primary" to={goTo.to} onClick={onClose}>Open the {goTo.label} page<ArrowRight /></Link>
      )}
    >
      <div className="proof">
        {kinds?.map(k => (
          <section key={k} className="proof-sec">
            {many && <h3 className="proof-sec-h">{TITLE[k]}</h3>}
            <Body kind={k} c={c} />
          </section>
        ))}
      </div>
    </Modal>
  )
}

/** One pop-up per page: `open(kinds, goTo?)` and the node to render. */
export function useProof(c: ProofFacts) {
  const [st, setSt] = useState<{ kinds: ProofKind[]; goTo?: { label: string; to: To } } | null>(null)
  const open = (kinds: ProofKind[], goTo?: { label: string; to: To }) => setSt({ kinds, goTo })
  const node = <ProofModal kinds={st?.kinds ?? null} goTo={st?.goTo} c={c} onClose={() => setSt(null)} />
  return [open, node] as const
}

/** Makes a whole card open its proof. Clicks on links, buttons and the
 *  "How this is counted" fold keep doing their own thing. Layout-neutral. */
export function Proofable({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  return (
    <div className="proofable" onClick={e => {
      if ((e.target as HTMLElement).closest('a,button,details,summary,select,input,textarea,label')) return
      onOpen()
    }}>
      {children}
    </div>
  )
}

/** The keyboard way in, and the visible hint that the card opens. */
export function ProofChip({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="proof-chip" onClick={e => { e.stopPropagation(); onOpen() }}>
      <BarChart3 />See the proof
    </button>
  )
}
