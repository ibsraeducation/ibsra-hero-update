import { Loader2 } from 'lucide-react'
import '@/roles/auth/auth.css'

/** While the session and the person's data load. */
export function BootScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="boot" role="status" aria-live="polite">
      <div className="boot-inner">
        <Loader2 className="spin" />
        <span>{label}</span>
      </div>
    </div>
  )
}
