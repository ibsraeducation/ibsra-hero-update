/* ==========================================================================
   Every notice sent to whoever is signed in, newest first — the page the
   bell's "See all" opens. One page, no role branching: what lands here
   depends only on who is reading it (see the RLS on `notifications`).
   ========================================================================== */

import { useEffect, useState } from 'react'
import { Bell, Check } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Empty } from '@/components/ui'
import { dateTime } from '@/lib/format'
import { useInbox, watchNotifications } from '@/lib/api/notifications'
import { useAuth } from '@/lib/auth'
import { NoticeDialog } from '@/components/layout/NoticeDialog'
import type { NotificationRow } from '@/lib/api/rows'

export default function Notifications() {
  const userId = useAuth(s => s.profile?.id)
  const { items, unread, loading, refresh, markOneRead, markAllRead } = useInbox()
  const [open, setOpen] = useState<NotificationRow | null>(null)

  useEffect(() => {
    void refresh()
    return userId ? watchNotifications(userId, () => void refresh()) : undefined
  }, [refresh, userId])

  const read = (n: NotificationRow) => {
    void markOneRead(n.id)
    setOpen(n)
  }

  return (
    <div className="page">
      <PageHeader
        title="Notifications"
        actions={unread > 0 ? (
          <button className="btn sm" onClick={() => void markAllRead()}><Check />Mark all read</button>
        ) : undefined}
      />

      {loading && items.length === 0 ? (
        <div className="skel" style={{ height: 200 }} />
      ) : items.length === 0 ? (
        <div className="card">
          <Empty icon={<Bell />} title="Nothing yet" />
        </div>
      ) : (
        <div className="card">
          {items.map(n => (
            <button key={n.id} type="button" className="fam-pay" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
              onClick={() => read(n)}>
              <div className="row g10 wrap" style={{ justifyContent: 'space-between' }}>
                <span className={`t-sm ${n.read_at ? '' : 'w-sb'}`}>{n.title}</span>
                <span className="t-xs c-muted2">{dateTime(n.created_at)}</span>
              </div>
              {n.body && <p className="t-xs c-muted" style={{ lineHeight: 1.6 }}>{n.body}</p>}
              {!n.read_at && <span className="badge brand sm" style={{ width: 'fit-content' }}>New</span>}
            </button>
          ))}
        </div>
      )}

      <NoticeDialog notice={open} onClose={() => setOpen(null)} />
    </div>
  )
}
