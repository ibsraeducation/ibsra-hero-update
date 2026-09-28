/* ==========================================================================
   "What it covers", as tabs.

   The admin adds a tab, names it, and writes its bullets. What is stored is
   still one Markdown document on the program or the course — a `##` heading
   per tab, its bullets under it — because that is what every reader already
   understands: the enrol dialog turns the headings back into tabs, and a
   plain list with no headings still reads as one.

   So this file is the one place the two shapes meet: text in, tabs out, and
   back again without losing anything the admin typed.
   ========================================================================== */

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)(\s+#+)?\s*$/

export interface CoverSection {
  /** React key only — never stored. */
  id: string
  /** The tab name. Empty means the bullets sit above the first heading, and
   *  they are written back without one. */
  name: string
  /** The bullets behind that tab, as Markdown. */
  body: string
  /** The video shown while that tab is open. Empty falls back to the
   *  program's own video. Stored beside the document, in `tab_videos`,
   *  rather than inside it — a link is not something to read. */
  video: string
}

let seq = 0
export const newSection = (name = '', body = '', video = ''): CoverSection =>
  ({ id: `cv${++seq}`, name, body, video })

const trimBlank = (lines: string[]) => {
  let a = 0
  let b = lines.length
  while (a < b && !lines[a].trim()) a++
  while (b > a && !lines[b - 1].trim()) b--
  return lines.slice(a, b).join('\n')
}

/** The document split into tabs, each paired with its video by position.
 *  Anything above the first heading becomes an unnamed section, so nothing
 *  the admin wrote is dropped. */
export function parseCovers(md: string | null | undefined, videos: string[] = []): CoverSection[] {
  const lines = (md ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out: CoverSection[] = []
  let name: string | null = null
  let buf: string[] = []

  const push = () => {
    const body = trimBlank(buf)
    if (name !== null || body) out.push(newSection(name ?? '', body))
    buf = []
  }

  for (const line of lines) {
    const h = HEADING.exec(line)
    if (h) {
      push()
      name = h[1].trim()
    } else {
      buf.push(line)
    }
  }
  push()
  return out.map((s, i) => ({ ...s, video: videos[i] ?? '' }))
}

/** The videos, in tab order, as they are stored next to the document. The
 *  trailing empty ones are dropped: a tab with no video keeps none. */
export function coversVideos(sections: CoverSection[]): string[] {
  const kept = sections.filter(s => s.name.trim() || trimBlank(s.body.split('\n')))
  const urls = kept.map(s => s.video.trim())
  while (urls.length && !urls[urls.length - 1]) urls.pop()
  return urls
}

/** Back to one document. A tab with no name and no bullets is left out — an
 *  empty tab is a thing being written, not a thing to store. */
export function coversToMarkdown(sections: CoverSection[]): string {
  return sections
    .map(s => ({ name: s.name.trim(), body: trimBlank(s.body.split('\n')) }))
    .filter(s => s.name || s.body)
    .map(s => (s.name ? `## ${s.name}${s.body ? `\n${s.body}` : ''}` : s.body))
    .join('\n')
}
