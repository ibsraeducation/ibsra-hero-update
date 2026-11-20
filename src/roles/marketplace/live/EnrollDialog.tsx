import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, ExternalLink, Loader2, MessageCircle, Send, Upload,
  UserPlus, Wallet as WalletIcon,
} from 'lucide-react'
import { Modal, Tabs } from '@/components/ui'
import {
  createHero, EMPTY_HERO, HeroFields, heroProblem, type HeroDraft,
} from '@/roles/parent/live/HeroFields'
import { ParentUsersError } from '@/lib/api/family'
import { VideoEmbed } from '@/components/VideoEmbed'
import { ProgramTabs } from '@/components/ProgramTabs'
import { TabScroller } from '@/components/TabScroller'
import { Outline } from '@/components/Outline'
import { countPoints, parseOutline, type OutlineNode } from '@/lib/outline'
import { listText, PROGRAM_LISTS, type ListKey } from '@/lib/programInfo'
import { toMessage } from '@/lib/api/errors'
import { fetchMyRequests, requestWithTimes } from '@/lib/api/requests'
import type { AccessRequestRow } from '@/lib/api/rows'
import {
  amountToSend, EMPTY_BILLING, fetchBilling, fetchSubscriptions, METHOD_FEE_PCT, offeredPlans,
  openChannels, planPrice, qrUrl,
} from '@/lib/api/billing'
import { fetchMyPayments, fetchPayAccounts } from '@/lib/api/family'
import { fetchWallet, payFromWallet } from '@/lib/api/wallet'
import { fileSubscriptionPayment } from '@/lib/api/payments'
import {
  PAY_METHOD_LABEL,
  type BillingSettingsRow, type PayAccountsRow, type PaymentRow, type PayMethod, type SubscriptionRow,
} from '@/lib/api/rows'
import { isLive, PLAN_DAYS, PLAN_LABEL, type PayPlan } from '@/lib/billing'
import {
  askProblem, clock, hoursWords, MAX_LECTURE_DAYS, minutesLabel, programHours, type WeekAsk,
} from '@/lib/programLength'
import {
  durationOk, LECTURE_DEFAULT_MIN, SECTION_DEFAULT_MIN, stepFor,
} from '@/lib/api/schedule'
import {
  HALF_HOUR_MIN, HOUR_MIN, lengthRange, planFromPicks, sectionDaysOffered, sectionOn, sectionsOn,
  slotsOffered, snapRange, weekFromPicks, type LengthRange,
} from '@/lib/enrolTimes'
import { ProgramRun } from '@/components/ProgramRun'
import { fetchBatchRegions, fetchOfferedWindows, occurrencesFor } from '@/lib/api/schedule'
import { batchOpenTo, inViewerRegion, REGIONS, viewerRegion } from '@/lib/region'
import { CAIRO, dayIn, formatInTz, viewerTz, WEEKDAYS } from '@/lib/time'
import type { AvailabilityWindowRow, WindowOccurrenceRow } from '@/lib/api/rows'
import { money, SUPPORT_WHATSAPP, whatsappLink } from '@/lib/format'
import { useStore } from '@/lib/store'
import { useAuth } from '@/lib/auth'
import { useFamily, usePayArea } from '@/roles/parent/live/useFamily'
import type { Loop, Track } from '@/lib/types'
import './enrollFlow.css'

function datesLine(startMin: number, occ: WindowOccurrenceRow[] | undefined): string {
  const tz = viewerTz()
  const mine = (occ ?? []).filter(o => minuteOfDay(o.starts_at) === startMin).slice(0, 3)
  return mine.length ? `from ${mine.map(o => dayIn(o.starts_at, tz)).join(', ')}` : ''
}

function minuteOfDay(iso: string): number {
  const [h, m] = formatInTz(iso, CAIRO, { hour: '2-digit', minute: '2-digit', hour12: false })
    .split(':').map(Number)
  return h * 60 + m
}

type StepKey = 'where' | 'about' | 'values' | 'who'
  | 'lecDays' | 'lecTime' | 'secDays' | 'secTime'
  | 'pay' | 'transfer'

const STEP_LABEL: Record<StepKey, string> = {
  where: 'Where you are',
  about: 'About',
  values: 'Values & skills',
  who: 'Who is it for',
  lecDays: 'Lecture days',
  lecTime: 'Lecture duration',
  secDays: 'Section days',
  secTime: 'Section time',
  pay: 'Payment',
  transfer: 'Send the money',
}

const SCHEDULE_STEPS: StepKey[] = ['lecDays', 'lecTime', 'secDays', 'secTime']

type PayWay = 'wallet' | 'direct'

function held(
  picked: number | null, range: LengthRange | null, usual: number, step: number,
): number {
  if (!range) return 0
  const clamp = (v: number) => Math.min(range.max, Math.max(range.min, v))
  const want = clamp(picked ?? usual)
  return clamp(range.min + Math.round((want - range.min) / step) * step)
}

function Volume({ label, range, value, step, mini, onChange }: {
  label: string
  range: LengthRange
  value: number
  step: number
  mini?: boolean
  onChange: (v: number) => void
}) {
  const fill = range.max > range.min
    ? ((value - range.min) / (range.max - range.min)) * 100
    : 100
  const slider = (
    <input className="ef-vol-range" type="range" min={range.min} max={range.max}
      step={step} value={value}
      disabled={range.max <= range.min}
      aria-label={label} aria-valuetext={hoursWords(value)}
      style={{ '--fill': `${fill}%` } as CSSProperties}
      onChange={e => onChange(Number(e.target.value))} />
  )

  if (mini) {
    return (
      <div className="ef-vol-mini">
        {slider}
        <b className="tnum">{minutesLabel(value)}</b>
      </div>
    )
  }

  return (
    <div className="ef-vol">
      <div className="ef-vol-head">
        <span>{label}</span>
        <b className="tnum">{hoursWords(value)}</b>
      </div>
      {slider}
      <div className="ef-vol-ends">
        <span>{hoursWords(range.min)}</span>
        <span>{hoursWords(range.max)}</span>
      </div>
    </div>
  )
}

function NoLength({ what }: { what: string }) {
  return (
    <span className="ef-hint" style={{ marginTop: 8 }}>
      No single {what} length runs on every day you picked ΓÇö the hours open on
      those days do not overlap. Go back and pick other days, or ask us below.
    </span>
  )
}

/** How many intakes are run for a country, for the line under its button. */
function intakesIn(regions: Map<string, string>, code: string): string {
  const n = [...regions.values()].filter(r => batchOpenTo(r, code)).length
  return n ? `${n} intake${n === 1 ? '' : 's'}` : 'nothing open yet'
}

function AskAdmin({ href, text = 'None of these times work for you?' }: {
  href: string | null
  text?: string
}) {
  if (!href) return null
  return (
    <div className="ef-help">
      <span>{text}</span>
      <a className="btn sm" href={href} target="_blank" rel="noopener noreferrer">
        <MessageCircle />Chat with the admin
      </a>
    </div>
  )
}

interface CoverTab { key: string; label: string; nodes: OutlineNode[]; video: string }

function coverTabs(track: Track, courses: Loop[]): CoverTab[] {
  let nodes = parseOutline(track.overview ?? '')
  const videos = nodes.length ? track.tabVideos?.covers ?? [] : []
  if (!nodes.length) nodes = courses.flatMap(c => parseOutline(c.overview ?? ''))
  if (!nodes.length) return []

  const tabs: CoverTab[] = []
  const loose: OutlineNode[] = []
  for (const n of nodes) {
    if (n.heading) tabs.push({ key: `h${tabs.length}`, label: n.text, nodes: n.children, video: '' })
    else loose.push(n)
  }
  if (!tabs.length) return [{ key: 'overview', label: 'Overview', nodes: loose, video: videos[0] ?? '' }]
  if (loose.length) tabs.unshift({ key: 'overview', label: 'Overview', nodes: loose, video: '' })
  return tabs.map((t, i) => ({ ...t, video: videos[i] ?? '' }))
}

export function EnrollDialog({ track, courses, onClose, onDone }: {
  track: Track
  courses: Loop[]
  onClose: () => void
  onDone: () => void
}) {
  const profile = useAuth(s => s.profile)
  const { children, child, pick, reload } = useFamily()
  const area = usePayArea()
  const self = profile?.role === 'student'

  const [step, setStep] = useState(0)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<HeroDraft>(EMPTY_HERO)
  const [sent, setSent] = useState<null | { paid: 'none' | 'wallet' | 'direct' }>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Where the family says they are. The clock their browser is set to is
     a first guess at it, never the answer ΓÇö they say. */
  const [region, setRegion] = useState<string | null>(() => viewerRegion())
  const [batchRegions, setBatchRegions] = useState<Map<string, string>>(new Map())
  const [allWindows, setAllWindows] = useState<AvailabilityWindowRow[] | null>(null)
  const [dates, setDates] = useState<Record<string, WindowOccurrenceRow[]>>({})
  const [lectureKeys, setLectureKeys] = useState<string[]>([])
  const [secWin, setSecWin] = useState<Record<number, string>>({})
  const [lecDays, setLecDays] = useState<number[]>([])
  const [secDays, setSecDays] = useState<number[] | null>(null)
  const [lecMin, setLecMin] = useState<number | null>(null)
  const [secMins, setSecMins] = useState<Record<number, number>>({})

  const [billing, setBilling] = useState<BillingSettingsRow>(EMPTY_BILLING)
  const [subs, setSubs] = useState<SubscriptionRow[] | null>(null)
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [accounts, setAccounts] = useState<PayAccountsRow | null>(null)
  const [balance, setBalance] = useState(0)

  const [way, setWay] = useState<PayWay | null>(null)
  const [plan, setPlan] = useState<PayPlan>('monthly')
  const [method, setMethod] = useState<PayMethod>('instapay')
  const [amount, setAmount] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [paidFor, setPaidFor] = useState<string | null>(null)
  const [askedFor, setAskedFor] = useState<string | null>(null)
  const [asked, setAsked] = useState<AccessRequestRow[]>([])

  useEffect(() => {
    if (!profile) return
    let live = true
    void (async () => {
      try {
        const [bill, subRows, pays, acc, purse, asks] = await Promise.all([
          fetchBilling(), fetchSubscriptions(), fetchMyPayments(), fetchPayAccounts(), fetchWallet(profile.id),
          fetchMyRequests(),
        ])
        if (!live) return
        setBilling(bill); setSubs(subRows); setPayments(pays); setAccounts(acc)
        setBalance(purse.balance_egp)
        setAsked(asks)
      } catch (e) {
        if (live) { setError(toMessage(e)); setSubs([]) }
      }
    })()
    return () => { live = false }
  }, [profile])

  /* The sessions laid out inside these courses: their lengths are what
     the program's hours are made of. */
  const sessions = useStore(s => s.db.sessions)
  const course = courses[0] ?? null
  const firstName = child?.profile.name?.split(' ')[0] || 'your hero'
  const whose = self ? 'your' : `${firstName}ΓÇÖs`

  useEffect(() => {
    if (!course) return
    let live = true
    /* Every published hour, and which intake each one belongs to. The step
       below narrows them to the country the family picked, so changing
       that answer costs nothing. */
    void Promise.all([
      fetchOfferedWindows({ loopId: course.id, trackId: track.id, region: 'all' }),
      fetchBatchRegions(course.id).catch(() => new Map<string, string>()),
    ])
      .then(async ([ws, regions]) => {
        if (!live) return
        setAllWindows(ws)
        setBatchRegions(regions)
        const occ = await occurrencesFor(ws, 1, 24)
        if (live) setDates(occ)
      })
      .catch(() => { if (live) { setAllWindows([]); setDates({}) } })
    return () => { live = false }
  }, [course, track.id])

  const windows = useMemo(
    () => (allWindows === null ? null : inViewerRegion(allWindows, batchRegions, region)),
    [allWindows, batchRegions, region])

  const lecOffered = lengthRange(windows ?? [], 'lecture', lecDays)
  const lecHours = snapRange(lecOffered, HOUR_MIN)
  const lecRange = lecHours ?? lecOffered
  const lecStep = lecHours ? HOUR_MIN : stepFor(lecRange?.min ?? 0, lecRange?.max ?? 0)
  const lectureMin = held(lecMin, lecRange, LECTURE_DEFAULT_MIN, lecStep)
  const lectureLenOk = !!lecRange && durationOk('lecture', 0, lectureMin)

  const anyLecture = slotsOffered(windows ?? [], 'lecture').filter(s => s.weekday !== null)
  const anySection = slotsOffered(windows ?? [], 'section')
  const noTimes = windows === null ? null : !anyLecture.length || !anySection.length

  const lectureDayChoices = [...new Set(anyLecture.map(x => x.weekday as number))]
    .sort((a, b) => a - b)

  const lectureSlots = lectureLenOk
    ? slotsOffered(windows ?? [], 'lecture', lectureMin).filter(s => s.weekday !== null)
    : []
  const lectureSlotsOn = (d: number) => lectureSlots.filter(x => x.weekday === d)
  const lecKeyOn = (d: number) =>
    lectureKeys.find(k => lectureSlotsOn(d).some(x => x.key === k)) ?? null

  const pickedLectureKeys = lecDays
    .map(d => lecKeyOn(d) ?? lectureSlotsOn(d)[0]?.key)
    .filter((k): k is string => !!k)

  const lectureOnly = weekFromPicks(windows ?? [],
    { lectureKeys: pickedLectureKeys, sectionByDay: {}, lectureMin })

  const openDays = sectionDaysOffered(windows ?? [], lectureOnly.lectures, null)
  const takenSecDays = (secDays ?? openDays).filter(d => openDays.includes(d))

  const secLen: Record<number, { range: LengthRange | null; step: number; min: number }> =
    Object.fromEntries(takenSecDays.map(d => {
      const offered = lengthRange(windows ?? [], 'section', [d])
      const halves = snapRange(offered, HALF_HOUR_MIN)
      const range = halves ?? offered
      const step = halves ? HALF_HOUR_MIN : stepFor(range?.min ?? 0, range?.max ?? 0)
      return [d, { range, step, min: held(secMins[d] ?? null, range, SECTION_DEFAULT_MIN, step) }]
    }))

  const sectionMinByDay = Object.fromEntries(takenSecDays.map(d => [d, secLen[d].min]))

  const sectionByDay = Object.fromEntries(
    takenSecDays
      .map(d => [d, secWin[d] ?? sectionsOn(windows ?? [], d, secLen[d].min)[0]?.key])
      .filter((e): e is [number, string] => !!e[1]),
  )

  const sectionLenOk = takenSecDays.length > 0 && takenSecDays.every(d =>
    !!secLen[d].range && durationOk('section', 0, secLen[d].min) && !!sectionByDay[d])

  const picks = {
    lectureKeys: pickedLectureKeys, sectionByDay, lectureMin, sectionMinByDay,
  }
  const { lectures, sections } = weekFromPicks(windows ?? [], picks)
  const secOn = (d: number) => sectionOn(windows ?? [], picks, d)

  const ask: WeekAsk = { lectures, sections }
  const askWrong = askProblem(ask)
    ?? (lectures.length !== lecDays.length
      ? 'One of those days has no lecture time left at that length ΓÇö pick another.'
      : null)
  const totalHours = programHours(courses, sessions)

  const setLec = (d: number, id: string) =>
    setLectureKeys(ks => [...ks.filter(k => !lectureSlotsOn(d).some(x => x.key === k)), id])
  const setSec = (d: number, id: string) => setSecWin(m => ({ ...m, [d]: id }))
  const setSecLen = (d: number, v: number) => {
    setSecMins(m => ({ ...m, [d]: v }))
    setSecWin(m => Object.fromEntries(Object.entries(m).filter(([k]) => Number(k) !== d)))
  }

  const flipLecDay = (d: number) => setLecDays(ds => {
    if (ds.includes(d)) return ds.filter(x => x !== d)
    if (ds.length >= MAX_LECTURE_DAYS) return ds
    return [...ds, d].sort((a, b) => a - b)
  })
  const flipSecDay = (d: number) => setSecDays(ds => {
    const from = ds ?? openDays
    return from.includes(d) ? from.filter(x => x !== d) : [...from, d].sort((a, b) => a - b)
  })
  const sameEveryDay = () => {
    const lead = takenSecDays[0]
    const first = lead === undefined ? null : secOn(lead)
    if (!first) return
    const len = secLen[lead].min
    setSecMins(Object.fromEntries(takenSecDays.map(d => [d, len])))
    setSecWin(m => {
      const next = { ...m }
      for (const d of takenSecDays) {
        const match = sectionsOn(windows ?? [], d, len).find(s => s.startMin === first.startMin)
        if (match) next[d] = match.key
      }
      return next
    })
  }

  const kidId = child?.profile.id ?? ''
  const paidThrough = subs?.find(s => s.student_id === kidId)?.paid_through ?? null
  const waiting = payments.some(p => p.student_id === kidId && p.plan && p.status === 'pending')
  const standingAsk = !!course && asked.some(r =>
    r.student_id === kidId && r.status === 'pending' &&
    (r.loop_id === course.id || (!r.loop_id && r.track_id === track.id)))
  const needsPay = !!kidId && subs !== null && !isLive(paidThrough) && !waiting && paidFor !== kidId

  const plans = useMemo(() => offeredPlans(billing), [billing])
  useEffect(() => { if (plans.length && !plans.includes(plan)) setPlan(plans[0]) }, [plans, plan])
  const price = planPrice(billing, plan)
  const monthly = planPrice(billing, 'monthly')
  const quarterly = planPrice(billing, 'quarterly')
  const saving = monthly && quarterly ? monthly * 3 - quarterly : 0
  const savingPct = monthly && saving > 0 ? Math.round((saving / (monthly * 3)) * 100) : 0
  const walletCovers = price != null && balance >= price

  const channels = useMemo(() => openChannels(accounts), [accounts])
  useEffect(() => {
    if (channels.length && !channels.includes(method)) setMethod(channels[0])
  }, [channels, method])
  /* What the family actually transfers: the price, plus whatever the channel
     they picked takes off it on the way. Switching channel re-quotes it. */
  const fee = METHOD_FEE_PCT[method] ?? 0
  const due = price == null ? null : amountToSend(price, method)

  useEffect(() => { if (due != null) setAmount(String(due)) }, [due])

  const steps: StepKey[] = [
    'where', 'about', 'values', 'who', ...SCHEDULE_STEPS,
    ...(needsPay ? ['pay' as const] : []),
    ...(needsPay && way === 'direct' ? ['transfer' as const] : []),
  ]
  const key = steps[Math.min(step, steps.length - 1)]
  const total = steps.length + (needsPay && way === null ? 1 : 0)

  const askAdminHref = whatsappLink(accounts?.support_whatsapp || SUPPORT_WHATSAPP, [
    `Hello, I would like to enrol${self ? '' : child ? ` ${firstName}` : ''} in ${track.name}`
      + `${course ? ` (${course.name})` : ''}.`,
    lecDays.length
      ? `Lecture days: ${lecDays.map(d => WEEKDAYS[d]).join(', ')}, ${hoursWords(lectureMin)} each.`
      : '',
    key === 'secTime' && takenSecDays.length && sectionLenOk
      ? `Section days: ${takenSecDays
        .map(d => `${WEEKDAYS[d]} ${minutesLabel(secLen[d].min)}`).join(', ')}.`
      : '',
    'None of the open times suit us. Could we agree on another time?',
  ].filter(Boolean).join('\n'))

  const go = (to: number) => { setError(null); setStep(to) }

  const request = async () => {
    if (!profile || !child || !course) return
    await requestWithTimes({
      parentId: profile.id, studentId: child.profile.id, loopId: course.id, ask,
      slots: planFromPicks(windows ?? [], picks),
      region,
    })
  }

  const run = async (paid: 'none' | 'wallet' | 'direct', pay?: () => Promise<unknown>) => {
    if (!kidId) { setError('Pick which hero this is for.'); return }
    setBusy(true); setError(null)
    try {
      if (!standingAsk && askedFor !== kidId) {
        await request()
        setAskedFor(kidId)
      }
      if (pay && paidFor !== kidId) {
        await pay()
        setPaidFor(kidId)
      }
      setSent({ paid })
    } catch (e) { setError(toMessage(e)) }
    setBusy(false)
  }

  const addHero = async () => {
    const wrong = heroProblem(draft)
    if (wrong) { setError(wrong); return }
    setBusy(true); setError(null)
    try {
      const made = await createHero(draft)
      pick(made.id)
      reload()
      setDraft(EMPTY_HERO)
      setAdding(false)
    } catch (e) {
      setError(e instanceof ParentUsersError ? e.message : toMessage(e))
    }
    setBusy(false)
  }

  const payWallet = () => {
    if (!child) return
    void run('wallet', () => payFromWallet(child.profile.id, plan, track.id))
  }
  const payDirect = () => {
    if (!profile || !child) return
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) { setError('Type the amount you sent, in EGP.'); return }
    if (!proof) { setError('Upload a screenshot of the transfer.'); return }
    void run('direct', () => fileSubscriptionPayment({
      parentId: profile.id, studentId: child.profile.id, trackId: track.id,
      plan, method, amountEgp: value, proof,
    }))
  }

  const close = () => { if (sent) onDone(); else onClose() }

  const covers = useMemo(() => coverTabs(track, courses), [track, courses])
  const [coverTab, setCoverTab] = useState('')
  const coverShown = covers.find(c => c.key === coverTab) ?? covers[0]

  const outcome = useMemo(() => {
    const nodes = {} as Record<ListKey, OutlineNode[]>
    const counts: Partial<Record<ListKey, number>> = {}
    for (const l of PROGRAM_LISTS) {
      nodes[l.key] = parseOutline(listText(track, l.key))
      counts[l.key] = countPoints(nodes[l.key]) || nodes[l.key].length
    }
    const filled = PROGRAM_LISTS.map(l => l.key).filter(k => (counts[k] ?? 0) > 0)
    return { nodes, counts, filled }
  }, [track])
  const [valueTab, setValueTab] = useState<ListKey>('technical')
  const valueShown = outcome.filled.includes(valueTab) ? valueTab : outcome.filled[0]

  const intro = track.videoUrl?.trim() ?? ''
  const tabVideo = (key === 'about'
    ? coverShown?.video
    : track.tabVideos?.lists?.[valueShown ?? '']) || intro

  if (sent) {
    return (
      <Modal open onClose={close} title={track.name} className="ef-modal ef-modal-sm"
        footer={<><span className="grow" /><button className="btn primary" onClick={close}>Done</button></>}
      >
        <div className="ef-done">
          <span className="ef-check">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <span className="ef-done-title">Thank you!</span>
          <p className="ef-done-body">
            {sent.paid === 'wallet'
              ? <>Paid from your wallet ΓÇö the program is open on Material now.</>
              : sent.paid === 'direct'
                ? <>We received your payment. The admin will confirm it, and the program opens
                    the moment they do.</>
                : <>The admin will confirm {whose} enrollment.</>}
            {' '}They will agree the session times with you after that, and you will get a
            notification each time.
          </p>
        </div>
      </Modal>
    )
  }

  let primary: JSX.Element
  if (key === 'where') {
    primary = <button className="btn primary" onClick={() => go(step + 1)} disabled={!region}>
      Next<ChevronRight />
    </button>
  } else if (key === 'about' || key === 'values') {
    primary = <button className="btn primary" onClick={() => go(step + 1)}>Next<ChevronRight /></button>
  } else if (key === 'who') {
    primary = adding
      ? <button className="btn primary" onClick={() => void addHero()} disabled={busy}>
          {busy ? <Loader2 className="spin" /> : <UserPlus />}Add hero
        </button>
      : <button className="btn primary" onClick={() => go(step + 1)} disabled={!child}>
          Next<ChevronRight />
        </button>
  } else if (SCHEDULE_STEPS.includes(key)) {
    const stuck = !child || !course || noTimes !== false
      || (key === 'lecDays' && (lecDays.length < 1 || lecDays.length > MAX_LECTURE_DAYS))
      || (key === 'lecTime' && (!lectureLenOk || lectures.length !== lecDays.length))
      || (key === 'secDays' && takenSecDays.length === 0)
      || (key === 'secTime' && (!sectionLenOk || !!askWrong))
    primary = key !== 'secTime' || needsPay
      ? <button className="btn primary" onClick={() => go(step + 1)} disabled={stuck}>
          Next<ChevronRight />
        </button>
      : <button className="btn primary" onClick={() => void run('none')}
          disabled={busy || stuck || subs === null}>
          {busy ? <Loader2 className="spin" /> : <Send />}Enroll
        </button>
  } else if (key === 'pay') {
    primary = way === 'wallet'
      ? <button className="btn primary" onClick={payWallet} disabled={busy || price == null || !walletCovers}>
          {busy ? <Loader2 className="spin" /> : <WalletIcon />}Pay {price != null ? money(price) : ''}
        </button>
      : <button className="btn primary" onClick={() => go(step + 1)} disabled={price == null || way !== 'direct'}>
          Next<ChevronRight />
        </button>
  } else {
    primary = <button className="btn primary" onClick={payDirect} disabled={busy || !proof || !amount}>
      {busy ? <Loader2 className="spin" /> : <Send />}Submit
    </button>
  }

  const reading = key === 'about' || key === 'values'
  const channelQr = method === 'instapay' ? accounts?.instapay_qr : accounts?.vodafone_qr
  const channelLink = (method === 'instapay' ? accounts?.instapay_link : accounts?.vodafone_link)?.trim()
  const qr = qrUrl(channelQr, accounts?.updated_at)

  return (
    <Modal
      open
      onClose={close}
      className="ef-modal"
      title={track.name}
      description={`Step ${step + 1} of ${total} ┬╖ ${STEP_LABEL[key]}`}
      footer={
        <>
          {(step > 0 || adding) && (
            <button className="btn ghost" disabled={busy}
              onClick={() => (adding ? (setAdding(false), setError(null)) : go(step - 1))}>
              <ChevronLeft />Back
            </button>
          )}
          <span className="grow" />
          {primary}
        </>
      }
    >
      <div className="ef">
        <div className="ef-progress" aria-hidden><i style={{ width: `${((step + 1) / total) * 100}%` }} /></div>

        {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}

        {reading && (
          <div className="ef-read">
            {tabVideo && (
              <div className="ef-video">
                <VideoEmbed key={tabVideo} url={tabVideo} title={track.name} />
              </div>
            )}
            <section className="ef-panel" key={key}>
              {key === 'about' ? (
                <>
                  {covers.length > 1 && (
                    <div className="ef-tabs">
                      <div className="ptabs">
                        <TabScroller activeKey={coverShown?.key}>
                          <Tabs value={coverShown?.key ?? ''} onChange={setCoverTab}
                            items={covers.map(c => ({ value: c.key, label: c.label }))} />
                        </TabScroller>
                      </div>
                    </div>
                  )}
                  <div className="ef-panel-body">
                    {coverShown
                      ? <Outline nodes={coverShown.nodes} />
                      : <p className="c-muted2">The admin has not described this program yet.</p>}
                  </div>
                </>
              ) : (
                <>
                  {outcome.filled.length > 1 && (
                    <div className="ef-tabs">
                      <ProgramTabs value={valueShown} onChange={setValueTab} counts={outcome.counts} hideEmpty />
                    </div>
                  )}
                  <div className="ef-panel-body">
                    {valueShown
                      ? <Outline nodes={outcome.nodes[valueShown]} />
                      : <p className="c-muted2">The admin has not listed this programΓÇÖs values and skills yet.</p>}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {key === 'where' && (
          <div className="ef-center">
            <div className="ef-row">
              <span className="ef-q">Where are you?</span>
              <span className="ef-hint">
                This only sets your time zone ΓÇö we read the clock from it so session times
                show in your hours. Pick the country you are in.
              </span>
              <div className="ef-days" style={{ marginTop: 6 }}>
                {REGIONS.filter(r => r.code === 'EG' || r.code === 'SA' || r.code === 'CA')
                  .map(r => (
                  <button key={r.code} type="button" className="ef-day-btn"
                    data-on={region === r.code || undefined}
                    aria-pressed={region === r.code}
                    onClick={() => setRegion(r.code)}>
                    <b>{r.label}</b>
                    <span>{intakesIn(batchRegions, r.code)}</span>
                  </button>
                ))}
              </div>
              <AskAdmin href={askAdminHref} text="Somewhere else? Tell us where and we will open a time." />
            </div>
          </div>
        )}

        {key === 'who' && (
          <div className="ef-center">
            {adding ? (
              <div className="ef-new">
                <span className="ef-q">A new hero on your account</span>
                <span className="ef-hint">
                  They sign in with this email and the password you choose. We read their date of
                  birth from the national ID.
                </span>
                <HeroFields value={draft} onChange={setDraft} idPrefix="ef" autoFocus />
              </div>
            ) : (
              <div className="ef-row">
                <span className="ef-q">Who is {track.name} for?</span>
                <span className="ef-hint">
                  {self
                    ? 'This one is for you.'
                    : children?.length
                      ? 'Pick the hero being enrolled, or add another one now.'
                      : 'Add the hero this program is for. It takes a minute.'}
                </span>
                <div className="ef-kids" style={{ marginTop: 6 }}>
                  {children === null && <div className="skel" style={{ height: 52 }} />}
                  {(children ?? []).map(c => (
                    <button key={c.profile.id} type="button" className="ef-kid"
                      data-on={child?.profile.id === c.profile.id}
                      onClick={() => pick(c.profile.id)}>
                      <span className="stack grow">
                        <b>{c.profile.name || c.profile.email}</b>
                        <span>
                          {[
                            c.profile.age ? `${c.profile.age} years old` : null,
                            c.profile.national_id ? `ID ${c.profile.national_id}` : null,
                            c.profile.whatsapp ?? c.profile.phone,
                          ].filter(Boolean).join(' ┬╖ ') || c.profile.email}
                        </span>
                      </span>
                      {child?.profile.id === c.profile.id && <Check />}
                    </button>
                  ))}
                  {!self && (
                    <button type="button" className="ef-kid ef-kid-add" onClick={() => { setAdding(true); setError(null) }}>
                      <UserPlus />{children?.length ? 'Add another hero' : 'Add your hero'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {SCHEDULE_STEPS.includes(key) && (
          <div className={key === 'secTime' ? 'ef-center ef-wide' : 'ef-center'}>
            {noTimes ? (
              <div className="ef-blocked">
                <AlertTriangle />
                <span className="stack g4">
                  <b>No class times are open for this course yet</b>
                  <span>
                    {!anyLecture.length && !anySection.length
                      ? 'The admin has not published lecture or section hours for it.'
                      : !anyLecture.length
                        ? 'The admin has not published lecture hours for it.'
                        : 'The admin has not published section hours for it.'}
                    {' '}It can also be that the hours open for it are run somewhere else ΓÇö an
                    intake is taught for one part of the world at a time. Either way, message us
                    and we will open a time that suits you.
                  </span>
                  <AskAdmin href={askAdminHref} text="Ask the admin for a time that suits you." />
                </span>
              </div>
            ) : windows === null ? (
              <div className="skel" style={{ height: 180 }} />
            ) : (
              <>
                {key === 'lecDays' && (
                  <div className="ef-row">
                    <span className="ef-q">Which days for the lecture?</span>
                    <span className="ef-hint">
                      Learn ΓÇö with the instructor. One day a week, or two; these are the days
                      {' '}{whose} course is taught on. The hour comes next.
                    </span>
                    <div className="ef-days">
                      {lectureDayChoices.map(d => (
                        <button key={d} type="button" className="ef-day-btn"
                          data-on={lecDays.includes(d) || undefined}
                          aria-pressed={lecDays.includes(d)}
                          disabled={!lecDays.includes(d) && lecDays.length >= MAX_LECTURE_DAYS}
                          onClick={() => flipLecDay(d)}>
                          <b>{WEEKDAYS[d]}</b>
                          <span>
                            {lectureSlotsOn(d).length || slotsOffered(windows, 'lecture')
                              .filter(x => x.weekday === d).length} time
                            {(lectureSlotsOn(d).length || slotsOffered(windows, 'lecture')
                              .filter(x => x.weekday === d).length) === 1 ? '' : 's'}
                          </span>
                          {lecDays.includes(d) && <Check />}
                        </button>
                      ))}
                    </div>
                    <span className="ef-hint">
                      {lecDays.length === 0 ? 'Pick one day, or two.'
                        : lecDays.length === 1
                          ? 'One day picked. Add a second for two lectures a week, or carry on.'
                          : 'Two days picked ΓÇö that is the most a week holds.'}
                    </span>
                  </div>
                )}

                {key === 'lecTime' && (
                  <div className="ef-row">
                    <span className="ef-q">Lecture duration</span>
                    <span className="ef-hint">
                      Slide to how long each lecture should run. The times that fit appear below.
                    </span>

                    {lecRange ? (
                      <Volume label="Each lecture" range={lecRange} value={lectureMin}
                        step={lecStep}
                        onChange={v => { setLecMin(v); setLectureKeys([]) }} />
                    ) : <NoLength what="lecture" />}

                    <div className="ef-picks">
                      {lecDays.map(d => (
                        <div key={d} className="ef-pick">
                          <span className="ef-pick-day">{WEEKDAYS[d]}</span>
                          {lectureSlotsOn(d).length === 0 ? (
                            <span className="ef-hint">
                              Nothing open that day offers {hoursWords(lectureMin)}.
                            </span>
                          ) : (
                            <div className="ef-slots">
                              {lectureSlotsOn(d).map(x => {
                                const on = (lecKeyOn(d) ?? lectureSlotsOn(d)[0]?.key) === x.key
                                return (
                                  <button key={x.key} type="button" className="ef-slot" data-on={on}
                                    onClick={() => setLec(d, x.key)}>
                                    <span className="stack grow">
                                      <b>{clock(x.startMin)}ΓÇô{clock(x.endMin)}</b>
                                      <span>
                                        {minutesLabel(x.endMin - x.startMin)}
                                        {x.mentor ? ` ┬╖ ${x.mentor}` : ''}
                                      </span>
                                      {datesLine(x.startMin, dates[x.windowId]) && (
                                        <span className="ef-dates">
                                          {datesLine(x.startMin, dates[x.windowId])}
                                        </span>
                                      )}
                                    </span>
                                    {on && <Check />}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <AskAdmin href={askAdminHref} />
                  </div>
                )}

                {key === 'secDays' && (
                  <div className="ef-row">
                    <span className="ef-q">Which days for the sections?</span>
                    <span className="ef-hint">
                      Execute ΓÇö building the projects. A section never lands on a day the
                      lecture takes, so those are out.
                    </span>

                    <div className="ef-chosen">
                      <span className="ef-chosen-t">{whose} lectures</span>
                      {lectures.map(l => (
                        <span key={l.day} className="ef-chosen-row">
                          <b>{WEEKDAYS[l.day]}</b>
                          <span>{clock(l.start)}ΓÇô{clock(l.start + l.min)}</span>
                        </span>
                      ))}
                    </div>

                    {openDays.length === 0 ? (
                      <span className="ef-hint" style={{ marginTop: 6 }}>
                        Every day a section is open on is a day the lecture takes. Go back and
                        move the lecture to free one up.
                      </span>
                    ) : (
                      <>
                        <div className="ef-days">
                          {openDays.map(d => (
                            <button key={d} type="button" className="ef-day-btn"
                              data-on={takenSecDays.includes(d) || undefined}
                              aria-pressed={takenSecDays.includes(d)}
                              onClick={() => flipSecDay(d)}>
                              <b>{WEEKDAYS[d]}</b>
                              <span>open</span>
                              {takenSecDays.includes(d) && <Check />}
                            </button>
                          ))}
                        </div>
                        <span className="ef-hint">
                          {takenSecDays.length} day{takenSecDays.length === 1 ? '' : 's'} picked.
                        </span>
                      </>
                    )}
                  </div>
                )}

                {key === 'secTime' && (
                  <div className="ef-row">
                    <span className="ef-q">Section time</span>
                    <span className="ef-hint">
                      A row for each day: how long the section runs, then the openings that
                      fit it.
                      {takenSecDays.length > 1 && (
                        <button type="button" className="ef-same" onClick={sameEveryDay}>
                          Same every day
                        </button>
                      )}
                    </span>

                    <div className="ef-split">
                      <div className="ef-split-main">
                        <div className="ef-grid">
                          {takenSecDays.map(d => {
                            const len = secLen[d]
                            const on = secOn(d)
                            const slots = len.range ? sectionsOn(windows, d, len.min) : []
                            return (
                              <div key={d} className="ef-grid-row">
                                <span className="ef-grid-day">{WEEKDAYS[d]}</span>
                                {len.range ? (
                                  <Volume mini label={`${WEEKDAYS[d]} section length`}
                                    range={len.range} value={len.min} step={len.step}
                                    onChange={v => setSecLen(d, v)} />
                                ) : <span className="ef-hint">Nothing open that day.</span>}
                                <div className="ef-chips">
                                  {slots.length === 0 ? (
                                    <span className="ef-hint">
                                      Nothing open that day runs {minutesLabel(len.min)}.
                                    </span>
                                  ) : slots.map(x => (
                                    <button key={x.key} type="button" className="ef-chip"
                                      data-on={on?.key === x.key}
                                      title={x.mentor ? `with ${x.mentor}` : undefined}
                                      onClick={() => setSec(d, x.key)}>
                                      {clock(x.startMin)}ΓÇô{clock(x.endMin)}
                                      {on?.key === x.key && <Check />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {askWrong && <span className="ef-warn">{askWrong}</span>}
                      </div>

                      <aside className="ef-split-side">
                        <ProgramRun totalHours={totalHours} ask={ask} size="sm" />
                        <AskAdmin href={askAdminHref} />
                      </aside>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {key === 'pay' && (
          <div className="ef-center">
            {plans.length === 0 ? (
              <p className="c-muted" style={{ textAlign: 'center' }}>
                Subscription prices are not set yet. Please check back soon.
              </p>
            ) : (
              <>
                {plans.length > 1 && (
                  <div className="ef-toggle" role="radiogroup" aria-label="Plan">
                    {plans.map(p => (
                      <button key={p} type="button" role="radio" aria-checked={plan === p}
                        data-on={plan === p} onClick={() => setPlan(p)}>
                        {PLAN_LABEL[p]}
                        {p === 'quarterly' && savingPct > 0 && <em>ΓêÆ{savingPct}%</em>}
                      </button>
                    ))}
                  </div>
                )}

                <div className="ef-card">
                  <div className="ef-price">
                    <b>{money(price ?? 0)}</b>
                    <span className="ef-hint">for {PLAN_DAYS[plan]} days</span>
                    {plan === 'quarterly' && saving > 0 && (
                      <span className="ef-save">You save {money(saving)}</span>
                    )}
                  </div>

                  <div className="ef-ways">
                    <button type="button" data-on={way === 'wallet'} onClick={() => setWay('wallet')}>
                      <b>IBSRA wallet</b>
                      <span>{money(balance)}</span>
                    </button>
                    <button type="button" data-on={way === 'direct'} onClick={() => setWay('direct')}>
                      <b>Pay directly</b>
                      <span>InstaPay ┬╖ Vodafone</span>
                    </button>
                  </div>
                </div>

                {way === 'wallet' && !walletCovers && (
                  <p className="ef-hint" style={{ textAlign: 'center' }}>
                    Not enough in your wallet. <Link className="crumb-link" to={`${area}/wallet`}>Charge it</Link> or pay directly.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {key === 'transfer' && (
          <div className="ef-center">
            <div className="ef-card">
              {channels.length > 1 ? (
                <div className="ef-toggle" role="radiogroup" aria-label="Pay with">
                  {channels.map(c => (
                    <button key={c} type="button" role="radio" aria-checked={method === c}
                      data-on={method === c} onClick={() => setMethod(c)}>
                      {PAY_METHOD_LABEL[c]}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="ef-q" style={{ textAlign: 'center' }}>{PAY_METHOD_LABEL[method]}</span>
              )}

              {channels.length === 0 ? (
                <p className="ef-hint" style={{ textAlign: 'center' }}>No way of paying is open right now.</p>
              ) : (
                <div className="ef-channel" key={method}>
                  <span className="ef-hint">Send <b className="c-ink2">{money(due ?? 0)}</b></span>
                  {fee > 0 && (
                    <span className="ef-fee">
                      {money(price ?? 0)} for the subscription, and the {fee}% {PAY_METHOD_LABEL[method]}
                      {' '}takes off a transfer.
                    </span>
                  )}

                  {qr && <img className="ef-qr" src={qr} alt={`${PAY_METHOD_LABEL[method]} QR code`} />}
                  {channelLink && (
                    <a className="btn" href={channelLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink />Open {PAY_METHOD_LABEL[method]}
                    </a>
                  )}
                </div>
              )}
            </div>

            <label className="ef-drop" data-has={!!proof || undefined}>
              {proof ? <Check /> : <Upload />}
              <span className="truncate">{proof ? proof.name : 'Upload the transfer screenshot'}</span>
              <input type="file" accept="image/*,application/pdf" hidden
                onChange={e => setProof(e.target.files?.[0] ?? null)} />
            </label>

            <label className="ef-amount">
              <span className="ef-hint">Amount sent</span>
              <input className="inp" type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} />
              <span className="ef-hint">EGP</span>
            </label>
          </div>
        )}
      </div>
    </Modal>
  )
}
