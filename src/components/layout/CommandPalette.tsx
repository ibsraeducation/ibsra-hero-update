import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Moon, Plus, Sun, Video } from 'lucide-react'
import { materialPath, useStore } from '@/lib/store'
import { fuzzy } from '@/lib/format'
import { railFor, ROLE_META } from './nav'
import type { ViewRole } from '@/lib/types'
import { backendLive } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

interface Cmd {
  id: string
  label: string
  group: string
  icon: React.ReactNode
  tail?: string
  run: () => void
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)

  const db = useStore(s => s.db)
  const role = useStore(s => s.role)
  const setRole = useStore(s => s.setRole)
  const toggleTheme = useStore(s => s.toggleTheme)
  const theme = useStore(s => s.theme)
  const createSession = useStore(s => s.createSession)
  /* A signed-in family only ever jumps to its own three pages. */
  const accountRole = useAuth(s => s.profile?.role)

  useEffect(() => { if (open) { setQ(''); setSel(0) } }, [open])

  const cmds = useMemo<Cmd[]>(() => {
    const out: Cmd[] = []

    for (const group of railFor(role, backendLive ? accountRole : null)) {
      for (const it of group.items) {
        out.push({
          id: `nav:${it.to}`, label: it.label, group: group.label ?? 'Go to',
          icon: <it.icon />, run: () => nav(it.to),
        })
      }
    }

    /* Signed in, the role belongs to the account — no switching. */
    for (const r of backendLive ? [] : Object.keys(ROLE_META) as ViewRole[]) {
      if (r === role || r === 'parent') continue
      const M = ROLE_META[r]
      out.push({
        id: `role:${r}`, label: `Switch to ${M.label} dashboard`, group: 'Roles',
        icon: <M.icon />, run: () => { setRole(r); nav(M.home) },
      })
    }

    /* A session needs a course to live in. */
    if (role === 'admin' && db.loops.length > 0) {
      out.push({
        id: 'act:new-session', label: 'New session', group: 'Actions', tail: 'Admin',
        icon: <Plus />, run: () => { const s = createSession(); nav(materialPath(db, s)) },
      })
    }
    out.push({
      id: 'act:theme', label: theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme',
      group: 'Actions', icon: theme === 'light' ? <Moon /> : <Sun />, run: toggleTheme,
    })

    /* A student jumps into the session view; everyone else lands in the CMS,
       and a student never sees a session that is not published to them. */
    for (const s of db.sessions) {
      if (role === 'student' && s.status !== 'published') continue
      const loop = db.loops.find(l => l.id === s.loopId)
      out.push({
        id: `ses:${s.id}`, label: s.name, group: 'Sessions',
        tail: `${s.code} · ${loop?.name ?? ''}`,
        icon: <Video />,
        run: () => nav(role === 'student' ? `/student/session/${s.id}` : materialPath(db, s)),
      })
    }

    return out
  }, [db, role, accountRole, theme, nav, setRole, toggleTheme, createSession])

  const results = useMemo(() => {
    const hit = q
      ? cmds.filter(c => fuzzy(q, c.label) || (c.tail ? fuzzy(q, c.tail) : false))
      : cmds.filter(c => c.group !== 'Sessions')
    return hit.slice(0, 40)
  }, [cmds, q])

  useEffect(() => { setSel(0) }, [q])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
      else if (e.key === 'Enter') {
        e.preventDefault()
        const c = results[sel]
        if (c) { c.run(); onClose() }
      } else if (e.key === 'Escape') { onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, sel, onClose])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-on="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null

  let lastGroup = ''
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="cmdk" role="dialog" aria-modal aria-label="Command palette">
        <input autoFocus value={q} placeholder="Search sessions, pages, actions…"
          onChange={e => setQ(e.target.value)} />
        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 && (
            <div className="empty" style={{ padding: 30 }}>
              <span className="t-sm c-muted">Nothing matches “{q}”</span>
            </div>
          )}
          {results.map((c, i) => {
            const head = c.group !== lastGroup ? (lastGroup = c.group) : null
            return (
              <div key={c.id}>
                {head && <div className="menu-label">{head}</div>}
                <button className="cmdk-item" data-on={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => { c.run(); onClose() }}>
                  {c.icon}
                  <span className="truncate">{c.label}</span>
                  {c.tail && <span className="tail truncate">{c.tail}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="row g12 t-xs c-muted2" style={{ padding: '8px 12px', borderTop: '1px solid var(--line-soft)' }}>
          <span className="row g4"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span className="row g4"><span className="kbd"><CornerDownLeft style={{ width: 9, height: 9 }} /></span> open</span>
          <span className="row g4"><span className="kbd">esc</span> close</span>
        </div>
      </div>
    </>,
    document.body,
  )
}
