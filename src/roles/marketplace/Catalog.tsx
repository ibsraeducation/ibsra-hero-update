/* ==========================================================================
   The marketplace catalogue, shared by the student and the parent dashboard.

   One component on purpose: a family and their child must not be shown two
   different prices, seat counts or date ranges for the same thing. The only
   differences between the two audiences are the wording of the button and
   whose age the age band is checked against.

   Every card opens the listing it describes. The interest button sits inside
   that card and stays a separate target, because asking to join and reading
   the detail are two different intentions.
   ========================================================================== */

import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays, Check, ChevronRight, Clock, GraduationCap, Layers, MapPin,
  Store, Users, Video, Wallet,
} from 'lucide-react'
import { productContent, seatsLeft, useStore } from '@/lib/store'
import { Badge, Empty, Tabs } from '@/components/ui'
import { date, mins, money } from '@/lib/format'
import {
  PRODUCT_CATEGORIES, PRODUCT_CATEGORY_META,
  type Product, type ProductCategory,
} from '@/lib/types'
import { CATEGORY_ICON, Thumb, priceLabel } from './shared'

export type Audience = 'student' | 'parent'

/* ---------------- one card ---------------- */

export function ProductCard({ p, to, badges, action, foot }: {
  p: Product
  /** Where the card leads. Omitted makes it a plain card. */
  to?: string
  badges?: ReactNode
  action?: ReactNode
  foot?: ReactNode
}) {
  const db = useStore(s => s.db)
  const content = productContent(db, p)
  const mentor = db.people.find(x => x.id === p.instructorId)
  const left = seatsLeft(p)

  const facts: Array<[ReactNode, string]> = []
  if (p.duration) facts.push([<Clock key="d" className="ico-xs" />, p.duration])
  if (p.startDate) {
    facts.push([
      <CalendarDays key="c" className="ico-xs" />,
      p.endDate ? `${date(p.startDate)} → ${date(p.endDate)}` : `From ${date(p.startDate)}`,
    ])
  }
  if (p.category === 'program' && p.pricePerCourse) {
    facts.push([<Wallet key="w" className="ico-xs" />, `or ${money(p.pricePerCourse)} per course`])
  } else if ((p.installments ?? 1) > 1) {
    facts.push([<Wallet key="w" className="ico-xs" />, `In ${p.installments} payments`])
  }
  facts.push([<Users key="a" className="ico-xs" />, `Ages ${p.ageMin}–${p.ageMax}`])
  if (p.location) facts.push([<MapPin key="l" className="ico-xs" />, p.location])
  if (content) {
    facts.push([
      <Layers key="k" className="ico-xs" />,
      `${content.courses} course${content.courses === 1 ? '' : 's'} · ${content.sessions} session${content.sessions === 1 ? '' : 's'} open`,
    ])
    if (content.minutes) {
      facts.push([<Video key="v" className="ico-xs" />, `${mins(content.minutes)} of material`])
    }
  }
  if (mentor) facts.push([<GraduationCap key="m" className="ico-xs" />, mentor.name])

  return (
    /* The whole card opens the listing, but the card itself is not an anchor:
       the title's link stretches an invisible overlay across it instead. That
       keeps the interest button a real button rather than a button nested
       inside a link, which is invalid and confuses a screen reader. */
    <article className="folder prod-card">
      <Thumb p={p} tail={<span className="prod-thumb-price tnum">{priceLabel(p)}</span>} />

      <div className="folder-body">
        <div className="row g8 mb8" style={{ minWidth: 0 }}>
          {to
            ? <Link to={to} className="t-md w-sb grow clamp2 prod-link" title={p.name}>{p.name}</Link>
            : <span className="t-md w-sb grow clamp2" title={p.name}>{p.name}</span>}
          {to && <ChevronRight className="folder-go" />}
        </div>

        {badges && <div className="row g6 wrap mb8">{badges}</div>}

        <span className="t-xs c-muted clamp2" style={{ lineHeight: 1.6 }}>{p.summary}</span>

        <div className="prod-facts mt8">
          {facts.slice(0, 6).map(([icon, text], i) => (
            <span key={i} className="prod-fact">
              <span className="row">{icon}</span>
              <span className="truncate" title={text}>{text}</span>
            </span>
          ))}
        </div>

        <div className="prod-foot">
          <span className="t-xs c-muted2 truncate">
            {foot ?? (p.seats >= 999
              ? 'No seat limit'
              : left === 0
                ? 'Full — waiting list only'
                : `${left} of ${p.seats} seats left`)}
          </span>
          {action}
        </div>
      </div>
    </article>
  )
}

/* ---------------- the interest button ---------------- *
   Interest is held in the store rather than in this component, so the card
   and the detail page can never disagree about what has been asked for — and
   it survives the navigation between them. */

export function InterestButton({ p, audience, size = 'sm' }: {
  p: Product
  audience: Audience
  size?: 'sm' | ''
}) {
  const on = useStore(s => s.interest.includes(p.id))
  const toggle = useStore(s => s.toggleInterest)
  const full = p.seats < 999 && seatsLeft(p) === 0

  const label = on
    ? (audience === 'parent' ? 'Interest sent' : 'Requested')
    : full
      ? 'Join the waiting list'
      : audience === 'parent' ? 'Ask about this' : 'Ask to join'

  return (
    <button
      className={`btn ${size} ${on ? '' : 'primary'}`}
      /* Not `data-on`: that already means a pressed tool button elsewhere and
         fills it solid, which would make "already asked" the loudest thing on
         the card. This is a done state, so it reads as one. */
      data-flagged={on ? 'true' : undefined}
      onClick={() => toggle(p.id)}
    >
      {on ? <><Check />{label}</> : label}
    </button>
  )
}

/* ---------------- the catalogue ---------------- */

export function Catalog({ audience, basePath, enrolledTrackId, age, emptyBody }: {
  audience: Audience
  /** Where a card leads: `${basePath}/${id}`. */
  basePath: string
  /** The program the reader is already on. Marked, never hidden — a family
   *  should still be able to read what they bought. */
  enrolledTrackId?: string
  /** Checked against each listing's age band, when we know it. */
  age?: number
  emptyBody?: string
}) {
  const products = useStore(s => s.db.products)
  const [cat, setCat] = useState<ProductCategory>('program')

  /* Only listed products reach a family — drafts and archived rows are the
     admin's working state, exactly like an unpublished session. */
  const listed = useMemo(
    () => products.filter(p => p.status === 'published'),
    [products],
  )

  const byCat = useMemo(() => {
    const m = {} as Record<ProductCategory, Product[]>
    for (const c of PRODUCT_CATEGORIES) m[c] = []
    for (const p of listed) m[p.category]?.push(p)
    for (const c of PRODUCT_CATEGORIES) {
      m[c].sort((a, b) => (a.startDate ?? '9').localeCompare(b.startDate ?? '9'))
    }
    return m
  }, [listed])

  const rows = byCat[cat] ?? []
  const meta = PRODUCT_CATEGORY_META[cat]

  return (
    <>
      <Tabs<ProductCategory>
        value={cat}
        onChange={setCat}
        items={PRODUCT_CATEGORIES.map(c => {
          const Icon = CATEGORY_ICON[c]
          return {
            value: c,
            label: PRODUCT_CATEGORY_META[c].label,
            icon: <Icon />,
            count: byCat[c].length,
          }
        })}
      />

      <p className="t-xs c-muted2 mt12" style={{ maxWidth: 620, lineHeight: 1.6 }}>{meta.blurb}</p>

      <div className="mt16">
        {rows.length === 0 ? (
          <div className="card"><Empty
            icon={<Store />}
            title={`Nothing listed under ${meta.label.toLowerCase()} yet`}
          /></div>
        ) : (
          <div className="prod-grid">
            {rows.map(p => (
              <ProductCard
                key={p.id}
                p={p}
                to={`${basePath}/${p.id}`}
                badges={<CardBadges p={p} audience={audience} enrolledTrackId={enrolledTrackId} age={age} />}
                action={<InterestButton p={p} audience={audience} />}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/** Split out so the detail page can show exactly the same set. */
export function CardBadges({ p, audience, enrolledTrackId, age }: {
  p: Product
  audience: Audience
  enrolledTrackId?: string
  age?: number
}) {
  const enrolled = !!enrolledTrackId && p.trackId === enrolledTrackId
  const fits = age === undefined ? undefined : age >= p.ageMin && age <= p.ageMax
  const full = p.seats < 999 && seatsLeft(p) === 0
  if (!enrolled && fits !== false && !full) return null
  return (
    <>
      {enrolled && (
        <Badge tone="teal" dot>
          {audience === 'parent' ? 'Already enrolled' : 'You are on this'}
        </Badge>
      )}
      {fits === false && <Badge tone="line">Outside the age band</Badge>}
      {full && <Badge tone="gold">Full</Badge>}
    </>
  )
}

/* The one sentence that has to travel with any price on a family-facing
   surface while checkout does not exist. */
export function EnrolmentNote({ audience }: { audience: Audience }) {
  return (
    <p className="t-xs c-muted2 mt16" style={{ maxWidth: 660, lineHeight: 1.7 }}>
      Prices are the listed price in EGP and include everything named on the card. Asking
      {audience === 'parent' ? ' about a listing flags it for your mentor' : ' to join flags your interest for your mentor'}
      {' '}— it does not reserve a seat and it does not take payment. Enrolment, instalments and the
      four-course bundle are handled with the mentor outside the platform for now, so nothing here
      charges you.
    </p>
  )
}
