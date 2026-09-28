import { useEffect, useMemo, useState } from 'react'
import { Check, Clock } from 'lucide-react'
import { fetchOfferedWindows, type PlanSlot } from '@/lib/api/schedule'
import { useStore } from '@/lib/store'
import { toMessage } from '@/lib/api/errors'
import { minToHHMM, WEEKDAYS } from '@/lib/time'
import { Field } from '@/components/ui'
import type { AvailabilityWindowRow } from '@/lib/api/rows'
import './confirmTimes.css'

const DAYS = [0, 1, 2, 3, 4, 5, 6]

export interface TimeChoice {
  slots: PlanSlot[]
  ready: boolean
  summary: string
}

export const NO_TIMES: TimeChoice = { slots: [], ready: false, summary: 'Pick the lecture day.' }

export function ConfirmTimes({ loopId, lecturesPerWeek, sectionMinutes, onChange }: {
  loopId: string
  lecturesPerWeek: number
  sectionMinutes?: number | null
  onChange: (c: TimeChoice) => void
}) {
  const [windows, setWindows] = useState<AvailabilityWindowRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const trackId = useStore(s => s.db.loops.find(l => l.id === loopId)?.trackId ?? null)
  const [lectures, setLectures] = useState<string[]>([])
  const [sectionIds, setSectionIds] = useState<string[]>([])

  useEffect(() => {
    let live = true
    setWindows(null)
    setLectures([])
    setSectionIds([])
    /* The admin books for families anywhere, so every intake's hours are
       theirs to pick from — the region filter is the family's, not theirs. */
    void fetchOfferedWindows({ loopId, trackId, region: 'all' })
      .then(ws => { if (live) setWindows(ws) })
      .catch(e => { if (live) { setError(toMessage(e)); setWindows([]) } })
    return () => { live = false }
  }, [loopId, trackId])

  const lectureWindows = useMemo(
    () => (windows ?? []).filter(w => w.kind === 'lecture')
      .sort((a, b) => (a.weekday ?? 0) - (b.weekday ?? 0) || a.start_min - b.start_min),
    [windows],
  )
  const sectionWindows = useMemo(
    () => (windows ?? []).filter(w => w.kind === 'section')
      .sort((a, b) => (a.weekday ?? 7) - (b.weekday ?? 7) || a.start_min - b.start_min),
    [windows],
  )

  const lectureDays = useMemo(
    () => new Set(lectureWindows.filter(w => lectures.includes(w.id)).map(w => w.weekday ?? -1)),
    [lectureWindows, lectures],
  )
  const freeDays = useMemo(
    () => DAYS.filter(d => !lectureDays.has(d)),
    [lectureDays],
  )

  const clashes = (w: AvailabilityWindowRow) =>
    w.weekday !== null && lectureDays.has(w.weekday)

  useEffect(() => {
    const picked = lectures.filter(id => lectureWindows.some(w => w.id === id))
    const slots: PlanSlot[] = picked.map(id => ({ w: id, d: null }))

    const secs = sectionWindows.filter(
      w => sectionIds.includes(w.id) && !(w.weekday !== null && lectureDays.has(w.weekday)))

    let summary = ''
    let ready = false

    if (picked.length !== lecturesPerWeek) {
      const n = lecturesPerWeek - picked.length
      summary = n > 0
        ? `Pick ${n} more lecture time${n === 1 ? '' : 's'}.`
        : `They picked ${lecturesPerWeek} lecture${lecturesPerWeek === 1 ? '' : 's'} a week.`
    } else if (sectionWindows.length > 0 && secs.length === 0) {
      summary = 'Pick at least one section time.'
    } else {
      const days = new Set<number>()
      for (const w of secs) {
        if (w.weekday === null) for (const d of freeDays) { slots.push({ w: w.id, d }); days.add(d) }
        else { slots.push({ w: w.id, d: w.weekday }); days.add(w.weekday) }
      }
      ready = true
      const lec = lectureWindows.filter(w => picked.includes(w.id))
        .map(w => `${WEEKDAYS[w.weekday ?? 0]} ${minToHHMM(w.start_min)}–${minToHHMM(w.end_min)}`)
        .join(' and ')
      const sec = [...days].sort((a, b) => a - b).map(d => WEEKDAYS[d]).join(', ')
      summary = sec ? `Lecture ${lec}. Sections on ${sec}.` : `Lecture ${lec}.`
    }

    onChange({ slots, ready, summary })
  }, [lectures, sectionIds, lectureDays, freeDays, lectureWindows, sectionWindows,
    lecturesPerWeek, onChange])

  const toggleLecture = (id: string, day: number) => {
    setLectures(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      const others = prev.filter(x => lectureWindows.find(w => w.id === x)?.weekday !== day)
      const next = [...others, id]
      return next.length > lecturesPerWeek ? next.slice(next.length - lecturesPerWeek) : next
    })
  }

  if (error) return <div className="auth-alert" role="alert"><span>{error}</span></div>
  if (windows === null) return <div className="skel" style={{ height: 120 }} />

  if (lectureWindows.length === 0) {
    return (
      <div className="ct-none">
        <Clock className="ico-xs" />
        <span>
          No lecture times are published for this course yet. Publish one on{' '}
          <b>Calendar → Weekly availability</b>, then come back and confirm.
        </span>
      </div>
    )
  }

  return (
    <div className="stack g14">
      <Field label={`Lectures — where they learn · ${lecturesPerWeek} a week`} >
        <div className="ct-slots">
          {lectureWindows.map(w => {
            const on = lectures.includes(w.id)
            return (
              <button key={w.id} type="button" className="ct-slot" data-on={on || undefined}
                onClick={() => toggleLecture(w.id, w.weekday ?? -1)}>
                <span className="ct-slot-day">{WEEKDAYS[w.weekday ?? 0]}</span>
                <span className="ct-slot-time">{minToHHMM(w.start_min)} – {minToHHMM(w.end_min)}</span>
                {w.mentor && <span className="ct-slot-sub">{w.mentor}</span>}
                {on && <Check className="ico-xs ct-tick" />}
              </button>
            )
          })}
        </div>
      </Field>

      {sectionWindows.length > 0 && (
        <Field label="Sections — the stand-ups, where they build"
          hint="Tick every day they agreed to. A day their lecture takes cannot carry one.">
          <div className="ct-slots">
            {sectionWindows.map(w => {
              const taken = clashes(w)
              const on = sectionIds.includes(w.id) && !taken
              return (
                <button key={w.id} type="button" className="ct-slot"
                  data-on={on || undefined} data-off={taken || undefined} disabled={taken}
                  title={taken ? `${WEEKDAYS[w.weekday as number]} is a lecture day for them` : undefined}
                  onClick={() => setSectionIds(xs =>
                    (xs.includes(w.id) ? xs.filter(x => x !== w.id) : [...xs, w.id]))}>
                  <span className="ct-slot-day">
                    {w.weekday === null ? 'Every free day' : WEEKDAYS[w.weekday]}
                  </span>
                  <span className="ct-slot-time">{minToHHMM(w.start_min)} – {minToHHMM(w.end_min)}</span>
                  {taken
                    ? <span className="ct-slot-sub">Their lecture day</span>
                    : sectionMinutes && w.end_min - w.start_min === sectionMinutes
                      ? <span className="ct-slot-sub">Their length</span>
                      : w.mentor && <span className="ct-slot-sub">{w.mentor}</span>}
                  {on && <Check className="ico-xs ct-tick" />}
                </button>
              )
            })}
          </div>
        </Field>
      )}
    </div>
  )
}
