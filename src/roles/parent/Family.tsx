/* ==========================================================================
   Parent · My family

   Where a parent registers another child of theirs and puts a child into a
   course that is actually running. Everything else in the parent workspace
   (Summary, Performance, Marketplace) still reports on one child at a time —
   this page is the one place that lists every child on the account and lets
   a parent act on more than the one the rest of the workspace opens to.
   ========================================================================== */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BadgeCheck, ChevronRight, GraduationCap, Plus, UserPlus, Users2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Empty, Field, Modal } from '@/components/ui'
import { useStore } from '@/lib/store'
import { pct } from '@/lib/format'
import { Portrait } from './ui'
import { useParent } from './data'

/** Everything a course-picker needs about one running or planned course,
 *  read off the real curriculum so a parent can never enrol a child into a
 *  course that does not actually exist. */
function useOpenCourses() {
  const db = useStore(s => s.db)
  return useMemo(() => {
    const tracksById = new Map(db.tracks.map(t => [t.id, t]))
    return db.loops
      .filter(l => l.status !== 'closed')
      .map(l => ({ loop: l, track: tracksById.get(l.trackId) }))
      .filter((x): x is { loop: typeof x.loop; track: NonNullable<typeof x.track> } => !!x.track)
      .sort((a, b) => a.track.name.localeCompare(b.track.name) || a.loop.index - b.loop.index)
  }, [db])
}

function AddChildModal({ open, onClose, parentId }: {
  open: boolean; onClose: () => void; parentId: string
}) {
  const addChild = useStore(s => s.addChild)
  const [name, setName] = useState('')
  const [age, setAge] = useState('')

  const submit = () => {
    if (!name.trim()) return
    addChild(parentId, { name, age: age ? Number(age) : undefined })
    setName(''); setAge('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a child"
      description="A record for a son or daughter not on your account yet. A mentor still confirms them into a cohort once they are enrolled in a course.">
      <div className="stack g14">
        <Field label="Full name">
          <input className="inp" autoFocus value={name} placeholder="e.g. Youssef Adel"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </Field>
        <Field label="Age">
          <input className="inp" type="number" min={5} max={25} value={age}
            onChange={e => setAge(e.target.value)} style={{ maxWidth: 120 }} />
        </Field>
      </div>
      <div className="modal-foot" style={{ paddingInline: 0 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn brand" disabled={!name.trim()} onClick={submit}><UserPlus />Add child</button>
      </div>
    </Modal>
  )
}

function EnrollModal({ open, onClose, studentId, studentName, currentLoopId }: {
  open: boolean; onClose: () => void; studentId: string; studentName: string; currentLoopId?: string
}) {
  const courses = useOpenCourses()
  const enrollChild = useStore(s => s.enrollChild)
  const [loopId, setLoopId] = useState(currentLoopId ?? '')

  const submit = () => {
    if (!loopId) return
    enrollChild(studentId, loopId)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Enrol ${studentName} in a course`}
      description="Every course currently running or scheduled — picked from the real curriculum, so nothing listed here is a course that doesn't exist yet.">
      {courses.length === 0
        ? <Empty icon={<GraduationCap />} title="No course is open" />
        : (
          <div className="stack g8" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {courses.map(({ loop, track }) => (
              <label key={loop.id} className="row g10"
                style={{
                  border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px',
                  cursor: 'pointer', background: loopId === loop.id ? 'var(--surface-2)' : 'transparent',
                }}>
                <input type="radio" name="loop" checked={loopId === loop.id} onChange={() => setLoopId(loop.id)} />
                <span className="stack g2 grow" style={{ minWidth: 0 }}>
                  <span className="row g8 wrap">
                    <b className="t-sm truncate">{track.name} · Course {loop.index}</b>
                    <Badge tone={loop.status === 'running' ? 'teal' : 'line'}>
                      {loop.status === 'running' ? 'Running now' : 'Planned'}
                    </Badge>
                  </span>
                  <span className="t-xs c-muted2">{loop.code} · {track.skill}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      <div className="modal-foot" style={{ paddingInline: 0 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn brand" disabled={!loopId} onClick={submit}><BadgeCheck />Enrol</button>
      </div>
    </Modal>
  )
}

export function ParentFamily() {
  const d = useParent()
  const db = useStore(s => s.db)
  const [addOpen, setAddOpen] = useState(false)
  const [enrollFor, setEnrollFor] = useState<string | undefined>()

  const parentId = d.parent?.id
  const children = useMemo(
    () => (parentId ? db.people.filter(p => p.role === 'student' && p.parentId === parentId) : [d.child]),
    [db, parentId, d.child],
  )
  const enrolling = children.find(c => c.id === enrollFor)
  const loopOf = (loopId?: string) => db.loops.find(l => l.id === loopId)
  const trackOf = (trackId?: string) => db.tracks.find(t => t.id === trackId)

  return (
    <div className="page">
      <PageHeader
        title="My family"
        actions={
          parentId && <button className="btn brand" onClick={() => setAddOpen(true)}><Plus />Add a child</button>
        }
      />

      {children.length === 0
        ? <Empty icon={<Users2 />} title="No children on this account yet" />
        : (
          <div className="grid g-2">
            {children.map(child => {
              const cohort = db.cohorts.find(c => c.id === child.cohortId)
              const loop = loopOf(cohort?.loopId)
              const track = trackOf(child.trackId)
              return (
                <section key={child.id} className="card pd rise">
                  <div className="row g12" style={{ alignItems: 'flex-start' }}>
                    <Portrait name={child.name} tone={child.avatarTone} size={56} />
                    <div className="stack g4 grow" style={{ minWidth: 0 }}>
                      <b className="t-md truncate">{child.name}</b>
                      <span className="t-xs c-muted2">{child.age ? `${child.age} years old` : 'Age not set'}</span>
                      {track && loop
                        ? (
                          <span className="row g6 wrap">
                            <Badge tone={track.color}>{track.name}</Badge>
                            <span className="t-xs c-muted2">Course {loop.index} · {loop.code}</span>
                          </span>
                        )
                        : <Badge tone="line">Not enrolled in a course</Badge>}
                    </div>
                  </div>
                  {typeof child.progress === 'number' && track && (
                    <div className="stack g6" style={{ marginTop: 12 }}>
                      <div className="between g12">
                        <span className="t-xs c-ink2">Current course progress</span>
                        <span className="t-xs w-sb tnum">{pct(child.progress, 0)}</span>
                      </div>
                      <div className="meter"><i style={{ width: `${Math.max(2, child.progress)}%`, background: `var(--${track.color}-500)` }} /></div>
                    </div>
                  )}
                  <div className="row g8 wrap" style={{ marginTop: 14 }}>
                    <button className="btn sm" onClick={() => setEnrollFor(child.id)}>
                      <GraduationCap />{track ? 'Enrol in a different course' : 'Enrol in a course'}
                    </button>
                    <Link className="btn sm ghost" to="/parent/marketplace">Browse marketplace<ChevronRight /></Link>
                  </div>
                </section>
              )
            })}
          </div>
        )}

      {parentId && <AddChildModal open={addOpen} onClose={() => setAddOpen(false)} parentId={parentId} />}
      {enrolling && (
        <EnrollModal
          open
          onClose={() => setEnrollFor(undefined)}
          studentId={enrolling.id}
          studentName={enrolling.name.split(' ')[0]}
          currentLoopId={db.cohorts.find(c => c.id === enrolling.cohortId)?.loopId}
        />
      )}
    </div>
  )
}
