/* ==========================================================================
   Parent · performance — the assistant and the mentor's notes.

     Ask AI           the first tab: a full-page chat for a parent who wants a
                      quick answer, with ready questions.
     Mentor feedback  the mentor's own daily note — one per page of the report
                      (overview, scores, learning, assets, return). The card
                      shows the latest; clicking it opens a pop-up with a date
                      slicer to read earlier days.

   Everything the assistant says is plain English, in short bullet points,
   with no report jargon. Offline answers are written in the browser from the
   numbers, so they always match the page. The model only answers follow-up
   questions, under the same rules. Anything that needs the mentor's
   judgement is handed to the mentor chat, with the question and the
   conversation.
   ========================================================================== */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import {
  ArrowRight, Bot, BookOpen, Briefcase, CalendarCheck, ChevronLeft, ChevronRight, ClipboardCheck,
  Coins, History, Loader2, MessageSquare, Send, Sparkles, UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge, Modal } from '@/components/ui'
import { dateTime, money, relative } from '@/lib/format'
import { aiLive, askAssistant, type Reply, type Turn } from '@/lib/ai'
import {
  FEEDBACK_PAGES, dayLabel, isToday, notesFor, today, useMentor,
  type FeedbackPage, type MentorNote,
} from '@/lib/mentorNotes'
import { useParent } from './data'
import { PAYBACK_TARGET } from './performanceModel'
import './insight.css'

/** The slice fields these cards read — a structural subset of the page's slice. */
export interface InsightFacts {
  first: string
  mentorName?: string
  title: string
  kind: string
  program: { track: { id: string; name: string }; stage: 'done' | 'live' | 'soon' }
  attPct: number | null
  att: { held: number; attended: number; live: number }
  mark: number | null
  marked: { length: number }
  due: { length: number }
  onTime: number | null
  learned: { length: number }
  topics: { length: number }
  ahead: { length: number }
  assets: { length: number }
  assetsHeld: { length: number }
  assetsMaking: { length: number }
  payback: number | null
  income: number
  fees: number
  cohort: { n: number; median: number; zeroPct: number; medianPayback: number; label: string }
}

const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`
const bullets = (xs: string[]) => xs.filter(Boolean).map(x => `- ${x}`).join('\n')

/* ---------------- the numbers, in plain words ---------------- */

interface Line { key: 'att' | 'mark' | 'learn' | 'asset' | 'ret'; icon: LucideIcon; text: string }
interface Read { lead: string; lines: Line[]; next: string; open: number; money: string[] }

function readSlice(f: InsightFacts): Read {
  const open = Math.max(0, f.due.length - f.marked.length)
  const lessonPct = f.topics.length ? (f.learned.length / f.topics.length) * 100 : null

  const best = [
    { label: 'coming to live classes', v: f.attPct },
    { label: 'homework marks', v: f.mark },
    { label: 'lessons learned', v: lessonPct },
  ].filter((x): x is { label: string; v: number } => x.v !== null)
    .sort((a, b) => b.v - a.v)[0]

  const lead = best
    ? `Best result so far: ${best.label}, at ${Math.round(best.v)}%.`
    : `It is early days — nothing has been marked yet.`

  const pct = f.payback === null ? 0 : Math.round(f.payback * 100)
  const lines: Line[] = [
    {
      key: 'att', icon: CalendarCheck,
      text: f.att.held
        ? `Came to ${f.att.attended} of ${n(f.att.held, 'live class', 'live classes')}.`
        : f.att.live ? 'No live class has happened yet.' : 'The lessons here are recorded videos, so there are no live classes.',
    },
    {
      key: 'mark', icon: ClipboardCheck,
      text: f.mark !== null
        ? `Handed in ${f.marked.length} of ${n(f.due.length, 'homework task')}. Average mark: ${Math.round(f.mark)}%${f.onTime !== null ? ` (${Math.round(f.onTime)}% on time)` : ''}.`
        : f.due.length ? `${n(f.due.length, 'homework task')} due, not marked yet.` : 'No homework is due yet.',
    },
    {
      key: 'learn', icon: BookOpen,
      text: `Learned ${f.learned.length} of ${n(f.topics.length, 'lesson')}.${f.ahead.length ? ` ${n(f.ahead.length, 'lesson')} still to come.` : ' All lessons done.'}`,
    },
    {
      key: 'asset', icon: Briefcase,
      text: `Owns ${n(f.assetsHeld.length, 'finished piece')} of real work${f.assetsMaking.length ? `, with ${f.assetsMaking.length} more being made` : ''}.`,
    },
    {
      key: 'ret', icon: Coins,
      text: f.payback !== null
        ? `Money from real clients has paid back ${pct}% of the fees so far. The goal is ${Math.round(PAYBACK_TARGET * 100)}%.`
        : 'No fees paid for this part yet, so there is nothing to pay back.',
    },
  ]

  const money_ = f.payback === null ? [] : [
    `Money from real clients so far: ${money(f.income)}.`,
    `Fees paid for this part: ${money(f.fees)}.`,
    `So client money has paid back ${pct}% of the fees. The goal is ${Math.round(PAYBACK_TARGET * 100)}%.`,
    `For context: out of ${f.cohort.n} students, the middle one earned ${money(f.cohort.median)}, and ${f.cohort.zeroPct}% have not earned anything yet.`,
    'This money is never promised — it depends on real clients.',
  ]

  const next = open > 0 && f.program.stage === 'done'
    ? `${n(open, 'homework task')} ${open === 1 ? 'was' : 'were'} not handed in before the program ended.`
    : open > 0
      ? `Next step: hand in the ${n(open, 'missing task')}.`
      : f.ahead.length > 0
        ? `Next up: ${n(f.ahead.length, 'more lesson')}.`
        : 'Everything here is done.'

  return { lead, lines, next, open, money: money_ }
}

/** The numbers sent to the model — no name, no id, no email. */
function factsJson(f: InsightFacts, open: number): string {
  return JSON.stringify({
    part: f.title,
    programStage: f.program.stage,
    liveClasses: f.att.held
      ? { attended: f.att.attended, held: f.att.held, percent: Math.round(f.attPct ?? 0) }
      : f.att.live ? 'no live class yet' : 'recorded lessons only',
    homework: {
      due: f.due.length, handedInAndMarked: f.marked.length, notHandedIn: open,
      averageMarkPercent: f.mark === null ? null : Math.round(f.mark),
      onTimePercent: f.onTime === null ? null : Math.round(f.onTime),
    },
    lessons: { learned: f.learned.length, total: f.topics.length, stillToCome: f.ahead.length },
    finishedPiecesOfWork: { owned: f.assetsHeld.length, beingMade: f.assetsMaking.length },
    moneyFromClients: f.payback === null
      ? 'no fees paid for this part'
      : {
          earnedEGP: f.income, feesEGP: f.fees,
          paidBackPercentOfFees: Math.round(f.payback * 100),
          goalPercent: Math.round(PAYBACK_TARGET * 100),
          otherStudents: { howMany: f.cohort.n, middleStudentEarnedEGP: f.cohort.median, percentEarnedNothingYet: f.cohort.zeroPct },
          note: 'never promised; depends on real clients',
        },
  })
}

/** Answers from the same read when the model is off or cannot be reached. */
function localAnswer(q: string, f: InsightFacts, r: Read): Reply {
  const s = q.toLowerCase()
  const take = (...keys: Line['key'][]) => r.lines.filter(l => keys.includes(l.key)).map(l => l.text)
  let out: string[] = []
  if (/attend|live class|class|حضور/.test(s)) out = take('att')
  else if (/mark|homework|assign|task|hand in|واجب|درج/.test(s)) out = [...take('mark'), r.next]
  else if (/money|return|income|earn|pay|fee|عائد|دخل|فلوس|مكسب/.test(s)) out = r.money.length ? r.money : take('ret')
  else if (/piece|asset|portfolio|work he|work she|own/.test(s)) out = take('asset')
  else if (/lesson|topic|learn|next|coming|تعلم|القادم|الجاي/.test(s)) out = [...take('learn'), r.next]
  else if (/home|help|support|focus|البيت|اساعد|أساعد|نركز/.test(s)) {
    out = [
      `Ask ${f.first} to show you the last lesson for 5 minutes.`,
      r.open ? `Check together on the ${n(r.open, 'homework task')} still to hand in.` : 'Ask what the next lesson is about.',
      'Keep the live class time free from other plans.',
      'Praise the effort, not only the marks.',
    ]
  } else if (/overall|doing|summary|how is|progress|عامل|مستوى|ماشي/.test(s)) {
    out = [r.lead, ...r.lines.map(l => l.text), r.next]
  } else {
    return { text: '', toMentor: true, source: 'local' }
  }
  return { text: bullets(out), toMentor: false, source: 'local' }
}

/* ---------------- answer text → bullets ---------------- */

function Rich({ text }: { text: string }) {
  const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/, '')
  const isB = (s: string) => /^([-•*]|\d+[.)])\s+/.test(s)
  const out: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) out.push(<ul key={out.length} className="chat-ul">{list.map((x, i) => <li key={i}>{x}</li>)}</ul>)
    list = []
  }
  text.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
    if (isB(l)) list.push(clean(l.replace(/^([-•*]|\d+[.)])\s+/, '')))
    else { flush(); out.push(<p key={out.length} className="chat-p">{clean(l)}</p>) }
  })
  flush()
  return <>{out}</>
}

/* ---------------- the chat (the Ask AI tab) ---------------- */

interface Msg { id: number; role: 'user' | 'assistant'; text: string; toMentor?: boolean; source?: Reply['source']; q?: string }

export function ChatPanel({ f }: { f: InsightFacts }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  /* Only the parent surface has a mentor chat page to hand off to. */
  const mentorPath = pathname.startsWith('/student') ? '/student/missions' : '/parent/mentor'
  const read = useMemo(() => readSlice(f), [f])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const mentor = f.mentorName?.split(' ')[0] ?? 'the mentor'

  const ready = [
    `How is ${f.first} doing?`,
    'How can I help at home?',
    'What does the money part mean?',
    'What is coming next?',
    `Why did ${f.first} get this mark?`,
  ]

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  async function send(text: string) {
    const q = text.trim()
    if (!q || busy) return
    setDraft('')
    const history: Turn[] = msgs.filter(m => !m.toMentor).map(m => ({ role: m.role, content: m.text }))
    setMsgs(m => [...m, { id: Date.now(), role: 'user', text: q }])
    setBusy(true)
    const reply = await askAssistant(q, history, factsJson(f, read.open), qq => localAnswer(qq, f, read))
    setMsgs(m => [...m, {
      id: Date.now() + 1, role: 'assistant', q, source: reply.source, toMentor: reply.toMentor,
      text: reply.toMentor
        ? bullets([
            reply.text || `This is a question for ${mentor}.`,
            `${mentor} knows ${f.first}'s work first-hand and can give you the real answer.`,
          ])
        : reply.text,
    }])
    setBusy(false)
  }

  /* The hand-off carries the question and everything said so far. */
  const handOff = (q: string) => {
    nav(mentorPath, {
      state: { question: q, transcript: msgs.map(m => ({ role: m.role, text: m.text })) },
    })
  }

  return (
    <div className="chat" data-variant="page">
      <div className="chat-log" ref={logRef}>
        {msgs.length === 0 && (
          <div className="chat-hello">
            <span className="chat-avatar"><Bot /></span>
            <div className="stack g6">
              <span className="t-sm">Hi! Ask me anything about how {f.first} is doing. I will answer in simple words.</span>
              <ul className="chat-ul">
                <li>I can explain classes, homework, lessons and money from clients.</li>
                <li>For anything that needs {mentor}, I will send you to {mentor} with your question.</li>
              </ul>
            </div>
          </div>
        )}

        {msgs.map(m => (
          <div key={m.id} className="chat-msg" data-role={m.role}>
            {m.role === 'assistant' && <span className="chat-avatar"><Bot /></span>}
            <div className="chat-bubble">
              {m.role === 'assistant' ? <Rich text={m.text} /> : <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>}

              {m.toMentor && m.q && (
                <div className="chat-handoff">
                  <span className="t-xs c-muted">Your question and this chat go with you.</span>
                  <button className="btn primary sm" onClick={() => handOff(m.q!)}>
                    <MessageSquare />Ask {mentor}<ArrowRight />
                  </button>
                </div>
              )}

              {m.role === 'assistant' && m.source === 'local' && !m.toMentor && aiLive && (
                <span className="chat-src">the assistant could not be reached — answered from the report</span>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="chat-msg" data-role="assistant">
            <span className="chat-avatar"><Bot /></span>
            <div className="chat-bubble c-muted2 row g6"><Loader2 className="spin" style={{ width: 14, height: 14 }} />Thinking…</div>
          </div>
        )}
      </div>

      <div className="chat-ready" aria-label="Ready questions">
        {ready.map(r => (
          <button key={r} className="chip-q" disabled={busy} onClick={() => void send(r)}>{r}</button>
        ))}
      </div>

      <form className="chat-compose" onSubmit={e => { e.preventDefault(); void send(draft) }}>
        <textarea
          ref={inputRef}
          className="ta"
          rows={1}
          value={draft}
          placeholder={`Ask a question about ${f.first}…`}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft) }
          }}
        />
        <button className="btn primary" type="submit" disabled={!draft.trim() || busy}>
          <Send />Send
        </button>
      </form>
    </div>
  )
}

/* ---------------- tab 1 · Ask AI ---------------- */

export function PerformanceAsk() {
  const c = useOutletContext<InsightFacts>()
  return (
    <section className="card ask-page">
      <header className="ins-head">
        <span className="ins-ico" data-tone="brand"><Sparkles /></span>
        <div className="stack g2 grow" style={{ minWidth: 0 }}>
          <span className="t-md w-sb">Ask AI about {c.first}</span>
          <span className="t-xs c-muted2">
            {aiLive
              ? `Reading: ${c.title}. Only the numbers on this report are used — never a name.`
              : `Reading: ${c.title}. Answers are written from the numbers on this report.`}
          </span>
        </div>
        <Badge tone="line">quick answers</Badge>
      </header>
      <ChatPanel f={c} />
    </section>
  )
}

/* ---------------- mentor feedback — one note per page, per day ---------------- */

/** Demo placeholders, in plain words — no figures, no promises. Real notes
 *  come from Admin → Mentor feedback and replace them day by day. */
const SEED: Record<FeedbackPage, { text: (first: string) => string[]; focus: string[] }> = {
  overview: {
    text: f => [
      `${f} worked through this week's lessons with good focus.`,
      `${f} asked two good questions in class today.`,
      `A steady day. ${f} kept going even on the harder part.`,
      `${f} helped another student today, which shows real understanding.`,
      `Good energy in class. ${f} is getting quicker with the tools.`,
    ],
    focus: ['Hand in the open task before the next class.', 'Spend 20 minutes on the last lesson.', 'Keep the finished work in one tidy folder.', 'Ask one question in the next live class.'],
  },
  scores: {
    text: f => [
      `${f} came to class on time and handed the work in.`,
      `The last task was neat and followed the brief.`,
      `${f} handed in a task a little late, but the work itself was careful.`,
      `Good habits this week: on time, prepared, and focused.`,
    ],
    focus: ['Hand in each task before the deadline, even if it is not perfect.', 'Set a phone reminder the evening before class.', 'Read the brief twice before starting.'],
  },
  learning: {
    text: f => [
      `${f} understands the main ideas of the recent lessons.`,
      `${f} explained today's idea back to me in their own words — a good sign.`,
      `The new tool was tricky at first; by the end of class ${f} had it.`,
      `${f} is ready for the next lesson.`,
    ],
    focus: ['Spend 20 minutes on the last lesson before the next class.', 'Try the lesson exercise once more without the video.', 'Write down one question to bring to class.'],
  },
  character: {
    text: f => [
      `${f} flagged a risk to a deadline before it slipped — that's the habit that matters most.`,
      `${f} fixed a mistake without being asked to.`,
      `Good judgement this week: ${f} asked a decision question instead of waiting for instructions.`,
      `${f} kept going after a client said no — back at it the next day.`,
    ],
    focus: ['Send one update before a deadline, even a short one.', 'Ask a decision question in the next session.', 'Write down one thing done without being asked.'],
  },
  portfolio: {
    text: f => [
      `${f}'s published work is starting to get real attention online.`,
      `We reviewed how ${f}'s work reads to someone who has never met them.`,
      `${f} added a project to their profile this week.`,
      `The portfolio is in good shape — the next step is getting it in front of more people.`,
    ],
    focus: ['Share one published piece on LinkedIn this week.', 'Ask two people outside the course for feedback on the profile.', 'Add one sentence of context to the newest piece.'],
  },
  assets: {
    text: f => [
      `The finished pieces are good enough to show real clients.`,
      `${f} improved one finished piece after my comments.`,
      `The piece in progress is coming along well.`,
      `${f}'s work should all live in one tidy place.`,
    ],
    focus: ['Add a short description to each finished piece.', 'Finish the piece in progress this week.', 'Put all finished work in one folder.'],
  },
  return: {
    text: f => [
      `Finding the first paying clients takes time. We are working on how ${f} presents the work.`,
      `${f} sent the finished work to a possible client this week.`,
      `We practised how to talk about price with a client.`,
      `No new client this week — normal at this stage. The work is ready to show.`,
    ],
    focus: ['Share one piece of work with a possible client this week.', 'Practise a two-line message to a client.', 'Ask a family friend who runs a business to look at the work.'],
  },
}

/** The day-by-day reader: the latest note first, earlier days on the slicer. */
function FeedbackHistory({ list, firstName }: { list: MentorNote[]; firstName: string }) {
  const [day, setDay] = useState(list[0]?.day ?? today())
  const note = list.find(x => x.day === day)
  const oldest = list[list.length - 1]?.day
  /* Arrows step between days that have a note — older and newer than the one shown. */
  const older = list.find(x => x.day < day)
  const newer = [...list].reverse().find(x => x.day > day)
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    stripRef.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [day])

  return (
    <div className="fb">
      <div className="fb-slicer">
        <button type="button" className="btn ghost icon sm" aria-label="Earlier note" disabled={!older}
          onClick={() => older && setDay(older.day)}><ChevronLeft /></button>
        <div className="fb-days" ref={stripRef} role="tablist" aria-label="Pick a day">
          {[...list].reverse().map(x => (
            <button key={x.day} type="button" role="tab" aria-selected={x.day === day}
              className="chip-q fb-day" data-on={x.day === day || undefined} onClick={() => setDay(x.day)}>
              {dayLabel(x.day)}
            </button>
          ))}
        </div>
        <button type="button" className="btn ghost icon sm" aria-label="Later note" disabled={!newer}
          onClick={() => newer && setDay(newer.day)}><ChevronRight /></button>
        <label className="fb-pick" title="Jump to a day">
          <CalendarCheck />
          <input type="date" value={day} min={oldest} max={today()}
            onChange={e => e.target.value && setDay(e.target.value)} aria-label="Jump to a day" />
        </label>
      </div>

      <div className="fb-note">
        <span className="eyebrow">{dayLabel(day)}{day !== today() && !dayLabel(day).includes(' ') ? '' : ''}</span>
        {note ? (
          <>
            <blockquote className="ins-quote">{note.text}</blockquote>
            {note.focus && <p className="ins-next"><ArrowRight /><span><b>Focus next:</b> {note.focus}</span></p>}
            <span className="t-xs c-muted2">— {note.author} · posted {dateTime(note.updatedAt)}</span>
          </>
        ) : (
          <p className="t-sm c-muted">No note on this day. {firstName} writes one on each working day.</p>
        )}
      </div>
    </div>
  )
}

interface MentorCardProps {
  studentId: string
  trackId: string
  trackName: string
  first: string
  mentorName: string
  stage: 'done' | 'live' | 'soon'
  page: FeedbackPage
  /** Collapse the card down to a single pill button — the note itself only
   *  shows once the button is opened, in the same pop-up used everywhere
   *  else. Used where a page wants one line, not a whole card (e.g. the
   *  reporting summary). */
  compact?: boolean
}

/** The card itself, built from primitives so it can sit on any page — the
 *  performance pages read them off the slice (see PageFeedback below), the
 *  reporting summary reads them straight off the child's live program. */
export function MentorCard({ studentId, trackId, trackName, first, mentorName, stage, page, compact }: MentorCardProps) {
  const notes = useMentor(s => s.notes)
  const seedHistory = useMentor(s => s.seedHistory)
  const { pathname } = useLocation()
  /* Only the parent surface has a mentor chat page to message into. */
  const mentorPath = pathname.startsWith('/student') ? '/student/missions' : '/parent/mentor'
  const list = useMemo(() => notesFor(notes, studentId, trackId, page), [notes, studentId, trackId, page])
  const note = list[0]
  const firstName = mentorName.split(' ')[0]
  const label = FEEDBACK_PAGES.find(p => p.key === page)?.label ?? ''
  const [open, setOpen] = useState(false)

  /* Demo data: two weeks of placeholder notes for a running program, a few
     for a finished one. Never overwrites a day that has a note. */
  useEffect(() => {
    if (stage === 'soon') return
    const set = SEED[page]
    const texts = set.text(first)
    seedHistory({ studentId, trackId, page, author: mentorName },
      stage === 'done' ? 5 : 14,
      i => ({ text: texts[i % texts.length], focus: set.focus[(i + 1) % set.focus.length] }))
  }, [page, stage, first, studentId, trackId, mentorName, seedHistory])

  const fresh = note ? isToday(note.updatedAt) : false

  const modal = (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      wide
      title={<span className="row g8"><UserRound style={{ width: 17, height: 17, color: 'var(--teal-600)' }} />Mentor feedback{page !== 'overview' ? ` · ${label}` : ''}</span>}
      description={`${mentorName} · ${trackName}. Pick a day to read that day's note.`}
      footer={<Link className="btn" to={mentorPath} onClick={() => setOpen(false)}><MessageSquare />Message {firstName}</Link>}
    >
      {open && (list.length
        ? <FeedbackHistory list={list} firstName={firstName} />
        : <p className="t-sm c-muted">No notes yet.</p>)}
    </Modal>
  )

  if (compact) {
    return (
      <button type="button" className="mf-pill" onClick={() => setOpen(true)}
        aria-label={`Mentor feedback${page !== 'overview' ? ` on ${label}` : ''} — open earlier notes`}>
        <span className="ins-ico sm" data-tone="teal"><UserRound /></span>
        <span className="stack g2 grow" style={{ minWidth: 0 }}>
          <span className="t-sm w-med">Mentor feedback{page !== 'overview' ? ` · ${label}` : ''}</span>
          <span className="t-xs c-muted2 truncate">
            {note ? note.text : stage === 'soon' ? `Starts when ${trackName} begins.` : `${firstName} has not written about this yet.`}
          </span>
        </span>
        {note && (
          <Badge tone={fresh ? 'teal' : 'gold'} dot title={dateTime(note.updatedAt)}>
            {fresh ? 'Today' : relative(note.updatedAt)}
          </Badge>
        )}
        {modal}
      </button>
    )
  }

  return (
    <section className="card ins-card fb-card" role="button" tabIndex={0}
      aria-label={`Mentor feedback${page !== 'overview' ? ` on ${label}` : ''} — open earlier notes`}
      onClick={e => { if (!(e.target as HTMLElement).closest('a,button')) setOpen(true) }}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpen(true) } }}>
      <header className="ins-head">
        <span className="ins-ico" data-tone="teal"><UserRound /></span>
        <div className="stack g2 grow" style={{ minWidth: 0 }}>
          <span className="t-md w-sb">Mentor feedback{page !== 'overview' ? ` · ${label}` : ''}</span>
          <span className="t-xs c-muted2 truncate">{mentorName} · {trackName}</span>
        </div>
        {note && (
          <Badge tone={fresh ? 'teal' : 'gold'} dot title={dateTime(note.updatedAt)}>
            {fresh ? 'Updated today' : `Updated ${relative(note.updatedAt)}`}
          </Badge>
        )}
      </header>

      <div className="ins-body">
        {!note ? (
          <p className="t-sm c-muted">
            {stage === 'soon'
              ? `Feedback starts when ${trackName} begins.`
              : `${firstName} has not written about this yet.`}
          </p>
        ) : (
          <>
            <blockquote className="ins-quote">{note.text}</blockquote>
            {note.focus && (
              <p className="ins-next"><ArrowRight /><span><b>Focus next:</b> {note.focus}</span></p>
            )}
            <span className="t-xs c-muted2">— {note.author}</span>
          </>
        )}
      </div>

      <div className="ins-foot" data-row="true">
        <div className="ins-stamp">
          <CalendarCheck />
          <span>
            {note
              ? <>Last updated <b>{dateTime(note.updatedAt)}</b>. {firstName} writes a new note every day.</>
              : `${firstName} writes a new note every day once the program is running.`}
          </span>
        </div>
        <div className="row g6">
          {list.length > 0 && (
            <button type="button" className="btn sm" onClick={() => setOpen(true)}>
              <History />Earlier notes · {list.length}
            </button>
          )}
          <Link className="btn sm" to={mentorPath}><MessageSquare />Message {firstName}</Link>
        </div>
      </div>

      {modal}
    </section>
  )
}

/** Above each detail page's own charts: that page's mentor note. The Ask AI
 *  tab carries none — it is itself the assistant. */
export function PageFeedback({ c }: { c: InsightFacts }) {
  const { child, mentor } = useParent()
  const { pathname } = useLocation()
  const seg = pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  const page = FEEDBACK_PAGES.find(p => p.key === seg && p.key !== 'overview')?.key
  if (!page) return null
  return (
    <div className="pf-feedback">
      <MentorCard key={page} page={page} compact
        studentId={child.id} trackId={c.program.track.id} trackName={c.program.track.name}
        first={c.first} mentorName={mentor?.name ?? c.mentorName ?? 'The mentor'} stage={c.program.stage} />
    </div>
  )
}
