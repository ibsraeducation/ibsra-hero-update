/* ==========================================================================
   Which child this page is about. A family with one student never sees it —
   there is nothing to pick.
   ========================================================================== */

import { Check } from 'lucide-react'
import type { GuardianChild } from '@/lib/api/rows'

export function ChildPicker({ kids, child, onPick }: {
  kids: GuardianChild[]
  child: GuardianChild | null
  onPick: (id: string) => void
}) {
  if (kids.length < 2) return null
  return (
    <div className="row g8 wrap mb16">
      {kids.map(c => (
        <button key={c.profile.id} type="button" className="role-pill"
          data-on={child?.profile.id === c.profile.id}
          onClick={() => onPick(c.profile.id)}>
          {child?.profile.id === c.profile.id && <Check />}
          {c.profile.name || c.profile.email}
        </button>
      ))}
    </div>
  )
}
