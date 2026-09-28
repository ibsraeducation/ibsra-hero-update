/* ==========================================================================
   Who was actually in the room.

   The hero asking for the link is a claim, not a record — a tab left open
   claims as loudly as a hero who sat the whole hour. The mentor who ran the
   class says Present or Absent afterwards, and that is what the measures
   count. A sitting nobody answered reads as a gap, deliberately: silence
   should look like missing work, not like a pass.
   ========================================================================== */

import { useMemo, useState } from 'react'
import { Check, ExternalLink, Loader2, Video, X } from 'lucide-react'
import { Badge, Empty } from '@/components/ui'
import { confirmAttendance, setBookingMeeting } from '@/lib/api/schedule'
import { toMessage } from '@/lib/api/errors'
import { useStore } from '@/lib/store'
import { dateTime } from '@/lib/format'
import type { SessionBookingRow } from '@/lib/api/rows'

export interface AttendanceRow extends SessionBookingRow {
  hero: string
}

function MeetingCell({ row, onSaved }: { row: AttendanceRow; onSaved: (url: string) => void }) {
  const toast = useStore(s => s.toast)
  const [value, setValue] = useState(row.meeting_url ?? '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const next = value.trim()
    if (next === (row.meeting_url ?? '')) return
    setBusy(true)
    try {
      await setBookingMeeting(row.id, next)
      onSaved(next)
      toast(next ? 'Meeting link saved' : 'Meeting link cleared')
    } catch (e) {
      setValue(row.meeting_url ?? '')
      toast(toMessage(e), 'err')
    }
    setBusy(false)
  }

  return (
    <span className="row g6" style={{ minWidth: 0 }}>
      <input className="inp" value={value} disabled={busy}
        placeholder="https://…" aria-label="Meeting link"
        style={{ minWidth: 150, height: 30, fontSize: 12.5 }}
        onChange={e => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={e => { if (e.key === 'Enter') void save() }} />
      {row.meeting_url && (
        <a className="btn ghost icon sm" href={row.meeting_url} target="_blank" rel="noreferrer"
          aria-label="Open the room"><ExternalLink /></a>
      )}
    </span>
  )
}

function MarkCell({ row, onMarked }: { row: AttendanceRow; onMarked: (was: boolean) => void }) {
  const toast = useStore(s => s.toast)
  const [busy, setBusy] = useState(false)
  const over = new Date(row.ends_at).getTime() <= Date.now()

  const mark = async (was: boolean) => {
    setBusy(true)
    try {
      await confirmAttendance(row.id, was)
      onMarked(was)
    } catch (e) {
      toast(toMessage(e), 'err')
    }
    setBusy(false)
  }

  if (!over) {
    return <span className="t-xs c-muted2">{row.joined_at ? 'Joined' : 'Not yet'}</span>
  }

  return (
    <span className="row g4">
      {busy && <Loader2 className="spin" style={{ width: 14, height: 14 }} />}
      <button className="btn sm" data-on={row.attended === true || undefined} disabled={busy}
        onClick={() => void mark(true)}><Check />Present</button>
      <button className="btn sm" data-on={row.attended === false || undefined} disabled={busy}
        onClick={() => void mark(false)}><X />Absent</button>
    </span>
  )
}

export function AttendancePanel({ rows, onChange }: {
  rows: AttendanceRow[]
  onChange: (id: string, patch: Partial<AttendanceRow>) => void
}) {
  const [onlyOpen, setOnlyOpen] = useState(true)

  const shown = useMemo(() => {
    const now = Date.now()
    const list = onlyOpen
      ? rows.filter(r => r.attended === null && new Date(r.ends_at).getTime() <= now)
      : rows
    return [...list].sort((a, b) => b.starts_at.localeCompare(a.starts_at))
  }, [rows, onlyOpen])

  const waiting = rows.filter(
    r => r.attended === null && new Date(r.ends_at).getTime() <= Date.now(),
  ).length

  return (
    <div className="stack g10">
      <div className="row g10 wrap between">
        <span className="row g8">
          {waiting > 0
            ? <Badge tone="gold" dot>{waiting} to confirm</Badge>
            : <Badge tone="teal" dot>Nothing waiting</Badge>}
        </span>
        <label className="row g6 t-xs c-muted2">
          <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />
          Only the ones still to confirm
        </label>
      </div>

      {shown.length === 0 ? (
        <Empty icon={<Video />} title={onlyOpen ? 'Every sitting here is confirmed' : 'Nothing booked into this intake yet'} />
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Hero</th>
                <th>Room</th>
                <th>Was there</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id}>
                  <td>
                    <span className="stack g2">
                      <span className="t-sm nowrap">{dateTime(r.starts_at)}</span>
                      <span className="t-xs c-muted2">
                        {r.kind === 'section' ? 'Section' : 'Lecture'}
                        {r.joined_at ? ' · asked for the link' : ''}
                      </span>
                    </span>
                  </td>
                  <td><span className="t-sm">{r.hero}</span></td>
                  <td><MeetingCell row={r} onSaved={url => onChange(r.id, { meeting_url: url || null })} /></td>
                  <td>
                    <span className="stack g4">
                      <MarkCell row={r} onMarked={was => onChange(r.id, { attended: was })} />
                      {r.attended !== null && (
                        <span className="t-xs c-muted2">
                          {r.attended ? 'Marked present' : 'Marked absent'}
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
