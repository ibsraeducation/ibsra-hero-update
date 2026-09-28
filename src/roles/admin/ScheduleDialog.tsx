/* ==========================================================================
   Set one student's week — the step right after accepting their payment.

   The family already described the week at enrolment: which of the lecture
   hours the admin had opened they took, and the hour they are free for a
   section on each of the other days. That week arrives here filled in, so
   the ordinary case is reading it and pressing send. The admin can move any
   of it — a day, an hour, a length — and what they end up with is what gets
   booked, day by day, from the first date to the last.

   A section falls on every day without a lecture. That is not a setting; it
   is what a section is, and the form has no way to say otherwise.

   The program length shown here is the same component and the same
   calculator the parent read in the enrolment form (see ProgramRun), so the
   admin cannot quietly book a week that is longer than the one the family
   was promised without seeing the number change.

   Opened from Payments the moment a program payment is accepted, and from
   Requests for anything still waiting.
   ========================================================================== */

import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarCheck, Loader2, X } from 'lucide-react'
import { answerRequest, scheduleStudent, type RequestWithPeople } from '@/lib/api/requests'
import { toMessage } from '@/lib/api/errors'
import { useStore } from '@/lib/store'
import { hhmmToMin, WEEKDAY_SHORT, WEEKDAYS } from '@/lib/time'
import {
  askProblem, availabilityLine, clock, LECTURE_HOURS, parseAsk, programHours, sectionDays,
  type DaySlot, type WeekAsk,
} from '@/lib/programLength'
import { ProgramRun } from '@/components/ProgramRun'
import { Field, Modal } from '@/components/ui'
import '../parent/live/family.css'
import './confirmTimes.css'

const LECTURE_MIN = LECTURE_HOURS * 60
const DAYS = [0, 1, 2, 3, 4, 5, 6]
/* Sunday and Tuesday, then Thursday: spread out, whichever count they chose.
   Only ever used for a request filed before the form asked for days. */
const DEFAULT_DAYS = [0, 2, 4]

interface Clock { at: string; min: number }
interface Span { from: string; to: string }

const spanOf = (s: DaySlot): Span => ({ from: clock(s.start), to: clock(s.start + s.min) })

const dayOnly = (iso?: string | null) => (iso ? iso.slice(0, 10) : '')
const today = () => new Date().toISOString().slice(0, 10)

export function ScheduleDialog({ req, onClose, onDone, canDecline }: {
  req: RequestWithPeople
  onClose: () => void
  onDone: () => void
  /** Requests can still say no; straight after taking the money, it cannot. */
  canDecline?: boolean
}) {
  const db = useStore(s => s.db)
  const toast = useStore(s => s.toast)

  const track = db.tracks.find(t => t.id === req.track_id)
  const course = useMemo(() => (req.loop_id
    ? db.loops.find(l => l.id === req.loop_id)
    : db.loops.filter(l => l.trackId === req.track_id).sort((a, b) => a.index - b.index)[0]),
  [db.loops, req.loop_id, req.track_id])

  /* The whole program's hours, so the weeks shown here are the weeks the
     parent was shown — the enrolment form sums the same courses. */
  const totalHours = useMemo(
    () => programHours(db.loops.filter(l => l.trackId === req.track_id), db.sessions),
    [db.loops, db.sessions, req.track_id])

  /* What the family asked for. A row from before the form asked for days
     and times carries only a count, and opens on spread-out defaults. */
  const asked = useMemo(() => parseAsk(req.schedule_ask), [req.schedule_ask])
  const wanted = req.lectures_per_week ?? course?.lecturesPerWeek ?? 1

  const [days, setDays] = useState<number[]>(
    asked ? asked.lectures.map(l => l.day) : DEFAULT_DAYS.slice(0, wanted))
  const [lecAt, setLecAt] = useState<Record<number, Clock>>(
    Object.fromEntries((asked?.lectures ?? []).map(l => [l.day, { at: clock(l.start), min: l.min }])))
  const [secAt, setSecAt] = useState<Record<number, Span>>(
    Object.fromEntries((asked?.sections ?? []).map(s => [s.day, spanOf(s)])))

  const [from, setFrom] = useState(() => {
    const start = dayOnly(course?.startDate)
    return start && start > today() ? start : today()
  })
  const [to, setTo] = useState(() => dayOnly(course?.endDate))
  const [meeting, setMeeting] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'send' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const kid = req.student?.name || 'the student'

  /* Whatever the family said for a day, or the hour this platform teaches
     at when they never said anything about it. */
  const defaultSec: Span = asked?.sections.length
    ? spanOf(asked.sections[0])
    : { from: '18:30', to: clock(hhmmToMin('18:30') + (req.section_minutes ?? 60)) }
  const lecOn = (d: number): Clock => lecAt[d] ?? { at: '16:00', min: LECTURE_MIN }
  const secOn = (d: number): Span => secAt[d] ?? defaultSec

  const lectures: DaySlot[] = [...days].sort((a, b) => a - b)
    .map(d => ({ day: d, start: hhmmToMin(lecOn(d).at), min: lecOn(d).min }))
  const openDays = sectionDays(lectures)
  const sections: DaySlot[] = openDays.map(d => {
    const s = secOn(d)
    return { day: d, start: hhmmToMin(s.from), min: hhmmToMin(s.to) - hhmmToMin(s.from) }
  })
  const plan: WeekAsk = { lectures, sections }

  const flip = (d: number) =>
    setDays(ds => (ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d].sort((a, b) => a - b)))
  const setLec = (d: number, at: string) => setLecAt(m => ({ ...m, [d]: { ...lecOn(d), at } }))
  const setSec = (d: number, patch: Partial<Span>) =>
    setSecAt(m => ({ ...m, [d]: { ...secOn(d), ...patch } }))
  const sameEveryDay = () => {
    const first = secOn(openDays[0])
    setSecAt(Object.fromEntries(openDays.map(d => [d, first])))
  }

  const problem = askProblem(plan)
    ?? (!to ? 'Set the last day.'
      : to < from ? 'The last day is before the first one.'
        : null)

  const summary = problem ?? [
    lectures.map(l => `${WEEKDAY_SHORT[l.day]} ${clock(l.start)}–${clock(l.start + l.min)}`).join(', '),
    sections.length
      ? `sections on ${sections.map(s => WEEKDAY_SHORT[s.day]).join(', ')}`
      : null,
    `${from} to ${to}`,
  ].filter(Boolean).join(' · ')

  const send = async () => {
    if (problem) { setError(problem); return }
    setBusy('send'); setError(null)
    try {
      await scheduleStudent({ requestId: req.id, plan, from, to, meetingUrl: meeting, note })
      toast(`Schedule sent to ${kid} and their parent`)
      onDone()
      onClose()
    } catch (e) {
      setError(toMessage(e))
      setBusy(null)
    }
  }

  const decline = async () => {
    if (!note.trim()) { setError('Write the reason in the message box — the family reads it.'); return }
    setBusy('decline'); setError(null)
    try {
      await answerRequest(req.id, false, [], note)
      toast('Declined — the family reads your reason', 'info')
      onDone()
      onClose()
    } catch (e) {
      setError(toMessage(e))
      setBusy(null)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Set ${kid}'s schedule`}
      description={`${track?.name ?? 'Program'}${course ? ` · ${course.name}` : ''} — sent to ${req.parent?.name || 'the parent'} and ${kid}, straight onto their calendars.`}
      footer={
        <>
          {canDecline && (
            <button className="btn ghost" style={{ color: 'var(--rose-600)' }} disabled={!!busy}
              onClick={() => void decline()}>
              {busy === 'decline' ? <Loader2 className="spin" /> : <X />}Decline
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose} disabled={!!busy}>Later</button>
          <button className="btn primary" onClick={() => void send()} disabled={!!busy || !!problem}>
            {busy === 'send' ? <Loader2 className="spin" /> : <CalendarCheck />}Send schedule
          </button>
        </>
      }
    >
      <div className="stack g16">
        {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}

        <div className="pay-reason" style={{ background: 'var(--brand-weak)', borderColor: 'var(--line)' }}>
          <span className="eyebrow">Who this is for</span>
          <span className="t-sm">
            <b>{kid}</b>
            {req.student?.age ? ` · ${req.student.age} years old` : ''}
            {req.student?.national_id ? ` · ID ${req.student.national_id}` : ''}
          </span>
          <span className="t-sm c-muted">
            {req.parent?.name || 'The parent'}
            {(req.student?.whatsapp ?? req.student?.phone)
              ? ` · WhatsApp ${req.student.whatsapp ?? req.student.phone}`
              : ''}
          </span>
        </div>

        <div className="pay-reason" style={{ background: 'var(--brand-weak)', borderColor: 'var(--line)' }}>
          <span className="eyebrow">What the family picked</span>
          <span className="t-sm">{availabilityLine(req) ?? 'They were never asked — set the week below.'}</span>
          {asked && <span className="t-sm c-muted">Already filled in below. Move anything that does not work.</span>}
        </div>

        <Field label="Lecture days">
          <div className="row g6 wrap">
            {DAYS.map(d => (
              <button key={d} type="button" className="role-pill" data-on={days.includes(d)} onClick={() => flip(d)}>
                {WEEKDAY_SHORT[d]}
              </button>
            ))}
          </div>
        </Field>

        {lectures.length > 0 && (
          <Field label="Lecture times">
            <div className="ct-rows">
              {lectures.map(l => (
                <label key={l.day} className="ct-row">
                  <span>{WEEKDAYS[l.day]}</span>
                  <input className="inp" type="time" step={900} value={lecOn(l.day).at}
                    onChange={e => setLec(l.day, e.target.value)} />
                  <span className="t-sm c-muted">to {clock(l.start + l.min)}</span>
                </label>
              ))}
            </div>
          </Field>
        )}

        <Field label={`Sections · ${openDays.length} day${openDays.length === 1 ? '' : 's'}, every day without a lecture`}>
          {lectures.length === 0 ? (
            <span className="t-sm c-muted2">Pick a lecture day first.</span>
          ) : openDays.length === 0 ? (
            <span className="t-sm c-muted2">Every day has a lecture — there is no day left for a section.</span>
          ) : (
            <div className="ct-rows">
              {openDays.map((d, i) => (
                <label key={d} className="ct-row">
                  <span>{WEEKDAYS[d]}</span>
                  <input className="inp" type="time" step={900} value={secOn(d).from}
                    onChange={e => setSec(d, { from: e.target.value })} />
                  <span className="t-sm c-muted2">to</span>
                  <input className="inp" type="time" step={900} value={secOn(d).to}
                    onChange={e => setSec(d, { to: e.target.value })} />
                  {i === 0 && openDays.length > 1 && (
                    <button type="button" className="ct-same" onClick={sameEveryDay}>Same every day</button>
                  )}
                </label>
              ))}
            </div>
          )}
        </Field>

        <div className="row g12 wrap">
          <Field label="First day">
            <input className="inp" type="date" value={from} min={today()} onChange={e => setFrom(e.target.value)} />
          </Field>
          <Field label="Last day">
            <input className="inp" type="date" value={to} min={from} onChange={e => setTo(e.target.value)} />
          </Field>
        </div>

        <ProgramRun totalHours={totalHours} ask={plan} size="sm" />

        <Field label="Meeting link (optional)">
          <input className="inp" type="url" value={meeting} placeholder="https://meet.google.com/…"
            onChange={e => setMeeting(e.target.value)} />
        </Field>

        <Field label="Message to the family (optional)">
          <textarea className="inp" rows={2} value={note} placeholder="e.g. See you on Sunday!"
            onChange={e => setNote(e.target.value)} />
        </Field>

        <p className="ct-summary" data-ready={!problem || undefined}>{summary}</p>
      </div>
    </Modal>
  )
}
