/* ==========================================================================
   One notice, opened.

   A notification in the bell is a line: a title, and as much of the body as
   fits. Clicking it used to navigate straight off the page, which is the
   wrong order — the family reads the whole sentence first, and *then*
   decides whether to go and look. So it opens here, in full, with one
   button that takes them to the page it is about.
   ========================================================================== */

import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Modal } from '@/components/ui'
import { dateTime } from '@/lib/format'
import type { NotificationRow } from '@/lib/api/rows'

export function NoticeDialog({ notice, onClose }: {
  notice: NotificationRow | null
  onClose: () => void
}) {
  const nav = useNavigate()
  if (!notice) return null

  const go = () => {
    onClose()
    if (notice.link) nav(notice.link)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={notice.title}
      description={dateTime(notice.created_at)}
      footer={
        <>
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>Close</button>
          {notice.link && (
            <button className="btn primary" onClick={go}>More details<ArrowRight /></button>
          )}
        </>
      }
    >
      {notice.body
        ? <p className="t-sm c-ink2" style={{ lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{notice.body}</p>
        : <p className="t-sm c-muted2">No more was said.</p>}
    </Modal>
  )
}
