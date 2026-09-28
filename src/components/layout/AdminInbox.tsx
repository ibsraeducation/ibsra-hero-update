/* ==========================================================================
   The admin's inbox — an icon in the top bar, not a rail entry.

   Everything that waits on the admin, in one menu: requests to answer,
   transfers to check, answers to grade. The badge is the
   sum, so one glance from any page says whether anything is waiting, and
   each line goes straight to the page that clears it.

   The counts come from `useAdminQueue`, the same store the rail badges and
   the pages themselves refresh, so all three always agree. Polled like the
   bell: every minute, and the moment the tab regains focus.
   ========================================================================== */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Inbox, Receipt, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Menu, MenuItem, MenuLabel } from '@/components/ui'
import { useAdminQueue } from '@/lib/api/adminQueue'
import './countdown.css'

const POLL_MS = 60_000

interface Line {
  key: 'requests' | 'payments' | 'grading'
  label: string
  to: string
  icon: LucideIcon
}

const LINES: Line[] = [
  { key: 'requests', label: 'Registrations to schedule', to: '/admin/requests', icon: UserPlus },
  { key: 'payments', label: 'Transfers to check', to: '/admin/students?tab=transfers', icon: Receipt },
  { key: 'grading', label: 'Answers to grade', to: '/admin/students?tab=students', icon: GraduationCap },
]

export function AdminInbox() {
  const nav = useNavigate()
  const queue = useAdminQueue()
  const { refresh } = queue

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  const total = LINES.reduce((n, l) => n + queue[l.key], 0)

  return (
    <Menu align="end" trigger={p => (
      <button className="btn ghost icon sm" {...p} style={{ position: 'relative' }}
        aria-label={`Inbox${total ? `, ${total} waiting` : ''}`} title="Inbox — what is waiting on you">
        <Inbox />
        {total > 0 && <span className="tb-count tnum">{total > 99 ? '99+' : total}</span>}
      </button>
    )}>
      <MenuLabel>Waiting on you</MenuLabel>
      {LINES.map(l => {
        const n = queue[l.key]
        return (
          <MenuItem key={l.key} icon={<l.icon />} onClick={() => nav(l.to)}
            tail={n > 0
              ? <span className="tb-count tb-count-inline tnum">{n}</span>
              : <span className="t-xs c-muted2">0</span>}>
            <span className={n > 0 ? 'w-sb' : 'c-muted'}>{l.label}</span>
          </MenuItem>
        )
      })}
    </Menu>
  )
}
