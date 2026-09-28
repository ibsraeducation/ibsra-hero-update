/* The answer key must never ride along in what a student can read. */

import { describe, expect, it } from 'vitest'
import type { Session, Track } from '@/lib/types'
import { loopFromRow, loopToRow, sessionFromRow, sessionToPayload, trackFromRow, trackToRow } from './mappers'

const demoTrack: Track = { id: 'trk_demo1', name: 'Demo', skill: 'AI video', tier: 'T3', color: 'gold', blurb: 'Old blurb' }

const session: Session = {
  id: 'ses_abc123',
  code: 'VID-L1-S01',
  loopId: 'lp_abc123',
  name: 'Hooks',
  summary: 'First three seconds',
  type: 'recorded',
  status: 'published',
  order: 0,
  instructorId: null,
  scheduledAt: null,
  durationMin: 40,
  titles: [{
    id: 'ttl_1', order: 0, name: 'Topic', estimatedMin: 20,
    video: { provider: 'youtube', url: 'https://youtu.be/x', durationSec: 0, captions: false, state: 'ready' },
    materials: [{ id: 'mat_1', order: 0, kind: 'pdf', name: 'Workbook', url: 'storage://materials/ses_abc123/u/w.pdf', size: 10 }],
    tasks: [
      {
        id: 'tsk_mcq', order: 0, kind: 'mcq', question: 'Which?', points: 5, required: true,
        options: [{ id: 'opt_a', text: 'A', correct: true }, { id: 'opt_b', text: 'B', correct: false }],
      },
      {
        id: 'tsk_txt', order: 1, kind: 'short', question: 'Why?', points: 5, required: true,
        modelAnswer: 'Because the hook sets the promise', options: [],
      },
    ],
  }],
  flowOrder: ['v:ttl_1', 't:tsk_mcq', 'm:mat_1', 't:tsk_txt'],
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:00:00.000Z',
}

describe('sessionToPayload', () => {
  it('takes every correct flag and grading note out of the content', () => {
    const { row, keys } = sessionToPayload(session)
    const text = JSON.stringify(row.content)
    expect(text).not.toContain('"correct"')
    expect(text).not.toContain('modelAnswer')
    expect(text).not.toContain('Because the hook')
    expect(keys).toEqual({
      tsk_mcq: { correct: ['opt_a'] },
      tsk_txt: { modelAnswer: 'Because the hook sets the promise' },
    })
  })

  it('keeps the student-facing order and the scalar fields', () => {
    const { row } = sessionToPayload(session)
    expect(row.content.flowOrder).toEqual(session.flowOrder)
    expect(row).toMatchObject({ id: 'ses_abc123', loop_id: 'lp_abc123', sort_order: 0, status: 'published' })
  })
})

describe('sessionFromRow', () => {
  it('round-trips for an admin, with the keys merged back', () => {
    const { row, keys } = sessionToPayload(session)
    const back = sessionFromRow({ ...row, updated_at: session.updatedAt }, keys)
    expect(back.titles).toEqual(session.titles)
    expect(back.flowOrder).toEqual(session.flowOrder)
  })

  it('gives a student no correct option and no grading note', () => {
    const { row } = sessionToPayload(session)
    const back = sessionFromRow(row)
    const tasks = back.titles[0].tasks
    expect(tasks[0].options.every(o => o.correct === false)).toBe(true)
    expect(tasks[1].modelAnswer).toBeUndefined()
  })
})

/** The stored video, which rides in a loosely typed content blob. */
const storedVideo = (content: { titles: unknown }) =>
  (content.titles as Array<{ video?: Record<string, unknown> | null }>)[0].video ?? {}

describe('checkpoint questions', () => {
  const withCheck: Session = {
    ...session,
    titles: [{
      ...session.titles[0],
      video: {
        provider: 'youtube', url: 'https://youtu.be/x', durationSec: 600,
        captions: false, state: 'ready',
        checks: [{
          id: 'chk_1', atSec: 30, kind: 'mcq', question: 'Which?', points: 5, required: true,
          options: [{ id: 'o_a', text: 'A', correct: true }, { id: 'o_b', text: 'B', correct: false }],
        }],
      },
    }],
  }

  it('hides a checkpoint answer the same way it hides a task answer', () => {
    const { row, keys } = sessionToPayload(withCheck)
    const stored = JSON.stringify(storedVideo(row.content))
    expect(stored).not.toContain('"correct"')
    expect(keys.chk_1).toEqual({ correct: ['o_a'] })
  })

  it('gives it back to an admin and withholds it from a student', () => {
    const { row, keys } = sessionToPayload(withCheck)
    const mentor = sessionFromRow({ ...row, updated_at: withCheck.updatedAt }, keys)
    expect(mentor.titles[0].video?.checks?.[0].options.find(o => o.id === 'o_a')?.correct).toBe(true)
    expect(mentor.titles[0].video?.checks?.[0].points).toBe(5)

    const hero = sessionFromRow(row)
    expect(hero.titles[0].video?.checks?.[0].options.every(o => !o.correct)).toBe(true)
  })

  it('leaves a recording with no checkpoints exactly as it was', () => {
    const { row } = sessionToPayload(session)
    expect('checks' in storedVideo(row.content)).toBe(false)
  })
})

describe('tracks', () => {
  it('keeps a Work program in Work, and never sends the area for a Material one', () => {
    const base = { id: 'trk_1abc', name: 'P', skill: '', tier: 'T2', color: 'brand', blurb: '' } as const
    const work = trackToRow({ ...base, area: 'work' })
    expect(work.area).toBe('work')
    expect(trackFromRow(work).area).toBe('work')
    const material = trackToRow(base)
    expect('area' in material).toBe(false)
    expect(trackFromRow({ ...material, area: 'material' }).area).toBeUndefined()
  })

  it('reads a program saved before the Marketplace switch existed as listed', () => {
    const base = { id: 'trk_1abc', name: 'P', skill: '', tier: 'T2', color: 'brand', blurb: '' } as const
    /* Nothing said, so nothing changes: it was on sale and it stays on sale. */
    expect(trackToRow(base).listed).toBe(true)
    expect(trackFromRow(trackToRow(base)).listed).toBe(true)
    /* And a program taken off sale stays off it, both ways. */
    const off = trackToRow({ ...base, listed: false })
    expect(off.listed).toBe(false)
    expect(trackFromRow(off).listed).toBe(false)
  })
})

describe('loops', () => {
  it('maps index ↔ idx and never sends an index below 1', () => {
    const loop = loopFromRow({
      id: 'lp_1abc', track_id: 'trk_1abc', code: 'VID-L1', name: 'Course 1', idx: 1,
      start_date: '2026-09-01T09:00:00.000Z', end_date: '2026-11-01T09:00:00.000Z', status: 'running',
    })
    expect(loop.index).toBe(1)
    expect(loopToRow({ ...loop, index: 0 }).idx).toBe(1)
  })

  it('carries what the course is sold for, and never invents a price', () => {
    const row = {
      id: 'lp_1abc', track_id: 'trk_1abc', code: 'VID-L1', name: 'Course 1', idx: 1,
      start_date: '2026-09-01T09:00:00.000Z', end_date: '2026-11-01T09:00:00.000Z',
      status: 'running' as const,
    }
    /* No price of its own: sold with its program, never as free. */
    expect(loopFromRow(row).priceEgp).toBeNull()
    expect(loopFromRow(row).listed).toBe(true)

    const sold = loopFromRow({ ...row, listed: true, price_egp: 4500 })
    expect(sold.priceEgp).toBe(4500)
    expect(loopToRow(sold).price_egp).toBe(4500)
    expect(loopToRow({ ...sold, listed: false, priceEgp: null }).price_egp).toBeNull()
  })
})

/* The seven lists and the overview must survive the trip to the database:
   the course form used to write an overview that no column received, and
   every outline typed there was lost on the next reload. */
describe('loop lists round-trip', () => {
  it('keeps the values, the skills and the overview a course was given', () => {
    const loop = loopFromRow(loopToRow({
      id: 'lp_abc', code: 'VID-L1', trackId: 'trk_abc', name: 'Hooks', index: 1,
      startDate: '2026-09-16', endDate: '2026-11-18', status: 'planning', cohortIds: [],
      overview: '## Weeks 1–3\n- Reads a circuit diagram',
      technical: '- Ohm’s law', market: '- Skills in demand',
      technicalSkills: '- Soldering',
      skills: [{ name: 'Soldering', category: 'technical' }],
      priceEgp: 1500,
    }))
    expect(loop.overview).toBe('## Weeks 1–3\n- Reads a circuit diagram')
    expect(loop.technical).toBe('- Ohm’s law')
    expect(loop.market).toBe('- Skills in demand')
    expect(loop.technicalSkills).toBe('- Soldering')
    expect(loop.skills).toEqual([{ name: 'Soldering', category: 'technical' }])
    expect(loop.priceEgp).toBe(1500)
    /* a list never written reads as empty, not undefined — the same as a track's */
    expect(loop.personal).toBe('')
  })

  it('carries a course’s video through its row, and a blank one back to null', () => {
    const withVideo = loopFromRow(loopToRow({
      id: 'lp_vid', code: 'VID-L2', trackId: 'trk_abc', name: 'Robotics', index: 2,
      startDate: '2026-09-16', endDate: '2026-11-18', status: 'planning', cohortIds: [],
      videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
    }))
    expect(withVideo.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ')
    const withoutVideo = loopFromRow(loopToRow({
      id: 'lp_vid2', code: 'VID-L3', trackId: 'trk_abc', name: 'Robotics 2', index: 3,
      startDate: '2026-09-16', endDate: '2026-11-18', status: 'planning', cohortIds: [],
    }))
    expect(withoutVideo.videoUrl).toBeNull()
  })

  it('carries a program’s video through its row', () => {
    const t = trackFromRow(trackToRow({ ...demoTrack, videoUrl: 'https://vimeo.com/76979871' }))
    expect(t.videoUrl).toBe('https://vimeo.com/76979871')
  })

  it('carries a session’s lists through its payload', () => {
    const { row } = sessionToPayload({ ...session, technical: '- Reads a datasheet', skills: [{ name: 'Datasheets', category: 'technical' }] })
    expect(row.technical_values).toBe('- Reads a datasheet')
    expect(row.skills).toEqual([{ name: 'Datasheets', category: 'technical' }])
    const back = sessionFromRow(row, {})
    expect(back.technical).toBe('- Reads a datasheet')
    expect(back.personalSkills).toBe('')
  })

  it('carries a session’s video through its payload, and a blank one back to null', () => {
    const { row } = sessionToPayload({ ...session, videoUrl: 'https://youtu.be/abc123' })
    expect(row.video_url).toBe('https://youtu.be/abc123')
    expect(sessionFromRow(row, {}).videoUrl).toBe('https://youtu.be/abc123')
    const { row: blank } = sessionToPayload({ ...session })
    expect(blank.video_url).toBeNull()
  })
})
