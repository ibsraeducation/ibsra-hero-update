import { memo } from 'react'
import { parseInline, type OutlineNode } from '@/lib/outline'
import './outline.css'

/* A Markdown outline as nested bullets. Headings show as bold group labels
   and their points stay at the same bullet level. Memoised: a large outline
   is hundreds of elements, and the editor re-renders on every keystroke. */
export const Outline = memo(function Outline({ nodes, depth = 0 }: {
  nodes: OutlineNode[]; depth?: number
}) {
  return (
    <ul className="mdo" data-depth={Math.min(depth, 2)}>
      {nodes.map((n, i) => (
        <li key={i} className={n.heading ? 'mdo-head' : undefined}>
          <InlineText text={n.text} />
          {n.children.length > 0 && <Outline nodes={n.children} depth={n.heading ? depth : depth + 1} />}
        </li>
      ))}
    </ul>
  )
})

function InlineText({ text }: { text: string }) {
  return (
    <span className="mdo-text">
      {parseInline(text).map((s, i) => {
        switch (s.kind) {
          case 'bold': return <strong key={i}>{s.text}</strong>
          case 'italic': return <em key={i}>{s.text}</em>
          case 'code': return <code key={i}>{s.text}</code>
          case 'link': return <a key={i} href={s.href} target="_blank" rel="noopener noreferrer">{s.text}</a>
          default: return s.text
        }
      })}
    </span>
  )
}
