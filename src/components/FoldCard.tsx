import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

const KEY = (id: string) => `ibsra.fold.${id}`

function remembered(id: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(KEY(id))
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

export function FoldCard({
  id, icon, title, aside, actions, defaultOpen = true, flush = false, sub = false, className = '', children,
}: {
  id: string
  icon?: ReactNode
  title: ReactNode
  aside?: ReactNode
  actions?: ReactNode
  defaultOpen?: boolean
  flush?: boolean
  sub?: boolean
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(() => remembered(id, defaultOpen))

  const toggle = () => {
    setOpen(o => {
      try { localStorage.setItem(KEY(id), o ? '0' : '1') } catch { /* not remembered, still works */ }
      return !o
    })
  }

  const Tag = sub ? 'div' : 'section'
  return (
    <Tag className={`fold ${sub ? 'fold-sub' : 'card mb14'} ${className}`} data-open={open || undefined}>
      <div className="fold-head">
        <button type="button" className="fold-head-main" aria-expanded={open} onClick={toggle}>
          <span className="pd-col-head">{icon}{title}</span>
          <span className="grow" />
          {aside && <span className="t-xs c-muted2">{aside}</span>}
        </button>
        {actions && (
          <div className="fold-actions" onClick={e => e.stopPropagation()}>
            {actions}
          </div>
        )}
        <button type="button" className="fold-chev-btn" aria-label="Toggle" aria-expanded={open} onClick={toggle}>
          <ChevronDown className="fold-chev" aria-hidden />
        </button>
      </div>
      {open && <div className={flush ? 'fold-body flush' : 'pd-col fold-body'}>{children}</div>}
    </Tag>
  )
}
