/* ==========================================================================
   Program map — the training path as the shape it actually is.

   Three columns: the program everybody starts on, the specializations that
   follow it, and the one they all lead to. Which column a card sits in comes
   from the connections the admin drew, and every line on the map is one of
   those connections — nothing here is inferred or decorative.

   The lines are real edges, so they are measured and drawn rather than faked
   with borders: each one leaves its card, turns in the gap between the
   columns, and arrives at the next card. Measuring is the price of letting
   the admin decide what connects to what.

   The nodes are the same cards as everywhere else — a map that invented its
   own card would be a second design to keep in step.
   ========================================================================== */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Plus, Share2, X } from 'lucide-react'
import { byStage, programEdges, type ProgramEdge } from '@/lib/programs'
import { PROGRAM_STAGES, PROGRAM_STAGE_META, type ProgramStage, type Track } from '@/lib/types'
import './programMap.css'

interface Box { x: number; y: number; w: number; h: number }

export interface ProgramMapProps<T extends Track> {
  tracks: T[]
  /** The node for one program — normally a compact card. */
  node: (track: T, stage: ProgramStage) => ReactNode
  /** Dim a program the viewer does not have: it stays on the path, greyed. */
  state?: (track: T) => 'on' | 'dim'
  /** Admin only. Given, the map can be wired up on screen. */
  onConnect?: (fromId: string, toId: string) => void
  /** Admin only. Adds a program straight into that column. */
  onAdd?: (stage: ProgramStage) => void
  /** Shown under the map — the one line that explains what it is. */
  footnote?: ReactNode
}

export function ProgramMap<T extends Track>({
  tracks, node, state, onConnect, onAdd, footnote,
}: ProgramMapProps<T>) {
  const groups = byStage(tracks)
  const edges = programEdges(tracks)

  /* A stage with nothing in it still shows its heading when the admin can
     add to it — an empty column is where the next program goes. Without
     that, it is a gap in the path and is better left out. */
  const shown = PROGRAM_STAGES.filter(s => groups[s].length > 0 || !!onAdd)

  const wrapRef = useRef<HTMLDivElement>(null)
  const [boxes, setBoxes] = useState<Record<string, Box>>({})
  const [size, setSize] = useState({ w: 0, h: 0 })
  /* Wiring mode: click a card, then the one it leads to. It stays selected
     so a foundation can be fanned out to every specialization in one go. */
  const [wiring, setWiring] = useState(false)
  const [from, setFrom] = useState('')

  /* Measuring writes state, and this runs after every render, so it has to
     be able to say "nothing moved" — otherwise it renders itself forever. */
  const lastRef = useRef('')

  /** Where every card is, relative to the map. Re-read on any layout change. */
  const measure = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const base = wrap.getBoundingClientRect()
    const next: Record<string, Box> = {}
    for (const el of wrap.querySelectorAll<HTMLElement>('[data-node]')) {
      const r = el.getBoundingClientRect()
      next[el.dataset.node!] = {
        x: Math.round(r.left - base.left), y: Math.round(r.top - base.top),
        w: Math.round(r.width), h: Math.round(r.height),
      }
    }
    const w = Math.round(base.width)
    const h = Math.round(base.height)
    const stamp = `${w}x${h}|${JSON.stringify(next)}`
    if (stamp === lastRef.current) return
    lastRef.current = stamp
    setBoxes(next)
    setSize({ w, h })
  }, [])

  useLayoutEffect(measure)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    for (const el of wrap.querySelectorAll('[data-node]')) ro.observe(el)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [measure, tracks.length])

  /* Leaving wiring mode should also drop the half-made connection. */
  useEffect(() => {
    if (!wiring) { setFrom(''); return }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (from) setFrom('')
      else setWiring(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wiring, from])

  const pick = (id: string) => {
    if (!onConnect) return
    if (!from) { setFrom(id); return }
    if (from === id) { setFrom(''); return }
    onConnect(from, id)
  }

  /** One line: out of the card, a turn in the gap, into the next card. */
  const pathFor = (e: ProgramEdge): string | null => {
    const a = boxes[e.from]
    const b = boxes[e.to]
    if (!a || !b) return null
    const sy = Math.round(a.y + a.h / 2)
    const ty = Math.round(b.y + b.h / 2)
    /* Forwards, which is what the columns make normal: right edge to left
       edge with one vertical turn halfway between them. */
    if (b.x > a.x + a.w) {
      const sx = Math.round(a.x + a.w)
      const tx = Math.round(b.x)
      const mx = Math.round((sx + tx) / 2)
      const r = Math.min(10, Math.abs(ty - sy) / 2, (tx - sx) / 2)
      if (r < 2) return `M ${sx} ${sy} H ${tx}`
      const dir = ty > sy ? 1 : -1
      return `M ${sx} ${sy} H ${mx - r}`
        + ` Q ${mx} ${sy} ${mx} ${sy + r * dir}`
        + ` V ${ty - r * dir}`
        + ` Q ${mx} ${ty} ${mx + r} ${ty}`
        + ` H ${tx}`
    }
    /* Anything else — a connection back up the path, or inside one column —
       loops round rather than cutting through the cards. */
    const sx = Math.round(a.x + a.w)
    const tx = Math.round(b.x + b.w)
    const out = Math.round(Math.max(sx, tx) + 26)
    return `M ${sx} ${sy} H ${out} V ${ty} H ${tx}`
  }

  if (shown.length === 0) return null

  return (
    <div className="pmap-wrap" data-wiring={wiring || undefined}>
      {onConnect && (
        <div className="pmap-bar">
          <button className="btn sm" data-on={wiring || undefined} onClick={() => setWiring(w => !w)}>
            {wiring ? <X /> : <Share2 />}{wiring ? 'Done connecting' : 'Connect programs'}
          </button>
          {wiring && (
            <span className="t-xs c-muted2">
              {from
                ? 'Now click the program it leads to. Click it again to remove that line.'
                : 'Click the program a student starts from. Click a line to remove it.'}
            </span>
          )}
        </div>
      )}

      <div className="pmap" ref={wrapRef} data-cols={shown.length}>
        <svg className="pmap-lines" width={size.w} height={size.h} aria-hidden focusable="false">
          <defs>
            <marker id="pmap-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5"
              orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0 0 L7 3.5 L0 7 z" fill="var(--line-hard)" />
            </marker>
          </defs>
          {edges.map(e => {
            const d = pathFor(e)
            if (!d) return null
            const dim = state && (state(tracks.find(t => t.id === e.from)!) === 'dim'
              || state(tracks.find(t => t.id === e.to)!) === 'dim')
            return (
              <g key={`${e.from}>${e.to}`} className="pmap-edge" data-dim={dim || undefined}>
                <path d={d} className="pmap-edge-line" markerEnd="url(#pmap-arrow)" />
                {/* A 2px line is not something anyone can click, so the real
                    target is a fat invisible copy of it. */}
                {wiring && onConnect && (
                  <path d={d} className="pmap-edge-hit"
                    onClick={() => onConnect(e.from, e.to)}>
                    <title>Remove this connection</title>
                  </path>
                )}
              </g>
            )
          })}
        </svg>

        {shown.map(stage => {
          const meta = PROGRAM_STAGE_META[stage]
          const cards = groups[stage]
          return (
            <div key={stage} className="pmap-col" data-stage={stage}>
              <div className="pmap-head">
                <span className="pmap-head-label">{meta.label}</span>
                <span className="pmap-head-n tnum">{cards.length}</span>
              </div>

              <div className="pmap-stack">
                {cards.map(t => (
                  <div
                    key={t.id}
                    className="pmap-node"
                    data-node={t.id}
                    data-state={state?.(t) ?? 'on'}
                    data-from={from === t.id || undefined}
                  >
                    {node(t, stage)}
                    {/* In wiring mode the card stops being a link and becomes
                        an end of a line — one target, no misclicks. */}
                    {wiring && onConnect && (
                      <button className="pmap-pick" onClick={() => pick(t.id)}
                        aria-label={from === t.id ? `${t.name}, selected` : `Connect ${t.name}`}>
                        <span className="pmap-pick-tag">
                          {from === t.id ? 'Starts here' : from ? 'Leads to this' : 'Start from this'}
                        </span>
                      </button>
                    )}
                  </div>
                ))}

                {cards.length === 0 && (
                  <p className="pmap-empty">Nothing in this column yet.</p>
                )}

                {onAdd && (
                  <button className="pmap-add" onClick={() => onAdd(stage)}>
                    <Plus />Add a program here
                  </button>
                )}
              </div>

              <p className="pmap-blurb">{meta.blurb}</p>
            </div>
          )
        })}
      </div>

      {footnote && <p className="pmap-foot">{footnote}</p>}
    </div>
  )
}
