/* ==========================================================================
   Admin ┬╖ Programs ΓÇö the rhythm each course runs at, and the intakes
   running through it.

   Two things live here because they answer the same question from either
   end. How many lectures a week a course meets for is the course's answer,
   not the family's: a family picks which days those fall on, and the server
   holds the enrolment form to the number (`loops.lectures_per_week`, read
   by `check_plan`). And a batch is the group of students who started that
   course together ΓÇö the unit the place is actually run in, and what the
   calendar slices by.

   Everything else about a program or a course is edited in Material, where
   it is made. This page is only the two operational numbers.
   ========================================================================== */

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Clock, Layers, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Confirm, Empty, Field, Modal, Segmented } from '@/components/ui'
import { useStore } from '@/lib/store'
import { deleteBatch, saveBatch } from '@/lib/api/schedule'
import { toMessage } from '@/lib/api/errors'
import { ANYWHERE, REGIONS, regionLabel } from '@/lib/region'
import type { CourseBatchRow } from '@/lib/api/rows'

const STATUS: Array<{ value: CourseBatchRow['status']; label: string }> = [
  { value: 'forming', label: 'Forming' },
  { value: 'running', label: 'Running' },
  { value: 'done', label: 'Finished' },
]

function BatchForm({ loopId, batch, onClose, onSaved }: {
  loopId: string
  batch: CourseBatchRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(batch?.name ?? '')
  const [startsOn, setStartsOn] = useState(batch?.starts_on ?? new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState<CourseBatchRow['status']>(batch?.status ?? 'forming')
  const [seats, setSeats] = useState(String(batch?.seats ?? 12))
  const [region, setRegion] = useState(batch?.region || ANYWHERE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveBatch({
        id: batch?.id, loopId, name, startsOn, status, region,
        seats: Math.max(1, Number(seats) || 1),
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(toMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={batch ? 'Edit batch' : 'New batch'}
      description="A batch is the students who start this course together ΓÇö what the calendar slices by."
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={() => void save()} disabled={busy || !name.trim()}>
            {batch ? 'Save batch' : 'Add batch'}
          </button>
        </>
      }
    >
      <div className="stack g14">
        {error && <div className="auth-alert" role="alert"><span>{error}</span></div>}
        <Field label="Name">
          <input className="inp" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
        </Field>
        <div className="grid g-2">
          <Field label="Starts on">
            <input className="inp" type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Seats">
            <input className="inp tnum" type="number" min={1} value={seats}
              onChange={e => setSeats(e.target.value)} />
          </Field>
        </div>
        <Field label="Who it is for"
          hint="Families are offered these hours only when their own clock says they are there. Everywhere offers them to all.">
          <select className="sel" value={region} onChange={e => setRegion(e.target.value)}>
            <option value={ANYWHERE}>Everywhere</option>
            {REGIONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Where it is up to">
          <Segmented value={status} onChange={setStatus} options={STATUS} />
        </Field>
      </div>
    </Modal>
  )
}

export default function AdminPrograms() {
  const tracks = useStore(s => s.db.tracks)
  const loops = useStore(s => s.db.loops)
  const updateLoop = useStore(s => s.updateLoop)
  const toast = useStore(s => s.toast)
  const batches = useStore(s => s.batches)
  const reloadBatches = useStore(s => s.reloadBatches)

  const [editing, setEditing] = useState<{ loopId: string; batch: CourseBatchRow | null } | null>(null)
  const [removing, setRemoving] = useState<CourseBatchRow | null>(null)

  useEffect(() => { void reloadBatches() }, [reloadBatches])

  const coursesOf = useCallback(
    (trackId: string) => loops.filter(l => l.trackId === trackId).sort((a, b) => a.index - b.index),
    [loops],
  )

  const setRhythm = (loopId: string, name: string, n: number) => {
    updateLoop(loopId, { lecturesPerWeek: n })
    toast(`${name} ΓÇö ${n === 1 ? 'one lecture' : 'two lectures'} a week`)
  }

  return (
    <div className="page">
      <PageHeader title="Programs" />

      {tracks.length === 0 ? (
        <div className="card">
          <Empty icon={<SlidersHorizontal />} title="No training programs yet" />
        </div>
      ) : (
        <div className="stack g14">
          {tracks.map(t => {
            const courses = coursesOf(t.id)
            return (
              <div key={t.id} className="card">
                <div className="card-head"><h2 className="t-md w-sb">{t.name}</h2></div>
                <div className="card-body stack g12">
                  {courses.length === 0 ? (
                    <p className="t-sm c-muted2">No courses in this program yet.</p>
                  ) : courses.map(c => {
                    const mine = batches.filter(b => b.loop_id === c.id)
                    const lectures = c.lecturesPerWeek ?? 1
                    return (
                      <div key={c.id} className="stack g8"
                        style={{ paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                        <div className="row g14 wrap" style={{ justifyContent: 'space-between' }}>
                          <div className="stack g2" style={{ minWidth: 0 }}>
                            <span className="t-sm w-sb truncate">Course {c.index} ┬╖ {c.name}</span>
                            <span className="t-xs c-muted2">
                              {lectures === 1 ? 'One lecture' : 'Two lectures'} a week
                              {' ┬╖ a section every other day'}
                            </span>
                          </div>
                          <Segmented
                            value={String(lectures)}
                            onChange={v => setRhythm(c.id, c.name, Number(v))}
                            options={[
                              { value: '1', label: '1 lecture', icon: <Clock className="ico-xs" /> },
                              { value: '2', label: '2 lectures', icon: <CalendarClock className="ico-xs" /> },
                            ]}
                          />
                        </div>

                        <div className="row g8 wrap" style={{ alignItems: 'center' }}>
                          <Layers className="ico-xs" style={{ color: 'var(--muted-2)' }} />
                          {mine.length === 0 ? (
                            <span className="t-xs c-muted2">No batches yet</span>
                          ) : mine.map(b => (
                            <span key={b.id} className="row g4 t-xs"
                              style={{
                                padding: '3px 8px', border: '1px solid var(--line)',
                                borderRadius: 'var(--r-md)', background: 'var(--surface-2)',
                              }}>
                              <button className="btn ghost sm" style={{ padding: 0, height: 'auto' }}
                                onClick={() => setEditing({ loopId: c.id, batch: b })}>
                                {b.name}
                              </button>
                              <span className="c-muted2">
                                ┬╖ {regionLabel(b.region)} ┬╖ {b.status} ┬╖ {b.seats} seats ┬╖ from {b.starts_on}
                              </span>
                              <button className="btn ghost icon sm" style={{ color: 'var(--rose-600)' }}
                                onClick={() => setRemoving(b)} aria-label={`Delete ${b.name}`}>
                                <Trash2 />
                              </button>
                            </span>
                          ))}
                          <button className="btn ghost sm"
                            onClick={() => setEditing({ loopId: c.id, batch: null })}>
                            <Plus />Batch
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="t-xs c-muted2 mt16" style={{ maxWidth: 640, lineHeight: 1.6 }}>
        The times themselves are published on <b>Calendar</b> ΓÇö on the Weekly availability tab, or
        straight onto a day with the <b>+</b> on the calendar grid. A course with no lecture window
        open cannot be enrolled in with a time; the family can still ask, and you offer them one
        when you answer.
      </p>

      {editing && (
        <BatchForm loopId={editing.loopId} batch={editing.batch}
          onClose={() => setEditing(null)} onSaved={() => void reloadBatches()} />
      )}
      {removing && (
        <Confirm open onClose={() => setRemoving(null)}
          onConfirm={() => { void deleteBatch(removing.id).then(() => void reloadBatches()) }}
          title={`Delete ${removing.name}?`}
          body="Sittings booked into it keep their times and fall back to ΓÇ£no batchΓÇ¥." />
      )}
    </div>
  )
}

