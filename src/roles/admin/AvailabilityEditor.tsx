import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, GraduationCap, Layers, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react'
import {
  assignToWindow, deleteBatch, deleteWindow, durationOk, fetchWindows, LECTURE_DEFAULT_MIN,
  LECTURE_MAX_MIN, LECTURE_MIN_MIN, saveBatch, saveWindow, saveWindowDays, SECTION_DEFAULT_MIN,
  SECTION_MIN_MIN, unassignFromWindow, windowOccurrences, windowRoster,
} from '@/lib/api/schedule'
import { toMessage } from '@/lib/api/errors'
import { useStore } from '@/lib/store'
import { ANYWHERE, REGIONS } from '@/lib/region'
import { gapLine, sharedGap, timeGaps } from '@/lib/enrolTimes'
import { minutesLabel } from '@/lib/programLength'
import { dayIn, hhmmToMin, minToHHMM, WEEKDAY_SHORT, WEEKDAYS } from '@/lib/time'
import { Badge, Confirm, Empty, Field, Modal, Switch, Tabs } from '@/components/ui'
import { FoldCard } from '@/components/FoldCard'
import { slotLength, slotsOf } from '@/lib/slots'
import { date } from '@/lib/format'
import type { AvailabilityWindowRow, CourseBatchRow, RosterRow, SlotKind } from '@/lib/api/rows'

export interface HourRow {
  key: string
  days: number[]
  windows: AvailabilityWindowRow[]
  at: AvailabilityWindowRow
}

export function hourRows(windows: AvailabilityWindowRow[]): HourRow[] {
  const m = new Map<string, HourRow>()
  for (const w of windows) {
    const key = [
      w.weekday === null ? 'daily' : 'dated',
      w.start_min, w.end_min, w.slot_min ?? 0, w.slot_max_min ?? 0,
      w.mentor ?? '', w.capacity, w.active ? 'on' : 'off',
    ].join('|')
    let r = m.get(key)
    if (!r) m.set(key, r = { key, days: [], windows: [], at: w })
    r.windows.push(w)
  }
  for (const r of m.values()) {
    r.windows.sort((a, b) => (a.weekday ?? 7) - (b.weekday ?? 7))
    r.days = r.windows.map(w => w.weekday).filter((d): d is number => d !== null)
    r.at = r.windows[0]
  }
  return [...m.values()].sort((a, b) =>
    (a.days[0] ?? 7) - (b.days[0] ?? 7) || a.at.start_min - b.at.start_min)
}

export const daysLabel = (days: number[]): string =>
  (days.length ? days.map(d => WEEKDAY_SHORT[d]).join(', ') : 'Every free day')

function Roster({ hour, onClose }: { hour: HourRow; onClose: () => void }) {
  const [rows, setRows] = useState<RosterRow[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [day, setDay] = useState(hour.days[0] ?? 1)
  const choices = hour.days.length ? hour.days : [0, 1, 2, 3, 4, 5, 6]
  const w = hour.windows.find(x => x.weekday === day) ?? hour.at
  const asks = choices.length > 1
  const [loopId, setLoopId] = useState(w.loop_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const toast = useStore(s => s.toast)
  const loops = useStore(s => s.db.loops)
  const tracks = useStore(s => s.db.tracks)

  const courses = useMemo(
    () => loops.map(l => ({
      id: l.id,
      label: `${tracks.find(t => t.id === l.trackId)?.name ?? 'Program'} · ${l.name}`,
    })).sort((a, b) => a.label.localeCompare(b.label)),
    [loops, tracks])

  const load = useCallback(async () => {
    if (!loopId) { setRows([]); return }
    try { setRows(await windowRoster(w.id, loopId)) } catch (e) { setError(toMessage(e)); setRows([]) }
  }, [w.id, loopId])
  useEffect(() => { void load() }, [load])

  const flip = async (r: RosterRow) => {
    setBusyId(r.student_id)
    setError(null)
    try {
      if (r.assigned) {
        const n = await unassignFromWindow(r.student_id, w.id)
        toast(`${r.name} taken out — ${n} sitting${n === 1 ? '' : 's'} cancelled`, 'info')
      } else {
        const n = await assignToWindow(r.student_id, w.id, w.weekday ?? day, null, loopId)
        toast(`${r.name} is in — ${n} sitting${n === 1 ? '' : 's'} on the calendar`)
      }
      await load()
    } catch (e) {
      setError(toMessage(e))
    }
    setBusyId(null)
  }

  return (
    <Modal open onClose={onClose} title="Who sits in this"
      description={`${hour.at.kind === 'lecture' ? 'Lecture' : 'Section'} · ${daysLabel(hour.days)}`
        + ` · ${minToHHMM(hour.at.start_min)} – ${minToHHMM(hour.at.end_min)}.`
        + ' Tick the heroes this time was agreed with.'}
      footer={<><span className="grow" /><button className="btn" onClick={onClose}>Done</button></>}
    >
      <div className="stack g14">
        {error && <div className="auth-alert" role="alert"><span>{error}</span></div>}

        <div className={asks ? 'grid g-2' : ''}>
          <Field label="Which course">
            <select className="sel" value={loopId} onChange={e => setLoopId(e.target.value)}
              disabled={!!w.loop_id}>
              <option value="">Pick a course…</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          {asks && (
            <Field label="Which day"
              hint={hour.days.length ? 'This hour runs on each of these.' : undefined}>
              <select className="sel" value={day} onChange={e => setDay(Number(e.target.value))}>
                {choices.map(i => <option key={i} value={i}>{WEEKDAYS[i]}</option>)}
              </select>
            </Field>
          )}
        </div>

        {!loopId ? (
          <Empty icon={<Users />} title="Pick a course to see who can take this time" />
        ) : rows === null ? (
          <div className="skel" style={{ height: 120 }} />
        ) : rows.length === 0 ? (
          <Empty icon={<Users />} title="Nobody is enrolled in that course yet" />
        ) : (
          <div className="stack g6">
            {rows.map(r => (
              <label key={r.student_id} className="row g10"
                style={{
                  cursor: busyId ? 'wait' : 'pointer', padding: '8px 10px',
                  border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
                  background: r.assigned ? 'var(--brand-weak)' : undefined,
                }}>
                <input type="checkbox" checked={r.assigned} disabled={!!busyId}
                  onChange={() => void flip(r)} />
                <span className="stack g2 grow" style={{ minWidth: 0 }}>
                  <span className="t-sm w-med truncate">{r.name}</span>
                  <span className="t-xs c-muted2 truncate">
                    {r.email}
                    {r.assigned && r.sittings > 0 && ` · ${r.sittings} sittings booked`}
                  </span>
                </span>
                {busyId === r.student_id && <Loader2 className="spin ico-xs" />}
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

const isoDay = (v: string | null | undefined): string => (v ? v.slice(0, 10) : '')

export const today = (): string => localDay(new Date())

const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const defaultLength = (k: SlotKind) =>
  (k === 'lecture' ? LECTURE_DEFAULT_MIN : SECTION_DEFAULT_MIN)

function addLabel(lectureDays: number, secDays: number, withSection: boolean): string {
  const hours = (n: number) => `${n} hour${n === 1 ? '' : 's'}`
  const parts = [
    lectureDays > 0 ? `${hours(lectureDays)} of lecture` : null,
    withSection && secDays > 0 ? `${hours(secDays)} of section` : null,
  ].filter(Boolean)
  return parts.length ? `Publish ${parts.join(' + ')}` : 'Publish'
}

const freeDays = (lectureDays: number[]): number[] =>
  [0, 1, 2, 3, 4, 5, 6].filter(d => !lectureDays.includes(d))

function DayPick({ days, marked = [], onFlip, hint }: {
  days: number[]
  marked?: number[]
  onFlip: (d: number) => void
  hint?: (day: number) => string | undefined
}) {
  return (
    <div className="daypick" role="group" aria-label="Days">
      {WEEKDAY_SHORT.map((label, i) => (
        <button key={label} type="button"
          data-on={days.includes(i)} data-lecture={marked.includes(i) || undefined}
          aria-pressed={days.includes(i)} title={hint?.(i)}
          onClick={() => onFlip(i)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Opening({ kind, start, end, slot, slotMax, onStart, onEnd, onSlot, onSlotMax, hint }: {
  kind: SlotKind
  start: string
  end: string
  slot: string
  slotMax: string
  onStart: (v: string) => void
  onEnd: (v: string) => void
  onSlot: (v: string) => void
  onSlotMax: (v: string) => void
  hint: string
}) {
  const startMin = hhmmToMin(start)
  const endMin = hhmmToMin(end)
  const slotMin = Math.max(0, Number(slot) || 0)
  const maxMin = Math.max(0, Number(slotMax) || 0)
  const shape = { start_min: startMin, end_min: endMin, slot_min: slotMin, slot_max_min: maxMin }
  const sittings = slotsOf(shape)
  const ok = openingOk(kind, shape)
  const wide = maxMin > slotMin
  const spare = sittings.length
    ? endMin - sittings[sittings.length - 1].endMin
    : 0

  return (
    <div className="stack g8">
      <Field label="Open from / to (Cairo time)" hint={hint}>
        <div className="grid g-4">
          <input className="inp" type="time" value={start}
            aria-label={`${kind} opens at`} onChange={e => onStart(e.target.value)} />
          <input className="inp" type="time" value={end}
            aria-label={`${kind} closes at`} onChange={e => onEnd(e.target.value)} />
          <input className="inp tnum" type="number" min={0} step={5} value={slot}
            aria-label={`shortest ${kind} in minutes`}
            onChange={e => onSlot(e.target.value)} />
          <input className="inp tnum" type="number" min={0} step={5} value={slotMax}
            aria-label={`longest ${kind} in minutes`}
            onChange={e => onSlotMax(e.target.value)} />
        </div>
        <div className="grid g-4" style={{ gap: 14, marginTop: 4 }}>
          {['Opens', 'Closes', 'Shortest session', 'Longest session'].map(c => (
            <span key={c} className="t-xs c-muted2">{c}</span>
          ))}
        </div>
      </Field>
      <p className="t-xs c-muted2" style={{ marginTop: -8 }}>
        A family slides between the shortest and the longest. Put the same number in
        both to hold every session to one length.
      </p>

      {!ok ? (
        <p className="t-xs" style={{ color: 'var(--rose-600)' }}>
          {maxMin < slotMin
            ? 'The longest cannot be shorter than the shortest.'
            : endMin - startMin < maxMin
              ? 'The longest is more than the stretch you opened — it would never fit.'
              : sittings.length === 0
                ? 'That is longer than the stretch you opened — no session fits in it.'
                : kind === 'lecture'
                  ? `One lecture has to run between ${LECTURE_MIN_MIN} and ${LECTURE_MAX_MIN} minutes.`
                  : `One section has to run at least ${SECTION_MIN_MIN} minutes.`}
        </p>
      ) : (
        <div className="stack g6">
          <span className="t-xs c-muted2">
            {wide
              ? `A family picks any length from ${minutesLabel(slotMin)} to `
                + `${minutesLabel(maxMin)}. At the shortest that is ${sittings.length} `
                + `session${sittings.length === 1 ? '' : 's'} a day:`
              : `${sittings.length} session${sittings.length === 1 ? '' : 's'} a day, `
                + `${minutesLabel(slotLength(shape))} each — this is what a family picks from:`}
          </span>
          <div className="chips">
            {sittings.map(x => (
              <span key={x.startMin} className="skill tnum">
                {minToHHMM(x.startMin)}–{minToHHMM(x.endMin)}
              </span>
            ))}
          </div>
          {spare > 0 && (
            <span className="t-xs" style={{ color: 'var(--gold-700)' }}>
              {minutesLabel(spare)} left over at {minToHHMM(endMin - spare)} — too short for
              another {minutesLabel(slotLength(shape))} session, so nothing is taught in it.
              Move the closing time, or change the session length to divide evenly.
            </span>
          )}
        </div>
      )}
    </div>
  )
}

interface Shape { start_min: number; end_min: number; slot_min: number; slot_max_min?: number }

function openingOk(kind: SlotKind, shape: Shape): boolean {
  const top = shape.slot_max_min || shape.slot_min
  if (top < shape.slot_min || shape.end_min - shape.start_min < top) return false
  return slotsOf(shape).length > 0
    && durationOk(kind, 0, slotLength(shape))
    && durationOk(kind, 0, top)
}

export function WindowForm({ rows, initialWeek, presetWeekday, onClose, onSaved }: {
  rows: AvailabilityWindowRow[] | null
  initialWeek?: { course: CourseWeek; batchId: string | null }
  presetWeekday?: number
  onClose: () => void
  onSaved: () => void
}) {
  const loops = useStore(s => s.db.loops)
  const tracks = useStore(s => s.db.tracks)

  const w = rows?.[0] ?? null
  const initLec = initialWeek?.course.lectures[0] ?? null
  const initSec = initialWeek?.course.sections[0] ?? null

  const [tab, setTab] = useState<SlotKind>(w?.kind ?? 'lecture')

  const [withLecture, setWithLecture] = useState(() => (initialWeek ? initialWeek.course.lectures.length > 0 : true))
  const [withSection, setWithSection] = useState(() => (initialWeek ? initialWeek.course.sections.length > 0 : true))

  const [days, setDays] = useState<number[]>(() => {
    if (initialWeek && initialWeek.course.lectures.length > 0) {
      const had = initialWeek.course.lectures.map(r => r.weekday).filter((d): d is number => d !== null)
      if (had.length) return had.sort((a, b) => a - b)
    }
    const had = (rows ?? []).map(r => r.weekday).filter((d): d is number => d !== null)
    return had.length ? had.sort((a, b) => a - b) : [presetWeekday ?? 0]
  })
  const [start, setStart] = useState(() => {
    const src = initLec ?? w
    return minToHHMM(src?.start_min ?? 960)
  })
  const [end, setEnd] = useState(() => {
    const src = initLec ?? w
    return minToHHMM(src?.end_min ?? 960 + defaultLength(src?.kind ?? 'lecture'))
  })
  const [mentor, setMentor] = useState(() => initLec?.mentor ?? w?.mentor ?? '')
  const [seats, setSeats] = useState(() => String(initLec?.capacity ?? w?.capacity ?? 4))
  const [active, setActive] = useState(() => initLec?.active ?? w?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trackOf = (id: string) => loops.find(l => l.id === id)?.trackId ?? ''
  const [loopId, setLoopId] = useState(() => initialWeek?.course.loopId ?? w?.loop_id ?? '')
  const [trackId, setTrackId] = useState(() => {
    const id = initialWeek?.course.loopId ?? w?.loop_id
    return id ? trackOf(id) : ''
  })
  const courses = useMemo(
    () => loops.filter(l => l.trackId === trackId).sort((a, b) => a.index - b.index),
    [loops, trackId])

  const batches = useStore(s => s.batches)
  const [batchId, setBatchId] = useState(() => initialWeek?.batchId ?? w?.batch_id ?? '')
  const [batchName, setBatchName] = useState('')
  const [batchRegion, setBatchRegion] = useState(ANYWHERE)
  const course = loops.find(l => l.id === loopId)


  const [published, setPublished] = useState<AvailabilityWindowRow[]>([])
  useEffect(() => {
    if (!loopId) { setPublished([]); return }
    let live = true
    void fetchWindows({ loopId })
      .then(ws => { if (live) setPublished(ws) })
      .catch(() => { if (live) setPublished([]) })
    return () => { live = false }
  }, [loopId])

  const [slot, setSlot] = useState(() => String(
    initLec?.slot_min ?? w?.slot_min ?? defaultLength(w?.kind ?? 'lecture')))
  const [slotMax, setSlotMax] = useState(() => String(
    initLec?.slot_max_min ?? initLec?.slot_min ?? w?.slot_max_min ?? w?.slot_min ?? defaultLength(w?.kind ?? 'lecture')))

  const [secTouched, setSecTouched] = useState(() => !!initialWeek?.course.sections.length)
  const [secStartRaw, setSecStartRaw] = useState(() => initSec ? minToHHMM(initSec.start_min) : '')
  const [secEndRaw, setSecEndRaw] = useState(() => initSec ? minToHHMM(initSec.end_min) : '')
  const [secSlot, setSecSlot] = useState(() => String(initSec?.slot_min ?? SECTION_DEFAULT_MIN))
  const [secSlotMax, setSecSlotMax] = useState(() => String(initSec?.slot_max_min ?? initSec?.slot_min ?? SECTION_DEFAULT_MIN))
  const [secDaysRaw, setSecDaysRaw] = useState<number[] | null>(() => {
    if (initialWeek && initialWeek.course.sections.length > 0) {
      return initialWeek.course.sections.map(r => r.weekday).filter((d): d is number => d !== null).sort((a, b) => a - b)
    }
    return null
  })

  const startMin = hhmmToMin(start)
  const endMin = hhmmToMin(end)
  const slotMin = Math.max(0, Number(slot) || 0)
  const slotMaxMin = Math.max(0, Number(slotMax) || 0)

  const secStart = secTouched ? secStartRaw : minToHHMM(startMin)
  const secEnd = secTouched ? secEndRaw
    : minToHHMM(Math.min(1440, startMin + Math.max(1, Number(secSlot) || SECTION_DEFAULT_MIN)))
  const secStartMin = hhmmToMin(secStart)
  const secEndMin = hhmmToMin(secEnd)
  const secSlotMin = Math.max(0, Number(secSlot) || 0)
  const secSlotMaxMin = Math.max(0, Number(secSlotMax) || 0)

  const batchLectureDays = useMemo(() => (batchId
    ? published
      .filter(x => x.batch_id === batchId && x.kind === 'lecture'
        && !(rows ?? []).some(r => r.id === x.id) && x.weekday !== null)
      .map(x => x.weekday as number)
    : []), [published, batchId, w?.id])

  const lectureDays = useMemo(
    () => [...new Set([...(withLecture && !w ? days : []), ...batchLectureDays])]
      .sort((a, b) => a - b),
    [withLecture, w, days, batchLectureDays])

  const secDays = useMemo(
    () => secDaysRaw ?? freeDays(lectureDays),
    [secDaysRaw, lectureDays])

  const flipSecDay = (d: number) => setSecDaysRaw(prev => {
    const from = prev ?? freeDays(lectureDays)
    return from.includes(d) ? from.filter(x => x !== d) : [...from, d].sort((a, b) => a - b)
  })

  const lectureOk = openingOk('lecture', {
    start_min: startMin, end_min: endMin, slot_min: slotMin, slot_max_min: slotMaxMin,
  })
  const secOk = openingOk('section', {
    start_min: secStartMin, end_min: secEndMin, slot_min: secSlotMin, slot_max_min: secSlotMaxMin,
  })
  const scopeOk = !!loopId && !!(batchId || batchName.trim())

  const canSave = scopeOk && (w
    ? openingOk(w.kind, {
      start_min: startMin, end_min: endMin, slot_min: slotMin, slot_max_min: slotMaxMin,
    })
      && days.length > 0
    : (withLecture || withSection)
      && (!withLecture || (lectureOk && days.length > 0))
      && (!withSection || (secOk && secDays.length > 0)))

  const flipDay = (d: number) => setDays(ds =>
    (ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d].sort((a, b) => a - b)))

  const switchStart = (next: string) => {
    setStart(next)
    setEnd(minToHHMM(Math.min(1440, hhmmToMin(next) + Math.max(1, endMin - startMin))))
  }

  const holdSection = () => {
    if (secTouched) return
    setSecTouched(true)
    setSecStartRaw(secStart)
    setSecEndRaw(secEnd)
  }
  const switchSecStart = (next: string) => {
    holdSection()
    setSecStartRaw(next)
    setSecEndRaw(minToHHMM(Math.min(1440, hhmmToMin(next) + Math.max(1, secEndMin - secStartMin))))
  }
  const switchSecEnd = (next: string) => { holdSection(); setSecEndRaw(next) }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const batch = batchId || (await saveBatch({
        loopId, name: batchName.trim(), startsOn: isoDay(course?.startDate) || today(),
        region: batchRegion,
      })).id

      const common = {
        loopId,
        batchId: batch,
        mentor: mentor.trim(),
        capacity: Math.max(1, Number(seats) || 1),
        active,
      }
      if (initialWeek) {
        const oldIds = [...initialWeek.course.lectures, ...initialWeek.course.sections].map(x => x.id)
        await Promise.all(oldIds.map(id => deleteWindow(id)))
        if (withLecture && days.length > 0) {
          await saveWindowDays({ ...common, kind: 'lecture', startMin, endMin, slotMin, slotMaxMin }, days)
        }
        if (withSection && secDays.length > 0) {
          await saveWindowDays({
            ...common,
            kind: 'section',
            startMin: secStartMin,
            endMin: secEndMin,
            slotMin: secSlotMin,
            slotMaxMin: secSlotMaxMin,
          }, secDays)
        }
      } else if (w && rows) {
        const fields = { ...common, kind: w.kind, startMin, endMin, slotMin, slotMaxMin }
        const dated = rows.filter(r => r.weekday !== null)
        const keep = dated.filter(r => days.includes(r.weekday as number))
        const drop = dated.filter(r => !days.includes(r.weekday as number))
        const add = days.filter(d => !keep.some(r => r.weekday === d))
        const dayless = rows.filter(r => r.weekday === null)
        const pinned = dayless.length && add.length ? add.shift() as number : null

        await Promise.all([
          ...keep.map(r => saveWindow({ ...fields, id: r.id, weekday: r.weekday })),
          ...(pinned === null ? [] : [saveWindow({ ...fields, id: dayless[0].id, weekday: pinned })]),
          ...drop.map(r => deleteWindow(r.id)),
          ...dayless.slice(pinned === null ? 0 : 1).map(r => deleteWindow(r.id)),
        ])
        if (add.length) await saveWindowDays(fields, add)
      } else {
        if (withLecture) {
          await saveWindowDays({ ...common, kind: 'lecture', startMin, endMin, slotMin, slotMaxMin }, days)
        }
        if (withSection) {
          await saveWindowDays({
            ...common,
            kind: 'section',
            startMin: secStartMin,
            endMin: secEndMin,
            slotMin: secSlotMin,
            slotMaxMin: secSlotMaxMin,
          }, secDays)
        }
      }
      onSaved()
      onClose()
    } catch (e) {
      setError(toMessage(e))
      setBusy(false)
    }
  }

  const lecturePane = (
    <div className="stack g14">
      {!w && (
        <div className="row g10 wrap">
          <Switch on={withLecture} onChange={setWithLecture} label="Publish lecture hours" />
          <span className="t-sm w-sb">Lecture hours</span>
          <span className="grow" />
          <span className="t-xs c-muted2">One window per day picked</span>
        </div>
      )}
      {!w && !withLecture ? (
        <p className="t-xs c-muted2" style={{ lineHeight: 1.6, margin: 0 }}>
          No lectures published here. Pick a batch that already has its lecture days and
          this form adds one more section hour to it.
        </p>
      ) : (
        <>
          <Field label="Days"
            hint={days.length > 1
              ? `${days.map(d => WEEKDAYS[d]).join(', ')} — ${days.length} windows, the same hour on each.`
              : 'Pick every day this hour is taught on.'}>
            <DayPick days={days} onFlip={flipDay} />
          </Field>

          <Opening kind="lecture" start={start} end={end} slot={slot} slotMax={slotMax}
            onStart={switchStart} onEnd={setEnd} onSlot={setSlot} onSlotMax={setSlotMax}
            hint={w
              ? 'The stretch you are free in. It is divided into sittings below.'
              : 'The stretch you teach the lecture in, divided into sittings below.'} />
        </>
      )}
    </div>
  )

  const sectionPane = (
    <div className="stack g14">
      {!w && (
        <div className="row g10 wrap">
          <Switch on={withSection} onChange={setWithSection} label="Publish the section hour" />
          <span className="t-sm w-sb">Section hour</span>
          <span className="grow" />
          <span className="t-xs c-muted2">
            One window per day · you set the session length
          </span>
        </div>
      )}
      {!w && !withSection ? (
        <p className="t-xs c-muted2" style={{ lineHeight: 1.6, margin: 0 }}>
          No section hour published here. A family cannot enrol into this batch until one
          exists, so this is only worth leaving off when the batch already has it.
        </p>
      ) : (
        <>
          <Field label="Days"
            hint={w
              ? 'Unticking a day deletes that day’s window; ticking one adds it.'
              : lectureDays.length
                ? `${lectureDays.map(d => WEEKDAYS[d]).join(', ')} also teach${lectureDays.length === 1 ? 'es' : ''} `
                  + 'a lecture — open a section there too if you like; a family never gets '
                  + 'one on a day their own lecture takes.'
                : 'Pick every day a section is open on.'}>
            <DayPick days={w ? days : secDays} marked={w ? [] : lectureDays}
              onFlip={w ? flipDay : flipSecDay}
              hint={d => (lectureDays.includes(d) && !w
                ? `${WEEKDAYS[d]} also teaches a lecture for this intake`
                : undefined)} />
          </Field>

          {w && w.weekday === null && (
            <p className="t-xs" style={{ color: 'var(--gold-700)', lineHeight: 1.6 }}>
              This section was published before sections carried a day, so it currently
              runs on every day a family’s lecture leaves free. Saving pins it to the one
              day picked above.
            </p>
          )}

          {!w && secDays.length === 0 && (
            <p className="t-xs" style={{ color: 'var(--rose-600)' }}>
              Pick at least one day for the section to be open on.
            </p>
          )}

          {w ? (
            <Opening kind="section" start={start} end={end} slot={slot} slotMax={slotMax}
              onStart={switchStart} onEnd={setEnd} onSlot={setSlot} onSlotMax={setSlotMax}
              hint="The stretch you are free in. It is divided into sittings below." />
          ) : (
            <Opening kind="section" start={secStart} end={secEnd} slot={secSlot}
              slotMax={secSlotMax}
              onStart={switchSecStart} onEnd={switchSecEnd}
              onSlot={v => { holdSection(); setSecSlot(v) }}
              onSlotMax={v => { holdSection(); setSecSlotMax(v) }}
              hint="The stretch you are free in on those days." />
          )}
        </>
      )}
    </div>
  )

  return (
    <Modal open onClose={onClose}
      title={initialWeek ? 'Edit week' : w ? (rows && rows.length > 1 ? 'Edit these times' : 'Edit this time') : 'Add a week'}
      description="Cairo time — families abroad see it converted to their own."
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={() => void save()} disabled={busy || !canSave}>
            {initialWeek
              ? 'Save week'
              : w
                ? `Save ${days.length} ${days.length === 1 ? 'time' : 'times'}`
                : addLabel(withLecture ? days.length : 0, secDays.length, withSection)}
          </button>
        </>
      }
    >
      <div className="stack g14">
        {error && <div className="auth-alert" role="alert"><span>{error}</span></div>}

        <div className="grid g-2">
          <Field label="Program">
            <select className="sel" value={trackId}
              onChange={e => { setTrackId(e.target.value); setLoopId(''); setBatchId('') }}>
              <option value="">Pick a program…</option>
              {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Course">
            <select className="sel" value={loopId} disabled={!trackId}
              onChange={e => { setLoopId(e.target.value); setBatchId('') }}>
              <option value="">{trackId ? 'Pick a course…' : 'Pick a program first'}</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>Course {c.index} · {c.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Batch"
          hint={batchId
            ? 'This time joins an intake that already exists.'
            : 'Named here — the intake is the heroes who sit these hours.'}>
          <div className="grid g-2">
            <select className="sel" value={batchId}
              onChange={e => {
                const id = e.target.value
                setBatchId(id)
                if (id) {
                  const b = batches.find(x => x.id === id)
                  if (b) {
                    setBatchName(b.name)
                    setBatchRegion(b.region || ANYWHERE)
                  }
                } else {
                  setBatchName('')
                  setBatchRegion(ANYWHERE)
                }
              }}>
              <option value="">New batch…</option>
              {batches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.starts_on ? ` · from ${date(b.starts_on)}` : ''}
                </option>
              ))}
            </select>
            {!batchId ? (
              <input className="inp" value={batchName}
                placeholder="Name this batch, e.g. October intake"
                onChange={e => setBatchName(e.target.value)} />
            ) : (
              <input className="inp" value={batches.find(b => b.id === batchId)?.name ?? batchName}
                disabled aria-label="Selected batch name" />
            )}
          </div>
          {!batchId && (
            <div className="mt8">
              <select className="sel" value={batchRegion} onChange={e => setBatchRegion(e.target.value)}
                title="Who it is for" aria-label="Batch region">
                <option value={ANYWHERE}>Everywhere</option>
                {REGIONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            </div>
          )}
        </Field>

        {w ? (
          w.kind === 'lecture' ? lecturePane : sectionPane
        ) : (
          <div className="stack g14">
            <Tabs value={tab} onChange={setTab} items={[
              { value: 'lecture', label: 'Lecture', count: withLecture ? days.length : undefined },
              { value: 'section', label: 'Section', count: withSection ? secDays.length : undefined },
            ]} />
            {tab === 'lecture' ? lecturePane : sectionPane}
          </div>
        )}

        <div className="grid g-2">
          <Field label="Mentor">
            <input className="inp" value={mentor} onChange={e => setMentor(e.target.value)} />
          </Field>
          <Field label="Max students" >
            <input className="inp tnum" type="number" min={1} value={seats}
              onChange={e => setSeats(e.target.value)} />
          </Field>
        </div>

        <Field label="Active">
          <Switch on={active} onChange={setActive} label="Offer this window" />
        </Field>
      </div>
    </Modal>
  )
}

interface CourseWeek {
  key: string
  loopId: string
  lectures: AvailabilityWindowRow[]
  sections: AvailabilityWindowRow[]
}

export interface BatchGroup {
  key: string
  batchId: string | null
  courses: CourseWeek[]
  lectures: number
  sections: number
}

export interface GroupLabels {
  course: (loopId: string) => string
  batch: (batchId: string) => { name: string; startsOn: string } | null
}

export function batchGroups(
  windows: AvailabilityWindowRow[], label: GroupLabels,
): BatchGroup[] {
  const m = new Map<string, BatchGroup>()
  for (const w of windows) {
    const bKey = w.batch_id ?? ''
    let g = m.get(bKey)
    if (!g) {
      m.set(bKey, g = {
        key: bKey || 'none', batchId: w.batch_id, courses: [], lectures: 0, sections: 0,
      })
    }
    const loopId = w.loop_id ?? ''
    let c = g.courses.find(x => x.loopId === loopId)
    if (!c) g.courses.push(c = { key: `${g.key}|${loopId || 'any'}`, loopId, lectures: [], sections: [] })
    if (w.kind === 'lecture') { c.lectures.push(w); g.lectures += 1 } else { c.sections.push(w); g.sections += 1 }
  }

  const order = (a: AvailabilityWindowRow, b: AvailabilityWindowRow) =>
    (a.weekday ?? 7) - (b.weekday ?? 7) || a.start_min - b.start_min
  for (const g of m.values()) {
    for (const c of g.courses) { c.lectures.sort(order); c.sections.sort(order) }
    g.courses.sort((a, b) => label.course(a.loopId).localeCompare(label.course(b.loopId)))
  }

  return [...m.values()].sort((a, b) => {
    if (!a.batchId || !b.batchId) return (a.batchId ? 0 : 1) - (b.batchId ? 0 : 1)
    const x = label.batch(a.batchId)
    const y = label.batch(b.batchId)
    return (x?.startsOn ?? '').localeCompare(y?.startsOn ?? '')
      || (x?.name ?? '').localeCompare(y?.name ?? '')
  })
}

const KINDS = [
  { kind: 'lecture', label: 'Lectures' },
  { kind: 'section', label: 'Sections · the days these hours are open on' },
] as const

export function AvailabilityEditor() {
  const [windows, setWindows] = useState<AvailabilityWindowRow[] | null>(null)
  const [next, setNext] = useState<Record<string, string[]>>({})
  const [editing, setEditing] = useState<HourRow | null | 'new'>(null)
  const [editingWeek, setEditingWeek] = useState<{ course: CourseWeek; batchId: string | null } | null>(null)
  const [removingCourseWeek, setRemovingCourseWeek] = useState<{ course: CourseWeek; batchId: string | null } | null>(null)
  const [removingBatch, setRemovingBatch] = useState<{ batchId: string | null; name: string; courses: CourseWeek[] } | null>(null)
  const [editingBatch, setEditingBatch] = useState<CourseBatchRow | null>(null)
  const [editingBatchName, setEditingBatchName] = useState('')
  const [editingBatchStartsOn, setEditingBatchStartsOn] = useState('')
  const [editingBatchRegion, setEditingBatchRegion] = useState(ANYWHERE)
  const [editingBatchError, setEditingBatchError] = useState<string | null>(null)
  const [roster, setRoster] = useState<HourRow | null>(null)
  const [removing, setRemoving] = useState<HourRow | null>(null)
  const allBatches = useStore(s => s.batches)
  const reloadBatches = useStore(s => s.reloadBatches)
  const loops = useStore(s => s.db.loops)
  const tracks = useStore(s => s.db.tracks)

  const load = useCallback(async () => {
    const ws = await fetchWindows()
    setWindows(ws)
    const pairs = await Promise.all(ws.map(async w => {
      try {
        const occ = await windowOccurrences(w.id, w.weekday ?? 0, 3)
        return [w.id, occ.map(o => o.starts_at)] as const
      } catch { return [w.id, []] as const }
    }))
    setNext(Object.fromEntries(pairs))
  }, [])

  useEffect(() => { void load(); void reloadBatches() }, [load, reloadBatches])

  const courseName = useCallback((id: string) => {
    if (!id) return 'Every course · published before times carried one'
    const l = loops.find(x => x.id === id)
    if (!l) return 'A course that is gone'
    const t = tracks.find(x => x.id === l.trackId)
    return `${t?.name ?? 'Program'} · ${l.name}`
  }, [loops, tracks])

  const batchOf = useCallback(
    (id: string | null) => (id ? allBatches.find(b => b.id === id) ?? null : null),
    [allBatches])

  const batchName = useCallback((id: string | null) => {
    if (!id) return 'No batch'
    return batchOf(id)?.name ?? 'A batch that is gone'
  }, [batchOf])

  const groups = useMemo(() => batchGroups(windows ?? [], {
    course: courseName,
    batch: id => {
      const b = batchOf(id)
      return b ? { name: b.name, startsOn: b.starts_on } : null
    },
  }), [windows, courseName, batchOf])

  const gaps = useMemo(
    () => (windows === null ? [] : timeGaps({ tracks, loops }, windows)),
    [windows, tracks, loops])

  const shared = useMemo(() => sharedGap(gaps, { tracks, loops }), [gaps, tracks, loops])

  const sittings = (w: AvailabilityWindowRow) => {
    const n = slotsOf(w).length
    return n > 1 ? `${n} × ${minutesLabel(slotLength(w))}` : minutesLabel(slotLength(w))
  }

  const nextDates = (r: HourRow) => [...new Set(r.windows.flatMap(x => next[x.id] ?? []))]
    .sort()
    .slice(0, 3)
    .map(iso => dayIn(iso, 'Africa/Cairo'))

  const timeTable = (windows: AvailabilityWindowRow[]) => (
    <div className="tbl-wrap">
      <table className="tbl avail-tbl">
        <thead>
          <tr>
            <th>Days</th>
            <th style={{ width: 116 }}>Hours</th>
            <th style={{ width: 98 }}>Sessions</th>
            <th style={{ width: 140 }}>Mentor</th>
            <th className="num" style={{ width: 68 }}>Seats</th>
            <th style={{ width: 176 }}>Next</th>
            <th className="act" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {hourRows(windows).map(r => {
            const soon = nextDates(r)
            return (
              <tr key={r.key}>
                <td>
                  <span className="row g6"
                    title={r.days.map(d => WEEKDAYS[d]).join(', ') || undefined}>
                    <span className="t-sm w-med">{daysLabel(r.days)}</span>
                    {!r.at.active && <Badge tone="line">Off</Badge>}
                  </span>
                </td>
                <td>
                  <span className="t-sm tnum">
                    {minToHHMM(r.at.start_min)}–{minToHHMM(r.at.end_min)}
                  </span>
                </td>
                <td><span className="t-xs c-muted tnum">{sittings(r.at)}</span></td>
                <td><span className="t-xs c-muted truncate">{r.at.mentor || '—'}</span></td>
                <td className="num"><span className="t-xs c-muted tnum">{r.at.capacity}</span></td>
                <td>
                  <span className="t-xs c-muted2 tnum">{soon.length ? soon.join(', ') : '—'}</span>
                </td>
                <td className="act">
                  <div className="row g6">
                    <button className="btn ghost sm" onClick={() => setRoster(r)}>
                      <Users />Who sits in this
                    </button>
                    <button className="btn ghost sm" onClick={() => setEditing(r)}>Edit</button>
                    <button className="btn ghost icon sm" style={{ color: 'var(--rose-600)' }}
                      onClick={() => setRemoving(r)}
                      aria-label={`Delete ${daysLabel(r.days)}`}><Trash2 /></button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="stack g14">
      <div className="row g10 wrap" style={{ justifyContent: 'space-between' }}>
        <p className="t-sm c-muted2" style={{ maxWidth: 560, margin: 0 }}>
          One intake&rsquo;s week per card: the lecture hours it is offered on, and the
          section hour that fills the days those leave. Cairo time; families abroad see it
          converted. These are the only hours an enrolling family is ever shown, so a
          course missing either half cannot be enrolled in at all.
        </p>
        <button className="btn primary sm" onClick={() => setEditing('new')}>
          <Plus />Add a week
        </button>
      </div>

      {gaps.length > 0 && (
        <div className="card" style={{
          borderColor: 'color-mix(in srgb, var(--gold-600) 40%, transparent)',
          background: 'var(--gold-100)',
        }}>
          <div className="card-body stack g8">
            <div className="row g8">
              <AlertTriangle style={{ width: 17, height: 17, flex: 'none', color: 'var(--gold-700)' }} />
              <span className="t-sm w-sb" style={{ color: 'var(--gold-700)' }}>
                {shared
                  ? `Nobody can enrol yet — there are ${gapLine(shared)} published`
                  : `${gaps.length} course${gaps.length === 1 ? '' : 's'} on the Marketplace`
                    + `${gaps.length === 1 ? ' has' : ' have'} no times to enrol into`}
              </span>
            </div>
            <p className="t-xs" style={{ color: 'var(--gold-700)', lineHeight: 1.6, margin: 0 }}>
              A family gets as far as the Schedule step and stops: there is nothing for them
              to pick. Add a week below, or take the programs off the families&rsquo;
              training path on Material until you have one.
            </p>
            {!shared && (
              <ul className="stack g4" style={{ margin: 0, paddingInlineStart: 18 }}>
                {gaps.map(g => (
                  <li key={g.loopId} className="t-xs" style={{ color: 'var(--gold-700)' }}>
                    {g.program} · {g.course} — <b>{gapLine(g.missing)}</b>
                  </li>
                ))}
              </ul>
            )}
            <div className="row g8 wrap">
              <button type="button" className="btn sm" onClick={() => setEditing('new')}>
                <Plus />Add a week
              </button>
            </div>
          </div>
        </div>
      )}

      {windows === null ? (
        <div className="skel" style={{ height: 160 }} />
      ) : groups.length === 0 ? (
        <div className="card"><Empty icon={<Plus />} title="No times published yet"
          action={<button className="btn primary" onClick={() => setEditing('new')}>
            <Plus />Add a week
          </button>} /></div>
      ) : (
        <div>
          {groups.map(g => (
            <FoldCard key={g.key} id={`avail.batch.${g.key}`} flush
              icon={<Layers />}
              title={<span className="truncate">{batchName(g.batchId)}</span>}
              aside={[
                g.batchId && batchOf(g.batchId) ? `from ${date(batchOf(g.batchId)!.starts_on)}` : null,
                `${g.courses.length} course${g.courses.length === 1 ? '' : 's'}`,
                `${g.lectures} lecture${g.lectures === 1 ? '' : 's'}`,
                `${g.sections} section${g.sections === 1 ? '' : 's'}`,
              ].filter(Boolean).join(' · ')}
              actions={
                <div className="row g6">
                  {g.batchId && batchOf(g.batchId) && (
                    <button type="button" className="btn ghost sm"
                      onClick={() => {
                        const b = batchOf(g.batchId)
                        if (b) {
                          setEditingBatch(b)
                          setEditingBatchName(b.name)
                          setEditingBatchStartsOn(b.starts_on ? isoDay(b.starts_on) : today())
                          setEditingBatchRegion(b.region || ANYWHERE)
                          setEditingBatchError(null)
                        }
                      }}
                      title="Edit batch name and start date">
                      <Pencil className="ico-xs" />Edit batch
                    </button>
                  )}
                  <button type="button" className="btn ghost icon sm" style={{ color: 'var(--rose-600)' }}
                    onClick={() => setRemovingBatch({ batchId: g.batchId, name: batchName(g.batchId), courses: g.courses })}
                    aria-label={`Delete batch ${batchName(g.batchId)}`}>
                    <Trash2 />
                  </button>
                </div>
              }
            >
              <div className="avail-course">
                {g.courses.map(c => (
                  <FoldCard key={c.key} id={`avail.course.${c.key}`} sub flush
                    icon={<GraduationCap />}
                    title={<span className="truncate">{courseName(c.loopId)}</span>}
                    aside={`${c.lectures.length} lecture${c.lectures.length === 1 ? '' : 's'}`
                      + ` · ${c.sections.length} section${c.sections.length === 1 ? '' : 's'}`}
                    actions={
                      <div className="row g6">
                        <button type="button" className="btn ghost sm"
                          onClick={() => setEditingWeek({ course: c, batchId: g.batchId })}
                          title="Edit weekly availability">
                          <Pencil className="ico-xs" />Edit
                        </button>
                        <button type="button" className="btn ghost icon sm" style={{ color: 'var(--rose-600)' }}
                          onClick={() => setRemovingCourseWeek({ course: c, batchId: g.batchId })}
                          aria-label={`Delete weekly availability for ${courseName(c.loopId)}`}>
                          <Trash2 />
                        </button>
                      </div>
                    }
                  >
                    {KINDS.map(part => {
                      const rows = part.kind === 'lecture' ? c.lectures : c.sections
                      return (
                        <FoldCard key={part.kind} sub flush
                          id={`avail.${part.kind}.${c.key}`}
                          title={<span className="truncate">{part.label}</span>}
                          aside={`${rows.length} hour${rows.length === 1 ? '' : 's'}`}
                        >
                          {rows.length
                            ? timeTable(rows)
                            : <p className="avail-none t-xs">
                                None — a family cannot enrol into this batch without one.
                              </p>}
                        </FoldCard>
                      )
                    })}
                  </FoldCard>
                ))}
              </div>
            </FoldCard>
          ))}
        </div>
      )}

      {editing && (
        <WindowForm rows={editing === 'new' ? null : editing.windows}
          onClose={() => setEditing(null)} onSaved={() => void load()} />
      )}
      {editingWeek && (
        <WindowForm rows={null} initialWeek={editingWeek}
          onClose={() => setEditingWeek(null)} onSaved={() => void load()} />
      )}
      {roster && <Roster hour={roster} onClose={() => { setRoster(null); void load() }} />}
      {removing && (
        <Confirm open onClose={() => setRemoving(null)}
          onConfirm={() => {
            void Promise.all(removing.windows.map(x => deleteWindow(x.id))).then(() => void load())
          }}
          title={removing.windows.length > 1
            ? `Delete this time on all ${removing.windows.length} days?`
            : 'Delete this time?'}
          body={`${daysLabel(removing.days)} · `
            + `${minToHHMM(removing.at.start_min)}–${minToHHMM(removing.at.end_min)}. `
            + 'Sittings already booked from it are unaffected.'} />
      )}
      {removingCourseWeek && (
        <Confirm open onClose={() => setRemovingCourseWeek(null)}
          onConfirm={() => {
            const allIds = [...removingCourseWeek.course.lectures, ...removingCourseWeek.course.sections].map(w => w.id)
            void Promise.all(allIds.map(deleteWindow)).then(() => {
              setRemovingCourseWeek(null)
              void load()
            })
          }}
          title={`Delete weekly availability for ${courseName(removingCourseWeek.course.loopId)}?`}
          body={`This will delete all ${removingCourseWeek.course.lectures.length} lecture and `
            + `${removingCourseWeek.course.sections.length} section availability windows for this course.`} />
      )}
      {removingBatch && (
        <Confirm open onClose={() => setRemovingBatch(null)}
          onConfirm={() => {
            const allIds = removingBatch.courses.flatMap(c => [...c.lectures, ...c.sections]).map(w => w.id)
            void Promise.all(allIds.map(deleteWindow))
              .then(async () => {
                if (removingBatch.batchId) await deleteBatch(removingBatch.batchId)
              })
              .then(() => {
                setRemovingBatch(null)
                void load()
                void reloadBatches()
              })
          }}
          title={`Delete batch “${removingBatch.name}”?`}
          body={`This will remove all published hours across ${removingBatch.courses.length} course${removingBatch.courses.length === 1 ? '' : 's'} and delete this batch.`} />
      )}
      {editingBatch && (
        <Modal open onClose={() => setEditingBatch(null)}
          title={`Edit batch · ${editingBatch.name}`}
          footer={
            <>
              <span className="grow" />
              <button className="btn" onClick={() => setEditingBatch(null)}>Cancel</button>
              <button className="btn primary" onClick={async () => {
                try {
                  await saveBatch({
                    id: editingBatch.id,
                    loopId: editingBatch.loop_id,
                    name: editingBatchName.trim() || editingBatch.name,
                    startsOn: editingBatchStartsOn || editingBatch.starts_on,
                    region: editingBatchRegion,
                    seats: editingBatch.seats,
                    status: editingBatch.status,
                  })
                  setEditingBatch(null)
                  void load()
                  void reloadBatches()
                } catch (e) {
                  setEditingBatchError(toMessage(e))
                }
              }}>Save</button>
            </>
          }>
          <div className="stack g14">
            {editingBatchError && <div className="auth-alert" role="alert"><span>{editingBatchError}</span></div>}
            <Field label="Batch name">
              <input className="inp" value={editingBatchName}
                onChange={e => setEditingBatchName(e.target.value)} />
            </Field>
            <Field label="Starts on">
              <input className="inp" type="date" value={editingBatchStartsOn}
                onChange={e => setEditingBatchStartsOn(e.target.value)} />
            </Field>
            <Field label="Who it is for"
              hint="Families are offered these hours only when their own clock says they are there. Everywhere offers them to all.">
              <select className="sel" value={editingBatchRegion} onChange={e => setEditingBatchRegion(e.target.value)}>
                <option value={ANYWHERE}>Everywhere</option>
                {REGIONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}
