import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Eraser, Highlighter, MousePointer2, Pen, Trash2, Type, Undo2,
} from 'lucide-react'

/* ------------------------------------------------------------------ *
   The drawing surface that sits on top of session material.

   Strokes are stored in NORMALISED coordinates (0–1 of the surface box) so
   they stay on the same word when the reader zooms the document or the
   panel is resized. Nothing leaves the browser — this is a reading aid, not
   a submission.
 * ------------------------------------------------------------------ */

export type Tool = 'select' | 'pen' | 'marker' | 'text' | 'eraser'

interface Pt { x: number; y: number }
type Mark =
  | { kind: 'stroke'; tool: 'pen' | 'marker'; color: string; pts: Pt[] }
  | { kind: 'text'; color: string; at: Pt; text: string }

const COLORS = ['#E0B419', '#E0741A', '#12A08E', '#2A7FCB', '#DA2B54', '#16130F']

const LINE = {
  pen: { width: 2.4, alpha: 1, cap: 'round' as CanvasLineCap },
  marker: { width: 15, alpha: 0.32, cap: 'butt' as CanvasLineCap },
}

export function AnnotationCanvas({ children, resetKey }: {
  children: React.ReactNode
  /** Change this (e.g. to the open file id) to clear the surface. */
  resetKey: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState(COLORS[0])
  const [marks, setMarks] = useState<Mark[]>([])
  const [typing, setTyping] = useState<{ at: Pt; value: string } | null>(null)
  const drawing = useRef<Mark | null>(null)

  useEffect(() => { setMarks([]); setTyping(null) }, [resetKey])

  /* ---- painting ---- */
  const paint = useCallback((live?: Mark | null) => {
    const cv = canvasRef.current
    const host = hostRef.current
    if (!cv || !host) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const { width: w, height: h } = host.getBoundingClientRect()
    ctx.clearRect(0, 0, w, h)

    const all = live ? [...marks, live] : marks
    for (const m of all) {
      if (m.kind === 'text') {
        ctx.globalAlpha = 1
        ctx.fillStyle = m.color
        ctx.font = '600 14px var(--font, system-ui)'
        ctx.textBaseline = 'top'
        ctx.fillText(m.text, m.at.x * w, m.at.y * h)
        continue
      }
      if (m.pts.length < 2) continue
      const cfg = LINE[m.tool]
      ctx.globalAlpha = cfg.alpha
      ctx.strokeStyle = m.color
      ctx.lineWidth = cfg.width
      ctx.lineCap = cfg.cap
      ctx.lineJoin = 'round'
      ctx.beginPath()
      m.pts.forEach((p, i) => {
        const x = p.x * w
        const y = p.y * h
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }, [marks])

  /* Keep the backing store in device pixels so strokes are not blurry, and
     repaint whenever the panel changes size. */
  useLayoutEffect(() => {
    const host = hostRef.current
    const cv = canvasRef.current
    if (!host || !cv) return
    const fit = () => {
      const { width, height } = host.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      cv.width = Math.max(1, Math.round(width * dpr))
      cv.height = Math.max(1, Math.round(height * dpr))
      cv.style.width = `${width}px`
      cv.style.height = `${height}px`
      cv.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
      paint()
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(host)
    return () => ro.disconnect()
  }, [paint])

  useEffect(() => { paint() }, [paint])

  /* ---- pointer ---- */
  const norm = (e: React.PointerEvent): Pt => {
    const r = hostRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  const hitErase = (p: Pt) => {
    const r = hostRef.current!.getBoundingClientRect()
    const near = (a: Pt, b: Pt) =>
      Math.hypot((a.x - b.x) * r.width, (a.y - b.y) * r.height) < 14
    setMarks(ms => ms.filter(m =>
      m.kind === 'text' ? !near(m.at, p) : !m.pts.some(q => near(q, p))))
  }

  const onDown = (e: React.PointerEvent) => {
    if (tool === 'select') return
    const p = norm(e)
    e.currentTarget.setPointerCapture(e.pointerId)

    if (tool === 'text') { setTyping({ at: p, value: '' }); return }
    if (tool === 'eraser') { hitErase(p); return }

    drawing.current = { kind: 'stroke', tool, color, pts: [p] }
    paint(drawing.current)
  }

  const onMove = (e: React.PointerEvent) => {
    if (tool === 'eraser' && e.buttons === 1) { hitErase(norm(e)); return }
    const d = drawing.current
    if (!d || d.kind !== 'stroke') return
    d.pts.push(norm(e))
    paint(d)
  }

  const onUp = () => {
    const d = drawing.current
    drawing.current = null
    if (d && d.kind === 'stroke' && d.pts.length > 1) setMarks(ms => [...ms, d])
    else paint()
  }

  const commitText = () => {
    if (typing && typing.value.trim()) {
      setMarks(ms => [...ms, { kind: 'text', color, at: typing.at, text: typing.value.trim() }])
    }
    setTyping(null)
  }

  const TOOLS: Array<[Tool, React.ReactNode, string]> = [
    ['select', <MousePointer2 key="s" />, 'Select — scroll and read'],
    ['pen', <Pen key="p" />, 'Pen'],
    ['marker', <Highlighter key="m" />, 'Highlighter'],
    ['text', <Type key="t" />, 'Add a note'],
    ['eraser', <Eraser key="e" />, 'Erase'],
  ]

  return (
    <div className="annot" ref={hostRef}>
      <div className="annot-doc">{children}</div>

      <canvas
        ref={canvasRef}
        className="annot-canvas"
        data-armed={tool === 'select' ? undefined : 'true'}
        data-tool={tool}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />

      {typing && (
        <input
          className="annot-input"
          autoFocus
          value={typing.value}
          placeholder="Note…"
          style={{
            insetInlineStart: `${typing.at.x * 100}%`,
            top: `${typing.at.y * 100}%`,
            color,
            borderColor: color,
          }}
          onChange={e => setTyping({ ...typing, value: e.target.value })}
          onBlur={commitText}
          onKeyDown={e => {
            if (e.key === 'Enter') commitText()
            if (e.key === 'Escape') setTyping(null)
          }}
        />
      )}

      <div className="annot-tools" role="toolbar" aria-label="Annotation tools">
        {TOOLS.map(([t, icon, label]) => (
          <button
            key={t}
            type="button"
            className="annot-tool"
            data-on={tool === t}
            title={label}
            aria-label={label}
            aria-pressed={tool === t}
            onClick={() => setTool(t)}
          >
            {icon}
          </button>
        ))}

        <span className="annot-sep" />

        {COLORS.map(c => (
          <button
            key={c}
            type="button"
            className="annot-swatch"
            data-on={color === c}
            style={{ background: c }}
            title={c}
            aria-label={`Colour ${c}`}
            onClick={() => { setColor(c); if (tool === 'select' || tool === 'eraser') setTool('pen') }}
          />
        ))}

        <span className="annot-sep" />

        <button
          type="button"
          className="annot-tool"
          title="Undo"
          aria-label="Undo"
          disabled={marks.length === 0}
          onClick={() => setMarks(ms => ms.slice(0, -1))}
        >
          <Undo2 />
        </button>
        <button
          type="button"
          className="annot-tool"
          title="Clear all annotations"
          aria-label="Clear all annotations"
          disabled={marks.length === 0}
          onClick={() => setMarks([])}
        >
          <Trash2 />
        </button>
      </div>
    </div>
  )
}
