import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './programTabs.css'

/* One line of tabs that scrolls sideways when it is wider than the space —
   by trackpad, touch or the mouse wheel. The edges fade where there is more
   to see, and whatever is chosen is scrolled into view.

   Lifted out of ProgramTabs so the program's values bar, the admin's
   "what it covers" editor and the family's enrolment dialog all scroll the
   same way rather than three times differently. */
export function TabScroller({ children, activeKey }: {
  children: ReactNode
  /** Changing this scrolls the tab marked `data-on` back into view. */
  activeKey?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  const measure = () => {
    const el = ref.current
    if (!el) return
    const start = el.scrollLeft > 1
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges(e => (e.start === start && e.end === end ? e : { start, end }))
  }

  useLayoutEffect(measure)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // A vertical wheel scrolls the bar sideways, until it reaches an end.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      const max = el.scrollWidth - el.clientWidth
      const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY))
      if (max <= 0 || next === el.scrollLeft) return
      e.preventDefault()
      el.scrollLeft = next
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', measure)
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    const on = el?.querySelector<HTMLElement>('[data-on="true"]')
    if (!el || !on) return
    const left = on.offsetLeft
    const right = left + on.offsetWidth
    if (left < el.scrollLeft) el.scrollTo({ left: left - 32, behavior: 'smooth' })
    else if (right > el.scrollLeft + el.clientWidth) el.scrollTo({ left: right - el.clientWidth + 32, behavior: 'smooth' })
  }, [activeKey])

  return (
    <div ref={ref} className="ptabs-scroll" data-start={edges.start} data-end={edges.end}>
      {children}
    </div>
  )
}
