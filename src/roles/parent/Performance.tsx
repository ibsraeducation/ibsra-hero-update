/* ==========================================================================
   Parent · Student performance analysis

   Five pages under one slicer:
     Learning    how fast it lands, how well it sticks, what comes next
     Character   ten work habits a mentor can watch directly
     Portfolio   an estimated worth of the published work, and its reach
     Assets      what they own, what each piece is worth, what it brought back
     Ask AI      a full-page assistant for a quick answer — see Insight.tsx, last
                 because a parent reaches for it after reading the numbers

   The slicer cuts by training program → course → session and every page
   reads the same cut. The cut lives in the URL (?program=…&course=…&session=…)
   and travels with the page tabs, so moving between pages never loses it and
   a parent can send the exact view to the mentor.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Link, NavLink, Outlet, useLocation, useOutletContext, useSearchParams,
} from 'react-router-dom'
import { BackLink } from '@/lib/backNav'
import {
  ArrowLeft, Briefcase, CheckCircle2,
  Linkedin, Mail, MessageSquare, Target, TrendingDown, TrendingUp,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Empty } from '@/components/ui'
import { date, money } from '@/lib/format'
import { useToast } from '@/lib/store'
import { paybackTone, paybackWord, scoreTone, useParent } from './data'
import { IncomeDisclosure, Panel, Ring } from './ui'
import { PageFeedback } from './Insight'
import { ProofChip, Proofable, useProof } from './proof'
import {
  PAYBACK_TARGET, attendanceOf, markOf, usePerformanceModel,
  type AssetRow, type SessionRow,
} from './performanceModel'
import { useScoresModel, type CharacterTrait } from './scoresModel'
import './performance.css'

type Model = ReturnType<typeof usePerformanceModel>
type Program = Model[number]
type Course = Program['courses'][number]

const STAGE = {
  done: { dot: 'have', word: 'Finished', tone: 'teal' },
  live: { dot: 'now', word: 'In progress', tone: 'brand' },
  soon: { dot: 'next', word: 'Coming', tone: 'sky' },
} as const
const COURSE = {
  done: { dot: 'have', word: 'Finished', tone: 'teal' },
  live: { dot: 'now', word: 'In progress', tone: 'brand' },
  next: { dot: 'next', word: 'Coming', tone: 'sky' },
} as const
const SESSION = {
  have: { word: 'Covered', tone: 'teal' },
  now: { word: 'In progress', tone: 'brand' },
  next: { word: 'Not reached', tone: 'line' },
} as const
const ASSET = {
  have: { word: 'owned', tone: 'teal' },
  making: { word: 'in the works', tone: 'brand' },
  will: { word: 'will build', tone: 'line' },
} as const

/** Mounted under both /parent and /student — same page, same data (there is
 *  no separate self-view in this no-auth demo), only the frame around it
 *  (back link, base path, where "ask the mentor" goes) reads its role off
 *  the URL so neither surface ever links into the other's rail. */
const roleFrom = (pathname: string): 'parent' | 'student' => (pathname.startsWith('/student') ? 'student' : 'parent')

const PAGES = [
  { to: 'learning', label: 'Learning' },
  { to: 'character', label: 'Character' },
  { to: 'portfolio', label: 'Portfolio' },
  { to: 'assets', label: 'Assets' },
  { to: 'ask', label: 'Ask AI' },
] as const

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const clamp = (v: number) => Math.max(0, Math.min(100, v))
const calm = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Same tone as the payback badge, so a bar and its badge never disagree. */
const paybackFill = (x: number) => {
  const t = paybackTone(x)
  return t === 'line' ? 'var(--muted-2)' : `var(--${t}-500)`
}

/* ---------------- motion ---------------- */

/** Counts from where it last stood to the new value. Static for anyone who
 *  asked their system for reduced motion. */
function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(() => (calm() ? target : 0))
  const cur = useRef(v)
  useEffect(() => {
    if (calm()) { cur.current = target; setV(target); return }
    const from = cur.current
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      const next = from + (target - from) * (1 - Math.pow(1 - k, 3))
      cur.current = next
      setV(next)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

function Num({ value, format }: { value: number; format: (v: number) => string }) {
  return <>{format(useCountUp(value))}</>
}

/** A bar that grows in from the left, after `delay` ms. */
function Grow({ pct, tone, delay = 0, className = '' }: { pct: number; tone: string; delay?: number; className?: string }) {
  return (
    <i className={`pf-grow ${className}`}
      style={{ width: `${clamp(pct)}%`, background: tone, '--d': `${delay}ms` } as CSSProperties} />
  )
}

/* ---------------- the slicer ----------------
   Three dropdowns on the tabs row: one line, however many programs,
   courses or sessions there are. */

function Pick({ label, value, onChange, disabled, children }: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean; children: ReactNode
}) {
  return (
    <select className="sel sm pf-pick" aria-label={label} title={label} value={value} disabled={disabled}
      onChange={e => onChange(e.target.value)}>
      {children}
    </select>
  )
}

/* ---------------- layout pieces ---------------- */

function Fig({ label, value, sub, bar, tone, tick, i, onOpen }: {
  label: string; value: ReactNode; sub: ReactNode
  bar: number | null; tone: string; tick?: number; i: number
  /** Opens the "see the proof" pop-up for this figure — see proof.tsx. */
  onOpen?: () => void
}) {
  return (
    <div className="pf-fig" role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `${label} — see the proof` : undefined} onClick={onOpen}
      onKeyDown={onOpen ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } } : undefined}>
      <span className="eyebrow">{label}</span>
      <span className="pf-fig-val">{value}</span>
      <span className="pf-fig-bar">
        {bar !== null && <Grow pct={bar} tone={tone} delay={180 + i * 70} />}
        {tick !== undefined && <span className="pf-tick" style={{ left: `${clamp(tick)}%` }} />}
      </span>
      <span className="pf-fig-sub">{sub}</span>
    </div>
  )
}

/** A panel's explanation, folded away until asked for — the figure first,
 *  the how-it-was-counted on one click. */
function More({ label = 'How this is counted', children }: { label?: string; children: ReactNode }) {
  return (
    <details className="pf-more">
      <summary>{label}</summary>
      <div className="pf-more-body">{children}</div>
    </details>
  )
}

/** Heading for one of the detail pages, with the slice it is reading. */
function PageHead({ title, sub }: { title: string; sub: string }) {
  const c = usePerf()
  return (
    <div className="pf-sec-head">
      <div className="stack g2 grow" style={{ minWidth: 0 }}>
        <h2 className="t-lg w-sb">{title}</h2>
        <span className="t-xs c-muted2">{sub}</span>
      </div>
      <span className="pf-where" title={c.title}>
        <Badge tone={c.status.tone} dot>{c.status.word}</Badge>
        <span className="truncate">{c.title}</span>
      </span>
    </div>
  )
}

/** On every chart: a one-click way to take that exact figure to the mentor,
 *  pre-written so a parent never has to describe which number they mean. */
function AskMentorChip({ topic }: { topic: string }) {
  const c = usePerf()
  const { pathname } = useLocation()
  const toast = useToast()
  const first = c.mentorName?.split(' ')[0] ?? 'the mentor'
  /* Only the parent surface has a mentor chat page; a student sees the same
     drafts-not-ready toast the header's "ask" button gives. */
  if (roleFrom(pathname) === 'student') {
    return (
      <button type="button" className="ask-chip" onClick={() => toast('Mentor message drafts arrive with messaging', 'info')}>
        <MessageSquare />Ask {first}
      </button>
    )
  }
  return (
    <Link className="ask-chip" to="/parent/mentor" state={{ question: `About ${topic}: ` }}>
      <MessageSquare />Ask {first}
    </Link>
  )
}

/** Income over the last 30 days against the 30 before — the part that can fall. */
function Trend({ a }: { a: AssetRow }) {
  if (a.state !== 'have') return <span className="pf-trend" data-dir="none">—</span>
  if (a.income === 0) return <span className="pf-trend" data-dir="none">no paying client yet</span>
  const diff = a.last30 - a.prev30
  if (diff === 0) return <span className="pf-trend" data-dir="none">no change</span>
  return (
    <span className="pf-trend" data-dir={diff > 0 ? 'up' : 'down'}
      title={`${money(a.last30)} in the last 30 days · ${money(a.prev30)} in the 30 before`}>
      {diff > 0 ? <TrendingUp /> : <TrendingDown />}
      {diff > 0 ? '+' : '−'}{money(Math.abs(diff))}
    </span>
  )
}

/* ---------------- one line chart, one session per point ----------------
   A gap in the data (nothing to measure that session) breaks the line
   rather than guessing a value to join it — the same rule the cashflow
   chart follows for "past today". */

interface ChartSeries { key: string; label: string; tone: string; points: Array<number | null> }

function LineChart({ series, n, height = 132, suffix = '' }: {
  series: ChartSeries[]; n: number; height?: number; suffix?: string
}) {
  const w = 600
  const padT = 10
  const padB = 8
  const innerH = height - padT - padB
  const vals = series.flatMap(s => s.points).filter((v): v is number => v !== null)
  const maxY = Math.max(1, ...vals) * 1.15
  const x = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * w)
  const y = (v: number) => padT + innerH - (v / maxY) * innerH

  /* Break the path at every gap instead of drawing across it. */
  const pathsFor = (points: Array<number | null>) => {
    const segs: string[] = []
    let cur: string[] = []
    points.forEach((v, i) => {
      if (v === null) { if (cur.length) { segs.push(cur.join(' ')); cur = [] }; return }
      cur.push(`${cur.length ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    })
    if (cur.length) segs.push(cur.join(' '))
    return segs
  }

  if (!vals.length) return <p className="lane-empty">Nothing to chart in this slice yet.</p>

  return (
    <div className="stack g10">
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img"
        aria-label={`${series.map(s => s.label).join(' and ')}, one point per session`}>
        <line x1="0" y1={y(0)} x2={w} y2={y(0)} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {series.map(s => (
          <g key={s.key}>
            {pathsFor(s.points).map((d, i) => (
              <path key={i} d={d} fill="none" stroke={s.tone} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
            {s.points.map((v, i) => v === null ? null : (
              <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="var(--surface)" stroke={s.tone} strokeWidth="2"
                vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        ))}
      </svg>
      <div className="pf-chart-x" aria-hidden>
        {Array.from({ length: n }, (_, i) => <span key={i}>S{i + 1}</span>)}
      </div>
      {series.length > 1 && (
        <div className="row g14 wrap">
          {series.map(s => <span key={s.key} className="lg-key"><i className="bar" style={{ background: s.tone }} />{s.label}</span>)}
        </div>
      )}
      {suffix && <span className="t-xs c-muted2">{suffix}</span>}
    </div>
  )
}

/* ---------------- the slice: every figure the four pages read ---------------- */

function buildSlice(program: Program, course: Course | undefined, session: SessionRow | undefined,
  first: string, mentorName: string | undefined) {
  const level: 'program' | 'course' | 'session' = session ? 'session' : course ? 'course' : 'program'
  const courses = course ? [course] : program.courses
  const sessions = session ? [session] : courses.flatMap(c => c.sessions)
  const tagOf = (s: SessionRow) => (level === 'program' ? `${s.courseCode} · S${s.order + 1}` : `S${s.order + 1}`)

  /* One level below the slice: a program breaks into courses, a course into sessions. */
  const units = level === 'program'
    ? courses.map(c => ({ key: c.card.key, label: `${c.card.code} · Course ${c.card.index}`, rows: c.sessions }))
    : sessions.map(s => ({ key: s.key, label: `S${s.order + 1} · ${s.name}`, rows: [s] }))

  /* ---- scores ---- */
  const att = attendanceOf(sessions)
  const attPct = att.held ? (att.attended / att.held) * 100 : null
  const recorded = sessions.length - att.live
  const tasks = sessions.flatMap(s => s.tasks)
  const due = tasks.filter(t => t.status !== 'open')
  const marked = due.filter(t => t.status === 'marked')
  const mark = markOf(tasks)
  const onTime = marked.length ? (marked.filter(t => t.onTime).length / marked.length) * 100 : null

  /* ---- learning ---- */
  const topics = sessions.flatMap(s => s.topics)
  const learned = topics.filter(t => t.state === 'have')
  const ahead = topics.filter(t => t.state !== 'have')

  /* ---- assets and return ---- */
  const assets = courses.flatMap(c => c.assets)
  const assetsHeld = assets.filter(a => a.state === 'have')
  const assetsMaking = assets.filter(a => a.state === 'making')
  const roiRows = assets.filter(a => a.state !== 'will')
  const fees = courses.reduce((a, c) => a + c.fee, 0)
  const income = assets.reduce((a, x) => a + x.income, 0)
  const payback = fees ? income / fees : null
  const cohort = program.cohort
  const scaleMax = Math.max(1.25, (payback ?? 0) * 1.1, cohort.medianPayback * 1.1)
  const at = (v: number) => clamp((v / scaleMax) * 100)

  /* ---- what the slice is called ---- */
  const title = session ? session.name : course ? course.card.name : program.track.name
  const kind = session
    ? `Session ${session.order + 1} · ${session.live ? 'live class' : 'recorded'}`
    : course ? `Course · ${course.card.code}` : `Training program · ${program.track.skill}`
  const status = session ? SESSION[session.state] : course ? COURSE[course.card.state] : STAGE[program.stage]
  const blurb = level === 'program' ? program.track.blurb : session && course ? course.card.name : program.track.name

  return {
    first, mentorName, program, course, session, level, courses, sessions, tagOf, units,
    att, attPct, recorded, tasks, due, marked, mark, onTime,
    topics, learned, ahead,
    assets, assetsHeld, assetsMaking, roiRows, fees, income, payback, cohort, at,
    title, kind, status, blurb,
  }
}

type Perf = ReturnType<typeof buildSlice> & { search: string }
const usePerf = () => useOutletContext<Perf>()

/* ---------------- the frame: header · page tabs · slicer ---------------- */

export function ParentPerformance() {
  const d = useParent()
  const model = usePerformanceModel(d)
  const toast = useToast()
  const { search, pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const { child, mentor } = d
  const first = child.name.split(' ')[0]
  const role = roleFrom(pathname)
  const BASE = `/${role}/performance`
  const back = role === 'student'
    ? { to: '/student/missions', label: 'Missions' }
    : { to: '/parent', label: 'Reporting summary' }

  const header = (
    <PageHeader
      eyebrow={<BackLink className="crumb-link row g4" to={back.to}><ArrowLeft style={{ width: 12, height: 12 }} />{back.label}</BackLink>}
      title="Performance analysis"
      actions={
        <button className="btn" onClick={() => toast('Mentor message drafts arrive with messaging', 'info')}>
          <Mail />Ask {mentor?.name.split(' ')[0] ?? 'the mentor'}
        </button>
      }
    />
  )

  const program = model.find(p => p.track.id === params.get('program'))
    ?? model.find(p => p.stage === 'live') ?? model[0]

  if (!program) {
    return (
      <div className="page">
        {header}
        <Empty icon={<Target />} title="Nothing to report yet" />
      </div>
    )
  }

  /* No course in the URL: the one running now, or the only one there is.
     "all" is an explicit choice; an unknown key falls back to all. */
  const courseParam = params.get('course')
  const course = courseParam === 'all'
    ? undefined
    : program.courses.find(c => c.card.key === courseParam)
      ?? (courseParam ? undefined
        : program.courses.find(c => c.card.state === 'live')
          ?? (program.courses.length === 1 ? program.courses[0] : undefined))
  const session = course?.sessions.find(s => s.id === params.get('session'))
  const sliceKey = `${program.track.id}/${course?.card.key ?? 'all'}/${session?.id ?? 'all'}`

  const setScope = (next: { program?: string; course?: string; session?: string }) => {
    const p = new URLSearchParams()
    p.set('program', next.program ?? program.track.id)
    if (next.course) p.set('course', next.course)
    if (next.session) p.set('session', next.session)
    setParams(p, { replace: true })
  }

  const ctx: Perf = { ...buildSlice(program, course, session, first, mentor?.name), search }

  return (
    <div className="page pf-page">
      {header}

      {/* ---------- the five pages on the left, the slice on the right ---------- */}
      <div className="pf-top">
        <nav className="pf-tabs" aria-label="Performance pages">
          {PAGES.map(p => (
            <NavLink key={p.to} end to={{ pathname: `${BASE}/${p.to}`, search }}
              className={({ isActive }) => `pf-tab${isActive ? ' active' : ''}`}>
              {p.label}
            </NavLink>
          ))}
        </nav>

        <div className="pf-picks" role="group" aria-label="Slice the report">
          <Pick label="Program" value={program.track.id} onChange={v => setScope({ program: v })}>
            {model.map(p => (
              <option key={p.track.id} value={p.track.id}>{p.track.name} · {STAGE[p.stage].word}</option>
            ))}
          </Pick>

          <Pick label="Course" value={course?.card.key ?? 'all'} onChange={v => setScope({ course: v })}>
            <option value="all">All courses</option>
            {program.courses.map(c => (
              <option key={c.card.key} value={c.card.key}>{c.card.code} · {COURSE[c.card.state].word}</option>
            ))}
          </Pick>

          <Pick label="Session" value={session?.id ?? ''}
            disabled={!course || !course.sessions.length}
            onChange={v => course && setScope({ course: course.card.key, session: v || undefined })}>
            <option value="">
              {!course ? 'Pick a course first' : course.sessions.length ? 'All sessions' : 'No sessions yet'}
            </option>
            {course?.sessions.map(s => (
              <option key={s.key} value={s.id}>S{s.order + 1} · {s.name}{s.live ? ' (live)' : ''}</option>
            ))}
          </Pick>
        </div>
      </div>

      <div key={`${pathname}|${sliceKey}`}>
        {/* Each page's own mentor note, read first — see Insight.tsx */}
        <PageFeedback c={ctx} />
        <Outlet context={ctx} />
      </div>
    </div>
  )
}

/* Page 1 · Ask AI is `PerformanceAsk`, in Insight.tsx alongside its chat panel. */

/* ================= page 2 · Learning ================= */

export function PerformanceLearning() {
  const c = usePerf()
  const [openProof, proofNode] = useProof(c)
  const sessions = useMemo(() => [...c.sessions].sort((a, b) => a.order - b.order), [c.sessions])
  const m = useScoresModel(c.title, c.assets, sessions.length)
  const n = sessions.length

  /* Each session's asset-related value: the average value of that session's
     course's own assets — assets are built across a course, not one session
     at a time, so every session in a course reads the same figure. Null
     until the course has a valued asset, never guessed. */
  const valueByCourse = useMemo(() => {
    const groups = new Map<string, number[]>()
    for (const a of c.assets) {
      if (a.value === null) continue
      groups.set(a.courseCode, [...(groups.get(a.courseCode) ?? []), a.value])
    }
    const out = new Map<string, number>()
    groups.forEach((vals, code) => out.set(code, Math.round(vals.reduce((x, y) => x + y, 0) / vals.length)))
    return out
  }, [c.assets])

  const newInfoPts = sessions.map(s => s.topics.filter(t => t.state === 'have').length)
  const infoValuePts = sessions.map(s => valueByCourse.get(s.courseCode) ?? null)
  const understandingPts = sessions.map(s => markOf(s.tasks))

  const learnedRows = sessions.flatMap(s => s.topics.filter(t => t.state === 'have').map(t => ({ s, t })))
  const aheadRows = sessions.flatMap(s => s.topics.filter(t => t.state !== 'have').map(t => ({ s, t })))

  const charts = [
    {
      key: 'newInfo', title: 'New information rate',
      help: `New topic titles ${c.first} learned, session by session.`,
      series: [{ key: 'v', label: 'New topics', tone: 'var(--brand)', points: newInfoPts }],
    },
    {
      key: 'infoValue', title: 'Information value rate',
      help: `The value of the asset that session's material builds toward — out of 100, from demand and client rating.`,
      series: [{ key: 'v', label: 'Asset value', tone: 'var(--sky-500)', points: infoValuePts }],
    },
    {
      key: 'understanding', title: 'Understanding rate',
      help: `The average mark on questions answered that session, out of 100.`,
      series: [{ key: 'v', label: 'Average mark', tone: 'var(--teal-500)', points: understandingPts }],
    },
    {
      key: 'engagement', title: 'Engagement rate',
      help: `How present ${c.first} was in the room, and how much of it stuck once class ended.`,
      series: [
        { key: 'during', label: 'During the session', tone: 'var(--teal-500)', points: m.engagement.during },
        { key: 'after', label: 'After the session', tone: 'var(--gold-500)', points: m.engagement.after },
      ],
    },
  ]

  return (
    <section className="pf-sec">
      <PageHead title="Learning" sub="How fast it lands, how well it sticks, and what comes next." />

      <div className="pf-learn-grid">
        {charts.map(ch => (
          <Panel key={ch.key} title={ch.title}
            aside={<AskMentorChip topic={ch.title.toLowerCase()} />}
            foot={<More>{ch.help}</More>}>
            <LineChart n={n} series={ch.series} />
          </Panel>
        ))}
      </div>

      <div className="grid g-2 mt16">
        <Proofable onOpen={() => openProof(['learned'])}>
        <Panel title={`What ${c.first} learned`}
          aside={<span className="row g6"><Badge tone="teal">{plural(learnedRows.length, 'topic')}</Badge><ProofChip onOpen={() => openProof(['learned'])} /><AskMentorChip topic="what was learned" /></span>}>
          {learnedRows.length ? (
            <div className="tbl-wrap" style={{ margin: -16 }}>
              <table className="tbl">
                <thead><tr><th>Session</th><th>Topic learned</th></tr></thead>
                <tbody>
                  {learnedRows.map(({ s, t }) => (
                    <tr key={t.id}><td className="tnum">S{s.order + 1}</td><td>{t.name}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="lane-empty">Nothing in this slice has been covered yet.</p>}
        </Panel>
        </Proofable>

        <Proofable onOpen={() => openProof(['ahead'])}>
        <Panel title={`What ${c.first} will learn, and its value`}
          aside={<span className="row g6"><Badge tone="brand">{plural(aheadRows.length, 'topic')}</Badge><ProofChip onOpen={() => openProof(['ahead'])} /><AskMentorChip topic="what comes next" /></span>}>
          {aheadRows.length ? (
            <div className="tbl-wrap" style={{ margin: -16 }}>
              <table className="tbl">
                <thead><tr><th>Session</th><th>Topic to learn</th><th className="num">Value</th></tr></thead>
                <tbody>
                  {aheadRows.map(({ s, t }) => {
                    const v = valueByCourse.get(s.courseCode) ?? null
                    return (
                      <tr key={t.id}>
                        <td className="tnum">S{s.order + 1}</td>
                        <td>{t.name}</td>
                        <td className="num tnum">{v === null ? '—' : `${v}/100`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="lane-empty">Every topic in this slice has been covered.</p>}
        </Panel>
        </Proofable>
      </div>
      {proofNode}
    </section>
  )
}

/* ================= page 3 · Character ================= */

/** One trait as its own small chart — a ring, not a bar, so ten of them read
 *  as a grid of gauges rather than another list. Closed shows the number;
 *  a tap opens the one line of evidence it was scored from. */
function CharacterCard({ t, open, onToggle }: { t: CharacterTrait; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="pf-char-card" aria-expanded={open} onClick={onToggle}>
      <Ring value={t.score} size={72} stroke={7} tone={`var(--${scoreTone(t.score / 20)}-500)`} sub={t.label} />
      <span className="pf-char-note" hidden={!open}>{t.note}</span>
    </button>
  )
}

export function PerformanceCharacter() {
  const c = usePerf()
  const m = useScoresModel(c.title, c.assets)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (key: string) => setOpen(s => {
    const next = new Set(s)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  return (
    <section className="pf-sec">
      <PageHead title="Character" sub="Ten work habits a mentor can watch directly. Tap one for what it's counted from." />
      <Panel title="Character"
        aside={<span className="row g6"><Badge tone="line">average {m.characterAvg}%</Badge><AskMentorChip topic="character" /></span>}
        foot={<More>Not a personality test, and not billed to anyone. Each habit is scored from what {c.first} actually did this slice.</More>}>
        <div className="pf-char-grid">
          {m.character.map(t => (
            <CharacterCard key={t.key} t={t} open={open.has(t.key)} onToggle={() => toggle(t.key)} />
          ))}
        </div>
      </Panel>
    </section>
  )
}

/* ================= page 4 · Portfolio ================= */

export function PerformancePortfolio() {
  const c = usePerf()
  const m = useScoresModel(c.title, c.assets)
  const maxVal = Math.max(1, ...m.portfolio.map(p => p.value))

  return (
    <section className="pf-sec">
      <PageHead title="Portfolio" sub="An estimated worth of the published work, and its reach online." />

      <Panel title="Portfolio valuation"
        aside={<span className="row g6"><Badge tone="line">estimated</Badge><AskMentorChip topic="portfolio valuation" /></span>}
        foot={
          <More>
            <p>Estimated worth of each published piece, folded from the same signals as the Assets page: demand, client rating and verified income. It is an estimate, not a price — nothing here is billed or promised.</p>
          </More>
        }>
        {m.portfolio.length ? (
          <ul className="pd-list pf-char-list">
            {m.portfolio.map(p => (
              <li key={p.id}>
                <span className="grow stack g2" style={{ minWidth: 0 }}>
                  <span className="t-sm w-med truncate">{p.name}</span>
                  <span className="t-xs c-muted2 mono">{p.courseCode}</span>
                </span>
                <span className="pf-bar" style={{ width: 120 }}><Grow pct={(p.value / maxVal) * 100} tone="var(--sky-500)" /></span>
                <b className="t-xs tnum pf-cell" style={{ minWidth: 76 }}>{money(p.value)}</b>
              </li>
            ))}
            <li className="pf-portfolio-total">
              <span className="grow t-sm w-sb">Estimated total</span>
              <b className="t-sm tnum pf-cell" style={{ minWidth: 76 }}>{money(m.portfolioTotal)}</b>
            </li>
          </ul>
        ) : <p className="lane-empty">Nothing published in this slice yet.</p>}
      </Panel>

      <Panel className="mt16" title="Media impact"
        aside={<span className="row g6"><Linkedin style={{ width: 13, height: 13 }} /><Badge tone="line">LinkedIn</Badge><AskMentorChip topic="media impact" /></span>}
        foot={<More>{c.first}&apos;s LinkedIn activity around the published work — reach, not income.</More>}>
        <ul className="pd-list">
          <li><span className="grow">Post impressions</span><b className="t-xs tnum pf-cell">{m.media.impressions.toLocaleString()}</b></li>
          <li><span className="grow">Profile views</span><b className="t-xs tnum pf-cell">{m.media.profileViews.toLocaleString()}</b></li>
          <li><span className="grow">New connections</span><b className="t-xs tnum pf-cell">{m.media.connections.toLocaleString()}</b></li>
          <li><span className="grow">Posts published</span><b className="t-xs tnum pf-cell">{m.media.postsPublished}</b></li>
          <li><span className="grow">Engagement rate</span><b className="t-xs tnum pf-cell">{m.media.engagementRate}%</b></li>
        </ul>
      </Panel>
    </section>
  )
}

/* ================= page 5 · Assets ================= */

export function PerformanceAssets() {
  const c = usePerf()
  const { assets, assetsHeld, roiRows, payback, fees, income, cohort, at, level, first } = c
  const [openProof, proofNode] = useProof(c)
  /* Being built = started and not finished, then the ones queued after it. */
  const building = [
    ...assets.filter(a => a.state === 'making'),
    ...assets.filter(a => a.state === 'will'),
  ]
  const row = (a: AssetRow) => (
    <div key={a.id} className="pd-asset" data-state={a.state}>
      <span className="pd-asset-ico">{a.state === 'have' ? <CheckCircle2 /> : <Briefcase />}</span>
      <div className="stack g2 grow" style={{ minWidth: 0 }}>
        <span className="t-sm w-med">{a.name}</span>
        <span className="t-xs c-muted2">{a.note}</span>
        <span className="t-xs c-muted2 mono">
          {a.courseCode}{a.state === 'have' ? ` · finished ${date(new Date(a.madeAt).toISOString())}` : ''}
        </span>
      </div>
      <Badge tone={ASSET[a.state].tone}>{ASSET[a.state].word}</Badge>
    </div>
  )

  return (
    <section className="pf-sec">
      <PageHead title="Assets" sub={`What ${first} owns, what each piece is worth, and what it has brought back.`} />

      <Proofable onOpen={() => openProof(['returnAssets'])}>
      <Panel title="Asset valuation and return"
        aside={<span className="row g6"><Badge tone="line">{plural(roiRows.length, 'asset')}</Badge><ProofChip onOpen={() => openProof(['returnAssets'])} /><AskMentorChip topic="asset valuation and return" /></span>}
        foot={
          <More>
            <p>Valuation is how wanted a piece is, out of 100: demand (people who bought or enrolled) plus client rating. Return is verified income ÷ the fees that built it — 0× until a client has paid.</p>
          </More>
        }>
        {roiRows.length ? (
          <div className="tbl-wrap" style={{ margin: -16 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="num">Valuation</th>
                  <th className="num">Income</th>
                  <th className="num">Return</th>
                  <th>This month vs last</th>
                </tr>
              </thead>
              <tbody>
                {roiRows.map(a => (
                  <tr key={a.id}>
                    <td>
                      <div className="stack g2">
                        <span className="w-med truncate">{a.name}</span>
                        <span className="mono t-xs c-muted2">{a.courseCode}</span>
                      </div>
                    </td>
                    <td className="num tnum">{a.value === null ? '—' : `${a.value}/100`}</td>
                    <td className="num tnum">{a.state === 'have' ? money(a.income) : '—'}</td>
                    <td className="num tnum">
                      {a.state !== 'have' ? <span className="t-xs c-muted2">in the works</span>
                        : a.roi === null ? '—' : <b>{a.roi.toFixed(2)}×</b>}
                    </td>
                    <td><Trend a={a} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="lane-empty">Nothing in this slice has been started, so there is nothing to value.</p>}
      </Panel>
      </Proofable>

      <div className="grid g-2 mt16">
        <Proofable onOpen={() => openProof(['assetsHave'])}>
        <Panel title={`Assets ${first} has`}
          aside={<span className="row g6"><Badge tone="line">{plural(assetsHeld.length, 'asset')}</Badge><ProofChip onOpen={() => openProof(['assetsHave'])} /><AskMentorChip topic="assets held" /></span>}
          foot={
            <More>
              <p>Each asset is a piece of client-facing work, approved by the mentor and published under {first}&apos;s own name. It stays {first}&apos;s after the course ends.</p>
            </More>
          }>
          {assetsHeld.length
            ? <div className="stack g10">{assetsHeld.map(row)}</div>
            : <p className="lane-empty">{first} has not finished an asset in this slice yet.</p>}
        </Panel>
        </Proofable>

        <Proofable onOpen={() => openProof(['assetsBuilding'])}>
        <Panel title={`Assets ${first} is building`}
          aside={<span className="row g6"><Badge tone="line">{plural(building.length, 'asset')}</Badge><ProofChip onOpen={() => openProof(['assetsBuilding'])} /><AskMentorChip topic="assets being built" /></span>}
          foot={
            <More>
              <p>&ldquo;In the works&rdquo; is started and not yet approved by the mentor. &ldquo;Will build&rdquo; is scheduled later in a course {first} is already enrolled in.</p>
              {level === 'session' && <p>Assets are built across a course, so a single session shows the whole course.</p>}
            </More>
          }>
          {building.length
            ? <div className="stack g10">{building.map(row)}</div>
            : <p className="lane-empty">Nothing is being built in this slice — every asset here is finished.</p>}
        </Panel>
        </Proofable>
      </div>

      <Proofable onOpen={() => openProof(['return'])}>
      <Panel className="mt16" title="Return against target"
        aside={<span className="row g6">{payback === null
          ? <Badge tone="line">not charged yet</Badge>
          : <Badge tone={paybackTone(payback)}>{paybackWord(payback)}</Badge>}<ProofChip onOpen={() => openProof(['return'])} /><AskMentorChip topic="return against target" /></span>}
        foot={
          <More>
            <p>Return is verified income ÷ fees paid. The {PAYBACK_TARGET}× target is a commitment about the program, not a promise about {first}.</p>
            {level === 'session' && <p>A session is not billed on its own, so this reads the whole course.</p>}
          </More>
        }>
        {payback === null ? (
          <p className="lane-empty">Nothing in this slice has been charged, so there is nothing to measure.</p>
        ) : (
          <div className="pf-target">
            <div className="stack g4">
              <span className="pf-score"><Num value={payback} format={v => `${v.toFixed(2)}×`} /></span>
              <span className="t-xs c-muted2">{money(income)} verified against {money(fees)} paid</span>
            </div>
            <div className="stack g6 grow">
              <div className="pf-bullet-track" role="img"
                aria-label={`${payback.toFixed(2)}× returned against a ${PAYBACK_TARGET}× target`}>
                <Grow pct={at(payback)} tone={paybackFill(payback)} delay={420} className="pf-bullet-fill" />
                <span className="pf-tick" style={{ left: `${at(PAYBACK_TARGET)}%` }} />
                <span className="pf-tick" data-kind="full" style={{ left: `${at(1)}%` }} />
                <span className="pf-median" style={{ left: `${at(cohort.medianPayback)}%` }} />
              </div>
              <div className="pf-bullet-scale" aria-hidden>
                <span style={{ left: 0 }}>0×</span>
                <span style={{ left: `${at(PAYBACK_TARGET)}%` }}>{PAYBACK_TARGET}× target</span>
                <span style={{ left: `${at(1)}%` }}>1× fees back</span>
              </div>
              <span className="t-xs c-muted2">
                <i className="pf-key-dot" />Cohort median {cohort.medianPayback.toFixed(2)}× · n = {cohort.n} · {cohort.zeroPct}% earned nothing
              </span>
            </div>
          </div>
        )}
      </Panel>
      </Proofable>

      <div className="mt16"><IncomeDisclosure cohort={cohort} compact /></div>
      {proofNode}
    </section>
  )
}

/* Same frame and pages, mounted under /student/performance — the role above
   is read off the URL, so a student never lands on a parent-only link. */
export const StudentPerformance = ParentPerformance
