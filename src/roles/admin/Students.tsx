import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Ban, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Clock, Copy,
  ExternalLink, Eye, EyeOff, Globe, GraduationCap, KeyRound, List, Mail, Phone, Plus, RefreshCw, RotateCcw,
  Save, Trash2, UserPlus, Users, Wallet, X,
} from 'lucide-react'
import { MentorNote } from './MentorNote'
import { Avatar, Badge, Confirm, Drawer, Empty, Field, Modal, SearchInput, Segmented } from '@/components/ui'
import { useStore } from '@/lib/store'
import { useAuthStore } from '@/lib/authStore'
import { backendLive } from '@/lib/supabase'
import { date, dateTime, money, relative } from '@/lib/format'
import { toMessage } from '@/lib/api/errors'
import { openFile } from '@/lib/api/storage'
import {
  AdminUsersError, adminUsers, authMeta, enrol, linkGuardian, listParents, listStudents,
  setEnrollmentStatus, setFamilyRegion, unenrol, unlinkGuardian, updateStudentProfile,
  type AuthMeta, type Guardian, type StudentRow,
} from '@/lib/api/students'
import { gradeSubmission, listSubmissionsForStudent, pendingReviewCounts } from '@/lib/api/submissions'
import { listRegistrations, type RegistrationRow } from '@/lib/api/requests'
import { availabilityLine } from '@/lib/programLength'
import { REGIONS, regionLabel } from '@/lib/region'
import { fetchWallet } from '@/lib/api/wallet'
import type { EnrollmentStatus, SubmissionRow } from '@/lib/api/rows'
import { TASK_META, type DB, type Track } from '@/lib/types'
import { trackArea } from '@/lib/area'

/* ==========================================================================
   Students — the accounts an admin creates, the courses they sit in, and
   the answers waiting to be graded. Nobody signs up on their own: the admin
   sets a temporary password here and hands it over; the student picks their
   own on first sign-in.
   ========================================================================== */

type StatusFilter = 'all' | 'active' | 'disabled'
type GroupBy = 'none' | 'parent'

/** One drawer, two things it can be about. Opening a parent from a student
 *  (or the other way round) swaps it rather than stacking a second one. */
type Open = { kind: 'student'; id: string } | { kind: 'parent'; id: string }

/** Students under the parent account that added them. A student the admin
 *  created directly has no parent and lands in the last group. When two
 *  parents share a child the first link wins, so nobody is listed twice. */
interface Family { parent: Guardian | null; students: StudentRow[] }

function families(rows: StudentRow[]): Family[] {
  const byParent = new Map<string, Family>()
  const alone: StudentRow[] = []
  for (const s of rows) {
    const p = s.parents[0]
    if (!p) { alone.push(s); continue }
    const got = byParent.get(p.id)
    if (got) got.students.push(s)
    else byParent.set(p.id, { parent: p, students: [s] })
  }
  const out = [...byParent.values()]
    .sort((a, b) => parentName(a.parent!).localeCompare(parentName(b.parent!)))
  if (alone.length) out.push({ parent: null, students: alone })
  return out
}

const parentName = (p: Guardian) => p.name || p.email

/** What a folded family is remembered by. The students nobody claims are
 *  one group too, so they fold like the rest. */
const famKey = (f: Family) => f.parent?.id ?? 'unclaimed'

const errText = (e: unknown) => (e instanceof AdminUsersError ? e.message : toMessage(e))

/** A readable temporary password: no 0/O, 1/l/I. */
function generatePassword(length = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}

function courseLabel(db: DB, loopId: string) {
  const loop = db.loops.find(l => l.id === loopId)
  if (!loop) return 'Removed course'
  const track = db.tracks.find(t => t.id === loop.trackId)
  return `${track ? programLabel(track) : 'Program'} · ${loop.name}`
}

/* Material and Work each have their own programs, so a Work one says so. */
const programLabel = (t: Track) => (trackArea(t) === 'work' ? `Work · ${t.name}` : t.name)

function CourseSelect({ db, value, onChange, exclude = [], placeholder = 'No course yet' }: {
  db: DB; value: string; onChange: (v: string) => void; exclude?: string[]; placeholder?: string
}) {
  return (
    <select className="sel" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {db.tracks.map(t => {
        const loops = db.loops.filter(l => l.trackId === t.id && !exclude.includes(l.id))
          .sort((a, b) => a.index - b.index)
        if (!loops.length) return null
        return (
          <optgroup key={t.id} label={programLabel(t)}>
            {loops.map(l => <option key={l.id} value={l.id}>{l.name} · {l.code}</option>)}
          </optgroup>
        )
      })}
    </select>
  )
}

function PasswordInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const [show, setShow] = useState(true)
  return (
    <div className="row g6">
      <input className="inp mono grow" type={show ? 'text' : 'password'} value={value} autoFocus={autoFocus}
        autoComplete="new-password" onChange={e => onChange(e.target.value)} placeholder="At least 8 characters" />
      <button type="button" className="btn ghost icon" onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff /> : <Eye />}</button>
      <button type="button" className="btn" onClick={() => { onChange(generatePassword()); setShow(true) }}>
        <RefreshCw />Generate
      </button>
    </div>
  )
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="between g8" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <span className="stack g2" style={{ minWidth: 0 }}>
        <span className="t-xs c-muted2">{label}</span>
        <span className="t-sm mono truncate">{value}</span>
      </span>
      <button className="btn sm" onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) })
      }}>
        {copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button className="btn sm ghost icon" aria-label="Copy" style={{ flex: 'none' }} onClick={() => {
      void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500) })
    }}>
      {copied ? <Check /> : <Copy />}
    </button>
  )
}

/* ---------------- add a student ---------------- */

function AddStudent({ db, onClose, onCreated }: {
  db: DB; onClose: () => void; onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [age, setAge] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState(() => generatePassword())
  const [loopId, setLoopId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; password: string; name: string } | null>(null)

  const submit = async () => {
    if (!name.trim() || !email.trim()) { setError('Name and email are required.'); return }
    if (password.length < 8) { setError('The temporary password needs at least 8 characters.'); return }
    setBusy(true)
    setError(null)
    try {
      await adminUsers({
        action: 'create_student',
        name: name.trim(),
        email: email.trim(),
        password,
        age: age ? Number(age) : null,
        phone: phone.trim() || null,
        loop_id: loopId || null,
      })
      setCreated({ email: email.trim().toLowerCase(), password, name: name.trim() })
      onCreated()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <Modal open onClose={onClose} title={`${created.name} can sign in now`}
        description="Send these to the student (or their parent). This is the only time the password is shown."
        footer={<button className="btn primary" onClick={onClose}>Done</button>}>
        <div className="stack">
          <CopyLine label="Sign-in page" value={`${window.location.origin}/login`} />
          <CopyLine label="Email" value={created.email} />
          <CopyLine label="Temporary password" value={created.password} />
          <CopyLine label="All together" value={`Sign in at ${window.location.origin}/login\nEmail: ${created.email}\nTemporary password: ${created.password}`} />
          <span className="t-xs c-muted2 mt8">They choose their own password the first time they sign in.</span>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Add a student"
      description="Creates their account. You give them the temporary password; they replace it on first sign-in."
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={() => void submit()} disabled={busy}>
            <UserPlus />{busy ? 'Creating…' : 'Create account'}
          </button>
        </>
      }>
      <div className="stack g14">
        {error && <div className="t-sm" role="alert" style={{ color: 'var(--rose-600)' }}>{error}</div>}
        <div className="grid g-2">
          <Field label="Full name">
            <input className="inp" autoFocus value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="grid g-2">
          <Field label="Age">
            <input className="inp tnum" type="number" min={8} max={99} value={age} onChange={e => setAge(e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="inp" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+20…" />
          </Field>
        </div>
        <Field label="Temporary password">
          <PasswordInput value={password} onChange={setPassword} />
        </Field>
        <Field label="Course">
          <CourseSelect db={db} value={loopId} onChange={setLoopId} />
        </Field>
      </div>
    </Modal>
  )
}

/* ---------------- one answer, graded ---------------- */

function SubmissionItem({ db, sub, adminId, onGraded }: {
  db: DB; sub: SubmissionRow; adminId: string; onGraded: (s: SubmissionRow) => void
}) {
  const toast = useStore(s => s.toast)
  const [score, setScore] = useState(sub.score != null ? String(Number(sub.score)) : '')
  const [feedback, setFeedback] = useState(sub.feedback ?? '')
  const [busy, setBusy] = useState(false)

  const session = db.sessions.find(s => s.id === sub.session_id)
  const task = session?.titles.flatMap(t => t.tasks).find(t => t.id === sub.task_id)
  const choiceTask = sub.task_kind === 'mcq' || sub.task_kind === 'multi'

  const save = async () => {
    const n = Number(score)
    if (score === '' || !Number.isFinite(n) || n < 0 || n > sub.points) {
      toast(`Score must be between 0 and ${sub.points}`, 'err')
      return
    }
    setBusy(true)
    try {
      onGraded(await gradeSubmission(sub.id, adminId, n, feedback))
      toast('Graded — the student sees it now')
    } catch (e) {
      toast(toMessage(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card flat" style={{ padding: 12 }}>
      <div className="between g8 mb8">
        <span className="t-xs c-muted2">{TASK_META[sub.task_kind].label} · {sub.points} pts · {dateTime(sub.updated_at)}</span>
        {sub.status === 'graded'
          ? <Badge tone={choiceTask ? (sub.is_correct ? 'teal' : 'rose') : 'teal'} dot>
              {choiceTask ? (sub.is_correct ? 'Correct' : 'Wrong') : 'Graded'} · {Number(sub.score ?? 0)}/{sub.points}
            </Badge>
          : <Badge tone="gold" dot>Waiting · {relative(sub.updated_at)}</Badge>}
      </div>
      <p className="t-sm w-med mb8" style={{ lineHeight: 1.5 }}>{sub.question || task?.question || 'Question'}</p>

      {choiceTask && (
        <div className="stack g4">
          {(task?.options ?? []).map(o => {
            const picked = sub.choice_ids?.includes(o.id)
            return (
              <span key={o.id} className="row g6 t-sm" style={{ color: picked ? 'var(--ink)' : 'var(--muted-2)' }}>
                {picked ? (o.correct ? <CheckCircle2 style={{ color: 'var(--teal-600)', width: 14 }} /> : <X style={{ color: 'var(--rose-600)', width: 14 }} />)
                  : <span style={{ width: 14, display: 'inline-block' }} />}
                {o.text}{o.correct && <Badge tone="teal">correct</Badge>}
              </span>
            )
          })}
          {!task && <span className="t-xs c-muted2">The question was removed from the session.</span>}
        </div>
      )}
      {sub.answer_text && <p className="t-sm c-ink2" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{sub.answer_text}</p>}
      {sub.link_url && (
        <a className="btn sm ghost" href={sub.link_url} target="_blank" rel="noreferrer"><ExternalLink />{sub.link_url}</a>
      )}
      {sub.file_path && (
        <button className="btn sm" onClick={() => openFile(sub.file_path!, 'submissions').catch(e => toast(toMessage(e), 'err'))}>
          <ExternalLink />Open the uploaded file
        </button>
      )}
      {task?.modelAnswer && !choiceTask && (
        <p className="t-xs c-muted2 mt8">Grading note: {task.modelAnswer}</p>
      )}

      {!choiceTask && (
        <div className="row g8 wrap mt8" style={{ alignItems: 'flex-end' }}>
          <Field label={`Score / ${sub.points}`}>
            <input className="inp tnum" type="number" min={0} max={sub.points} style={{ width: 90 }}
              value={score} onChange={e => setScore(e.target.value)} />
          </Field>
          <Field label="Feedback" className="grow">
            <input className="inp" value={feedback} onChange={e => setFeedback(e.target.value)}
              placeholder="What was good, what to fix next" />
          </Field>
          <button className="btn primary" onClick={() => void save()} disabled={busy}>
            <Save />{sub.status === 'graded' ? 'Update grade' : 'Grade'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ---------------- one student ---------------- */

/** The program behind the first course this student is in — what a note is
 *  about, when it is about one. */
function trackOf(db: DB, student: StudentRow): string | null {
  const loopId = student.enrollments.find(e => e.status !== 'dropped')?.loop_id
  return db.loops.find(l => l.id === loopId)?.trackId ?? null
}

function StudentDrawer({ student, db, meta, regs, onClose, onChanged, onOpenParent }: {
  student: StudentRow; db: DB; meta?: AuthMeta
  /** Every program this hero was enrolled on, with the week their family
   *  asked for on each. */
  regs: RegistrationRow[]
  onClose: () => void; onChanged: () => void; onOpenParent: (id: string) => void
}) {
  const toast = useStore(s => s.toast)
  const adminId = useAuthStore(s => s.profile?.id) ?? ''

  const [name, setName] = useState(student.name)
  const [age, setAge] = useState(student.age != null ? String(student.age) : '')
  const [phone, setPhone] = useState(student.phone ?? '')
  const [email, setEmail] = useState(student.email)
  const [addLoop, setAddLoop] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<null | 'delete' | { unenrol: string }>(null)
  const [subs, setSubs] = useState<SubmissionRow[] | null>(null)
  /* Every family account, so a student created here can be put on one. */
  const [parents, setParents] = useState<Guardian[] | null>(null)
  const [addParent, setAddParent] = useState('')

  useEffect(() => {
    setName(student.name); setAge(student.age != null ? String(student.age) : '')
    setPhone(student.phone ?? ''); setEmail(student.email)
  }, [student])

  useEffect(() => {
    let live = true
    listSubmissionsForStudent(student.id)
      .then(r => { if (live) setSubs(r) })
      .catch(e => toast(toMessage(e), 'err'))
    return () => { live = false }
  }, [student.id, toast])

  useEffect(() => {
    let live = true
    listParents()
      .then(r => { if (live) setParents(r) })
      .catch(() => { if (live) setParents([]) })
    return () => { live = false }
  }, [])

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      toast(ok)
      onChanged()
    } catch (e) {
      toast(errText(e), 'err')
    } finally {
      setBusy(null)
    }
  }

  const bySession = useMemo(() => {
    const groups = new Map<string, SubmissionRow[]>()
    for (const s of subs ?? []) (groups.get(s.session_id) ?? groups.set(s.session_id, []).get(s.session_id)!).push(s)
    return [...groups.entries()]
  }, [subs])

  const pending = (subs ?? []).filter(s => s.status === 'submitted').length
  const enrolled = student.enrollments.map(e => e.loop_id)

  return (
    <Drawer open onClose={onClose} title={student.name || student.email}>
      <div className="row g12 mb16">
        <Avatar name={student.name || student.email} size="lg" />
        <div className="stack g2 grow" style={{ minWidth: 0 }}>
          <span className="t-md w-sb truncate">{student.name}</span>
          <span className="t-xs c-muted2 truncate">{student.email}</span>
          <span className="t-xs c-muted2">
            Joined {date(student.created_at)} · {meta?.last_sign_in_at ? `last sign-in ${relative(meta.last_sign_in_at)}` : 'has not signed in yet'}
          </span>
        </div>
        {student.disabled ? <Badge tone="rose" dot>Paused</Badge> : <Badge tone="teal" dot>Active</Badge>}
      </div>

      {/* ---- profile ---- */}
      <section className="stack g10 mb20">
        <span className="eyebrow">Profile</span>
        <Field label="Full name">
          <input className="inp" value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <div className="grid g-2">
          <Field label="Age">
            <input className="inp tnum" type="number" min={8} max={99} value={age} onChange={e => setAge(e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="inp" value={phone} onChange={e => setPhone(e.target.value)} />
          </Field>
        </div>
        <div className="row g8">
          <button className="btn" disabled={busy === 'profile'} onClick={() => void run('profile',
            () => updateStudentProfile(student.id, { name: name.trim(), age: age ? Number(age) : null, phone: phone.trim() || null }),
            'Profile saved')}>
            <Save />Save profile
          </button>
        </div>
        <Field label="Sign-in email">
          <div className="row g6">
            <input className="inp grow" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <button className="btn" disabled={busy === 'email' || email.trim().toLowerCase() === student.email}
              onClick={() => void run('email', () => adminUsers({ action: 'set_email', user_id: student.id, email: email.trim() }), 'Email changed')}>
              Change
            </button>
          </div>
        </Field>
      </section>

      {/* ---- what the parent said about the week ---- */}
      <section className="stack g8 mb20">
        <span className="eyebrow">What the parent asked for</span>
        {regs.filter(r => r.lectures_per_week).length === 0 ? (
          <span className="t-sm c-muted2">
            Nothing on file. A family says how they want the week when they enrol, on the
            program's Schedule step.
          </span>
        ) : regs.filter(r => r.lectures_per_week).map(r => (
          <div key={r.id} className="stack g2">
            <span className="t-sm">{availabilityLine(r)}</span>
            <span className="t-xs c-muted2">
              {r.program_name ?? 'a program that is gone'} · asked {date(r.created_at)}
              {r.status === 'approved' ? ' · scheduled' : r.status === 'pending' ? ' · not scheduled yet' : ' · declined'}
            </span>
          </div>
        ))}
      </section>

      {/* ---- family ---- */}
      <section className="stack g8 mb20">
        <span className="eyebrow">Family</span>
        {student.parents.length === 0
          ? (
            <span className="t-sm c-muted2">
              No parent account. A student who is on nobody's account cannot be subscribed
              for, and no family can ask for a program for them — put them on one below.
            </span>
          )
          : student.parents.map(p => (
            <div key={p.id} className="mat-row">
              <button type="button" className="row g10 grow" style={{ minWidth: 0, textAlign: 'start', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                onClick={() => onOpenParent(p.id)}>
                <Avatar name={parentName(p)} size="sm" />
                <span className="grow stack g2" style={{ minWidth: 0 }}>
                  <span className="t-sm w-med truncate">{p.name || '—'}</span>
                  <span className="t-xs c-muted2 truncate">{p.email}{p.phone ? ` · ${p.phone}` : ''}</span>
                </span>
                <ChevronRight style={{ width: 15, height: 15, color: 'var(--muted-2)', flex: 'none' }} />
              </button>
              <button className="btn sm ghost" disabled={busy === `unlink:${p.id}`}
                onClick={() => void run(`unlink:${p.id}`, () => unlinkGuardian(p.id, student.id),
                  'Taken off that family account')}>
                <X />Unlink
              </button>
            </div>
          ))}

        {/* Linking is how a student the admin created joins a family. A
            student a family added is linked already and is not offered. */}
        {(() => {
          const free = (parents ?? []).filter(p => !student.parents.some(x => x.id === p.id))
          if (!free.length) return null
          return (
            <div className="row g6">
              <select className="sel grow" value={addParent} onChange={e => setAddParent(e.target.value)}>
                <option value="">Put this student on a family account…</option>
                {free.map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.email}{p.name ? ` · ${p.email}` : ''}</option>
                ))}
              </select>
              <button className="btn" disabled={!addParent || busy === 'link'}
                onClick={() => void run('link', async () => {
                  await linkGuardian(addParent, student.id)
                  setAddParent('')
                }, 'Added to that family account')}>
                <UserPlus />Link
              </button>
            </div>
          )
        })()}
      </section>

      {/* ---- courses ---- */}
      <section className="stack g8 mb20">
        <span className="eyebrow">Courses</span>
        {student.enrollments.length === 0 && <span className="t-sm c-muted2">Not in any course yet.</span>}
        {student.enrollments.map(e => (
          <div key={e.loop_id} className="mat-row">
            <GraduationCap style={{ width: 16, height: 16, color: 'var(--muted)' }} />
            <span className="grow stack g2" style={{ minWidth: 0 }}>
              <span className="t-sm w-med truncate">{courseLabel(db, e.loop_id)}</span>
              <span className="t-xs c-muted2">since {date(e.enrolled_at)}</span>
            </span>
            <select className="sel sm" style={{ width: 118 }} value={e.status}
              onChange={ev => void run(`st:${e.loop_id}`,
                () => setEnrollmentStatus(student.id, e.loop_id, ev.target.value as EnrollmentStatus), 'Course status saved')}>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="dropped">Dropped</option>
            </select>
            <button className="btn ghost icon sm" aria-label="Remove from course"
              onClick={() => setConfirm({ unenrol: e.loop_id })}><Trash2 /></button>
          </div>
        ))}
        <div className="row g6">
          <div className="grow"><CourseSelect db={db} value={addLoop} onChange={setAddLoop} exclude={enrolled} placeholder="Add to a course…" /></div>
          <button className="btn" disabled={!addLoop || busy === 'enrol'}
            onClick={() => void run('enrol', async () => { await enrol(student.id, addLoop, adminId); setAddLoop('') }, 'Added to the course')}>
            <Plus />Add
          </button>
        </div>
      </section>

      {/* ---- answers ---- */}
      <section className="stack g8 mb20">
        <span className="eyebrow">Answers{pending ? ` · ${pending} to grade` : ''}</span>
        {subs === null ? (
          <div className="skel" style={{ height: 60 }} />
        ) : subs.length === 0 ? (
          <span className="t-sm c-muted2">No answers sent yet.</span>
        ) : bySession.map(([sessionId, list]) => (
          <div key={sessionId} className="stack g6">
            <span className="t-sm w-sb">{db.sessions.find(s => s.id === sessionId)?.name ?? 'Session'}</span>
            {list.map(s => (
              <SubmissionItem key={s.id} db={db} sub={s} adminId={adminId}
                onGraded={next => { setSubs(all => (all ?? []).map(x => (x.id === next.id ? next : x))); onChanged() }} />
            ))}
          </div>
        ))}
      </section>

      {/* ---- what the family reads ---- */}
      <MentorNote studentId={student.id} trackId={trackOf(db, student)} authorId={adminId} />

      {/* ---- account ---- */}
      <section className="stack g10">
        <span className="eyebrow">Account</span>
        <Field label="New temporary password">
          <PasswordInput value={password} onChange={setPassword} />
        </Field>
        <div className="row g8 wrap">
          <button className="btn" disabled={password.length < 8 || busy === 'pw'}
            onClick={() => void run('pw', async () => {
              await adminUsers({ action: 'reset_password', user_id: student.id, password })
            }, 'Temporary password set — share it with the student')}>
            <KeyRound />Set password
          </button>
          <button className="btn" disabled={busy === 'disable'}
            onClick={() => void run('disable',
              () => adminUsers({ action: 'set_disabled', user_id: student.id, disabled: !student.disabled }),
              student.disabled ? 'Account turned back on' : 'Account paused — they can no longer sign in')}>
            {student.disabled ? <><RotateCcw />Turn account back on</> : <><Ban />Pause account</>}
          </button>
          <button className="btn danger" onClick={() => setConfirm('delete')} disabled={busy === 'delete'}>
            <Trash2 />Delete student
          </button>
        </div>
      </section>

      <Confirm
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => void run('delete', async () => {
          await adminUsers({ action: 'delete_student', user_id: student.id })
          onClose()
        }, 'Student deleted')}
        title="Delete this student for good?"
        body={<>{student.name}'s account, course places, progress and every answer and uploaded file are removed. This cannot be undone. To stop access but keep their work, pause the account instead.</>}
      />
      <Confirm
        open={typeof confirm === 'object' && confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (typeof confirm === 'object' && confirm) {
            const loopId = confirm.unenrol
            void run(`un:${loopId}`, () => unenrol(student.id, loopId), 'Removed from the course')
          }
        }}
        title="Remove from this course?"
        body={<>They lose access to its sessions. Their progress and answers stay, and come back if you add them again. To keep access for a finished course, set it to Completed instead.</>}
        confirmLabel="Remove" />
    </Drawer>
  )
}

/* ---------------- one parent, and their children ---------------- */

function ParentDrawer({ parent, kids, db, meta, pending, onClose, onOpenStudent }: {
  parent: Guardian; kids: StudentRow[]; db: DB; meta?: AuthMeta
  pending: Record<string, number>; onClose: () => void; onOpenStudent: (id: string) => void
}) {
  const toast = useStore(s => s.toast)
  const [balance, setBalance] = useState<number | null>(null)
  /* Where the family is. The parent picks it as they enrol; this is the
     admin's own correction of it, and it moves the heroes with them —
     which intakes they are offered follows it. */
  const [region, setRegion] = useState(parent.region ?? '')
  const [saving, setSaving] = useState(false)

  const saveRegion = async (next: string) => {
    const before = region
    setRegion(next)
    setSaving(true)
    try {
      await setFamilyRegion([parent.id, ...kids.map(k => k.id)], next || null)
      toast(next
        ? `${parent.name || 'This family'} is in ${regionLabel(next)}`
        : 'Country cleared')
    } catch (e) {
      setRegion(before)
      toast(toMessage(e), 'err')
    }
    setSaving(false)
  }

  useEffect(() => {
    let live = true
    fetchWallet(parent.id)
      .then(w => { if (live) setBalance(w.balance_egp) })
      .catch(e => toast(toMessage(e), 'err'))
    return () => { live = false }
  }, [parent.id, toast])

  const toGrade = gradeCount(kids, pending)

  return (
    <Drawer open onClose={onClose} title={parentName(parent)}>
      <div className="row g12 mb16">
        <Avatar name={parentName(parent)} size="lg" tone="gold" />
        <div className="stack g2 grow" style={{ minWidth: 0 }}>
          <span className="t-md w-sb truncate">{parent.name || parent.email}</span>
          <span className="t-xs c-muted2 truncate">Parent account</span>
          <span className="t-xs c-muted2">
            Joined {date(parent.created_at)} · {meta?.last_sign_in_at ? `last sign-in ${relative(meta.last_sign_in_at)}` : 'has not signed in yet'}
          </span>
        </div>
        {parent.disabled ? <Badge tone="rose" dot>Paused</Badge> : <Badge tone="teal" dot>Active</Badge>}
      </div>

      {/* ---- how to reach them ---- */}
      <section className="stack g8 mb20">
        <span className="eyebrow">Contact</span>
        <div className="mat-row">
          <Mail style={{ width: 15, height: 15, color: 'var(--muted)', flex: 'none' }} />
          <span className="t-sm truncate grow">{parent.email}</span>
          <CopyButton value={parent.email} />
        </div>
        {parent.phone && (
          <div className="mat-row">
            <Phone style={{ width: 15, height: 15, color: 'var(--muted)', flex: 'none' }} />
            <span className="t-sm truncate grow">{parent.phone}</span>
            <CopyButton value={parent.phone} />
          </div>
        )}
        <div className="mat-row">
          <Globe style={{ width: 15, height: 15, color: 'var(--muted)', flex: 'none' }} />
          <span className="t-sm grow">Country</span>
          <select className="sel" value={region} disabled={saving}
            style={{ maxWidth: 180, height: 30, fontSize: 13 }}
            title="Saved on this parent and their heroes — it decides which intakes they are offered"
            aria-label="Country" onChange={e => void saveRegion(e.target.value)}>
            <option value="">Not said</option>
            {REGIONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </div>
        <div className="mat-row">
          <Wallet style={{ width: 15, height: 15, color: 'var(--muted)', flex: 'none' }} />
          <span className="t-sm grow">Family wallet</span>
          {balance === null
            ? <span className="skel" style={{ width: 70, height: 16 }} />
            : <span className="t-sm w-sb tnum">{money(balance)}</span>}
        </div>
      </section>

      {/* ---- the kids on this account ---- */}
      <section className="stack g8 mb20">
        <span className="eyebrow">
          Children · {kids.length}{toGrade ? ` · ${toGrade} to grade` : ''}
        </span>
        {kids.length === 0 ? (
          <span className="t-sm c-muted2">Nobody on this account yet.</span>
        ) : kids.map(c => (
          <button key={c.id} type="button" className="mat-row click" onClick={() => onOpenStudent(c.id)}>
            <Avatar name={c.name || c.email} size="sm" />
            <span className="grow stack g2" style={{ minWidth: 0, textAlign: 'start' }}>
              <span className="t-sm w-med truncate">{c.name || '—'}</span>
              <span className="t-xs c-muted2 truncate">
                {c.email}{c.age != null ? ` · ${c.age}` : ''}
              </span>
              <span className="row g4 wrap mt4">
                {c.enrollments.length === 0
                  ? <span className="t-xs c-muted2">Not in any course yet</span>
                  : c.enrollments.map(e => (
                    <Badge key={e.loop_id} tone={e.status === 'active' ? 'brand' : e.status === 'completed' ? 'teal' : 'line'}>
                      {courseLabel(db, e.loop_id)}
                    </Badge>
                  ))}
              </span>
            </span>
            <span className="stack g4" style={{ alignItems: 'flex-end', flex: 'none' }}>
              {c.disabled
                ? <Badge tone="rose" dot>Paused</Badge>
                : c.must_change_password
                  ? <Badge tone="gold" title="Still on the temporary password"><Clock />First sign-in</Badge>
                  : <Badge tone="teal" dot>Active</Badge>}
              {pending[c.id] ? <Badge tone="gold">{pending[c.id]} to grade</Badge> : null}
            </span>
            <ChevronRight style={{ width: 15, height: 15, color: 'var(--muted-2)', flex: 'none' }} />
          </button>
        ))}
      </section>

      <p className="t-xs c-muted2">
        A parent account is made by the family, and its children with it. Open a child to change
        their courses, grade their answers or write the note the family reads.
      </p>
    </Drawer>
  )
}

/* ---------------- one row of the table ---------------- */

const gradeCount = (list: StudentRow[], pending: Record<string, number>) =>
  list.reduce((n, s) => n + (pending[s.id] ?? 0), 0)

/** What the parent said about this hero's week, one line per program they
 *  enrolled them on. It is the answer to "when can they actually sit", and
 *  it is the family's answer, not the admin's — the real days and times are
 *  set from it on Registrations. */
function Availability({ regs }: { regs: RegistrationRow[] }) {
  const said = regs.filter(r => r.lectures_per_week)
  if (said.length === 0) return <span className="t-xs c-muted2">Not asked</span>
  return (
    <div className="stack g4" style={{ minWidth: 0 }}>
      {said.slice(0, 2).map(r => (
        <span key={r.id} className="stack g2" style={{ minWidth: 0 }}>
          <span className="t-xs c-muted truncate">{availabilityLine(r, { short: true })}</span>
          <span className="t-xs c-muted2 truncate">{r.program_name ?? 'a program that is gone'}</span>
        </span>
      ))}
      {said.length > 2 && <span className="t-xs c-muted2">+{said.length - 2} more</span>}
    </div>
  )
}

function StudentCells({ s, db, pending, regs, showParent }: {
  s: StudentRow; db: DB; pending: number; regs: RegistrationRow[]; showParent: boolean
}) {
  return (
    <>
      <td>
        <div className="row g8">
          <Avatar name={s.name || s.email} size="sm" />
          <span className="t-sm w-med truncate">{s.name || '—'}</span>
        </div>
      </td>
      <td><span className="t-xs c-muted truncate">{s.email}</span></td>
      {showParent && (
        <td>
          {s.parents.length === 0
            ? <span className="t-xs c-muted2">—</span>
            : <span className="t-xs c-muted truncate">{s.parents.map(parentName).join(', ')}</span>}
        </td>
      )}
      <td className="tnum t-sm">{s.age ?? '—'}</td>
      <td>
        <div className="row g4 wrap">
          {s.enrollments.length === 0
            ? <span className="t-xs c-muted2">—</span>
            : s.enrollments.map(e => (
              <Badge key={e.loop_id} tone={e.status === 'active' ? 'brand' : e.status === 'completed' ? 'teal' : 'line'}>
                {courseLabel(db, e.loop_id)}
              </Badge>
            ))}
        </div>
      </td>
      <td><Availability regs={regs} /></td>
      <td>
        {s.disabled
          ? <Badge tone="rose" dot>Paused</Badge>
          : s.must_change_password
            ? <Badge tone="gold" title="Still on the temporary password"><Clock />First sign-in</Badge>
            : <Badge tone="teal" dot>Active</Badge>}
      </td>
      <td className="num tnum t-sm">
        {pending ? <Badge tone="gold">{pending}</Badge> : <span className="c-muted2">—</span>}
      </td>
    </>
  )
}

/* ---------------- the panel ---------------- */

/* The Students tab of Students & payments (see StudentsAndPayments). */
export function StudentsPanel() {
  const db = useStore(s => s.db)
  const [students, setStudents] = useState<StudentRow[] | null>(null)
  const [pending, setPending] = useState<Record<string, number>>({})
  const [regs, setRegs] = useState<RegistrationRow[]>([])
  const [meta, setMeta] = useState<Record<string, AuthMeta>>({})
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [course, setCourse] = useState('')
  const [group, setGroup] = useState<GroupBy>('none')
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set())
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<Open | null>(null)

  const load = useCallback(async () => {
    try {
      const [list, counts, m, registrations] = await Promise.all([
        listStudents(),
        pendingReviewCounts(),
        authMeta().catch(() => ({} as Record<string, AuthMeta>)),
        /* What each family said about their week. A missing list costs one
           column, not the page. */
        listRegistrations().catch(() => [] as RegistrationRow[]),
      ])
      setStudents(list)
      setPending(counts)
      setMeta(m)
      setRegs(registrations)
      setError(null)
    } catch (e) {
      setError(errText(e))
    }
  }, [])

  useEffect(() => { if (backendLive) void load() }, [load])

  const saidBy = useMemo(() => {
    const by: Record<string, RegistrationRow[]> = {}
    for (const r of regs) (by[r.student_id] ??= []).push(r)
    return by
  }, [regs])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const hit = (s: StudentRow) =>
      s.name.toLowerCase().includes(needle) || s.email.toLowerCase().includes(needle) ||
      s.parents.some(p => p.name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle))
    return (students ?? []).filter(s =>
      (!needle || hit(s)) &&
      (status === 'all' || (status === 'active' ? !s.disabled : s.disabled)) &&
      (!course || s.enrollments.some(e => e.loop_id === course)))
  }, [students, q, status, course])

  /* Grouped, the rows keep their order inside each family. */
  const grouped = useMemo(() => (group === 'parent' ? families(rows) : []), [group, rows])
  const allFolded = grouped.length > 0 && grouped.every(f => folded.has(famKey(f)))

  const fold = (key: string) => setFolded(prev => {
    const next = new Set(prev)
    if (!next.delete(key)) next.add(key)
    return next
  })

  if (!backendLive) {
    return (
      <div className="card">
        <Empty icon={<Users />} title="Student accounts need the backend" />
      </div>
    )
  }

  const totalPending = Object.values(pending).reduce((a, b) => a + b, 0)

  /* The drawer reads from the loaded list, so a reload after an edit keeps
     it on the same person instead of closing under the admin's hands. */
  const openStudent = open?.kind === 'student' ? students?.find(s => s.id === open.id) ?? null : null
  const openParent = open?.kind === 'parent'
    ? (students ?? []).flatMap(s => s.parents).find(p => p.id === open.id) ?? null
    : null
  const openParentKids = openParent
    ? (students ?? []).filter(s => s.parents.some(p => p.id === openParent.id))
    : []

  return (
    <>

      <div className="card mb16" style={{ padding: 10 }}>
        <div className="row g8 wrap">
          <SearchInput value={q} onChange={setQ} placeholder="Search by student, email or parent…" className="grow" />
          <Segmented<StatusFilter> value={status} onChange={setStatus} options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'disabled', label: 'Paused' },
          ]} />
          <div style={{ minWidth: 200 }}>
            <CourseSelect db={db} value={course} onChange={setCourse} placeholder="All courses" />
          </div>
          <Segmented<GroupBy> value={group} onChange={setGroup} options={[
            { value: 'none', label: 'Flat', icon: <List /> },
            { value: 'parent', label: 'By parent', icon: <Users /> },
          ]} />
          {group === 'parent' && grouped.length > 0 && (
            <button className="btn"
              onClick={() => setFolded(allFolded ? new Set() : new Set(grouped.map(famKey)))}>
              {allFolded ? <><ChevronsUpDown />Expand all</> : <><ChevronsDownUp />Collapse all</>}
            </button>
          )}
          {totalPending > 0 && <Badge tone="gold" dot>{totalPending} answer{totalPending === 1 ? '' : 's'} to grade</Badge>}
          <button className="btn primary" onClick={() => setAdding(true)}><UserPlus />Add student</button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {error ? (
          <Empty icon={<Users />} title="Couldn't load students"
            action={<button className="btn" onClick={() => void load()}><RotateCcw />Try again</button>} />
        ) : students === null ? (
          <div className="stack g8" style={{ padding: 16 }}>
            {[0, 1, 2].map(i => <div key={i} className="skel" style={{ height: 36 }} />)}
          </div>
        ) : rows.length === 0 ? (
          <Empty icon={<Users />}
            title={students.length === 0 ? 'No students yet' : 'Nobody matches'}
            action={students.length === 0
              ? <button className="btn primary" onClick={() => setAdding(true)}><UserPlus />Add student</button>
              : undefined} />
        ) : (
          <div className="tbl-wrap" style={{ maxHeight: 'calc(100dvh - 350px)' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 230 }}>Email</th>
                  {group === 'none' && <th style={{ width: 200 }}>Parent</th>}
                  <th style={{ width: 60 }}>Age</th>
                  <th>Courses</th>
                  <th style={{ width: 220 }}>What the parent asked for</th>
                  <th style={{ width: 150 }}>Status</th>
                  <th className="num" style={{ width: 110 }}>To grade</th>
                </tr>
              </thead>
              <tbody>
                {group === 'parent'
                  ? grouped.map(f => {
                    const key = famKey(f)
                    const shut = folded.has(key)
                    return (
                    <Fragment key={key}>
                      <tr className="grp" data-click={!!f.parent}
                        onClick={f.parent ? () => setOpen({ kind: 'parent', id: f.parent!.id }) : undefined}>
                        <td colSpan={7}>
                          <div className="row g8">
                            <button type="button" className="btn ghost icon sm fold"
                              aria-expanded={!shut}
                              aria-label={`${shut ? 'Show' : 'Hide'} ${f.parent ? parentName(f.parent) : 'the unclaimed students'}`}
                              onClick={e => { e.stopPropagation(); fold(key) }}>
                              {shut ? <ChevronRight /> : <ChevronDown />}
                            </button>
                            {f.parent
                              ? <Avatar name={parentName(f.parent)} size="sm" tone="gold" />
                              : <Users style={{ width: 16, height: 16, color: 'var(--muted-2)', flex: 'none' }} />}
                            <span className="stack g2" style={{ minWidth: 0 }}>
                              <span className="t-sm w-sb truncate">
                                {f.parent ? parentName(f.parent) : 'No parent account'}
                              </span>
                              <span className="t-xs c-muted2 truncate">
                                {f.parent
                                  ? [f.parent.name && f.parent.email, f.parent.phone].filter(Boolean).join(' · ')
                                  : 'Created here, not added by a family'}
                              </span>
                            </span>
                            <span className="auto-s row g6" style={{ flex: 'none' }}>
                              <Badge tone="line">{f.students.length} child{f.students.length === 1 ? '' : 'ren'}</Badge>
                              {gradeCount(f.students, pending) > 0 &&
                                <Badge tone="gold">{gradeCount(f.students, pending)} to grade</Badge>}
                              {f.parent && <ChevronRight style={{ width: 15, height: 15, color: 'var(--muted-2)' }} />}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {!shut && f.students.map(s => (
                        <tr key={s.id} onClick={() => setOpen({ kind: 'student', id: s.id })} style={{ cursor: 'pointer' }}>
                          <StudentCells s={s} db={db} pending={pending[s.id] ?? 0} regs={saidBy[s.id] ?? []} showParent={false} />
                        </tr>
                      ))}
                    </Fragment>
                    )
                  })
                  : rows.map(s => (
                    <tr key={s.id} onClick={() => setOpen({ kind: 'student', id: s.id })} style={{ cursor: 'pointer' }}>
                      <StudentCells s={s} db={db} pending={pending[s.id] ?? 0} regs={saidBy[s.id] ?? []} showParent />
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {students && <div className="mt12 t-xs c-muted2">{rows.length} of {students.length} student{students.length === 1 ? '' : 's'}</div>}

      {adding && <AddStudent db={db} onClose={() => setAdding(false)} onCreated={() => void load()} />}
      {openStudent && (
        <StudentDrawer student={openStudent} db={db} meta={meta[openStudent.id]}
          regs={saidBy[openStudent.id] ?? []}
          onClose={() => setOpen(null)} onChanged={() => void load()}
          onOpenParent={id => setOpen({ kind: 'parent', id })} />
      )}
      {openParent && (
        <ParentDrawer parent={openParent} kids={openParentKids} db={db} meta={meta[openParent.id]}
          pending={pending} onClose={() => setOpen(null)}
          onOpenStudent={id => setOpen({ kind: 'student', id })} />
      )}
    </>
  )
}
