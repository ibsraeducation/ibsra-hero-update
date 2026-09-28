/* ==========================================================================
   One program, read by a family or a student before anybody enrols —
   its intro video, what it is worth (the seven lists), and every course
   in it with its own video, what it covers, and its sessions.

   Everything here comes from `fetchCatalogue()`: the same tracks, loops and
   session previews the board reads, so a card and the page it opens can
   never disagree about what a program contains.
   ========================================================================== */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Radio, Video } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { VideoEmbed } from '@/components/VideoEmbed'
import { ProgramOutcomes } from '@/components/ProgramOutcomes'
import { Badge, Empty } from '@/components/ui'
import { Outline } from '@/components/Outline'
import { parseOutline } from '@/lib/outline'
import { mins } from '@/lib/format'
import { fetchCatalogue, type Catalogue, type SessionPreview } from '@/lib/api/catalogue'
import { toMessage } from '@/lib/api/errors'
import { EnrollDialog } from './EnrollDialog'

/** A date range. Same short-vs-full-date rule the old marketplace used: a
 *  range that crosses a year needs both years spelled out. */
function span(from: string, to: string): string {
  if (!from || !to) return ''
  const f = new Date(from)
  const t = new Date(to)
  const sameYear = f.getFullYear() === t.getFullYear()
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }
  return `${f.toLocaleDateString('en-GB', opts)} → ${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export function ProgramPage({ audience }: { audience: 'parent' | 'student' }) {
  const { trackId = '' } = useParams()
  const nav = useNavigate()
  const base = audience === 'parent' ? '/parent/marketplace' : '/student/marketplace'

  const [cat, setCat] = useState<Catalogue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)

  useEffect(() => {
    let live = true
    void fetchCatalogue().then(c => { if (live) setCat(c) }).catch(e => { if (live) setError(toMessage(e)) })
    return () => { live = false }
  }, [])

  const track = cat?.tracks.find(t => t.id === trackId) ?? null
  const courses = useMemo(
    () => (cat?.loops ?? []).filter(l => l.trackId === trackId).sort((a, b) => a.index - b.index),
    [cat, trackId],
  )
  const sessionsOf = (loopId: string): SessionPreview[] =>
    (cat?.sessions ?? []).filter(s => s.loopId === loopId)

  if (error) return <div className="page"><div className="auth-alert" role="alert"><span>{error}</span></div></div>
  if (cat && !track) {
    return (
      <div className="page">
        <Empty icon={<Video />} title="That program is not on the path any more" />
      </div>
    )
  }
  if (!track) return <div className="page"><div className="skel" style={{ height: 320 }} /></div>

  return (
    <div className="page">
      <PageHeader
        eyebrow={<Link to={base} className="row g4 t-xs"><ChevronLeft style={{ width: 14, height: 14 }} />Training path</Link>}
        title={track.name}
        actions={<button className="btn primary" onClick={() => setEnrolling(true)}>Enroll</button>}
      />

      {track.videoUrl && <div className="mb16" style={{ maxWidth: 640 }}><VideoEmbed url={track.videoUrl} title={track.name} /></div>}

      <ProgramOutcomes track={track} />

      <h2 className="t-lg w-sb mb12 mt8">Courses</h2>
      {courses.length === 0 ? (
        <Empty icon={<Video />} title="Nothing built yet" />
      ) : (
        <div className="stack g14">
          {courses.map(c => {
            const nodes = parseOutline(c.overview ?? '')
            const sessions = sessionsOf(c.id)
            return (
              <details key={c.id} className="card" open={c.index === 1}>
                <summary className="card-head" style={{ cursor: 'pointer' }}>
                  <span className="row g10">
                    <Badge tone="brand">{c.index}</Badge>
                    <span className="t-md w-sb">{c.name}</span>
                    {c.startDate && c.endDate && <span className="t-xs c-muted2">{span(c.startDate, c.endDate)}</span>}
                  </span>
                </summary>
                <div className="card-body stack g14">
                  {c.videoUrl && <div style={{ maxWidth: 520 }}><VideoEmbed url={c.videoUrl} title={c.name} /></div>}
                  {nodes.length > 0 && <Outline nodes={nodes} />}
                  {sessions.length > 0 && (
                    <div className="stack g8">
                      {sessions.map(s => (
                        <div key={s.id} className="row g10" style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                          {s.type === 'live' ? <Radio className="ico-xs" /> : <Video className="ico-xs" />}
                          <span className="t-sm grow">{s.name}</span>
                          {s.durationMin > 0 && <span className="t-xs c-muted2">{mins(s.durationMin)}</span>}
                          {s.videoUrl && <span className="badge line sm">Preview</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            )
          })}
        </div>
      )}

      {enrolling && (
        <EnrollDialog
          track={track}
          courses={courses}
          onClose={() => setEnrolling(false)}
          onDone={() => nav(base)}
        />
      )}
    </div>
  )
}
