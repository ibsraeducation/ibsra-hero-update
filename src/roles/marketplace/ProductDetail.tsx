/* ==========================================================================
   One listing, in full — shared by the student and the parent dashboard.

   The card is a summary; this is the page that has to answer the question the
   card raised. Everything on it is either authored by the admin or read live
   off the curriculum: where a listing points at a real program, the courses
   and the sessions inside them are the actual published ones, so a family can
   see what they would be buying rather than a promise about it.
   ========================================================================== */

import { Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BackLink } from '@/lib/backNav'
import {
  CalendarDays, Check, ChevronRight, Clock, FileText, GraduationCap, Hammer, ListChecks,
  MapPin, Radio, Store, Users, Video,
} from 'lucide-react'
import { productContent, productCourses, seatsLeft, sessionStats, useStore } from '@/lib/store'
import { Badge, Empty } from '@/components/ui'
import { dateFull, mins } from '@/lib/format'
import { PRODUCT_CATEGORY_META, DELIVERY_META } from '@/lib/types'
import { Thumb, paymentLines, priceLabel } from './shared'
import { CardBadges, EnrolmentNote, InterestButton, type Audience } from './Catalog'

export function ProductDetail({ audience, basePath, enrolledTrackId, age, missionsPath }: {
  audience: Audience
  /** The catalogue this came from — the breadcrumb and every fallback lead back to it. */
  basePath: string
  enrolledTrackId?: string
  age?: number
  /** Where an already-enrolled reader opens the thing they bought. */
  missionsPath?: string
}) {
  const { productId } = useParams()
  const db = useStore(s => s.db)
  const p = db.products.find(x => x.id === productId)

  /* A stale link, or one to something that has been unlisted, lands on a note
     saying where to look — the same courtesy a locked session gets, rather
     than a redirect that silently loses the reader's place. */
  if (!p || p.status !== 'published') {
    return (
      <div className="page">
        <div className="card">
          <Empty
            icon={<Store />}
            title={p ? 'This listing is not open right now' : 'That listing no longer exists'}
            action={<BackLink className="btn primary" to={basePath}>Back to the marketplace<ChevronRight /></BackLink>}
          />
        </div>
      </div>
    )
  }

  const meta = PRODUCT_CATEGORY_META[p.category]
  const mentor = db.people.find(x => x.id === p.instructorId)
  const content = productContent(db, p)
  const courses = productCourses(db, p)
  const left = seatsLeft(p)
  const enrolled = !!enrolledTrackId && p.trackId === enrolledTrackId
  const plan = paymentLines(p)

  const facts: Array<{ icon: React.ReactNode; k: string; v: string }> = [
    { icon: <Clock />, k: 'How long', v: p.duration || '—' },
    {
      icon: <CalendarDays />,
      k: 'When',
      v: p.startDate
        ? (p.endDate ? `${dateFull(p.startDate)} → ${dateFull(p.endDate)}` : `From ${dateFull(p.startDate)}`)
        : 'No fixed date',
    },
    { icon: <MapPin />, k: 'Where', v: `${DELIVERY_META[p.delivery].label}${p.location ? ` · ${p.location}` : ''}` },
    { icon: <Users />, k: 'Who it is for', v: `Ages ${p.ageMin}–${p.ageMax}` },
    {
      icon: <Store />,
      k: 'Seats',
      v: p.seats >= 999 ? 'No limit' : left === 0 ? `Full — ${p.seats} taken` : `${left} of ${p.seats} left`,
    },
    { icon: <GraduationCap />, k: 'Mentor', v: mentor?.name ?? 'Not assigned yet' },
  ]

  return (
    <div className="page">
      <nav className="crumbs mb12" aria-label="Breadcrumb">
        <BackLink to={basePath} className="crumb-link">Marketplace</BackLink>
        <ChevronRight className="sepr" style={{ width: 13, height: 13 }} />
        <BackLink to={basePath} className="crumb-link">{meta.label}</BackLink>
        <ChevronRight className="sepr" style={{ width: 13, height: 13 }} />
        <b className="truncate">{p.name}</b>
      </nav>

      {/* ---------- hero ---------- */}
      <section className="card pd-hero mb20">
        <Thumb p={p} height={200} className="pd-cover" />

        <div className="pd-head">
          <div className="stack g8 grow" style={{ minWidth: 0 }}>
            <span className="eyebrow">{meta.one}</span>
            <h1 className="t-2xl w-sb">{p.name}</h1>
            <div className="row g6 wrap">
              <CardBadges p={p} audience={audience} enrolledTrackId={enrolledTrackId} age={age} />
            </div>
            <p className="t-sm c-ink2" style={{ lineHeight: 1.7, maxWidth: 620 }}>{p.summary}</p>
          </div>

          <div className="pd-buy">
            <span className="pd-price tnum">{priceLabel(p)}</span>
            <span className="t-xs c-muted2">
              {p.price === null
                ? 'Ask your mentor what this one costs'
                : p.price === 0
                  ? 'No charge for this one'
                  : plan.length ? 'Full price · or pay it one of these ways' : 'Listed price · paid with the mentor'}
            </span>
            {plan.length > 0 && (
              <span className="stack g6 pd-plan">
                {plan.map(l => (
                  <span key={l} className="prod-bullet tnum"><Check className="ico-xs" />{l}</span>
                ))}
              </span>
            )}
            <InterestButton p={p} audience={audience} size="" />
            {enrolled && missionsPath && (
              <Link className="btn" to={missionsPath}>Open it in missions<ChevronRight /></Link>
            )}
          </div>
        </div>
      </section>

      <div className="grid g-2a">
        <div className="stack g16">
          {p.description?.trim() && (
            <section className="card">
              <div className="card-head"><h2 className="t-md w-sb">About this {meta.one.toLowerCase()}</h2></div>
              <div className="card-body">
                <p className="t-sm c-ink2" style={{ lineHeight: 1.75, whiteSpace: 'pre-line' }}>{p.description}</p>
              </div>
            </section>
          )}

          {/* ---------- what is included ---------- */}
          <section className="card">
            <div className="card-head"><h2 className="t-md w-sb">What is included</h2></div>
            <div className="card-body">
              {p.highlights.length ? (
                <div className="stack g10">
                  {p.highlights.map(h => (
                    <span key={h} className="prod-bullet"><Check className="ico-xs" />{h}</span>
                  ))}
                </div>
              ) : (
                <p className="t-xs c-muted2" style={{ lineHeight: 1.7 }}>
                  Nothing itemised yet. Your mentor can walk you through what this covers.
                </p>
              )}
            </div>
          </section>

          {/* ---------- what it covers ----------
              Only published sessions, because that is what the reader would
              actually be able to open on the day they joined. */}
          {courses.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h2 className="t-md w-sb">What it covers</h2>
                {content && (
                  <span className="t-xs c-muted2 tnum">
                    {content.sessions} session{content.sessions === 1 ? '' : 's'} · {mins(content.minutes)}
                  </span>
                )}
              </div>
              <div className="card-body stack g14">
                {courses.map(({ loop, sessions }) => (
                  <Fragment key={loop.id}>
                    <div className="stack g8">
                      <div className="between g10">
                        <span className="t-sm w-sb truncate">{loop.name}</span>
                        <Badge tone="line">{loop.code}</Badge>
                      </div>
                      {sessions.length === 0 ? (
                        <span className="t-xs c-muted2">
                          Sessions for this course are still being built.
                        </span>
                      ) : (
                        <div className="stack g6">
                          {sessions.map(s => {
                            const st = sessionStats(s)
                            return (
                              <div key={s.id} className="pd-session">
                                <span className="pd-session-ix tnum">{s.order + 1}</span>
                                <span className="grow stack g2" style={{ minWidth: 0 }}>
                                  <span className="t-sm w-med truncate">{s.name}</span>
                                  <span className="row g10 wrap t-xs c-muted2 tnum">
                                    <span className="row g4">
                                      {s.type === 'live'
                                        ? <Radio className="ico-xs" />
                                        : <Video className="ico-xs" />}
                                      {s.type === 'live' ? 'Live' : 'Recorded'}
                                    </span>
                                    <span className="row g4"><ListChecks className="ico-xs" />{st.topics} topics</span>
                                    {st.projects > 0 && (
                                      <span className="row g4">
                                        <Hammer className="ico-xs" />{st.projects} project{st.projects === 1 ? '' : 's'}
                                      </span>
                                    )}
                                    <span className="row g4"><FileText className="ico-xs" />{st.tasks} questions</span>
                                    <span>{mins(st.minutes)}</span>
                                  </span>
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </Fragment>
                ))}
              </div>
              <div className="card-foot t-xs c-muted2">
                Read live from the curriculum — this is the material as it stands today, not a
                prospectus. Sessions still in draft are not counted.
              </div>
            </section>
          )}
        </div>

        {/* ---------- the practical column ---------- */}
        <div className="stack g16">
          <section className="card">
            <div className="card-head"><h2 className="t-md w-sb">The practical detail</h2></div>
            <div className="card-body stack g12">
              {facts.map(f => (
                <div key={f.k} className="pd-fact">
                  <span className="pd-fact-ico">{f.icon}</span>
                  <span className="stack g2 grow" style={{ minWidth: 0 }}>
                    <span className="eyebrow">{f.k}</span>
                    <span className="t-sm w-med">{f.v}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {mentor && (
            <section className="card">
              <div className="card-head"><h2 className="t-md w-sb">Who teaches it</h2></div>
              <div className="card-body stack g8">
                <span className="t-sm w-sb">{mentor.name}</span>
                {mentor.expertise?.length && (
                  <div className="chips">
                    {mentor.expertise.map(x => <span key={x} className="skill" data-state="have">{x}</span>)}
                  </div>
                )}
                {mentor.reviewSlaHours && (
                  <span className="t-xs c-muted2" style={{ lineHeight: 1.6 }}>
                    Reviews submitted work within {mentor.reviewSlaHours} hours.
                  </span>
                )}
              </div>
            </section>
          )}

          <BackLink to={basePath} className="card jump">
            <span className="jump-ico" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>
              <Store />
            </span>
            <span className="stack g2 grow">
              <span className="t-md w-sb">Back to the marketplace</span>
              <span className="t-xs c-muted2">Everything else on offer, by category.</span>
            </span>
            <ChevronRight className="jump-go" />
          </BackLink>
        </div>
      </div>

      <EnrolmentNote audience={audience} />
    </div>
  )
}
