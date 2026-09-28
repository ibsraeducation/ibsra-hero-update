/* ==========================================================================
   A Markdown outline: the part of Markdown a program's lists use, read into a
   tree of bullets and sub-bullets. Pure functions, no HTML — the page renders
   the tree with React elements, so nothing typed here can inject markup.

   What it reads:
   - `-`, `*`, `+`, `•` or `1.` items; indentation (spaces or tabs) nests them.
   - `#` headings group everything under them until the next heading of the
     same or a higher level.
   - A plain line is a point too. Items right under it at the same indent
     become its sub-points ("**Week 1:**" followed by "- …").
   - Inline `**bold**`, `*italic*`, `` `code` `` and [links](https://…).
   Blank lines, rules (---), code fences and task boxes ([ ], [x]) are ignored.
   ========================================================================== */

export interface OutlineNode {
  text: string
  heading?: boolean
  children: OutlineNode[]
}

const FENCE = /^\s*(```|~~~)/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(\s+#+)?\s*$/
const ITEM = /^(\s*)(?:[-*+•●▪◦‣]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/
const QUOTE = /^(\s*)>\s?/

export function parseOutline(md = ''): OutlineNode[] {
  const root: OutlineNode[] = []
  const headings: Array<{ level: number; node: OutlineNode }> = []
  // Open points under the current heading, by indent. A plain line sits half
  // a step to the left so items at its own indent nest under it.
  let open: Array<{ indent: number; node: OutlineNode }> = []

  const container = () => (headings.length ? headings[headings.length - 1].node.children : root)

  const place = (node: OutlineNode, indent: number, popFrom: number) => {
    while (open.length && open[open.length - 1].indent >= popFrom) open.pop()
    ;(open.length ? open[open.length - 1].node.children : container()).push(node)
    open.push({ indent, node })
  }

  for (const raw of md.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    const line = raw.replace(QUOTE, '$1')
    if (!line.trim() || FENCE.test(line) || RULE.test(line)) continue

    const h = HEADING.exec(line)
    if (h) {
      const level = h[1].length
      const node: OutlineNode = { text: h[2].trim(), heading: true, children: [] }
      while (headings.length && headings[headings.length - 1].level >= level) headings.pop()
      container().push(node)
      headings.push({ level, node })
      open = []
      continue
    }

    const item = ITEM.exec(line)
    if (item) {
      const text = item[2].trim()
      if (text) place({ text, children: [] }, item[1].length, item[1].length)
      continue
    }

    const indent = line.length - line.trimStart().length
    place({ text: line.trim(), children: [] }, indent - 0.5, indent - 0.5)
  }
  return root
}

/** Every point in the tree, headings left out. */
export function countPoints(nodes: OutlineNode[]): number {
  return nodes.reduce((n, x) => n + (x.heading ? 0 : 1) + countPoints(x.children), 0)
}

/* ---------------- inline ---------------- */

export type Inline =
  | { kind: 'text' | 'bold' | 'italic' | 'code'; text: string }
  | { kind: 'link'; text: string; href: string }

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(?!\s)(.+?)\*|(?<!\w)_(?!\s)(.+?)_(?!\w)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let at = 0
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0
    if (index > at) out.push({ kind: 'text', text: text.slice(at, index) })
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1] })
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ kind: 'bold', text: m[2] ?? m[3] })
    else if (m[4] !== undefined || m[5] !== undefined) out.push({ kind: 'italic', text: m[4] ?? m[5] })
    else out.push({ kind: 'link', text: m[6], href: m[7] })
    at = index + m[0].length
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) })
  return out
}

/** The words of a line with its Markdown marks taken out. */
export const plainText = (text: string) => parseInline(text).map(s => s.text).join('')
