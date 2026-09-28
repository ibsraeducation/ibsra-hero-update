import { useMemo } from 'react'
import { ListOrdered, Plus } from 'lucide-react'
import { hasCustomFlow, sessionFlow, useStore } from '@/lib/store'
import { Menu, MenuItem, MenuLabel } from '@/components/ui'
import { TITLE_KINDS, TITLE_KIND_META } from '@/lib/types'
import type { Session, TitleKind } from '@/lib/types'
import { TITLE_KIND_ICON } from './FlowPanel'

/** The rail is now a single door into the session: the Sequence, which
 *  groups everything by topic already. Picking a step's own tab (Recording,
 *  Material, Q&amp;A, Topic settings) happens from a row in the Sequence via
 *  "Open in its topic tab" — `onSelect` still exists for that, and for the
 *  fresh topic a new "+" creates. */
export function TitleRail({ session, selectedId, onSelect, onGoFlow }: {
  session: Session
  selectedId: string
  onSelect: (id: string) => void
  onGoFlow: () => void
}) {
  const addTitle = useStore(s => s.addTitle)

  const steps = useMemo(() => sessionFlow(session).length, [session])
  const custom = hasCustomFlow(session)

  const add = (kind: TitleKind) => {
    const t = addTitle(session.id, undefined, kind)
    if (t) onSelect(t.id)
  }

  return (
    <aside className="editor-rail">
      <div className="row g4" style={{ margin: '10px 10px 4px' }}>
        <button className="title-card grow" data-on={!selectedId} onClick={onGoFlow} style={{ width: 'auto' }}>
          <div className="idx" style={!selectedId ? undefined : { background: 'transparent' }}>
            <ListOrdered style={{ width: 12, height: 12 }} />
          </div>
          <div className="grow stack g2" style={{ minWidth: 0 }}>
            <span className="t-sm w-sb">Sequence</span>
            <span className="t-xs c-muted2 truncate">
              {steps} step{steps === 1 ? '' : 's'} · {custom ? 'arranged by hand' : 'topic order'}
            </span>
          </div>
        </button>
        <Menu align="end" trigger={p => (
          <button className="btn ghost icon sm" style={{ flex: 'none' }} {...p}
            aria-label="Add a topic or a project" title="Add a topic or a project">
            <Plus />
          </button>
        )}>
          <MenuLabel>Add to this session</MenuLabel>
          {TITLE_KINDS.map(k => (
            <MenuItem key={k} icon={TITLE_KIND_ICON[k]} onClick={() => add(k)}>
              {TITLE_KIND_META[k].one}
            </MenuItem>
          ))}
        </Menu>
      </div>

      {session.titles.length === 0 && (
        <div className="stack g10" style={{ padding: '18px 18px 12px', textAlign: 'center' }}>
          <span className="t-xs c-muted2" style={{ lineHeight: 1.6 }}>
            A session is empty until it has something in it. A topic is taught —
            a recording, its material and its Q&amp;A. A project is built — the brief
            and the work handed in.
          </span>
          {TITLE_KINDS.map(k => (
            <button key={k} className="btn sm block" onClick={() => add(k)}>
              {TITLE_KIND_ICON[k]}Add a {k}
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}
