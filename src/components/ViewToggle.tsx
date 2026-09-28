/* The one control that swaps the programs page between the path and the
   grid. It is the same choice in all three workspaces, so it is one
   component reading one persisted preference. */

import { LayoutGrid, Waypoints } from 'lucide-react'
import { useStore } from '@/lib/store'

export function ProgramViewToggle() {
  const view = useStore(s => s.programView)
  const set = useStore(s => s.setProgramView)
  return (
    /* Same chrome as the role switcher in the shell — one kind of segmented
       control across the product. */
    <div className="roles" role="group" aria-label="How to show the programs">
      <button className="role-pill" data-on={view === 'map' || undefined}
        aria-pressed={view === 'map'} onClick={() => set('map')}
        title="The training path, stage by stage">
        <Waypoints />Path
      </button>
      <button className="role-pill" data-on={view === 'grid' || undefined}
        aria-pressed={view === 'grid'} onClick={() => set('grid')}
        title="Every program as a card, with its counts">
        <LayoutGrid />Grid
      </button>
    </div>
  )
}
