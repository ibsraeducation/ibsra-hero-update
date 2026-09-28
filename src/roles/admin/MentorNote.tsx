/* ==========================================================================
   The mentor's note on one student — what the family reads on their
   feedback page.

   One note per day: posting again replaces today's, so a parent opening the
   page never finds three versions of the same afternoon.
   ========================================================================== */

import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarCheck, Loader2, Send } from 'lucide-react'
import { fetchMentorFeedback, postMentorFeedback } from '@/lib/api/mentorFeedback'
import { toMessage } from '@/lib/api/errors'
import { useStore } from '@/lib/store'
import { dateFull } from '@/lib/format'
import { Badge, Field } from '@/components/ui'
import type { MentorFeedbackRow } from '@/lib/api/rows'

const today = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* ---------------- the section in the drawer ---------------- */

export function MentorNote({ studentId, trackId, authorId }: {
  studentId: string
  trackId?: string | null
  authorId?: string | null
}) {
  const toast = useStore(s => s.toast)
  const [notes, setNotes] = useState<MentorFeedbackRow[] | null>(null)
  const [body, setBody] = useState('')
  const [focus, setFocus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setNotes(null)
    void (async () => {
      try {
        const rows = await fetchMentorFeedback(studentId, 8)
        if (!live) return
        setNotes(rows)
        const mine = rows.find(r => r.day === today())
        setBody(mine?.body ?? '')
        setFocus(mine?.focus ?? '')
      } catch (e) {
        if (live) { setNotes([]); setError(toMessage(e)) }
      }
    })()
    return () => { live = false }
  }, [studentId])

  const posted = (notes ?? []).find(n => n.day === today())

  const post = async () => {
    if (!body.trim()) {
      setError('Write a line — the family needs something to read.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const row = await postMentorFeedback({ studentId, trackId, body, focus, authorId })
      setNotes(all => [row, ...(all ?? []).filter(n => n.day !== row.day)])
      toast("Posted — the family sees it on their feedback page with today's date")
    } catch (e) {
      setError(toMessage(e))
    }
    setBusy(false)
  }

  return (
    <section className="stack g10 mb20">
      <div className="row g8" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow row g6"><CalendarCheck style={{ width: 12, height: 12 }} />Note for the family</span>
        <Badge tone={posted ? 'teal' : 'gold'} dot>{posted ? 'Posted today' : 'Nothing today'}</Badge>
      </div>

      {error && <div className="auth-alert" role="alert"><AlertTriangle /><span>{error}</span></div>}

      <Field label="What happened">
        <textarea className="ta" rows={3} value={body} onChange={e => setBody(e.target.value)}
          placeholder="e.g. Finished the wiring for the line follower and tested it twice…" />
      </Field>

      <Field label="Focus next">
        <input className="inp" value={focus} onChange={e => setFocus(e.target.value)}
          placeholder="Hand in the open piece before Thursday's class" />
      </Field>

      <div className="row g10 wrap">
        <button className="btn primary" disabled={busy} onClick={() => void post()}>
          {busy ? <Loader2 className="spin" /> : <Send />}
          {posted ? "Replace today's note" : 'Post to the family'}
        </button>
      </div>

      {notes === null ? (
        <div className="skel" style={{ height: 40 }} />
      ) : notes.length > 0 && (
        <div className="stack g6">
          <span className="eyebrow">Earlier notes</span>
          {notes.filter(n => n.day !== today()).slice(0, 4).map(n => (
            <div key={n.id} className="row g8 t-xs c-muted2" style={{ alignItems: 'flex-start' }}>
              <b className="c-ink2" style={{ flex: 'none' }}>{dateFull(n.day)}</b>
              <span className="truncate" title={n.body}>{n.body}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
