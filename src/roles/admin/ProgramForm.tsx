import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoBack } from '@/lib/backNav'
import { ChevronRight, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { Confirm, Field, Modal, Switch, Tabs } from '@/components/ui'
import {
  PROGRAM_STAGES, PROGRAM_STAGE_META, type ProgramStage, type TabVideos, type Track,
} from '@/lib/types'
import { derivedStage } from '@/lib/programs'
import { AREA_META, areaPatch, useArea } from '@/lib/area'
import { listsOf, savedLists, ValuesFields } from './ValuesFields'
import { CoversEditor } from './CoversEditor'
import { VideoField } from './VideoField'
import './programForm.css'

/* A training program: the folder its courses live in. Created and edited
   right here in Material.

   Three tabs rather than one long scroll, because the three things being
   written are different jobs: what it is called and where it sits, what it
   covers, and what it is worth. The dialog is one size whichever tab is
   open, so nothing jumps and the two outline editors get the whole pane —
   the same shape the course form uses one level down. */

type Tab = 'about' | 'covers' | 'values'

export function ProgramForm({ track, stage: startStage, onClose }: {
  track?: Track
  /** Added from a column on the map: it is born into that column. */
  stage?: ProgramStage
  onClose: () => void
}) {
  const createTrack = useStore(s => s.createTrack)
  const updateTrack = useStore(s => s.updateTrack)
  const deleteTrack = useStore(s => s.deleteTrack)
  const toast = useStore(s => s.toast)
  const courses = useStore(s => (track ? s.db.loops.filter(l => l.trackId === track.id).length : 0))
  const nav = useNavigate()
  const goBack = useGoBack()
  /* Opened from Material or from Work — the program belongs to that one. */
  const area = useArea()
  const base = AREA_META[area].admin

  const [tab, setTab] = useState<Tab>('about')
  const [name, setName] = useState(track?.name ?? '')
  const [overview, setOverview] = useState(track?.overview ?? '')
  const [lists, setLists] = useState(() => listsOf(track))
  const [videoUrl, setVideoUrl] = useState(track?.videoUrl ?? '')
  /* A video per tab, beside the document the tabs are read from. */
  const [tabVideos, setTabVideos] = useState<TabVideos>(() => track?.tabVideos ?? {})
  /* Whether a family is shown it at all. The Marketplace is what Material
     holds, so a new program is listed from the start and this is how one is
     taken out of sight. Work is not shown to families at all. */
  const [listed, setListed] = useState(track?.listed ?? true)
  /* Empty means "work it out from the path" — the normal answer. */
  const [stage, setStage] = useState<ProgramStage | ''>(track?.stage ?? startStage ?? '')
  const [confirm, setConfirm] = useState(false)
  /* What the connections say today, shown beside the automatic option so the
     choice is never made blind. */
  const tracks = useStore(s => s.db.tracks)
  const auto = track ? derivedStage(track, tracks) : 'specialization'

  const save = () => {
    const patch = {
      name: name.trim() || 'Untitled program',
      overview: overview.trim(),
      listed: area === 'work' ? false : listed,
      stage: stage || undefined,
      videoUrl: videoUrl.trim() || null,
      tabVideos,
      ...savedLists(lists),
    }
    if (track) {
      updateTrack(track.id, patch)
      toast('Program saved')
      onClose()
      return
    }
    const created = createTrack({ ...patch, ...areaPatch(area) })
    toast('Program added — now add its first course')
    onClose()
    nav(`${base}/${created.id}`)
  }

  return (
    <Modal
      open
      className="pf-modal"
      onClose={onClose}
      title={track ? track.name || 'Program' : 'New training program'}
      description={track ? 'Program' : 'A program holds courses taken one after another'}
      footer={
        <>
          {track && (
            <button className="btn ghost" style={{ color: 'var(--rose-600)' }}
              disabled={courses > 0}
              title={courses > 0 ? 'Delete its courses first' : 'Delete this program'}
              onClick={() => setConfirm(true)}>
              <Trash2 />Delete
            </button>
          )}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>
            {track ? 'Save' : <>Add program<ChevronRight /></>}
          </button>
        </>
      }
    >
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
              <Field label="Program name">
                <input className="inp" autoFocus value={name} placeholder="e.g. Electronics & Robotics Level 1"
                  onChange={e => setName(e.target.value)} />
              </Field>

              {area !== 'work' && (
                <VideoField label="Introduction video" value={videoUrl} onChange={setVideoUrl} />
              )}

              <Field label="Where it sits on the path">
                <select className="sel" value={stage}
                  onChange={e => setStage(e.target.value as ProgramStage | '')}>
                  <option value="">Work it out from the path — {PROGRAM_STAGE_META[auto].one.toLowerCase()}</option>
                  {PROGRAM_STAGES.map(s => (
                    <option key={s} value={s}>{PROGRAM_STAGE_META[s].one}</option>
                  ))}
                </select>
              </Field>

              {area !== 'work' && (
                <label className="pf-switch">
                  <Switch on={listed} onChange={setListed} label="Show this program on the families' training path" />
                  <span className="stack g2">
                    <b className="t-sm">Shown to families</b>
                    <span className="t-xs c-muted2">{listed ? 'Families can see and enroll' : 'Hidden from families'}</span>
                  </span>
                </label>
              )}
            </div>
          )}

          {tab === 'covers' && (
            <CoversEditor value={overview} videos={tabVideos.covers ?? []}
              onChange={(md, covers) => { setOverview(md); setTabVideos(v => ({ ...v, covers })) }} />
          )}

          {tab === 'values' && (
            <ValuesFields fill label={null} lists={lists} onChange={setLists}
              videos={tabVideos.lists ?? {}}
              onVideosChange={next => setTabVideos(v => ({ ...v, lists: next }))} />
          )}
        </div>
      </div>

      {track && (
        <Confirm
          open={confirm}
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            deleteTrack(track.id)
            toast('Program deleted', 'info')
            onClose()
            goBack(base, { replace: true })
          }}
          title="Delete this program?"
          body={<>“{track.name}” has no courses, so nothing else is removed.</>}
        />
      )}
    </Modal>
  )
}
