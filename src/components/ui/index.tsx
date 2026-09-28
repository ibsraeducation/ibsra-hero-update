/* ==========================================================================
   UI primitives. Deliberately small and unopinionated — the CSS in index.css
   carries the design, these carry behaviour (focus trap, escape, portals).
   ========================================================================== */

import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect,
  useMemo, useRef, useState, type CSSProperties, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, Check, ChevronDown, Info, Search, X,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import { initials } from '@/lib/format'

/* ---------- Badge ---------- */
export function Badge({ tone = '', dot, children, className = '', title, style }: {
  tone?: string; dot?: boolean; children: ReactNode; className?: string; title?: string
  style?: CSSProperties
}) {
  return (
    <span className={`badge ${tone} ${dot ? 'dot' : ''} ${className}`} title={title} style={style}>
      {children}
    </span>
  )
}

/* ---------- Avatar ---------- */
export function Avatar({ name, size = '', tone = 'brand' }: { name: string; size?: string; tone?: string }) {
  const style = tone === 'brand' ? undefined : {
    background: `var(--${tone}-100)`,
    color: `var(--${tone}-600)`,
    borderColor: `color-mix(in srgb, var(--${tone}-500) 22%, transparent)`,
  }
  return <span className={`avatar ${size}`} style={style} title={name}>{initials(name)}</span>
}

/* ---------- Field ---------- */
/* A label and the control under it. No hint: a field that needs a
   paragraph to explain it is a field with the wrong label. */
export function Field({ label, children, hint, className = '' }: {
  label?: string; children: ReactNode
  /** The line under the input: what to type, or what the platform read
   *  out of what was typed. */
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={`field ${className}`}>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

/* ---------- Switch ---------- */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" className="switch" data-on={on} aria-pressed={on} aria-label={label}
      onClick={() => onChange(!on)} />
  )
}

/* ---------- SearchInput ---------- */
export function SearchInput({ value, onChange, placeholder = 'Search…', className = '', autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean
}) {
  return (
    <div className={`search ${className}`}>
      <Search />
      <input className="inp" value={value} placeholder={placeholder} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)} />
    </div>
  )
}

/* ---------- Segmented ---------- */
export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: Array<{ value: T; label: string; icon?: ReactNode }>; onChange: (v: T) => void
}) {
  return (
    <div className="roles" role="tablist">
      {options.map(o => (
        <button key={o.value} type="button" role="tab" className="role-pill"
          data-on={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Escape / outside-click ---------- */
function useDismiss(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, active])
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, description, children, footer, wide, className = '' }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode
  children?: ReactNode; footer?: ReactNode; wide?: boolean
  /** Extra class on the dialog, for one that sizes itself (see enrollFlow.css). */
  className?: string
}) {
  useDismiss(onClose, open)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('input,textarea,select,button')
      el?.focus()
    }, 30)
    return () => clearTimeout(t)
  }, [open])

  if (!open) return null
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal ref={ref}>
        <div className="modal-head">
          <div className="stack g2">
            <h2 className="t-lg w-sb">{title}</h2>
            {description && <p className="t-sm c-muted">{description}</p>}
          </div>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  )
}

/* ---------- Drawer ---------- */
export function Drawer({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode
}) {
  useDismiss(onClose, open)
  if (!open) return null
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal>
        <div className="modal-head" style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: 14 }}>
          <h2 className="t-lg w-sb">{title}</h2>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="grow" style={{ overflowY: 'auto', padding: 16 }}>{children}</div>
        {footer && <div className="modal-foot" style={{ marginTop: 0 }}>{footer}</div>}
      </aside>
    </>,
    document.body,
  )
}

/* ---------- Confirm ---------- */
export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel = 'Delete', danger = true }: {
  open: boolean; onClose: () => void; onConfirm: () => void
  title: string; body: ReactNode; confirmLabel?: string; danger?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className={danger ? 'btn danger' : 'btn primary'}
            onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
        </>
      }>
      <p className="t-sm c-ink2" style={{ lineHeight: 1.6 }}>{body}</p>
    </Modal>
  )
}

/* ---------- Menu (anchored dropdown) ---------- */
interface MenuCtx { close: () => void }
const MenuContext = createContext<MenuCtx>({ close: () => {} })

export function Menu({ trigger, children, align = 'end' }: {
  trigger: (props: { onClick: (e: React.MouseEvent) => void; 'aria-expanded': boolean }) => ReactNode
  children: ReactNode
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const anchorRect = useRef<DOMRect | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(close, open)

  useLayoutEffect(() => {
    if (!open || !anchorRect.current) return
    const r = anchorRect.current
    const w = menuRef.current?.offsetWidth ?? 180
    const h = menuRef.current?.offsetHeight ?? 120
    let left = align === 'end' ? r.right - w : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    const top = r.bottom + h + 8 > window.innerHeight ? r.top - h - 4 : r.bottom + 4
    setPos({ top, left })
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close()
    }
    const onScroll = () => close()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, close])

  return (
    <>
      {trigger({
        'aria-expanded': open,
        onClick: e => {
          e.stopPropagation()
          anchorRect.current = (e.currentTarget as HTMLElement).getBoundingClientRect()
          setOpen(v => !v)
        },
      })}
      {open && createPortal(
        <MenuContext.Provider value={{ close }}>
          <div className="menu" ref={menuRef} style={{ top: pos.top, left: pos.left }} role="menu">
            {children}
          </div>
        </MenuContext.Provider>,
        document.body,
      )}
    </>
  )
}

export function MenuItem({ icon, children, onClick, danger, tail }: {
  icon?: ReactNode; children: ReactNode; onClick?: () => void; danger?: boolean; tail?: ReactNode
}) {
  const { close } = useContext(MenuContext)
  return (
    <button type="button" role="menuitem" className={`menu-item ${danger ? 'danger' : ''}`}
      onClick={e => { e.stopPropagation(); onClick?.(); close() }}>
      {icon}{children}{tail && <span className="tail">{tail}</span>}
    </button>
  )
}
export const MenuSep = () => <div className="menu-sep" />
export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="menu-label">{children}</div>

/* ---------- Tabs ----------
   The label is its own element so a tab bar that caps its width can truncate
   it (see `.tab-label`); `title` keeps the whole name readable on hover. */
export function Tabs<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void
  items: Array<{ value: T; label: string; icon?: ReactNode; count?: number }>
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map(it => (
        <button key={it.value} role="tab" className="tab" data-on={value === it.value}
          title={it.label} onClick={() => onChange(it.value)}>
          {it.icon}<span className="tab-label">{it.label}</span>
          {it.count !== undefined && <span className="cnt tnum">{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ---------- Empty ---------- */
/* Nothing here yet, and the one button that changes that. The sentence
   these used to carry explained an empty list to someone already looking
   at one. */
export function Empty({ icon, title, action }: {
  icon: ReactNode; title: string; action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="ico">{icon}</div>
      <span className="t-md w-sb" style={{ color: 'var(--ink)' }}>{title}</span>
      {action && <div className="mt4">{action}</div>}
    </div>
  )
}

/* ---------- Sparkline / Bars ---------- */
export function Sparkline({ data, w = 108, h = 30, tone = 'var(--brand)', fill = true }: {
  data: number[]; w?: number; h?: number; tone?: string; fill?: boolean
}) {
  const gid = useId().replace(/:/g, '')
  const d = useMemo(() => {
    if (data.length < 2) return { line: '', area: '' }
    const max = Math.max(...data), min = Math.min(...data)
    const span = max - min || 1
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * (w - 2) + 1
      const y = h - 3 - ((v - min) / span) * (h - 6)
      return [x, y] as const
    })
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`
    return { line, area }
  }, [data, w, h])

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity=".26" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={d.area} fill={`url(#${gid})`} />}
      <path d={d.line} fill="none" stroke={tone} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Bars({ data, labels, tone = 'var(--brand)', h = 96 }: {
  data: number[]; labels?: string[]; tone?: string; h?: number
}) {
  const max = Math.max(...data, 1)
  return (
    <div className="row g6" style={{ height: h, alignItems: 'flex-end' }}>
      {data.map((v, i) => (
        <div key={i} className="grow stack g6" style={{ height: '100%', justifyContent: 'flex-end' }}
          title={labels ? `${labels[i]}: ${v}` : String(v)}>
          <div style={{
            height: `${Math.max(3, (v / max) * (h - 18))}px`,
            background: tone, borderRadius: '4px 4px 2px 2px', opacity: 0.25 + 0.75 * (v / max),
            transition: 'height var(--med)',
          }} />
          {labels && <span className="t-xs c-muted2" style={{ textAlign: 'center' }}>{labels[i]}</span>}
        </div>
      ))}
    </div>
  )
}

/* ---------- Stat tile ---------- */
export function Stat({ label, value, sub, delta, spark, tone = 'var(--brand)', icon }: {
  label: string; value: ReactNode; sub?: ReactNode
  delta?: { value: string; up: boolean }
  spark?: number[]; tone?: string; icon?: ReactNode
}) {
  return (
    <div className="card stat">
      <div className="top">
        <span className="eyebrow">{label}</span>
        {icon ?? (delta && (
          <span className={`delta ${delta.up ? 'up' : 'down'}`}>
            <ChevronDown style={{ transform: delta.up ? 'rotate(180deg)' : undefined }} />
            {delta.value}
          </span>
        ))}
      </div>
      <div className="row g12 between">
        <span className="val">{value}</span>
        {spark && <Sparkline data={spark} tone={tone} />}
      </div>
      {sub && <span className="sub">{sub}</span>}
    </div>
  )
}

/* ---------- Toasts ---------- */
export function Toasts() {
  const toasts = useStore(s => s.toasts)
  const drop = useStore(s => s.dropToast)
  if (!toasts.length) return null
  return createPortal(
    <div className="toasts">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => drop(t.id)} role="status">
          {t.kind === 'ok' ? <Check /> : t.kind === 'err' ? <AlertTriangle /> : <Info />}
          <span className="grow">{t.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  )
}

/* ---------- Inline editable text ---------- */
export function InlineEdit({ value, onCommit, className = 'inp ghost', placeholder, multiline }: {
  value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; multiline?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const dirty = useRef(false)
  useEffect(() => { if (!dirty.current) setDraft(value) }, [value])

  const commit = () => { dirty.current = false; if (draft !== value) onCommit(draft) }
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <Tag
      className={className}
      value={draft}
      placeholder={placeholder}
      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        dirty.current = true; setDraft(e.target.value)
      }}
      onBlur={commit}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !multiline) (e.target as HTMLElement).blur()
        if (e.key === 'Escape') { dirty.current = false; setDraft(value); (e.target as HTMLElement).blur() }
      }}
    />
  )
}

/* ---------- Splitter ----------
   A drag handle between two panes. It sizes ONE pane, the one before it or
   the one after it, and each drag starts from the width actually on screen,
   so a remembered width the layout had to clamp never makes it feel stuck.
   Arrow keys nudge it (Shift for bigger steps), double-click puts it back. */

const PANE_KEY = 'ibsra.pane.'

/** A pane width the reader chose, remembered per browser. Undefined means
 *  "use the layout's default", which is also what a reset goes back to. */
export function usePaneSize(key: string): [number | undefined, (px: number | undefined) => void] {
  const [px, setPx] = useState<number | undefined>(() => {
    try {
      const v = Number(localStorage.getItem(PANE_KEY + key))
      return Number.isFinite(v) && v > 0 ? v : undefined
    } catch { return undefined }
  })
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        if (px === undefined) localStorage.removeItem(PANE_KEY + key)
        else localStorage.setItem(PANE_KEY + key, String(Math.round(px)))
      } catch { /* private window: the width just is not remembered */ }
    }, 200)
    return () => clearTimeout(id)
  }, [key, px])
  return [px, setPx]
}

export function Splitter({ side, min, max, onChange, onReset, label }: {
  /** Which neighbour this handle sizes. */
  side: 'before' | 'after'
  min: number
  max: number
  onChange: (px: number) => void
  onReset: () => void
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; w: number } | null>(null)
  const [now, setNow] = useState<number>()

  const pane = () => {
    const el = ref.current
    return (side === 'before' ? el?.previousElementSibling : el?.nextElementSibling) as HTMLElement | null
  }
  const width = () => pane()?.getBoundingClientRect().width ?? min
  /* Dragging toward the pane shrinks it; RTL mirrors the direction. */
  const sign = () => (side === 'before' ? 1 : -1) * (document.documentElement.dir === 'rtl' ? -1 : 1)
  const set = (v: number) => {
    const c = Math.round(Math.min(max, Math.max(min, v)))
    setNow(c)
    onChange(c)
  }
  const end = () => {
    drag.current = null
    delete document.documentElement.dataset.resizing
  }

  return (
    <div
      ref={ref}
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={now}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onFocus={() => setNow(Math.round(width()))}
      onPointerDown={e => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, w: width() }
        document.documentElement.dataset.resizing = 'true'
      }}
      onPointerMove={e => {
        if (drag.current) set(drag.current.w + (e.clientX - drag.current.x) * sign())
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => { setNow(undefined); onReset() }}
      onKeyDown={e => {
        const by = e.shiftKey ? 64 : 16
        const dir = (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0) * sign()
        if (dir) { e.preventDefault(); set(width() + dir * by) }
        else if (e.key === 'Home') { e.preventDefault(); set(min) }
        else if (e.key === 'End') { e.preventDefault(); set(max) }
      }}
    />
  )
}
