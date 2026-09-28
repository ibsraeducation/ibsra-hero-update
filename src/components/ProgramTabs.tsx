import { Tabs } from '@/components/ui'
import { TabScroller } from '@/components/TabScroller'
import { categoryMeta, PROGRAM_LISTS, type ListKey } from '@/lib/programInfo'
import './programTabs.css'

/* A program's tab bar: its four values, then its three kinds of skill, on one
   line that scrolls sideways when it is wider than the space (see
   TabScroller). `hideEmpty` leaves out tabs with nothing in them, for reading
   rather than editing. */
export function ProgramTabs({ value, onChange, counts, hideEmpty = false }: {
  value: ListKey
  onChange: (key: ListKey) => void
  counts: Partial<Record<ListKey, number>>
  hideEmpty?: boolean
}) {
  const items = PROGRAM_LISTS
    .map(l => ({
      value: l.key,
      label: l.tab,
      count: counts[l.key] ?? 0,
      skill: !!l.category,
      icon: l.category ? <span className={`ptab-swatch ${categoryMeta(l.category).tone}`} aria-hidden /> : undefined,
    }))
    .filter(i => !hideEmpty || i.count > 0)
  const values = items.filter(i => !i.skill)
  const skills = items.filter(i => i.skill)

  return (
    <div className="ptabs">
      <TabScroller activeKey={value}>
        {values.length > 0 && <Tabs value={value} onChange={onChange} items={values} />}
        {values.length > 0 && skills.length > 0 && <span className="ptabs-sep" aria-hidden />}
        {skills.length > 0 && <Tabs value={value} onChange={onChange} items={skills} />}
      </TabScroller>
    </div>
  )
}
