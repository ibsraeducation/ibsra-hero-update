import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { CloudOff, RotateCcw } from 'lucide-react'
import { backendLive } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { decide } from '@/lib/routeAccess'
import { hydrate } from '@/lib/sync'
import { useSyncStatus } from '@/lib/sync/status'
import { Empty } from '@/components/ui'
import { BootScreen } from './BootScreen'

/** Gate for everything inside the app shell. The demo (no backend) passes
 *  straight through, exactly as before. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuth(s => s.status)
  const profile = useAuth(s => s.profile)
  const data = useSyncStatus(s => s.data)
  const loc = useLocation()

  if (!backendLive) return <>{children}</>
  if (status === 'loading') return <BootScreen />
  if (status !== 'ready' || !profile) {
    const next = encodeURIComponent(loc.pathname + loc.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (profile.must_change_password) return <Navigate to="/account/password" replace />

  const d = decide(loc.pathname, profile.role)
  if (!d.allow) return <Navigate to={d.to} replace />

  if (data === 'idle' || data === 'loading') return <BootScreen label="Loading your workspace…" />
  if (data === 'error') {
    return (
      <div className="boot">
        <Empty icon={<CloudOff />} title="Couldn't load your data"
          action={
            <button className="btn primary" onClick={() => void hydrate(profile.role)}>
              <RotateCcw />Try again
            </button>
          } />
      </div>
    )
  }
  return <>{children}</>
}
