/* ==========================================================================
   Parent · Ask the mentor

   Where the assistant hands a parent off when a question needs the mentor.
   The question arrives pre-written, with the assistant conversation attached
   so the mentor does not have to ask what was already said. The mentor side
   of the thread is written from Admin → Mentor feedback.

   Dev build: the thread lives in this browser (see lib/mentorNotes.ts).
   ========================================================================== */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BackLink } from '@/lib/backNav'
import { ArrowLeft, Bot, MessageSquare, Paperclip, Send, UserRound, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Empty } from '@/components/ui'
import { dateTime } from '@/lib/format'
import { useMentor, type ThreadMsg } from '@/lib/mentorNotes'
import { useParent } from './data'
import './insight.css'
import './mentor-chat.css'

type Ctx = NonNullable<ThreadMsg['context']>
interface HandOff { question?: string; transcript?: Ctx }

export function ParentMentorChat() {
  const { child, mentor } = useParent()
  const loc = useLocation()
  const nav = useNavigate()
  const all = useMentor(s => s.msgs)
  const send = useMentor(s => s.send)
  const msgs = useMemo(() => all.filter(m => m.studentId === child.id), [all, child.id])

  const handed = (loc.state ?? {}) as HandOff
  const [draft, setDraft] = useState(handed.question ?? '')
  const [ctx, setCtx] = useState<Ctx | undefined>(handed.transcript?.length ? handed.transcript : undefined)
  const logRef = useRef<HTMLDivElement>(null)
  const mentorName = mentor?.name ?? 'the mentor'
  const first = mentorName.split(' ')[0]

  /* The hand-off is read once, then cleared, so a refresh does not re-attach it. */
  useEffect(() => {
    if (loc.state) nav(loc.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [msgs.length])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    send({ studentId: child.id, from: 'parent', text, context: ctx })
    setDraft(''); setCtx(undefined)
  }

  return (
    <div className="page mc-page">
      <PageHeader
        eyebrow={<BackLink className="crumb-link row g4" to="/parent/performance"><ArrowLeft style={{ width: 12, height: 12 }} />Performance analysis</BackLink>}
        title={`Ask ${first}`}
      />

      <section className="card mc-card">
        <header className="ins-head">
          <span className="ins-ico" data-tone="teal"><UserRound /></span>
          <div className="stack g2 grow" style={{ minWidth: 0 }}>
            <span className="t-md w-sb">{mentorName}</span>
            <span className="t-xs c-muted2">Mentor · {child.name}</span>
          </div>
          <Badge tone="line">replies within 72h</Badge>
        </header>

        <div className="mc-log" ref={logRef}>
          {msgs.length === 0 ? (
            <Empty icon={<MessageSquare />} title="No messages yet" />
          ) : msgs.map(m => (
            <div key={m.id} className="chat-msg" data-role={m.from === 'parent' ? 'user' : 'assistant'}>
              {m.from === 'mentor' && <span className="chat-avatar" data-tone="teal"><UserRound /></span>}
              <div className="chat-bubble">
                <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
                {m.context && (
                  <details className="mc-ctx">
                    <summary><Bot />Conversation with the assistant · {m.context.length} messages</summary>
                    <ul>
                      {m.context.map((c, i) => (
                        <li key={i} data-role={c.role}><b>{c.role === 'user' ? 'You' : 'Assistant'}:</b> {c.text}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <span className="chat-src">{m.from === 'parent' ? 'You' : first} · {dateTime(m.at)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mc-compose">
          {ctx && (
            <span className="mc-attach">
              <Paperclip />Assistant conversation attached · {ctx.length} messages
              <button className="btn ghost icon sm" aria-label="Remove attachment" onClick={() => setCtx(undefined)}><X /></button>
            </span>
          )}
          <form className="chat-compose" onSubmit={e => { e.preventDefault(); submit() }}>
            <textarea
              className="ta" rows={2} autoFocus={!!handed.question}
              value={draft} placeholder={`Write to ${first}…`}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            />
            <button className="btn primary" type="submit" disabled={!draft.trim()}><Send />Send</button>
          </form>
          <span className="t-xs c-muted2">Dev build: messages stay in this browser. The mentor's replies are written from Admin → Mentor feedback.</span>
        </div>
      </section>
    </div>
  )
}
