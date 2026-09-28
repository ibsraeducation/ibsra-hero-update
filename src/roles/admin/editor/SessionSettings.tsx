import { useEffect, useState } from 'react'
import { Radio, Video } from 'lucide-react'
import { useStore } from '@/lib/store'
import { Field, InlineEdit, Switch } from '@/components/ui'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import { skillsFromLists } from '@/lib/programInfo'
import type { Session } from '@/lib/types'
import { listsOf, ValuesFields, type Lists } from '../ValuesFields'
import { VideoField } from '../VideoField'

export function SessionSettings({ session }: { session: Session }) {
  const db = useStore(s => s.db)
  const update = useStore(s => s.updateSession)
  const set = (patch: Partial<Session>) => update(session.id, patch)

  const instructors = db.people.filter(p => p.role === 'instructor')

  /* The same seven lists a program and a course have. Held here while the
     admin types, and written to the session on every change the way the
     other fields on this page are — the sync coalesces the keystrokes into
     one save. A different session gets its own lists. */
  const [lists, setLists] = useState<Lists>(() => listsOf(session))
  useEffect(() => { setLists(listsOf(session)) }, [session.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const changeLists = (next: Lists) => {
    setLists(next)
    set({ ...next, skills: skillsFromLists(next) })
  }

  return (
    <div className="editor-scroll">
      <div className="inner stack g20">
        {/* name */}
        <div>
          <InlineEdit
            className="inp ghost title"
            value={session.name}
            placeholder="Name this session"
            onCommit={v => set({ name: v.trim() || 'Untitled session' })}
          />
          <InlineEdit
            className="inp ghost t-sm"
            value={session.summary ?? ''}
            placeholder="One line on what a student walks away with…"
            onCommit={v => set({ summary: v })}
          />
        </div>

        {/* delivery */}
        <section className="card">
          <div className="card-head"><h2 className="t-md w-sb">Delivery</h2></div>
          <div className="card-body stack g16">
            <div className="grid g-2">
              <Field label="Format">
                <div className="row g8">
                  {(['recorded', 'live'] as const).map(t => (
                    <button key={t} className={`btn grow ${session.type === t ? 'primary' : ''}`}
                      onClick={() => set({ type: t })}>
                      {t === 'live' ? <Radio /> : <Video />}
                      {t === 'live' ? 'Live' : 'Recorded'}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Session code">
                <input className="inp mono" value={session.code}
                  onChange={e => set({ code: e.target.value })} />
              </Field>
            </div>

            <div className="grid g-2">
              <Field
                label={session.type === 'live' ? 'Class time' : 'Release date'}
>
                <input className="inp" type="datetime-local"
                  value={toLocalInput(session.scheduledAt)}
                  onChange={e => set({ scheduledAt: fromLocalInput(e.target.value) })} />
              </Field>

              <Field label="Instructor">
                <select className="sel" value={session.instructorId ?? ''}
                  onChange={e => set({ instructorId: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {instructors.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </div>

            <VideoField label="Preview video" value={session.videoUrl ?? ''}
              onChange={v => set({ videoUrl: v || null })}
 />

            {session.type === 'live' && (
              <>
                <div className="grid g-2">
                  <Field label="Meeting link">
                    <input className="inp" placeholder="https://meet.ibsra.dev/…"
                      value={session.meetingUrl ?? ''}
                      onChange={e => set({ meetingUrl: e.target.value })} />
                  </Field>
                  <Field label="Planned length">
                    <input className="inp tnum" type="number" min={0} step={5}
                      value={session.durationMin}
                      onChange={e => set({ durationMin: Number(e.target.value) })} />
                  </Field>
                </div>

                <div className="row g10" style={{
                  padding: '10px 12px', border: '1px solid var(--line)',
                  borderRadius: 'var(--r-md)', background: 'var(--surface-2)',
                }}>
                  <Switch on={!!session.recordingReady}
                    onChange={v => set({ recordingReady: v })}
                    label="Recording published" />
                  <div className="stack g2 grow">
                    <span className="t-sm w-med">Recording published after the class</span>
                    <span className="hint">
                      Students who missed the live class get the replay attached to each title.
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* values and skills — the program form's block, on the session */}
        <section className="card">
          <div className="card-head">
            <div className="stack g2">
              <h2 className="t-md w-sb">Values and skills</h2>
              <span className="hint">
                What this session is worth to the student and the skills it builds — the same
                seven lists as on the program and the course.
              </span>
            </div>
          </div>
          <div className="card-body">
            <ValuesFields lists={lists} onChange={changeLists} label={null} />
          </div>
        </section>
      </div>
    </div>
  )
}
