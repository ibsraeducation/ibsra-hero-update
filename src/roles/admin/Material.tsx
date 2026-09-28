import { Fragment, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { BackLink, useGoBack } from '@/lib/backNav'
import {
  AlertTriangle, BookOpen, ChevronRight, Copy, EyeOff, FileText, Hammer, ImagePlus,
  Layers, ListChecks, ListOrdered, MoreHorizontal, Paperclip, Pencil, Plus, Radio,
  Trash2, UploadCloud, Video,
} from 'lucide-react'
import { readiness, sessionFlow, sessionStats, useStore } from '@/lib/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Cover, sessionCover, toneCover } from '@/components/Cover'
import { Badge, Confirm, Empty, Field, Menu, MenuItem, MenuLabel, MenuSep, Modal, Switch, Tabs } from '@/components/ui'
import { date, mins } from '@/lib/format'
import { courseHours, hoursLabel } from '@/lib/programLength'
import {
  STATUS_META,
  type Loop, type ProgramStage, type PublishStatus, type Session, type TabVideos, type Track,
} from '@/lib/types'
import { PickCard } from '@/components/PickCard'
import { ProgramPicker } from '@/components/ProgramPicker'
import './programForm.css'
import { backendLive } from '@/lib/supabase'
import { uploadMaterial } from '@/lib/api/storage'
import { toMessage } from '@/lib/api/errors'
import { IMAGE_ACCEPT, pickFile, readImageAsDataUrl } from './editor/uploads'
import { ProgramForm } from './ProgramForm'
import { CoversEditor } from './CoversEditor'
import { CourseOverview } from '@/components/CourseOverview'
import { listsOf, savedLists, ValuesFields } from './ValuesFields'
import { VideoField } from './VideoField'
import { cleanList } from '@/lib/programInfo'
import { AREA_META, cap, inArea, trackArea, useArea, useNouns } from '@/lib/area'

/* ==========================================================================
   Material — the whole admin surface, three steps deep:
     1. training program (track)  →  2. course (loop)  →  3. sessions & topics
   Step 3 hands off to the session editor, where each topic gets its
   recording, its material and its Q&A. Publishing a session is what puts it
   in front of a student — nothing else here is visible to them.

   Work runs on these same pages at /admin/work, with programs of its own —
   where the student works on their assets. Nothing is shared between the two.
   ========================================================================== */

export function Crumbs({ trail }: { trail: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="crumbs mb12" aria-label="Breadcrumb">
      {trail.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="sepr" style={{ width: 13, height: 13 }} />}
          {c.to
            ? <BackLink to={c.to} className="crumb-link">{c.label}</BackLink>
            : <b className="truncate">{c.label}</b>}
        </Fragment>
      ))}
    </nav>
  )
}

/* ---------------- the ⋯ on a folder card ----------------
   Rename or delete a program or a course from the grid, without opening it
   first. Delete always asks, and the question says exactly what goes with it. */

export function CardMenu({ label, editLabel, onEdit, deleteLabel, onDelete, confirmTitle, confirmBody }: {
  label: string
  editLabel: string
  onEdit: () => void
  deleteLabel: string
  onDelete: () => void
  confirmTitle: string
  confirmBody: React.ReactNode
}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <Menu align="end" trigger={p => (
        <button className="btn ghost icon sm" {...p} aria-label={`${label} menu`}>
          <MoreHorizontal />
        </button>
      )}>
        <MenuLabel>{label}</MenuLabel>
        <MenuItem icon={<Pencil />} onClick={onEdit}>{editLabel}</MenuItem>
        <MenuSep />
        <MenuItem icon={<Trash2 />} danger onClick={() => setConfirm(true)}>{deleteLabel}</MenuItem>
      </Menu>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={onDelete}
        title={confirmTitle}
        body={confirmBody}
      />
    </>
  )
}

/* ---------------- a course: add, rename, delete ----------------
   A course is a folder in its program. It is numbered in the order it is
   added, and its dates and status are set by the store — a new one starts
   the week after the one before it ends and runs nine weeks.

   Its form is the program's: a name, a price and the seven values-and-skills
   lists, the same fields in the same order, so the admin never meets a
   different form one level down. The outline of what it covers comes last. */

export function CourseForm({ track, loop, onClose }: { track: Track; loop?: Loop; onClose: () => void }) {
  const createLoop = useStore(s => s.createLoop)
  const updateLoop = useStore(s => s.updateLoop)
  const deleteLoop = useStore(s => s.deleteLoop)
  const toast = useStore(s => s.toast)
  const count = useStore(s => s.db.loops.filter(l => l.trackId === track.id).length)
  const sessions = useStore(s => s.db.sessions)
  const inside = loop ? sessions.filter(x => x.loopId === loop.id).length : 0
  const goBack = useGoBack()
  const area = useArea()
  const base = AREA_META[area].admin
  /* The same form names a course in Material and a milestone in Work. */
  const nouns = useNouns()

  const next = count + 1
  const [name, setName] = useState(loop?.name ?? '')
  const [lists, setLists] = useState(() => listsOf(loop))
  /* What the course covers, written the same way a program's lists are. */
  const [overview, setOverview] = useState(loop?.overview ?? '')
  const [videoUrl, setVideoUrl] = useState(loop?.videoUrl ?? '')
  /* Lectures and sections together. Added up from the sessions inside this
     course — they carry the lengths — and typed only while it has none. The
     program's length a family sees is the sum of its courses divided by the
     hours a week they pick. */
  const [hours, setHours] = useState(loop?.durationHours ? String(loop.durationHours) : '')
  const auto = loop
    ? courseHours({ id: loop.id, durationHours: null }, sessions)
    : null
  const [tabVideos, setTabVideos] = useState<TabVideos>(() => loop?.tabVideos ?? {})
  const [tab, setTab] = useState<'about' | 'covers' | 'values'>('about')
  const [confirm, setConfirm] = useState(false)

  const save = () => {
    const patch: Partial<Loop> = {
      name: name.trim() || (loop?.name ?? `${cap(nouns.loop)} ${next}`),
      ...savedLists(lists),
      overview: cleanList(overview),
      videoUrl: videoUrl.trim() || null,
      tabVideos,
      durationHours: auto ?? (Number(hours) > 0 ? Math.min(2000, Math.round(Number(hours))) : null),
    }
    if (loop) {
      updateLoop(loop.id, patch)
      toast(`${cap(nouns.loop)} saved`)
      onClose()
      return
    }
    /* The course is created and that is all: it lands in the grid, and
       opening it is a separate decision. */
    const created = createLoop(track.id, patch)
    toast(`${cap(nouns.loop)} ${created.index} added`)
    onClose()
  }

  return (
    <Modal
      open
      className="pf-modal"
      onClose={onClose}
      title={loop ? loop.name || `${cap(nouns.loop)} ${loop.index}` : `New ${nouns.loop}`}
      description={loop
        ? `${cap(nouns.loop)} ${loop.index} of ${track.name}`
        : `Number ${next} in ${track.name}`}
      footer={
        <>
          {loop && (
            <button className="btn ghost" style={{ color: 'var(--rose-600)' }} onClick={() => setConfirm(true)}>
              <Trash2 />Delete
            </button>
          )}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>
            {loop ? 'Save' : `Add ${nouns.loop}`}
          </button>
        </>
      }
    >
      {/* Three tabs, one dialog size — the same shape as the program form
          above it, so the admin learns the form once. */}
      <div className="pf">
        <div className="pf-tabs">
          <Tabs value={tab} onChange={setTab} items={[
            { value: 'about', label: 'About' },
            { value: 'covers', label: 'What it covers' },
            { value: 'values', label: 'Values & skills' },
          ]} />
        </div>

        <div className="pf-body">
          {tab === 'about' && (
            <div className="pf-col">
              <Field label={`${cap(nouns.loop)} name`}>
                <input className="inp" autoFocus value={name}
                  placeholder={`${cap(nouns.loop)} ${loop?.index ?? next} — e.g. Scripting & hooks`}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') save() }} />
              </Field>

              <Field label="Duration — teaching hours, lectures and sections together"
                hint={auto !== null
                  ? `Added up from the ${inside} session${inside === 1 ? '' : 's'} inside this ${nouns.loop} — change one's length and this follows.`
                  : `Type it while this ${nouns.loop} is empty. The moment it has sessions, it is added up from their lengths.`}>
                {auto !== null ? (
                  <input className="inp tnum" readOnly value={hoursLabel(auto)}
                    style={{ maxWidth: 140 }} aria-label="Teaching hours" />
                ) : (
                  <input className="inp" type="number" min={1} max={2000} value={hours}
                    placeholder="e.g. 30" style={{ maxWidth: 140 }}
                    onChange={e => setHours(e.target.value)} />
                )}
              </Field>

              <VideoField label="Course video" value={videoUrl} onChange={setVideoUrl} />
            </div>
          )}

          {tab === 'covers' && (
            <CoversEditor value={overview} videos={tabVideos.covers ?? []} noun={nouns.loop}
              onChange={(md, covers) => { setOverview(md); setTabVideos(v => ({ ...v, covers })) }} />
          )}

          {tab === 'values' && (
            <ValuesFields fill label={null} lists={lists} onChange={setLists}
              videos={tabVideos.lists ?? {}}
              onVideosChange={next => setTabVideos(v => ({ ...v, lists: next }))} />
          )}
        </div>
      </div>

      {loop && (
        <Confirm
          open={confirm}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            deleteLoop(loop.id)
            onClose()
            goBack(`${base}/${track.id}`, { replace: true })
          }}
          title={`Delete this ${nouns.loop}?`}
          body={<>“{loop.name}” and {inside === 1 ? 'the 1 session' : `all ${inside} sessions`} inside it are removed, with every topic, recording, file and question in them. The {nouns.loopPlural} after it move up one place.</>}
        />
      )}
    </Modal>
  )
}

/* ---------------- step 1 · training programs ---------------- */

function Programs() {
  const db = useStore(s => s.db)
  const deleteProgram = useStore(s => s.deleteProgram)
  const area = useArea()
  const { admin: base } = AREA_META[area]
  const toggleProgramLink = useStore(s => s.toggleProgramLink)
  /* A new program is born into the column the admin added it from. */
  const [creating, setCreating] = useState<ProgramStage | null>(null)
  /* Rename or delete straight from the card — no need to open the program. */
  const [editing, setEditing] = useState<Track | null>(null)
  /* A program is created right here; its price and listing are a separate job. */
  const newProgram = () => setCreating('specialization')

  /* The programs of this area, and the facts about each one. The map needs
     the tracks themselves, because a connection is between two of them. */
  const tracks = useMemo(() => db.tracks.filter(inArea(area)), [db.tracks, area])

  const rows = useMemo(() => tracks.map(track => {
    const loops = db.loops.filter(l => l.trackId === track.id)
    const sessions = db.sessions.filter(s => loops.some(l => l.id === s.loopId))
    return {
      track,
      courses: loops.length,
      sessions: sessions.length,
      published: sessions.filter(s => s.status === 'published').length,
      topics: sessions.reduce((a, s) => a + s.titles.length, 0),
    }
  }), [db, tracks])

  const factsOf = (r: typeof rows[number]) => [
    `${r.courses} course${r.courses === 1 ? '' : 's'}`,
    `${r.sessions} session${r.sessions === 1 ? '' : 's'}`,
    `${r.topics} topic${r.topics === 1 ? '' : 's'}`,
    `${r.published} live to students`,
  ]

  /* Rename or delete a program without opening it — the one thing on this
     card a family never sees. */
  const programMenu = (r: typeof rows[number]) => (
    <CardMenu
      label="Training program"
      editLabel="Edit program"
      onEdit={() => setEditing(r.track)}
      deleteLabel="Delete program"
      onDelete={() => deleteProgram(r.track.id)}
      confirmTitle="Delete this training program?"
      confirmBody={
        <>
          “{r.track.name}” is removed
          {r.courses > 0
            ? <> with {r.courses === 1 ? 'its 1 course' : `all ${r.courses} courses`} and
                {' '}{r.sessions === 1 ? 'the 1 session' : `the ${r.sessions} sessions`}
                {' '}inside {r.courses === 1 ? 'it' : 'them'},
                every topic, recording, file and question included.
                {r.published > 0 && <> {r.published === 1 ? 'One session is' : `${r.published} sessions are`} live to students right now.</>}
              </>
            : <>. It has no courses in it yet.</>}
        </>
      }
    />
  )

  return (
    <div className="page">
      <PageHeader
        title="Pick a training program"
        actions={<button className="btn primary" onClick={newProgram}><Plus />New training program</button>}
      />

      {rows.length === 0 ? (
        <div className="card">
          <Empty icon={<Layers />} title="No training programs yet"
            action={<button className="btn primary" onClick={newProgram}><Plus />New training program</button>} />
        </div>
      ) : (
        <ProgramPicker
          tracks={tracks}
          to={t => `${base}/${t.id}`}
          facts={t => factsOf(rows.find(r => r.track.id === t.id)!)}
          tail={t => {
            const live = rows.find(r => r.track.id === t.id)!.published
            /* Two different words: what students can open, and whether a
               family is shown it at all. */
            return area === 'work' || (t.listed ?? true)
              ? <Badge tone="teal" dot>{live} live</Badge>
              : <Badge tone="line" dot><EyeOff style={{ width: 11, height: 11 }} />Hidden</Badge>
          }}
          menu={t => programMenu(rows.find(r => r.track.id === t.id)!)}
          onConnect={toggleProgramLink}
          onAdd={setCreating}
        />
      )}

      {creating && <ProgramForm stage={creating} onClose={() => setCreating(null)} />}
      {editing && <ProgramForm track={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/* ---------------- step 2 · courses ---------------- */

const LOOP_TONE = { planning: 'line', running: 'teal', closed: '' } as const

function Courses({ track }: { track: Track }) {
  const db = useStore(s => s.db)
  const deleteLoop = useStore(s => s.deleteLoop)
  const [adding, setAdding] = useState(false)
  const [editingProgram, setEditingProgram] = useState(false)
  /* Rename or delete straight from the grid — no need to open the course. */
  const [editingCourse, setEditingCourse] = useState<Loop | null>(null)
  const updateTrack = useStore(s => s.updateTrack)
  const toast = useStore(s => s.toast)
  const area = useArea()
  const { admin: base, label } = AREA_META[area]
  /* What the Marketplace sells is what Material holds, so the switch for it
     is here rather than on another page. Work has no shop. */
  const listed = track.listed ?? true
  const shop = area !== 'work'
  const setListed = (on: boolean) => {
    updateTrack(track.id, { listed: on })
    toast(on
      ? `${track.name} is on the training path`
      : `${track.name} is hidden — families no longer see it`, on ? 'ok' : 'info')
  }

  const rows = useMemo(() => db.loops
    .filter(l => l.trackId === track.id)
    .sort((a, b) => a.index - b.index)
    .map(loop => {
      const sessions = db.sessions.filter(s => s.loopId === loop.id)
      return {
        loop,
        sessions: sessions.length,
        published: sessions.filter(s => s.status === 'published').length,
        topics: sessions.reduce((a, s) => a + s.titles.length, 0),
        minutes: sessions.reduce((a, s) => a + sessionStats(s).minutes, 0),
      }
    }), [db, track.id])

  return (
    <div className="page">
      <Crumbs trail={[{ label, to: base }, { label: track.name }]} />
      <PageHeader
        title={rows.length ? 'Pick a course' : 'Add the first course'}
        actions={
          <>
            {/* On sale or not, decided here: the Marketplace lists what
                Material holds, and this is the switch that holds one back. */}
            {shop && (
              <label className="row g8" style={{ cursor: 'pointer' }}
                title={listed
                  ? 'Families see this program on their training path'
                  : 'Hidden from families — it stays here in Material'}>
                <Switch on={listed} onChange={setListed} label="Show this program on the families' training path" />
                <span className="t-sm c-muted">{listed ? 'Shown to families' : 'Hidden'}</span>
              </label>
            )}
            <button className="btn" onClick={() => setEditingProgram(true)}><Pencil />Edit program</button>
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Plus />New course
            </button>
          </>
        }
      />


      {rows.length === 0 ? (
        <div className="card">
          <Empty icon={<BookOpen />} title="No courses on this program yet"
            action={<button className="btn primary" onClick={() => setAdding(true)}><Plus />Add course 1</button>} />
        </div>
      ) : (
        <div className="folder-grid">
          {rows.map(r => (
            <PickCard
              key={r.loop.id}
              to={`${base}/${track.id}/${r.loop.id}`}
              cover={
                <Cover bg={toneCover(track.color, r.loop.id)} icon={BookOpen}
                  tag={`Course · ${r.loop.code}`} big={String(r.loop.index).padStart(2, '0')}
                  tail={<Badge tone={LOOP_TONE[r.loop.status]} dot>{r.loop.status}</Badge>} />
              }
              name={r.loop.name}
              menu={
                <CardMenu
                  label={`Course ${r.loop.index} · ${r.loop.code}`}
                  editLabel="Rename course"
                  onEdit={() => setEditingCourse(r.loop)}
                  deleteLabel="Delete course"
                  onDelete={() => deleteLoop(r.loop.id)}
                  confirmTitle="Delete this course?"
                  confirmBody={
                    <>
                      “{r.loop.name}” and {r.sessions === 1 ? 'the 1 session' : `all ${r.sessions} sessions`} inside
                      it are removed, with every topic, recording, file and question in them
                      {r.published > 0 && <> — {r.published === 1 ? '1 of them is' : `${r.published} of them are`} live to students</>}.
                      The courses after it move up one place.
                    </>
                  }
                />
              }
              facts={[
                `${r.sessions} session${r.sessions === 1 ? '' : 's'}`,
                `${r.topics} topic${r.topics === 1 ? '' : 's'}`,
                `${r.published} live to students`,
                mins(r.minutes),
                `${date(r.loop.startDate)} → ${date(r.loop.endDate)}`,
              ]}
            />
          ))}
          {/* The next course in the sequence, as the last folder in the row. */}
          <button className="folder tree-add" onClick={() => setAdding(true)}>
            <Plus />
            <span className="t-sm w-sb">Add course {rows.length + 1}</span>
            <span className="t-xs c-muted2">Starts after course {rows.length} ends</span>
          </button>
        </div>
      )}

      {adding && <CourseForm track={track} onClose={() => setAdding(false)} />}
      {editingCourse && (
        <CourseForm track={track} loop={editingCourse} onClose={() => setEditingCourse(null)} />
      )}
      {editingProgram && <ProgramForm track={track} onClose={() => setEditingProgram(false)} />}
    </div>
  )
}

/* ---------------- a session card, edited from its own ⋯ ----------------
   Its name and its picture are both card-level things, so neither of them
   is a reason to open the editor. */

function RenameSession({ session, onClose }: { session: Session; onClose: () => void }) {
  const updateSession = useStore(s => s.updateSession)
  const toast = useStore(s => s.toast)
  const [name, setName] = useState(session.name)

  const save = () => {
    updateSession(session.id, { name: name.trim() || 'Untitled session' })
    toast('Session renamed')
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Rename ${session.code}`}
      description="The name on the card, and the one the student reads at the top of the session."
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save name</button>
        </>
      }
    >
      <Field label="Session name">
        <input className="inp" autoFocus value={name} placeholder="e.g. Soldering the first board"
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save() }} />
      </Field>
    </Modal>
  )
}

function SessionPicture({ session, tone, onClose }: {
  session: Session; tone: string; onClose: () => void
}) {
  const updateSession = useStore(s => s.updateSession)
  const toast = useStore(s => s.toast)
  const [cover, setCover] = useState(session.cover ?? '')
  const [busy, setBusy] = useState(false)

  const upload = async () => {
    const file = await pickFile(IMAGE_ACCEPT)
    if (!file) return
    setBusy(true)
    try {
      /* Connected, the picture goes to the materials bucket like any other
         file. On its own, it is scaled down and kept with the session. */
      setCover(backendLive
        ? (await uploadMaterial(session.id, file)).url
        : await readImageAsDataUrl(file))
    } catch (e) {
      toast(toMessage(e), 'err')
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    const next = cover.trim()
    updateSession(session.id, { cover: next })
    toast(next ? 'Picture saved' : 'Picture removed')
    onClose()
  }

  /* What the card will look like — the picture behind, with the number, the
     name and the state on top of it. */
  const preview = cover.trim() || sessionCover({ ...session, cover: undefined }, tone)

  return (
    <Modal
      open
      onClose={onClose}
      title={`Picture · ${session.code}`}
      description="It sits behind the card. The number, the name and the state stay on top of it."
      footer={
        <>
          {cover.trim() && (
            <button className="btn ghost" style={{ color: 'var(--rose-600)' }}
              onClick={() => setCover('')}>
              <Trash2 />Remove picture
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy}>Save picture</button>
        </>
      }
    >
      <div className="stack g14">
        <Cover
          bg={preview}
          icon={session.type === 'live' ? Radio : Video}
          tag={session.type === 'live' ? 'Live session' : 'Recorded session'}
          big={String(session.order + 1).padStart(2, '0')}
          caption={session.name || 'Untitled session'}
          height={176}
          tail={<Badge tone={STATUS_META[session.status].tone} dot>{STATUS_META[session.status].label}</Badge>}
        />

        <Field label="Picture">
          <div className="row g6">
            <input className="inp mono grow" value={cover} placeholder="https://… — or upload one"
              onChange={e => setCover(e.target.value)} />
            <button className="btn" onClick={() => void upload()} disabled={busy}>
              <UploadCloud />{busy ? 'Adding…' : cover.trim() ? 'Replace' : 'Upload'}
            </button>
          </div>
        </Field>

        <p className="hint">
          With no picture the card keeps its programme colour, exactly as it does now.
        </p>
      </div>
    </Modal>
  )
}

/* ---------------- step 3 · sessions & topics ---------------- */

export function CourseSessions({ track, loop }: { track: Track; loop: Loop }) {
  const db = useStore(s => s.db)
  const createSession = useStore(s => s.createSession)
  const duplicateSession = useStore(s => s.duplicateSession)
  const deleteSessions = useStore(s => s.deleteSessions)
  const setSessionStatus = useStore(s => s.setSessionStatus)
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  /* Renaming a session and giving it a picture both happen on the card. */
  const [renaming, setRenaming] = useState<Session | null>(null)
  const [picturing, setPicturing] = useState<Session | null>(null)
  const { admin: root, label } = AREA_META[useArea()]
  const nouns = useNouns()

  const base = `${root}/${track.id}/${loop.id}`
  const sessions = useMemo(
    () => db.sessions.filter(s => s.loopId === loop.id).sort((a, b) => a.order - b.order),
    [db.sessions, loop.id],
  )

  const add = () => {
    const s = createSession({ loopId: loop.id })
    nav(`${base}/${s.id}`)
  }

  return (
    <div className="page">
      <Crumbs trail={[
        { label, to: root },
        { label: track.name, to: `${root}/${track.id}` },
        { label: loop.name },
      ]} />
      <PageHeader
        title={loop.name}
        actions={
          <>
            <button className="btn" onClick={() => setEditing(true)}><Pencil />Edit {nouns.loop}</button>
            <button className="btn primary" onClick={add}><Plus />New session</button>
          </>
        }
      />

      <CourseOverview loop={loop} />

      {sessions.length === 0 ? (
        <div className="card">
          <Empty
            icon={<Video />}
            title={`No sessions in this ${nouns.loop} yet`}
            action={<button className="btn primary" onClick={add}><Plus />Add the first session</button>}
          />
        </div>
      ) : (
        <div className="folder-grid">
          {sessions.map(s => {
            const st = sessionStats(s)
            const gaps = readiness(s)
            const to = `${base}/${s.id}`

            return (
              <article key={s.id} className="folder prod-card tree-card">
                {/* The picture sits behind; the number, the name and the state
                    read on top of it. The whole cover opens the editor — the
                    biggest target on the card. */}
                <Link to={to} className="prod-cover-btn" aria-label={`Open ${s.name}`}>
                  <Cover
                    bg={sessionCover(s, track.color)}
                    icon={s.type === 'live' ? Radio : Video}
                    tag={s.type === 'live' ? 'Live session' : 'Recorded session'}
                    big={String(s.order + 1).padStart(2, '0')}
                    caption={s.name || 'Untitled session'}
                    height={140}
                    tail={<Badge tone={STATUS_META[s.status].tone} dot>{STATUS_META[s.status].label}</Badge>}
                  />
                </Link>

                <span className="folder-body">
                  <span className="row g8 mb8" style={{ minWidth: 0 }}>
                    <span className="eyebrow mono grow truncate">{s.code}</span>
                    <Menu align="end" trigger={p => (
                      <button className="btn ghost icon sm" {...p} aria-label="Session menu">
                        <MoreHorizontal />
                      </button>
                    )}>
                      <MenuLabel>{s.code}</MenuLabel>
                      <MenuItem icon={<Video />} onClick={() => nav(to)}>Open editor</MenuItem>
                      <MenuItem icon={<Pencil />} onClick={() => setRenaming(s)}>Rename session</MenuItem>
                      <MenuItem icon={<ImagePlus />} onClick={() => setPicturing(s)}>
                        {s.cover ? 'Change the picture' : 'Add a picture'}
                      </MenuItem>
                      <MenuItem icon={<ListOrdered />} onClick={() => nav(`${to}?pane=flow`)}>
                        Arrange the sequence
                      </MenuItem>
                      <MenuItem icon={<Copy />} onClick={() => {
                        const c = duplicateSession(s.id)
                        if (c) nav(`${base}/${c.id}`)
                      }}>Duplicate</MenuItem>
                      <MenuSep />
                      <MenuItem icon={<Trash2 />} danger onClick={() => deleteSessions([s.id])}>
                        Delete session
                      </MenuItem>
                    </Menu>
                  </span>

                  {/* Not a count with the reasons hidden in a tooltip — the
                      list itself, so the next thing to do is on the card. */}
                  {gaps.length > 0 && s.status !== 'published' && (
                    <ul className="gap-list">
                      <li className="gap-head"><AlertTriangle />Fix before it can publish</li>
                      {gaps.map(g => <li key={g}>{g}</li>)}
                    </ul>
                  )}

                      <div className="row g10 t-xs c-muted2 tnum wrap">
                        <span className="row g4">
                          {s.type === 'live'
                            ? <Radio style={{ width: 12, height: 12 }} />
                            : <Video style={{ width: 12, height: 12 }} />}
                          {s.type === 'live' ? 'Live' : 'Recorded'}
                        </span>
                        <span className="row g4" title="Topics">
                          <ListChecks style={{ width: 12, height: 12 }} />{st.topics} topics
                        </span>
                        {st.projects > 0 && (
                          <span className="row g4" title="Projects">
                            <Hammer style={{ width: 12, height: 12 }} />{st.projects} project{st.projects === 1 ? '' : 's'}
                          </span>
                        )}
                        <span className="row g4" title="Recordings ready"
                          style={{ color: st.missingVideo ? 'var(--gold-600)' : undefined }}>
                          <Video style={{ width: 12, height: 12 }} />{st.videos}/{st.topics}
                        </span>
                        <span className="row g4" title="Material files">
                          <Paperclip style={{ width: 12, height: 12 }} />{st.materials}
                        </span>
                        <span className="row g4" title="Q&A questions">
                          <FileText style={{ width: 12, height: 12 }} />{st.tasks}
                        </span>
                        <Link to={`${to}?pane=flow`} className="row g4"
                          title="The order the student meets all of this in">
                          <ListOrdered style={{ width: 12, height: 12 }} />
                          {sessionFlow(s).length} steps
                        </Link>
                        <span>{mins(st.minutes)}</span>
                      </div>

                  {/* The topics themselves live in the editor — the card
                      carries the state, not the contents. */}

                  <span className="prod-foot">
                    <label className="row g6 t-xs c-muted2" style={{ minWidth: 0 }}>
                      State
                      <select
                        className="sel sm"
                        style={{ maxWidth: 130 }}
                        value={s.status}
                        aria-label={`State of ${s.name || s.code}`}
                        title={gaps.length ? `Publishing is blocked: ${gaps.join(' · ')}` : undefined}
                        onChange={e => setSessionStatus([s.id], e.target.value as PublishStatus)}
                      >
                        {(Object.keys(STATUS_META) as PublishStatus[]).map(k => (
                          <option key={k} value={k} disabled={k === 'published' && gaps.length > 0}>
                            {STATUS_META[k].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="row g6" style={{ marginInlineStart: 'auto' }}>
                      <Link to={to} className="btn sm primary">Open<ChevronRight /></Link>
                    </span>
                  </span>
                </span>
              </article>
            )
          })}
        </div>
      )}

      <p className="t-xs c-muted2 mt16">
        Students only ever see published sessions — drafts and scheduled ones stay in here.
        Sessions run in the order they are numbered; drag them into order from the sessions list.
      </p>

      {editing && <CourseForm track={track} loop={loop} onClose={() => setEditing(false)} />}
      {renaming && <RenameSession session={renaming} onClose={() => setRenaming(null)} />}
      {picturing && (
        <SessionPicture session={picturing} tone={track.color} onClose={() => setPicturing(null)} />
      )}
    </div>
  )
}

/* ---------------- router entry ---------------- */

export default function Material() {
  const { trackId, loopId } = useParams()
  const db = useStore(s => s.db)
  const area = useArea()
  const base = AREA_META[area].admin

  const track = db.tracks.find(t => t.id === trackId)
  const loop = db.loops.find(l => l.id === loopId)

  /* A stale deep link falls back to the nearest step that still exists. */
  if (trackId && !track) return <Navigate to={base} replace />
  if (!track) return <Programs />
  /* A program opened under the other area moves to its own. */
  if (trackArea(track) !== area) {
    const own = AREA_META[trackArea(track)].admin
    return <Navigate to={`${own}/${track.id}${loopId ? `/${loopId}` : ''}`} replace />
  }
  if (loopId && (!loop || loop.trackId !== track.id)) {
    return <Navigate to={`${base}/${track.id}`} replace />
  }
  if (!loop) return <Courses track={track} />
  return <CourseSessions track={track} loop={loop} />
}
