import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Hammer, Milestone, Pencil, Plus } from 'lucide-react'
import { sessionStats, useStore } from '@/lib/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Cover, toneCover } from '@/components/Cover'
import { Badge, Empty, Field, Modal } from '@/components/ui'
import { PickCard } from '@/components/PickCard'
import { date, mins } from '@/lib/format'
import type { Loop, Track } from '@/lib/types'
import { AREA_META, areaPatch, inArea, trackArea } from '@/lib/area'
import { CardMenu, CourseForm, CourseSessions, Crumbs } from './Material'

/* ==========================================================================
   Work — the projects we build with the student, its own workflow beside
   Material's. Three levels, in Work's own words:
     1. project  →  2. milestone  →  3. sessions

   The sessions level is Material's own component on purpose: a Work session
   is the same session, edited in the same editor, with the same topics,
   recordings, files and Q&A. Only the two levels above it differ, because a
   project is not a syllabus — it runs in milestones, and it has nothing to
   price, no stage on a path and nothing to put on the program map.
   ========================================================================== */

const BASE = AREA_META.work.admin

/* A new project takes the next colour in the row, so two added one after the
   other never come out looking like the same folder. */
const TONES = ['brand', 'teal', 'gold', 'sky', 'rose']

const LOOP_TONE = { planning: 'line', running: 'teal', closed: '' } as const

/* ---------------- a project: add and rename ---------------- */

function ProjectForm({ track, onClose }: { track?: Track; onClose: () => void }) {
  const createTrack = useStore(s => s.createTrack)
  const updateTrack = useStore(s => s.updateTrack)
  const toast = useStore(s => s.toast)
  const count = useStore(s => s.db.tracks.filter(inArea('work')).length)
  const nav = useNavigate()

  const [name, setName] = useState(track?.name ?? '')
  const [blurb, setBlurb] = useState(track?.blurb ?? '')

  const save = () => {
    const patch = { name: name.trim() || 'Untitled project', blurb: blurb.trim() }
    if (track) {
      updateTrack(track.id, patch)
      toast('Project saved')
      onClose()
      return
    }
    /* Straight into it: a project with no milestones has nothing to show,
       so the admin lands where the first one is added. */
    const created = createTrack({ ...patch, color: TONES[count % TONES.length], ...areaPatch('work') })
    toast('Project added — now add its first milestone')
    onClose()
    nav(`${BASE}/${created.id}`)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={track ? `Project · ${track.name}` : 'New project'}
      description={track
        ? 'Rename it, or say again what is being built. Its milestones and sessions are untouched.'
        : 'A project runs in milestones, and each milestone holds the sessions we work through.'}
      footer={
        <>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>
            {track ? 'Save project' : 'Add project'}
          </button>
        </>
      }
    >
      <div className="stack g14">
        <Field label="Project name">
          <input className="inp" autoFocus value={name} placeholder="e.g. A YouTube channel of their own"
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }} />
        </Field>

        <Field label="What we build">
          <textarea className="ta" rows={2} value={blurb}
            placeholder="A channel with ten published videos and a thumbnail set of its own."
            onChange={e => setBlurb(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* ---------------- step 1 · projects ---------------- */

function Projects() {
  const db = useStore(s => s.db)
  const deleteProgram = useStore(s => s.deleteProgram)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Track | null>(null)

  const rows = useMemo(() => db.tracks.filter(inArea('work')).map(track => {
    const loops = db.loops.filter(l => l.trackId === track.id)
    const sessions = db.sessions.filter(s => loops.some(l => l.id === s.loopId))
    return {
      track,
      milestones: loops.length,
      sessions: sessions.length,
      published: sessions.filter(s => s.status === 'published').length,
      topics: sessions.reduce((a, s) => a + s.titles.length, 0),
    }
  }), [db])

  return (
    <div className="page">
      <PageHeader
        title={rows.length ? 'Pick a project' : 'Add the first project'}
        actions={<button className="btn primary" onClick={() => setAdding(true)}><Plus />New project</button>}
      />

      {rows.length === 0 ? (
        <div className="card">
          <Empty icon={<Hammer />} title="No projects yet"
            action={<button className="btn primary" onClick={() => setAdding(true)}><Plus />New project</button>} />
        </div>
      ) : (
        <div className="folder-grid">
          {rows.map(r => (
            <PickCard
              key={r.track.id}
              to={`${BASE}/${r.track.id}`}
              cover={
                <Cover bg={toneCover(r.track.color, r.track.id)} icon={Hammer} height={112}
                  tag="Project"
                  tail={<Badge tone="teal" dot>{r.published} live</Badge>} />
              }
              eyebrow={`${r.milestones} milestone${r.milestones === 1 ? '' : 's'}`}
              name={r.track.name}
              blurb={r.track.blurb}
              menu={
                <CardMenu
                  label="Project"
                  editLabel="Edit project"
                  onEdit={() => setEditing(r.track)}
                  deleteLabel="Delete project"
                  onDelete={() => deleteProgram(r.track.id)}
                  confirmTitle="Delete this project?"
                  confirmBody={
                    <>
                      “{r.track.name}” is removed
                      {r.milestones > 0
                        ? <> with {r.milestones === 1 ? 'its 1 milestone' : `all ${r.milestones} milestones`} and
                            {' '}{r.sessions === 1 ? 'the 1 session' : `the ${r.sessions} sessions`}
                            {' '}inside {r.milestones === 1 ? 'it' : 'them'},
                            every topic, recording, file and question included.
                            {r.published > 0 && <> {r.published === 1 ? 'One session is' : `${r.published} sessions are`} live to students right now.</>}
                          </>
                        : <>. It has no milestones in it yet.</>}
                    </>
                  }
                />
              }
              facts={[
                `${r.sessions} session${r.sessions === 1 ? '' : 's'}`,
                `${r.topics} topic${r.topics === 1 ? '' : 's'}`,
                `${r.published} live to students`,
              ]}
            />
          ))}
          <button className="folder tree-add" onClick={() => setAdding(true)}>
            <Plus />
            <span className="t-sm w-sb">New project</span>
            <span className="t-xs c-muted2">Another thing we build with them</span>
          </button>
        </div>
      )}

      {adding && <ProjectForm onClose={() => setAdding(false)} />}
      {editing && <ProjectForm track={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/* ---------------- step 2 · milestones ---------------- */

function Milestones({ track }: { track: Track }) {
  const db = useStore(s => s.db)
  const deleteLoop = useStore(s => s.deleteLoop)
  const [adding, setAdding] = useState(false)
  const [editingProject, setEditingProject] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState<Loop | null>(null)

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
      <Crumbs trail={[{ label: 'Work', to: BASE }, { label: track.name }]} />
      <PageHeader
        title={rows.length ? 'Pick a milestone' : 'Add the first milestone'}
        actions={
          <>
            <button className="btn" onClick={() => setEditingProject(true)}><Pencil />Edit project</button>
            <button className="btn primary" onClick={() => setAdding(true)}><Plus />New milestone</button>
          </>
        }
      />

      {track.blurb && <p className="t-sm c-muted mb16">{track.blurb}</p>}

      {rows.length === 0 ? (
        <div className="card">
          <Empty icon={<Milestone />} title="No milestones on this project yet"
            action={<button className="btn primary" onClick={() => setAdding(true)}><Plus />Add milestone 1</button>} />
        </div>
      ) : (
        <div className="folder-grid">
          {rows.map(r => (
            <PickCard
              key={r.loop.id}
              to={`${BASE}/${track.id}/${r.loop.id}`}
              cover={
                <Cover bg={toneCover(track.color, r.loop.id)} icon={Milestone}
                  tag={`Milestone · ${r.loop.code}`} big={String(r.loop.index).padStart(2, '0')}
                  tail={<Badge tone={LOOP_TONE[r.loop.status]} dot>{r.loop.status}</Badge>} />
              }
              name={r.loop.name}
              menu={
                <CardMenu
                  label={`Milestone ${r.loop.index} · ${r.loop.code}`}
                  editLabel="Rename milestone"
                  onEdit={() => setEditingMilestone(r.loop)}
                  deleteLabel="Delete milestone"
                  onDelete={() => deleteLoop(r.loop.id)}
                  confirmTitle="Delete this milestone?"
                  confirmBody={
                    <>
                      “{r.loop.name}” and {r.sessions === 1 ? 'the 1 session' : `all ${r.sessions} sessions`} inside
                      it are removed, with every topic, recording, file and question in them
                      {r.published > 0 && <> — {r.published === 1 ? '1 of them is' : `${r.published} of them are`} live to students</>}.
                      The milestones after it move up one place.
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
          {/* The next milestone in the run, as the last folder in the row. */}
          <button className="folder tree-add" onClick={() => setAdding(true)}>
            <Plus />
            <span className="t-sm w-sb">Add milestone {rows.length + 1}</span>
            <span className="t-xs c-muted2">Starts after milestone {rows.length} ends</span>
          </button>
        </div>
      )}

      {/* The milestone form is Material's course form: same folder, and it
          reads its words off the area it was opened from. */}
      {adding && <CourseForm track={track} onClose={() => setAdding(false)} />}
      {editingMilestone && (
        <CourseForm track={track} loop={editingMilestone} onClose={() => setEditingMilestone(null)} />
      )}
      {editingProject && <ProjectForm track={track} onClose={() => setEditingProject(false)} />}
    </div>
  )
}

/* ---------------- router entry ---------------- */

export default function Work() {
  const { trackId, loopId } = useParams()
  const db = useStore(s => s.db)

  const track = db.tracks.find(t => t.id === trackId)
  const loop = db.loops.find(l => l.id === loopId)

  /* A stale deep link falls back to the nearest step that still exists. */
  if (trackId && !track) return <Navigate to={BASE} replace />
  if (!track) return <Projects />
  /* A Material program opened under Work goes back to Material. */
  if (trackArea(track) !== 'work') {
    const own = AREA_META[trackArea(track)].admin
    return <Navigate to={`${own}/${track.id}${loopId ? `/${loopId}` : ''}`} replace />
  }
  if (loopId && (!loop || loop.trackId !== track.id)) return <Navigate to={`${BASE}/${track.id}`} replace />
  if (!loop) return <Milestones track={track} />
  /* The sessions level is Material's, unchanged — a session is a session. */
  return <CourseSessions track={track} loop={loop} />
}
