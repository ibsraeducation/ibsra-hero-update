/* ==========================================================================
   How a training program describes itself: seven Markdown lists, one tab
   each — its technical, personal, market and asset value to the student, and
   the technical, marketing and personal skills it builds.
   `skills` ({name, category}) is filled from the three skill lists on save.
   Demo programs predate all this and still carry `skill` and `blurb`, so
   every reader here falls back to those.
   ========================================================================== */

import type { SkillCategory, Track, TrackSkill, ValueLists } from '@/lib/types'
import { parseOutline, plainText, type OutlineNode } from '@/lib/outline'

export const SKILL_CATEGORIES: Array<{ id: SkillCategory; label: string; tone: string }> = [
  { id: 'technical', label: 'Technical', tone: 'sky' },
  { id: 'marketing', label: 'Marketing', tone: 'gold' },
  { id: 'personal', label: 'Personal', tone: 'teal' },
]

export const categoryMeta = (id: SkillCategory) =>
  SKILL_CATEGORIES.find(c => c.id === id) ?? SKILL_CATEGORIES[0]

export const MAX_SKILLS = 60
export const MAX_SKILL_NAME = 80

export type ListKey =
  | 'technical' | 'personal' | 'market' | 'asset'
  | 'technicalSkills' | 'marketingSkills' | 'personalSkills'

export interface ProgramList {
  key: ListKey
  tab: string
  /** Set on the three skill lists. */
  category?: SkillCategory
  placeholder: string
}

/* In tab order. Each is shown as bullets and sub-bullets (see lib/outline.ts).
   Market values describe demand for the skills — never a promise of income. */
export const PROGRAM_LISTS: ProgramList[] = [
  {
    key: 'technical', tab: 'Technical values',
    placeholder: '## Electronics\n- Reads a circuit diagram\n  - Ohm’s law\n  - Series and parallel\n- Trains an object-detection model',
  },
  {
    key: 'personal', tab: 'Personal values',
    placeholder: '- Presents their work to a client\n- Works in a team of three\n  - Splits tasks and meets deadlines',
  },
  {
    key: 'market', tab: 'Market values',
    placeholder: '- Skills in demand: Python, OpenCV, embedded systems\n- Can quote and deliver a small automation job',
  },
  {
    key: 'asset', tab: 'Asset value',
    placeholder: '- A line-following robot they keep\n- A portfolio page with 3 finished projects\n  - Demo videos and source code',
  },
  {
    key: 'technicalSkills', tab: 'Technical skills', category: 'technical',
    placeholder: '- Python\n  - NumPy\n  - OpenCV\n- Soldering\n- Reading a datasheet',
  },
  {
    key: 'marketingSkills', tab: 'Marketing skills', category: 'marketing',
    placeholder: '- Pricing a project\n- Writing a pitch\n  - A one-page proposal',
  },
  {
    key: 'personalSkills', tab: 'Personal skills', category: 'personal',
    placeholder: '- Teamwork\n- Presenting to a client\n- Managing their time',
  },
]

/** The database cap on each list. */
export const MAX_LIST_CHARS = 20000

/** A list as saved: line endings made plain, blank lines trimmed off both ends. */
export function cleanList(md = ''): string {
  return md.replace(/\r\n?/g, '\n').replace(/^(\s*\n)+/, '').replace(/\s+$/, '').slice(0, MAX_LIST_CHARS)
}

/** The top-level points of a list, as plain text. */
export function toPoints(md = ''): string[] {
  return parseOutline(md).map(n => plainText(n.text)).filter(Boolean)
}

/** A program's, course's or session's list as Markdown. A skill list never
 *  written falls back to the saved skills of that kind, one bullet each. */
export function listText(t: ValueLists, key: ListKey): string {
  const md = t[key] ?? ''
  const category = PROGRAM_LISTS.find(l => l.key === key)?.category
  if (md.trim() || !category) return md
  return (t.skills ?? []).filter(s => s.category === category).map(s => `- ${s.name}`).join('\n')
}

/** Every point of the three skill lists as a skill, headings left out. */
export function skillsFromLists(lists: Partial<Record<ListKey, string>>): TrackSkill[] {
  const out: TrackSkill[] = []
  for (const l of PROGRAM_LISTS) {
    const category = l.category
    if (!category) continue
    const walk = (nodes: OutlineNode[]) => nodes.forEach(n => {
      if (!n.heading) out.push({ name: plainText(n.text), category })
      walk(n.children)
    })
    walk(parseOutline(lists[l.key]))
  }
  return cleanSkills(out)
}

/** Whether any list at all has been written. */
export function hasProgramInfo(t: ValueLists): boolean {
  return PROGRAM_LISTS.some(l => parseOutline(listText(t, l.key)).length > 0)
}

/** One line for a card: the first value that has points, run together, else the old blurb. */
export function programBlurb(t: Track): string {
  for (const l of PROGRAM_LISTS) {
    if (l.category) continue
    const points = toPoints(t[l.key])
    if (points.length) return points.join(' · ')
  }
  return t.blurb
}

/** A card's eyebrow: how many skills and in which categories, else the old skill. */
export function programEyebrow(t: Track): string {
  const skills = t.skills ?? []
  if (!skills.length) return t.skill
  const cats = SKILL_CATEGORIES.filter(c => skills.some(s => s.category === c.id)).map(c => c.label)
  return `${skills.length} skill${skills.length === 1 ? '' : 's'} · ${cats.join(', ')}`
}

/** Trimmed, without blanks or repeats, within the limits the database enforces. */
export function cleanSkills(skills: TrackSkill[]): TrackSkill[] {
  const seen = new Set<string>()
  const out: TrackSkill[] = []
  for (const s of skills) {
    const name = s.name.trim().slice(0, MAX_SKILL_NAME)
    const key = `${s.category}|${name.toLowerCase()}`
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push({ name, category: s.category })
  }
  return out.slice(0, MAX_SKILLS)
}
