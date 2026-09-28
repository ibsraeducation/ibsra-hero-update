/* ==========================================================================
   Admin · the training programs, as a family sees them.

   Every training program in Material is shown to families — there is no
   second place to write one, and no listing to keep in step with it. So this
   is the shop window, drawn as the same card a kit is drawn as: what is on
   sale sits beside what is not, in one visual language.

   Nothing carries a price. The platform is paid for by the month; a program
   is not sold. A family reads it and asks for it, and answering that request
   in Requests is what opens courses — the ones that student is ready for.
   The one decision on a card here is whether the program appears at all.
   ========================================================================== */

import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, ExternalLink, GraduationCap, Layers, Store } from 'lucide-react'
import { sessionStats, useStore } from '@/lib/store'
import { Badge, Empty, Switch } from '@/components/ui'
import { toneCover } from '@/components/Cover'
import { mins } from '@/lib/format'
import { inArea } from '@/lib/area'
import { programBlurb, programEyebrow } from '@/lib/programInfo'
import type { Loop, Track } from '@/lib/types'
import './wallets.css'

interface Row {
  track: Track
  courses: Loop[]
  /** Sessions a student can actually open today. */
  published: number
  topics: number
  minutes: number
  listed: boolean
}

/* ---------------- one program, as a card ---------------- */

function ProgramCard({ r, onFlip }: { r: Row; onFlip: (on: boolean) => void }) {
  const nav = useNavigate()
  const { track } = r
  const blurb = programBlurb(track)

  const facts: string[] = [
    `${r.courses.length} course${r.courses.length === 1 ? '' : 's'}`,
    `${r.published} session${r.published === 1 ? '' : 's'} live to students`,
  ]
  if (r.topics) facts.push(`${r.topics} topic${r.topics === 1 ? '' : 's'}`)
  if (r.minutes) facts.push(mins(r.minutes))

  return (
    <article className="folder prod-card">
      {/* The cover opens the program in Material: the biggest target on the
          card, and the thing an admin points at when they mean "that one". */}
      <button className="prod-cover-btn" onClick={() => nav(`/admin/material/${track.id}`)}
        aria-label={`Open ${track.name} in Material`}>
        <span className="prod-thumb" style={{ height: 116, background: toneCover(track.color, track.id) }}>
          <GraduationCap className="prod-thumb-mark" aria-hidden />
          <span className="prod-thumb-tag">Training program</span>
          {/* Short on purpose: it shares the top of the cover with the tag. */}
          <span className="prod-thumb-tail">
            {r.listed
              ? <Badge tone="teal" dot>Shown</Badge>
              : <Badge tone="line" dot>Hidden</Badge>}
          </span>
        </span>
      </button>

      <span className="folder-body">
        <span className="row g8 mb8" style={{ minWidth: 0 }}>
          <Link className="t-md w-sb grow clamp2 linkish" to={`/admin/material/${track.id}`}>
            {track.name || <span className="c-muted2">Untitled program</span>}
          </Link>
          {/* Where a price sits on a kit, because that is the question a
              family asks of both. */}
          <span className="t-xs c-muted2" style={{ flex: 'none' }}>No fee</span>
        </span>

        {r.courses.length === 0 && (
          <span className="row g6 wrap mb8">
            <Badge tone="gold" dot>No course yet — nothing would open</Badge>
          </span>
        )}

        <span className="t-xs c-muted clamp2" style={{ lineHeight: 1.6 }}>
          {blurb || <span className="c-muted2">Nothing written about it yet — this is the part a family reads.</span>}
        </span>

        <span className="prod-facts mt8">
          <span className="prod-fact"><span className="truncate">{programEyebrow(track)}</span></span>
          {facts.map(f => (
            <span key={f} className="prod-fact"><span className="truncate" title={f}>{f}</span></span>
          ))}
        </span>

        {/* The courses under it, in the order a hero takes them — the same
            list the family reads on the card, and what you tick in Requests. */}
        {r.courses.length > 0 && (
          <span className="mkt-courses">
            {r.courses.slice(0, 4).map(l => (
              <span key={l.id} className="mkt-course">
                <BookOpen style={{ width: 12, height: 12, flex: 'none', color: 'var(--muted-2)' }} />
                <span className="t-xs truncate grow">Course {l.index} · {l.name}</span>
              </span>
            ))}
            {r.courses.length > 4 && (
              <span className="t-xs c-muted2" style={{ padding: '6px 0 0' }}>
                +{r.courses.length - 4} more
              </span>
            )}
          </span>
        )}

        <span className="prod-foot">
          <label className="row g8" style={{ cursor: 'pointer' }}
            title={r.listed
              ? 'Families see this program on their training path'
              : 'Hidden from families — it stays in Material'}>
            <Switch on={r.listed} onChange={onFlip}
              label={`Show ${track.name} on the families' training path`} />
            <span className="t-xs c-muted">{r.listed ? 'Shown' : 'Hidden'}</span>
          </label>

          <span className="row g6" style={{ marginInlineStart: 'auto' }}>
            <button className="btn sm" onClick={() => nav('/parent/material')}
              title="The training path a family enrols from, in Material">
              <ExternalLink />Preview
            </button>
            <button className="btn sm primary" onClick={() => nav(`/admin/material/${track.id}`)}
              title="Its courses, sessions and topics, in Material">
              <Layers />Courses
            </button>
          </span>
        </span>
      </span>
    </article>
  )
}

/* ---------------- the grid ---------------- */

export function MaterialPrograms() {
  const db = useStore(s => s.db)
  const updateTrack = useStore(s => s.updateTrack)
  const toast = useStore(s => s.toast)

  const rows = useMemo<Row[]>(() => db.tracks
    .filter(inArea('material'))
    .map(track => {
      const courses = db.loops.filter(l => l.trackId === track.id).sort((a, b) => a.index - b.index)
      const ids = new Set(courses.map(l => l.id))
      const sessions = db.sessions.filter(s => ids.has(s.loopId))
      const open = sessions.filter(s => s.status === 'published')
      return {
        track,
        courses,
        published: open.length,
        topics: open.reduce((a, s) => a + s.titles.length, 0),
        minutes: open.reduce((a, s) => a + sessionStats(s).minutes, 0),
        listed: track.listed ?? true,
      }
    }), [db])

  const shown = rows.filter(r => r.listed).length

  const flip = (r: Row, on: boolean) => {
    updateTrack(r.track.id, { listed: on })
    toast(on
      ? `${r.track.name} is on the training path`
      : `${r.track.name} is hidden — families no longer see it`, on ? 'ok' : 'info')
  }

  if (rows.length === 0) {
    return (
      <div className="card">
        <Empty icon={<Store />} title="No training program yet"
          action={<Link className="btn primary" to="/admin/material"><GraduationCap />Open Material</Link>} />
      </div>
    )
  }

  return (
    <>
      <div className="row g10 wrap mb16">
        <p className="t-xs c-muted2 grow" style={{ maxWidth: 660, lineHeight: 1.6 }}>
          Every program in Material, with its courses under it. Nothing is priced: a family reads
          one and asks for it, and you answer in Requests by opening the courses their hero is
          ready for. Switch one off and it stays in Material, out of sight.
        </p>
        <span className="t-xs c-muted2 tnum" style={{ flex: 'none' }}>
          <b className="c-ink2">{shown}</b> of {rows.length} shown to families
        </span>
      </div>

      <div className="prod-grid">
        {rows.map(r => (
          <ProgramCard key={r.track.id} r={r} onFlip={on => flip(r, on)} />
        ))}
      </div>
    </>
  )
}
