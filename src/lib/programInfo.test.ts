import { describe, expect, it } from 'vitest'
import type { Track } from '@/lib/types'
import { trackFromRow, trackToRow } from '@/lib/api/mappers'
import {
  cleanList, cleanSkills, hasProgramInfo, listText, MAX_LIST_CHARS, programBlurb, programEyebrow,
  skillsFromLists, toPoints,
} from './programInfo'

const demo: Track = { id: 'trk_demo1', name: 'Demo', skill: 'AI video', tier: 'T3', color: 'gold', blurb: 'Old blurb' }

describe('program info', () => {
  it('cleans skills: trims, drops blanks and repeats', () => {
    expect(cleanSkills([
      { name: '  Soldering ', category: 'technical' },
      { name: '', category: 'technical' },
      { name: 'soldering', category: 'technical' },
      { name: 'Soldering', category: 'personal' },
    ])).toEqual([
      { name: 'Soldering', category: 'technical' },
      { name: 'Soldering', category: 'personal' },
    ])
  })

  it('reads points one per line', () => {
    expect(toPoints(' Read a circuit \n\n Solder a board ')).toEqual(['Read a circuit', 'Solder a board'])
  })

  it('falls back to the old skill and blurb for demo programs', () => {
    expect(programEyebrow(demo)).toBe('AI video')
    expect(programBlurb(demo)).toBe('Old blurb')
  })

  it('summarises skills by category in a fixed order', () => {
    const t: Track = {
      ...demo,
      technical: 'A\nB',
      skills: [{ name: 'Pitch', category: 'marketing' }, { name: 'Wiring', category: 'technical' }],
    }
    expect(programEyebrow(t)).toBe('2 skills · Technical, Marketing')
    expect(programBlurb(t)).toBe('A · B')
  })

  it('maps a program to a row with only the new fields and back', () => {
    const t: Track = {
      ...demo, personal: 'A\nB', asset: 'Robot', technicalSkills: '- Wiring',
      skills: [{ name: 'Wiring', category: 'technical' }],
    }
    const row = trackToRow(t)
    expect(row).toEqual({
      id: 'trk_demo1', name: 'Demo',
      /* What the program covers, written on the program form itself. */
      overview: '',
      technical_values: '', personal_values: 'A\nB', market_values: '', asset_value: 'Robot',
      technical_skills: '- Wiring', marketing_skills: '', personal_skills: '',
      skills: [{ name: 'Wiring', category: 'technical' }],
      /* Not for sale until the admin puts a price on it. */
      price_egp: null,
      listed: true,
      locked: false,
      /* Where it sits on the path, and the lines out of it. Unset means the
         column is read off those lines. */
      stage: null,
      next_ids: [],
      video_url: null,
      tab_videos: {},
    })
    expect(trackFromRow(row)).toMatchObject({
      technical: '', personal: 'A\nB', market: '', asset: 'Robot', technicalSkills: '- Wiring',
      skills: row.skills, skill: 'Wiring', blurb: 'A · B',
    })
  })

  it('reads the top-level points of a Markdown list as plain text', () => {
    expect(toPoints('• Read a circuit\n- **Solder** a board\n  - sub point\n2. Program a robot\n\n-5V rail')).toEqual([
      'Read a circuit', 'Solder a board', 'Program a robot', '-5V rail',
    ])
  })

  it('saves a list as clean Markdown within the database limit', () => {
    expect(cleanList('\r\n\n- A\r\n  - B  \n\n')).toBe('- A\n  - B')
    expect(cleanList('x'.repeat(MAX_LIST_CHARS + 50))).toHaveLength(MAX_LIST_CHARS)
  })

  it('knows a program has info when any list is written', () => {
    expect(hasProgramInfo(demo)).toBe(false)
    expect(hasProgramInfo({ ...demo, market: 'Skills in demand' })).toBe(true)
    expect(hasProgramInfo({ ...demo, personalSkills: '- Teamwork' })).toBe(true)
    expect(programBlurb({ ...demo, asset: 'Robot\nLamp' })).toBe('Robot · Lamp')
    expect(programBlurb({ ...demo, market: 'Later', technical: '- First' })).toBe('First')
    expect(programBlurb({ ...demo, technicalSkills: '- Python' })).toBe('Old blurb')
  })

  it('turns every point of the skill lists into a skill, headings left out', () => {
    expect(skillsFromLists({
      technical: '- Not a skill',
      technicalSkills: '## Coding\n- **Python**\n  - NumPy\n  - numpy\n- Soldering',
      marketingSkills: '- Pricing a project',
    })).toEqual([
      { name: 'Python', category: 'technical' },
      { name: 'NumPy', category: 'technical' },
      { name: 'Soldering', category: 'technical' },
      { name: 'Pricing a project', category: 'marketing' },
    ])
  })

  it('shows saved skills as bullets when a skill list was never written', () => {
    const t: Track = { ...demo, skills: [{ name: 'Teamwork', category: 'personal' }, { name: 'Wiring', category: 'technical' }] }
    expect(listText(t, 'personalSkills')).toBe('- Teamwork')
    expect(listText({ ...t, personalSkills: '- Leading a team' }, 'personalSkills')).toBe('- Leading a team')
    expect(listText(t, 'personal')).toBe('')
  })
})
