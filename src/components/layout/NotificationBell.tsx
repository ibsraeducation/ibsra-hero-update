/* ==========================================================================
   The bell — a durable inbox in the top bar, not a toast that is gone in
   3.2 seconds. Fed by a realtime channel, with a slow poll underneath it in
   case the socket drops (see src/lib/api/notifications.ts).

   Clicking a notice opens it rather than navigating: the reader sees the
   whole sentence, then decides whether to follow it.
   ========================================================================== */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Menu, MenuItem, MenuLabel, MenuSep } from '@/components/ui'
import { relative } from '@/lib/format'
import { useInbox, watchNotifications } from '@/lib/api/notifications'
import { syncAfterNotice } from '@/lib/sync'
import { useAuth } from '@/lib/auth'
import { NoticeDialog } from './NoticeDialog'
import type { NotificationRow } from '@/lib/api/rows'

/* The floor under the channel, not the mechanism. */
const POLL_MS = 120_000

export function NotificationBell() {
  const nav = useNavigate()
  const userId = useAuth(s => s.profile?.id)
  const { items, unread, refresh, markOneRead, markAllRead } = useInbox()
  const [open, setOpen] = useState<NotificationRow | null>(null)

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    /* A notice usually means something the reader can open has changed —
       a program the admin just opened is the whole point of this bell. */
    const arrived = () => { void refresh(); syncAfterNotice() }
    const stop = userId ? watchNotifications(userId, arrived) : undefined
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
      stop?.()
    }
  }, [refresh, userId])

  const read = (n: NotificationRow) => {
    void markOneRead(n.id)
    setOpen(n)
  }

  return (
    <>
    <Menu align="end" trigger={p => (
      <button className="btn ghost icon sm" {...p} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        style={{ position: 'relative' }}>
        <Bell />
        {unread > 0 && (
          <span className="tnum" style={{
            position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, padding: '0 3px',
            borderRadius: 999, background: 'var(--rose-600)', color: '#fff',
            fontSize: 10, lineHeight: '15px', textAlign: 'center',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
    )}>
      <MenuLabel>Notifications</MenuLabel>
      {items.length === 0 ? (
        <div className="menu-item" style={{ opacity: 0.6, cursor: 'default' }}>Nothing yet</div>
      ) : (
        items.slice(0, 8).map(n => (
          <MenuItem key={n.id} onClick={() => read(n)}
            tail={<span className="t-xs c-muted2">{relative(n.created_at)}</span>}>
            <span className="stack g2" style={{ minWidth: 0 }}>
              <span className={`t-sm truncate ${n.read_at ? '' : 'w-sb'}`}>{n.title}</span>
              {n.body && <span className="t-xs c-muted2 truncate" style={{ maxWidth: 220 }}>{n.body}</span>}
            </span>
          </MenuItem>
        ))
      )}
      {items.length > 0 && (
        <>
          <MenuSep />
          <MenuItem onClick={() => void markAllRead()}>Mark all read</MenuItem>
          <MenuItem onClick={() => nav('/notifications')}>See all →</MenuItem>
        </>
      )}
    </Menu>

    <NoticeDialog notice={open} onClose={() => setOpen(null)} />
    </>
  )
}
