/* ==========================================================================
   Parent · One training program

   What used to open underneath the summary's funnel, on a page of its own.
   The summary stays a single row of folders however many programs and
   courses the child collects, and a program's detail can run as long as its
   curriculum does. Previous / next walk the same path the funnel shows.
   ========================================================================== */

import { Fragment, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BackLink } from '@/lib/backNav'
import {
  BadgeCheck, Briefcase, CheckCircle2, ChevronLeft, ChevronRight, Circle, Dot,
  FolderOpen, Info, Lightbulb, LineChart, ListChecks, Store,
} from 'lucide-react'
import { Badge, Empty } from '@/components/ui'
import { date, pct } from '@/lib/format'
import { useStore } from '@/lib/store'
import { scoreTone, useParent, type ProgramStage } from './data'
import { ScoreDots } from './ui'
import { iso, programPath, stageMeta, topicCount } from './stages'

function Crumbs({ name }: { name: string }) {
  return (
    <nav className="crumbs mb12" aria-label="Breadcrumb">
      <BackLink to="/parent" className="crumb-link">Reporting summary</BackLink>
      <ChevronRight className="sepr" style={{ width: 13, height: 13 }} />
      <b className="truncate">{name}</b>
    </nav>
  )
}

function ProgramDetail({ p, first, productId }: { p: ProgramStage; first: string; productId?: string }) {
  const meta = stageMeta(p.stage)
  const future = p.stage === 'soon' || p.stage === 'recommended'
  const heads = {
    learn: p.stage === 'done' ? `What ${first} learned` : p.stage === 'live' ? `What ${first} is learning` : `What ${first} will learn`,
    skills: p.stage === 'done' ? 'Skills gained' : p.stage === 'live' ? 'Skills being built' : `Skills ${first} will have`,
    assets: p.stage === 'done' ? `Assets ${first} has` : p.stage === 'live' ? 'Assets so far' : `Assets ${first} will have`,
  }
  const covered = p.learn.reduce((a, g) => a + g.topics.filter(t => t.state === 'have').length, 0)

  return (
    <section className="card pd rise">
      <div className="pd-head">
        <span className="fn-card-ico lg" style={{ background: `var(--${p.track.color}-100)`, color: `var(--${p.track.color}-600)` }}>
          <FolderOpen />
        </span>
        <div className="stack g4 grow" style={{ minWidth: 0 }}>
          <div className="row g8 wrap">
            <Badge tone={meta.tone} dot>{meta.label}</Badge>
            <span className="eyebrow">{p.track.skill}</span>
          </div>
          <h1 className="t-xl w-sb">{p.track.name}</h1>
          <span className="t-sm c-muted">{p.track.blurb}</span>
        </div>
        <div className="row g8 wrap" style={{ flex: 'none' }}>
          {(p.stage === 'done' || p.stage === 'live') && (
            <Link className="btn sm" to={`/parent/performance?program=${p.track.id}`}><LineChart />Performance</Link>
          )}
          {future && (
            <Link className="btn sm" to={productId ? `/parent/marketplace/${productId}` : '/parent/marketplace'}>
              <Store />View in marketplace
            </Link>
          )}
        </div>
      </div>

      <div className="pd-meta">
        {p.stage === 'done' && <>
          <span><b>{p.courses.length}</b> course{p.courses.length === 1 ? '' : 's'} finished</span>
          <span>{date(iso(p.start))} – {date(iso(p.end))}</span>
          {p.score !== undefined && <span>Closing mark <b>{p.score.toFixed(1)}/5</b></span>}
        </>}
        {p.stage === 'live' && <>
          <span><b>{pct(p.progress, 0)}</b> through the current course</span>
          <span><b>{covered}</b> of {topicCount(p)} topics covered</span>
          <span>Ends {date(iso(p.end))}</span>
        </>}
        {p.stage === 'soon' && <>
          <span>Booked · starts <b>{date(iso(p.start))}</b></span>
          <span>{topicCount(p)} topics in the first course</span>
        </>}
        {p.stage === 'recommended' && <>
          <span>Recommended after <b>{p.after}</b></span>
          <span>{p.start ? `Next intake ${date(iso(p.start))}` : 'No intake scheduled yet'}</span>
          <span>Not enrolled — nothing is charged until you enrol</span>
        </>}
      </div>

      {p.after && (
        <div className="pd-why">
          <Lightbulb aria-hidden />
          <div className="stack g4">
            <span className="t-sm w-sb">Where it sits on the path</span>
            <p className="t-sm c-ink2" style={{ lineHeight: 1.65 }}>
              It is what IBSRA runs after <b>{p.after}</b>.
            </p>
            <Link to="/parent/path" className="crumb-link t-xs">See the whole path</Link>
          </div>
        </div>
      )}

      <div className="pd-grid">
        {/* what is learned */}
        <div className="pd-col">
          <h2 className="pd-col-head"><ListChecks />{heads.learn}</h2>
          {p.learn.length ? (
            <div className="stack g12">
              {p.learn.map(g => (
                <Fragment key={g.session}>
                  <div className="stack g6">
                    <span className="eyebrow">{g.session}</span>
                    <ul className="pd-list">
                      {g.topics.map(t => (
                        <li key={t.id} data-state={t.state}>
                          {t.state === 'have' ? <CheckCircle2 /> : t.state === 'now' ? <Dot /> : <Circle />}
                          <span className="grow">{t.name}</span>
                          {p.stage === 'live' && t.state === 'now' && <Badge tone="brand">this week</Badge>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Fragment>
              ))}
            </div>
          ) : <p className="lane-empty">The curriculum for this program is not published yet.</p>}
        </div>

        {/* skills */}
        <div className="pd-col">
          <h2 className="pd-col-head"><BadgeCheck />{heads.skills}</h2>
          <div className="stack g8">
            {p.skills.map(s => (
              <div key={s.name} className="pd-skill" data-state={s.state}>
                <span className="grow t-sm">{s.name}</span>
                {s.score !== undefined && (
                  <span className="row g6" style={{ flex: 'none' }}>
                    <ScoreDots score={s.score} tone={`var(--${scoreTone(s.score)}-500)`} />
                    <b className="t-xs tnum">{s.score.toFixed(1)}</b>
                  </span>
                )}
                {s.state === 'building' && <Badge tone="brand">building</Badge>}
                {s.state === 'will' && <Badge tone="line">will have</Badge>}
              </div>
            ))}
          </div>
          <span className="t-xs c-muted2 mt4">
            {future ? 'The competencies a mentor scores in this program.' : 'Scored out of 5 by the mentor.'}
          </span>
        </div>

        {/* assets */}
        <div className="pd-col">
          <h2 className="pd-col-head"><Briefcase />{heads.assets}</h2>
          <div className="stack g10">
            {p.assets.map(a => (
              <div key={a.name} className="pd-asset" data-state={a.state}>
                <span className="pd-asset-ico">{a.state === 'have' ? <CheckCircle2 /> : <Briefcase />}</span>
                <div className="stack g2 grow" style={{ minWidth: 0 }}>
                  <span className="t-sm w-med">{a.name}</span>
                  <span className="t-xs c-muted2" style={{ lineHeight: 1.55 }}>{a.note}</span>
                </div>
                <Badge tone={a.state === 'have' ? 'teal' : a.state === 'making' ? 'brand' : 'line'}>
                  {a.state === 'have' ? 'owned' : a.state === 'making' ? 'in the works' : 'will build'}
                </Badge>
              </div>
            ))}
          </div>
          <span className="t-xs c-muted2 mt4">Counted, never priced. Owned outright, under {first}&apos;s own name.</span>
        </div>
      </div>

      {future && (
        <div className="card-foot row g8">
          <Info className="ico-xs" style={{ color: 'var(--muted-2)' }} />
          <span>What this program is built to teach and produce — not a promise of what {first} will earn.</span>
        </div>
      )}
    </section>
  )
}

export function ParentProgram() {
  const { trackId = '' } = useParams()
  const d = useParent()
  const products = useStore(s => s.db.products)
  const first = d.child.name.split(' ')[0]

  const at = d.journey.findIndex(p => p.track.id === trackId)
  const p = at >= 0 ? d.journey[at] : undefined
  const prev = at > 0 ? d.journey[at - 1] : undefined
  const next = at >= 0 ? d.journey[at + 1] : undefined

  /* The marketplace listing a future program's "view" button should land on:
     the booked intake if there is one, otherwise the program itself. */
  const productId = useMemo(() => {
    if (!p) return undefined
    const booked = p.courses[0]?.key
    return (products.find(x => x.loopId === booked) ?? products.find(x => x.trackId === p.track.id))?.id
  }, [products, p])

  if (!p) {
    return (
      <div className="page">
        <Crumbs name="Program not found" />
        <Empty
          icon={<FolderOpen />}
          title={`This program is not on ${first}'s path`}
          action={<BackLink className="btn" to="/parent">Back to the summary</BackLink>}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <Crumbs name={p.track.name} />

      {/* Keyed by program, so stepping to the next one replays the entrance. */}
      <ProgramDetail key={p.track.id} p={p} first={first} productId={productId} />

      <nav className="between g8 wrap mt16" aria-label="Other programs on the path">
        {prev
          ? <Link className="btn sm" to={programPath(prev.track.id)}><ChevronLeft />{prev.track.name}</Link>
          : <span />}
        {next
          ? <Link className="btn sm" to={programPath(next.track.id)}>{next.track.name}<ChevronRight /></Link>
          : <span />}
      </nav>
    </div>
  )
}
