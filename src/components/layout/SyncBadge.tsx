import { useEffect, useState } from 'react'
import { CloudOff, Loader2 } from 'lucide-react'
import { retrySync } from '@/lib/sync'
import { useSyncStatus } from '@/lib/sync/status'
import { relative } from '@/lib/format'

/** Honest save state for work that goes to the server. */
export function SyncBadge() {
  const { pending, saving, lastSavedAt, error } = useSyncStatus()
  const [, tick] = useState(0)
  useEffect(() => {
    if (!lastSavedAt) return
    const t = window.setInterval(() => tick(n => n + 1), 15_000)
    return () => clearInterval(t)
  }, [lastSavedAt])

  if (error) {
    return (
      <button className="btn sm ghost c-rose" onClick={retrySync} title={error}>
        <CloudOff /><span className="hide-sm">Not saved — retry</span>
      </button>
    )
  }
  if (saving || pending > 0) {
    return (
      <span className="saving hide-sm" role="status">
        <Loader2 className="spin" style={{ width: 13, height: 13, verticalAlign: '-2px', marginInlineEnd: 4 }} />
        Saving…
      </span>
    )
  }
  if (!lastSavedAt) return null
  return (
    <span className="saving hide-sm" title="Saved to the server">
      Saved {relative(new Date(lastSavedAt).toISOString())}
    </span>
  )
}
