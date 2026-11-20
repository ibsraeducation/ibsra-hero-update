/* ==========================================================================
   Admin · Marketplace

   What a family sees, in two halves that work differently.

   The training programs are the ones in Material. They are not written up
   here and they carry no price — the platform is paid for by the month, and
   a program is asked for rather than bought. The first tab is that half:
   which programs are shown, and nothing else.

   A kit is the other half, and the only thing with a price on it: a box,
   bought outright from the family wallet, which the admin then hands over.
   Kits are rows in `products` (see `catalogue.ts`) and keep the publish
   discipline they always had — one does not reach a family until what it is,
   what it costs and how many there are are all filled in. Editing still goes
   through the store, which is what makes it instant and what lets the demo
   build run with no backend; every write is mirrored up behind it.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, Archive, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, EyeOff, GraduationCap,
  Layers, MoreHorizontal, Package, Pencil, Search, Store, Trash2,
} from 'lucide-react'
import {
  productContent, productReadiness, seatsLeft, useStore,
} from '@/lib/store'
import {
  dropUnsaved, duplicateListing, persistProduct, removeProducts, setCatalogueStatus, useCatalogue,
} from './catalogue'
import { PageHeader } from '@/components/layout/PageHeader'
import {
  Badge, Confirm, Empty, Field, Menu, MenuItem, MenuLabel, MenuSep, Modal, Tabs,
} from '@/components/ui'
import { date, mins } from '@/lib/format'
import {
  DELIVERY_META, PRODUCT_CATEGORIES, PRODUCT_CATEGORY_META, PRODUCT_STATUS_META,
  type DeliveryMode, type Product, type ProductCategory, type ProductStatus,
} from '@/lib/types'
import { CATEGORY_ICON, Thumb, paymentLines, priceLabel } from '../marketplace/shared'
import { MaterialPrograms } from './MaterialPrograms'

/* The page's two halves. */
type MktTab = 'programs' | 'kits'

const TONES = ['brand', 'gold', 'teal', 'rose', 'sky']
const STATUSES = Object.keys(PRODUCT_STATUS_META) as ProductStatus[]
const DELIVERIES = Object.keys(DELIVERY_META) as DeliveryMode[]
const INSTALMENTS = [1, 2, 3, 4, 6, 9, 12]

/* <input type="date"> speaks YYYY-MM-DD; the store speaks ISO. */
const toDateInput = (v: string | null) => (v ? v.slice(0, 10) : '')
const fromDateInput = (v: string, hour = 17) =>
  (v ? new Date(`${v}T${String(hour).padStart(2, '0')}:00:00Z`).toISOString() : null)

/** A blank number input is "not set", never 0. */
const numOrNull = (v: string) => (v === '' ? null : Math.max(0, Number(v)))

/* ---------------- the editor ---------------- */

/* The form is four tabs, one card each. A tab is found by its key; which
   tab a readiness gap belongs to is read off its wording, so the tab strip can
   say how much is left in each without a second list to keep in step. */
type SecKey = 'desc' | 'money' | 'when' | 'content'
const SEC_ORDER: SecKey[] = ['desc', 'money', 'when', 'content']
const secOf = (gap: string): SecKey =>
  /name|summary/i.test(gap) ? 'desc'
    : /price|deposit/i.test(gap) ? 'money'
      : /content/i.test(gap) ? 'content'
        : 'when'

function Section({ n, title, sub, active, children }: {
  n: number
  title: string
  sub?: string
  active: boolean
  children: ReactNode
}) {
  if (!active) return null
  return (
    <section className="form-sec" role="tabpanel">
      <div className="form-sec-head">
        <span className="form-sec-n tnum">{n}</span>
        <span className="stack g2">
          <span className="t-sm w-sb">{title}</span>
          {sub && <span className="t-xs c-muted2">{sub}</span>}
        </span>
      </div>
      <div className="stack g14">{children}</div>
    </section>
  )
}

function ProductForm({ open, draft, onChange, onClose, onSave, isNew }: {
  open: boolean
  draft: Product | null
  onChange: (patch: Partial<Product>) => void
  onClose: () => void
  /** `true` opens the program's content in Material once it is saved. */
  onSave: (thenContent?: boolean) => void
  isNew: boolean
}) {
  const db = useStore(s => s.db)
  const instructors = db.people.filter(p => p.role === 'instructor')
  const loops = draft?.trackId ? db.loops.filter(l => l.trackId === draft.trackId) : []
  const [tab, setTab] = useState<SecKey>('desc')
  useEffect(() => { if (open) setTab('desc') }, [open])

  if (!draft) return null
  const gaps = productReadiness(draft)
    /* The form is what fixes this one, so it is not a gap while editing. */
    .filter(g => !g.startsWith('No content yet'))
  const isProgram = draft.category === 'program'
  const plan = paymentLines(draft)
  const track = db.tracks.find(t => t.id === draft.trackId)
  /* Saving an unlinked program creates its folder in Material — so the button
     says where it is about to take the admin. */
  const buildsNew = isProgram && !track
  const at = SEC_ORDER.indexOf(tab)

  const secs: Array<{ key: SecKey; title: string; state: string; ok: boolean }> = [
    { key: 'desc' as SecKey, title: 'Description', state: '', ok: false },
    { key: 'money' as SecKey, title: 'Financial', state: '', ok: false },
    { key: 'when' as SecKey, title: 'Schedule & seats', state: '', ok: false },
    {
      key: 'content' as SecKey,
      title: isProgram ? 'Content' : 'Curriculum',
      state: isProgram ? (track ? 'Linked in Material' : 'Built after saving') : (draft.trackId ? 'Linked' : 'Optional'),
      ok: isProgram ? !!track : true,
    },
  ].map(s => {
    if (s.key === 'content') return s
    const left = gaps.filter(g => secOf(g) === s.key).length
    return { ...s, state: left ? `${left} to fill` : 'Complete', ok: left === 0 }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={isNew ? (isProgram ? 'New training program' : 'New kit') : draft.name || 'Untitled listing'}
      description={isProgram
        ? 'Step 1 of 2 — describe the program and set what it costs. Step 2 is its content, in Material: its courses, then the sessions in each course, then the topics in each session.'
        : 'Everything on this form is what a family reads before they decide. It is the price list, so nothing here is decoration.'}
      footer={
        <>
          <span className="grow t-xs c-muted2">
            {gaps.length === 0
              ? 'Ready to list.'
              : `${gaps.length} thing${gaps.length > 1 ? 's' : ''} still missing before this can go live.`}
          </span>
          <button className="btn" onClick={onClose}>Cancel</button>
          {at > 0 && (
            <button className="btn" onClick={() => setTab(SEC_ORDER[at - 1])}><ChevronLeft />Back</button>
          )}
          {at < SEC_ORDER.length - 1 && (
            <button className="btn" onClick={() => setTab(SEC_ORDER[at + 1])}>Next<ChevronRight /></button>
          )}
          {isProgram && !buildsNew && (
            <button className="btn" onClick={() => onSave(true)}>
              <Layers />Save &amp; open content
            </button>
          )}
          <button className="btn primary" onClick={() => onSave()}>
            {buildsNew
              ? <>{isNew ? 'Create' : 'Save'} &amp; add courses<ChevronRight /></>
              : isNew ? 'Create listing' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="stack g20">
        <div className="grid g-2">
          {/* What this is, stated rather than chosen: the Marketplace sells
              kits, and a training program is the one in Material. */}
          <Field label="What this is">
            <input className="inp" value={PRODUCT_CATEGORY_META[draft.category].one} disabled readOnly />
          </Field>

          <Field label="Status">
            <select className="sel" value={draft.status}
              onChange={e => onChange({ status: e.target.value as ProductStatus })}>
              {STATUSES.map(s => (
                <option key={s} value={s} disabled={s === 'published' && gaps.length > 0}>
                  {PRODUCT_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="form-tabs" role="tablist" aria-label="Listing sections">
          {secs.map((s, i) => (
            <button key={s.key} role="tab" aria-selected={tab === s.key} className="form-tab"
              data-on={tab === s.key} onClick={() => setTab(s.key)}>
              <span className="form-tab-n tnum" data-ok={s.ok || undefined}>
                {s.ok ? <Check /> : i + 1}
              </span>
              <span className="stack g2" style={{ minWidth: 0 }}>
                <span className="t-sm w-sb truncate">{s.title}</span>
                <span className="t-xs c-muted2 truncate">{s.state}</span>
              </span>
            </button>
          ))}
        </div>

        {/* ---------------- 1 · description ---------------- */}
        <Section n={1} active={tab === 'desc'} title="Description" sub="What it is, in the words a family reads on the card and the listing page.">
          <div className="grid g-2">
            <Field label="Name">
              <input className="inp" value={draft.name}
                placeholder={isProgram ? 'AI Video Production' : 'Creator starter kit'}
                onChange={e => onChange({ name: e.target.value })} />
            </Field>
            {isProgram ? (
              <Field label="Skill it teaches">
                <input className="inp" value={draft.skill ?? ''} placeholder="AI video"
                  onChange={e => onChange({ skill: e.target.value })} />
              </Field>
            ) : (
              <Field label="Card colour">
                <select className="sel" value={draft.color} onChange={e => onChange({ color: e.target.value })}>
                  {TONES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            )}
          </div>

          <Field label="Summary">
            <textarea className="ta" value={draft.summary}
              placeholder={isProgram
                ? 'Four 9-week courses in AI video, taken in order. Every student finishes with a paid client job.'
                : 'A phone rig, a clip mic and a light, boxed and shipped anywhere in Egypt.'}
              onChange={e => onChange({ summary: e.target.value })} />
          </Field>

          <Field label="Full description">
            <textarea className="ta" rows={4} value={draft.description ?? ''}
              placeholder="Who it is for, how a week runs, what is expected of the student and what they own at the end."
              onChange={e => onChange({ description: e.target.value })} />
          </Field>

          <Field label="What they get">
            <textarea className="ta" value={draft.highlights.join('\n')}
              placeholder={'A mentor reviews every submitted piece\nOne published portfolio piece per course\nA real client brief in the final course'}
              onChange={e => onChange({
                highlights: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
              })} />
          </Field>

          {/* The preview is the real card cover, not a mock-up of one, so what
              is set here is exactly what a family sees. */}
          <div className={`grid ${isProgram ? 'g-2a' : ''}`}>
            <Field label="Cover image" >
              <div className="row g10" style={{ alignItems: 'stretch' }}>
                <input className="inp grow" value={draft.thumbnail ?? ''}
                  placeholder="https://… or linear-gradient(135deg,#4F3BD9,#8574F0)"
                  onChange={e => onChange({ thumbnail: e.target.value })} />
                <Thumb p={draft} height={38} className="prod-thumb-mini" />
              </div>
            </Field>
            {isProgram && (
              <Field label="Card colour">
                <select className="sel" value={draft.color} onChange={e => onChange({ color: e.target.value })}>
                  {TONES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            )}
          </div>
        </Section>

        {/* ---------------- 2 · financial ---------------- */}
        <Section n={2} active={tab === 'money'} title="Financial"
          sub="The price list. Every value here is shown to the family exactly as entered.">
          <div className="grid g-2">
            <Field label={isProgram ? 'Full program price (EGP)' : 'Price (EGP)'}
>
              <input className="inp" type="number" min={0} step={50}
                value={draft.price === null ? '' : draft.price}
                placeholder="Not set"
                onChange={e => onChange({ price: numOrNull(e.target.value) })} />
            </Field>
            {isProgram ? (
              <Field label="Price per course (EGP)">
                <input className="inp" type="number" min={0} step={50}
                  value={draft.pricePerCourse ?? ''}
                  placeholder="Not offered"
                  onChange={e => onChange({ pricePerCourse: numOrNull(e.target.value) })} />
              </Field>
            ) : <span />}
          </div>

          <div className="grid g-3">
            <Field label="Instalments">
              <select className="sel" value={draft.installments ?? 1}
                onChange={e => onChange({ installments: Number(e.target.value) })}>
                {INSTALMENTS.map(n => (
                  <option key={n} value={n}>{n === 1 ? 'One payment' : `${n} payments`}</option>
                ))}
              </select>
            </Field>
            <Field label="Deposit (EGP)">
              <input className="inp" type="number" min={0} step={50}
                value={draft.deposit || ''}
                placeholder="None"
                onChange={e => onChange({ deposit: numOrNull(e.target.value) ?? 0 })} />
            </Field>
            <Field label="Paid-in-full discount (%)">
              <input className="inp" type="number" min={0} max={90} step={1}
                value={draft.upfrontDiscount || ''}
                placeholder="None"
                onChange={e => onChange({ upfrontDiscount: Math.min(90, numOrNull(e.target.value) ?? 0) })} />
            </Field>
          </div>

          <div className="pay-preview">
            <span className="eyebrow">What the family will read</span>
            <span className="t-md w-sb tnum">{priceLabel(draft)}</span>
            {plan.length > 0
              ? plan.map(l => <span key={l} className="t-xs c-ink2 tnum">{l}</span>)
              : (
                <span className="t-xs c-muted2">
                  {draft.price === null ? 'No price yet — the card will say “Price on request”.' : 'One payment, no options.'}
                </span>
              )}
          </div>
        </Section>

        {/* ---------------- 3 · schedule & seats ---------------- */}
        <Section n={3} active={tab === 'when'} title="Schedule & seats">
          <div className="grid g-2">
            <Field label="Duration">
              <input className="inp" value={draft.duration}
                placeholder={isProgram ? '4 courses · 8–10 weeks each' : 'Ships in 3–5 days'}
                onChange={e => onChange({ duration: e.target.value })} />
            </Field>
            <Field label="Mentor">
              <select className="sel" value={draft.instructorId ?? ''}
                onChange={e => onChange({ instructorId: e.target.value || null })}>
                <option value="">Not assigned</option>
                {instructors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid g-2">
            <Field label="Delivery">
              <select className="sel" value={draft.delivery}
                onChange={e => onChange({ delivery: e.target.value as DeliveryMode })}>
                {DELIVERIES.map(d => <option key={d} value={d}>{DELIVERY_META[d].label}</option>)}
              </select>
            </Field>
            <Field label="Location or platform">
              <input className="inp" value={draft.location ?? ''} placeholder="Zoom + the platform"
                onChange={e => onChange({ location: e.target.value })} />
            </Field>
          </div>

          <div className="grid g-4">
            <Field label="Youngest age">
              <input className="inp" type="number" min={5} max={99} value={draft.ageMin}
                onChange={e => onChange({ ageMin: Number(e.target.value) })} />
            </Field>
            <Field label="Oldest age">
              <input className="inp" type="number" min={5} max={99} value={draft.ageMax}
                onChange={e => onChange({ ageMax: Number(e.target.value) })} />
            </Field>
            <Field label="Seats">
              <input className="inp" type="number" min={0} value={draft.seats}
                onChange={e => onChange({ seats: Number(e.target.value) })} />
            </Field>
            <Field label="Seats taken">
              <input className="inp" type="number" min={0} value={draft.seatsTaken}
                onChange={e => onChange({ seatsTaken: Number(e.target.value) })} />
            </Field>
          </div>

          <div className="grid g-2">
            <Field label="Starts">
              <input className="inp" type="date" value={toDateInput(draft.startDate)}
                onChange={e => onChange({ startDate: fromDateInput(e.target.value) })} />
            </Field>
            <Field label="Ends">
              <input className="inp" type="date" value={toDateInput(draft.endDate)}
                onChange={e => onChange({ endDate: fromDateInput(e.target.value) })} />
            </Field>
          </div>
        </Section>

        {/* ---------------- 4 · content ---------------- */}
        {isProgram ? (
          <Section n={4} active={tab === 'content'} title="Content"
            sub="Built in Material once this is saved: courses first, then the sessions in each course, then the topics in each session.">
            <Field label="Program in Material" >
              <select className="sel" value={draft.trackId ?? ''}
                onChange={e => onChange({ trackId: e.target.value || null, loopId: null })}>
                <option value="">Build a new program in Material</option>
                {db.tracks.map(t => <option key={t.id} value={t.id}>Use existing — {t.name}</option>)}
              </select>
            </Field>
            {track && <ProgramContentLine trackId={track.id} />}
          </Section>
        ) : (
          <Section n={4} active={tab === 'content'} title="Linked curriculum" sub="Optional. A kit that belongs to a program says so on its card.">
            <div className="grid g-2">
              <Field label="Linked training program">
                <select className="sel" value={draft.trackId ?? ''}
                  onChange={e => onChange({ trackId: e.target.value || null, loopId: null })}>
                  <option value="">Not linked</option>
                  {db.tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Linked course" >
                <select className="sel" value={draft.loopId ?? ''} disabled={!draft.trackId}
                  onChange={e => onChange({ loopId: e.target.value || null })}>
                  <option value="">Whole program</option>
                  {loops.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
            </div>
          </Section>
        )}

        {gaps.length > 0 && (
          <div className="rowtop g8" style={{
            padding: '10px 12px', borderRadius: 'var(--r-md)',
            background: 'var(--gold-100)', color: 'var(--gold-700)',
          }}>
            <AlertTriangle style={{ width: 14, height: 14, flex: 'none', marginTop: 1 }} />
            <div className="stack g2">
              <span className="t-xs w-sb">Not ready to list</span>
              <span className="t-xs" style={{ lineHeight: 1.6 }}>{gaps.join(' · ')}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** Where a program's content stands, in the order it is built. */
function ProgramContentLine({ trackId }: { trackId: string }) {
  const db = useStore(s => s.db)
  const loops = db.loops.filter(l => l.trackId === trackId)
  const ids = new Set(loops.map(l => l.id))
  const sessions = db.sessions.filter(s => ids.has(s.loopId))
  const topics = sessions.reduce((a, s) => a + s.titles.length, 0)
  const steps: Array<[string, number]> = [['courses', loops.length], ['sessions', sessions.length], ['topics', topics]]
  return (
    <div className="row g8 wrap">
      {steps.map(([k, n], i) => (
        <span key={k} className="row g8">
          {i > 0 && <ChevronRight style={{ width: 12, height: 12, color: 'var(--muted-2)' }} />}
          <Badge tone={n ? 'teal' : 'line'}>{n} {k}</Badge>
        </span>
      ))}
    </div>
  )
}

/* ---------------- one row in the admin grid ---------------- */

function AdminCard({ p, onEdit }: { p: Product; onEdit: () => void }) {
  const db = useStore(s => s.db)
  const [confirm, setConfirm] = useState(false)
  const nav = useNavigate()

  const gaps = productReadiness(p)
  const content = productContent(db, p)
  const mentor = db.people.find(x => x.id === p.instructorId)
  const left = seatsLeft(p)

  const facts: string[] = [`Ages ${p.ageMin}–${p.ageMax}`]
  if (p.duration) facts.push(p.duration)
  if (p.startDate) facts.push(`${date(p.startDate)}${p.endDate ? ` → ${date(p.endDate)}` : ''}`)
  facts.push(p.seats >= 999 ? 'No seat limit' : `${left}/${p.seats} seats left`)
  if (p.location) facts.push(p.location)
  if (mentor) facts.push(mentor.name)
  if (content) {
    facts.push(`${content.courses} course${content.courses === 1 ? '' : 's'} · ${content.sessions} open · ${mins(content.minutes)}`)
  }

  return (
    <article className="folder prod-card">
      {/* The cover opens the editor: it is the biggest target on the card and
          the thing an admin points at when they mean "that one". */}
      <button className="prod-cover-btn" onClick={onEdit}
        aria-label={`Edit ${p.name || 'untitled listing'}`}>
        <Thumb
          p={p}
          tail={
            <Badge tone={PRODUCT_STATUS_META[p.status].tone} dot>
              {PRODUCT_STATUS_META[p.status].label}
            </Badge>
          }
        />
      </button>

      <span className="folder-body">
        <span className="row g8 mb8" style={{ minWidth: 0 }}>
          <button className="t-md w-sb grow clamp2 linkish" onClick={onEdit}>
            {p.name || <span className="c-muted2">Untitled listing</span>}
          </button>
          <span className="prod-price tnum">{priceLabel(p)}</span>
        </span>

        {gaps.length > 0 && p.status !== 'published' && (
          <span className="row g6 wrap mb8">
            <Badge tone="gold" title={gaps.join(' · ')}>
              <AlertTriangle />{gaps.length} to fix before it can go live
            </Badge>
          </span>
        )}

        <span className="t-xs c-muted clamp2" style={{ lineHeight: 1.6 }}>
          {p.summary || <span className="c-muted2">No summary yet — this is the part a family reads.</span>}
        </span>

        <span className="prod-facts mt8">
          {facts.slice(0, 6).map(f => (
            <span key={f} className="prod-fact"><span className="truncate" title={f}>{f}</span></span>
          ))}
        </span>

        <span className="prod-foot">
          {p.status === 'published' ? (
            <button className="btn sm" onClick={() => void setCatalogueStatus([p.id], 'draft')}>
              <EyeOff />Unlist
            </button>
          ) : (
            <button className="btn sm" disabled={gaps.length > 0}
              title={gaps.length ? gaps.join(' · ') : 'Show it in the student and parent dashboards'}
              onClick={() => void setCatalogueStatus([p.id], 'published')}>
              <Eye />List it
            </button>
          )}

          <span className="row g6" style={{ marginInlineStart: 'auto' }}>
            {p.category === 'program' && p.trackId && (
              <button className="btn sm" onClick={() => nav(`/admin/material/${p.trackId}`)}
                title="Its courses, sessions and topics, in Material">
                <Layers />Content
              </button>
            )}
            <button className="btn sm primary" onClick={onEdit}><Pencil />Edit</button>

            <Menu align="end" trigger={props => (
              <button className="btn ghost icon sm" {...props} aria-label="Listing menu">
                <MoreHorizontal />
              </button>
            )}>
              <MenuLabel>{PRODUCT_CATEGORY_META[p.category].one}</MenuLabel>
              <MenuItem icon={<Pencil />} onClick={onEdit}>Edit listing</MenuItem>
              {p.category === 'program' && p.trackId && (
                <MenuItem icon={<Layers />} onClick={() => nav(`/admin/material/${p.trackId}`)}>
                  Open content in Material
                </MenuItem>
              )}
              {/* Straight to the page a family lands on, rather than a preview
                  mode that could drift from it. Only a listed product has one. */}
              <MenuItem icon={<ExternalLink />} onClick={() => nav(`/student/marketplace/${p.id}`)}>
                {p.status === 'published' ? 'Open as a family sees it' : 'Preview (not listed yet)'}
              </MenuItem>
              <MenuItem icon={<Copy />} onClick={() => void duplicateListing(p.id)}>Duplicate</MenuItem>
              <MenuItem icon={<Archive />} onClick={() => void setCatalogueStatus([p.id], 'archived')}>
                Archive
              </MenuItem>
              <MenuSep />
              <MenuItem icon={<Trash2 />} danger onClick={() => setConfirm(true)}>Delete listing</MenuItem>
            </Menu>
          </span>
        </span>
      </span>

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void removeProducts([p.id])}
        title="Delete this listing?"
        body={<>“{p.name || 'Untitled listing'}” is removed from the catalogue for everyone. Anyone who already asked about it is not notified — this build has no messaging. Archiving keeps the record instead.{p.category === 'program' && p.trackId ? ' The program’s courses, sessions and topics stay in Material.' : ''}</>}
      />
    </article>
  )
}

/* ---------------- the page ---------------- */

export default function AdminMarketplace() {
  const { products, loading, error } = useCatalogue()
  const createProduct = useStore(s => s.createProduct)
  const createTrack = useStore(s => s.createTrack)
  const toast = useStore(s => s.toast)
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()

  const [status, setStatus] = useState<ProductStatus | 'all'>('all')
  /* Two halves of one page, and they work differently: programs are shown or
     hidden, kits are made and sold. A tab each. */
  const [tab, setTab] = useState<MktTab>('programs')
  const [q, setQ] = useState('')

  /* The form edits a detached copy, so Cancel really cancels and a
     half-typed price never reaches the catalogue. */
  const [draft, setDraft] = useState<Product | null>(null)
  const [newId, setNewId] = useState<string | null>(null)

  /* Kits, and only kits: a training program is not a listing any more — it
     is the program in Material, shown or hidden on the other tab. */
  const kits = useMemo(() => products.filter(p => p.category === 'kit'), [products])
  /* The programs are the store's own, so the tab can count them without
     waiting for anything. */
  const programCount = useStore(st => st.db.tracks.length)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return kits
      .filter(p => status === 'all' || p.status === status)
      .filter(p => !needle
        || p.name.toLowerCase().includes(needle)
        || p.summary.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [kits, status, q])

  const listed = kits.filter(p => p.status === 'published').length

  const startNew = (category: ProductCategory = 'kit') => {
    const created = createProduct({ category })
    setNewId(created.id)
    setDraft(created)
  }

  /* `?new=kit` opens the form straight away, for a link that means "add one".
     The ref keeps StrictMode's double effect from opening two drafts. An old
     `?new=program` link opens nothing: a program is not a listing any more. */
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current || params.get('new') !== 'kit') return
    opened.current = true
    startNew('kit')
    setParams({}, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeForm = () => {
    /* A brand-new row exists in the store before the form opens, so it has to
       be swept up if the admin backs out. It was never sent anywhere. */
    if (newId) dropUnsaved(newId)
    setNewId(null)
    setDraft(null)
  }

  const save = (thenContent = false) => {
    if (!draft) return
    if (!draft.name.trim()) { toast('A listing needs a name', 'err'); return }
    const { id, createdAt, updatedAt, ...patch } = draft
    void createdAt; void updatedAt

    /* A training program always has its folder in Material: saving one that
       is not linked yet creates it, named and coloured like the listing. */
    let trackId = patch.trackId ?? null
    let built = false
    if (draft.category === 'program' && !trackId) {
      trackId = createTrack({
        name: draft.name.trim(),
        skill: draft.skill?.trim() || draft.name.trim(),
        blurb: draft.summary.trim(),
        color: draft.color,
      }).id
      built = true
    }
    void persistProduct({
      ...draft,
      ...patch,
      id,
      trackId,
      loopId: draft.category === 'program' ? null : patch.loopId ?? null,
    })
    toast(built
      ? 'Program saved — now add its first course'
      : newId ? 'Listing created as a draft' : 'Listing saved')
    setNewId(null)
    setDraft(null)
    if (draft.category === 'program' && trackId && (built || thenContent)) {
      nav(`/admin/material/${trackId}`)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Marketplace"
        actions={tab === 'kits'
          ? <button className="btn primary" onClick={() => startNew('kit')}><Package />New kit</button>
          : undefined}
      />

      {error && (
        <div className="auth-alert mb12" role="alert">
          <AlertTriangle /><span>{error}</span>
        </div>
      )}

      <Tabs<MktTab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'programs', label: 'Training programs', icon: <GraduationCap />, count: programCount },
          { value: 'kits', label: 'Kits', icon: <Package />, count: kits.length },
        ]}
      />

      {/* The programs themselves live in Material; this is what families are
          shown of them, and the switch that decides it. */}
      {tab === 'programs' && <div className="mt16"><MaterialPrograms /></div>}

      {tab === 'kits' && (
      <>
      <p className="t-xs c-muted2 mt16 mb12" style={{ maxWidth: 660, lineHeight: 1.6 }}>
        A box that reaches a hero's hands. This is the only thing in the Marketplace with a price
        on it: a family buys it outright from their wallet, and it lands in Payments as an order
        for you to hand over.
      </p>

      <div className="row g10 wrap mb16">
        <div className="search grow" style={{ maxWidth: 320 }}>
          <Search />
          <input className="inp" value={q} placeholder="Search kits…"
            onChange={e => setQ(e.target.value)} />
        </div>
        <select className="sel" style={{ width: 170 }} value={status}
          onChange={e => setStatus(e.target.value as ProductStatus | 'all')}>
          <option value="all">Any status</option>
          {STATUSES.map(s => <option key={s} value={s}>{PRODUCT_STATUS_META[s].label}</option>)}
        </select>
        <span className="t-xs c-muted2 auto-s tnum">
          {rows.length} shown · {listed} live to families
        </span>
      </div>

      {loading && products.length === 0 ? (
        <div className="prod-grid">
          {[0, 1, 2].map(i => <div key={i} className="skel" style={{ height: 280 }} />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <Empty
            icon={<Package />}
            title={kits.length === 0 ? 'No kit yet' : 'Nothing matches those filters'}
            action={kits.length === 0
              ? <button className="btn primary" onClick={() => startNew('kit')}><Package />New kit</button>
              : undefined}
          />
        </div>
      ) : (
        <div className="prod-grid">
          {rows.map(p => (
            <AdminCard key={p.id} p={p} onEdit={() => { setNewId(null); setDraft({ ...p }) }} />
          ))}
        </div>
      )}

      <p className="t-xs c-muted2 mt16" style={{ maxWidth: 660, lineHeight: 1.7 }}>
        Listing a kit puts it in the family marketplace at its price, with its stock. It is bought
        outright from the family wallet and appears in Payments as an order to hand over.
      </p>
      </>
      )}

      <ProductForm
        open={!!draft}
        draft={draft}
        isNew={!!newId}
        onChange={patch => setDraft(d => (d ? { ...d, ...patch } : d))}
        onClose={closeForm}
        onSave={save}
      />
    </div>
  )
}

