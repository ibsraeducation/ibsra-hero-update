import { describe, expect, it } from 'vitest'
import type { Loop, Session, Track } from '@/lib/types'
import { diffContent, diffDone, tooManyRemovals } from './diff'

const track = (id: string): Track => ({ id, name: id, skill: '', tier: 'T2', color: 'brand', blurb: '', technical: '', skills: [] })
const loop = (id: string, trackId = 'trk_1'): Loop => ({
  id, code: id, trackId, name: id, index: 1, startDate: '', endDate: '', status: 'planning', cohortIds: [],
})
const session = (id: string, loopId: string): Session => ({
  id, code: id, loopId, name: id, type: 'recorded', status: 'draft', order: 0, instructorId: null,
  scheduledAt: null, durationMin: 0, titles: [], createdAt: '', updatedAt: '',
})

describe('diffContent', () => {
  const t1 = track('trk_1')
  const l1 = loop('lp_1')
  const l2 = loop('lp_2')
  const s1 = session('ses_1', 'lp_1')
  const s2 = session('ses_2', 'lp_2')
  const prev = { tracks: [t1], loops: [l1, l2], sessions: [s1, s2] }

  it('reports nothing when references are unchanged', () => {
    const d = diffContent(prev, { ...prev, sessions: [...prev.sessions] })
    expect(d.sessions.upsert).toEqual([])
    expect(d.sessions.remove).toEqual([])
  })

  it('treats a replaced object as changed and a new one as added', () => {
    const s1b = { ...s1, name: 'renamed' }
    const s3 = session('ses_3', 'lp_1')
    const d = diffContent(prev, { ...prev, sessions: [s1b, s2, s3] })
    expect(d.sessions.upsert.map(s => s.id)).toEqual(['ses_1', 'ses_3'])
  })

  it('leaves the sessions of a deleted course to the database cascade', () => {
    const d = diffContent(prev, { tracks: [t1], loops: [l1], sessions: [s1] })
    expect(d.loops.remove).toEqual(['lp_2'])
    expect(d.sessions.remove).toEqual([])
  })

  it('flags a change that removes far too much at once', () => {
    const many = Array.from({ length: 7 }, (_, i) => session(`ses_x${i}`, 'lp_1'))
    const d = diffContent({ ...prev, sessions: many }, { ...prev, sessions: [] })
    expect(tooManyRemovals(d)).toBe(true)
  })

  it('still sends the courses of a deleted program — the database restricts', () => {
    const d = diffContent(prev, { tracks: [], loops: [], sessions: [] })
    expect(d.tracks.remove).toEqual(['trk_1'])
    expect(d.loops.remove).toEqual(['lp_1', 'lp_2'])
    expect(d.loopsOfRemovedTracks).toEqual(['lp_1', 'lp_2'])
    expect(d.sessions.remove).toEqual([])
  })

  it('lets a program of any size go — it is one delete, not many', () => {
    const loops = Array.from({ length: 9 }, (_, i) => loop(`lp_y${i}`))
    const sessions = loops.map((l, i) => session(`ses_y${i}`, l.id))
    const d = diffContent({ tracks: [t1], loops, sessions }, { tracks: [], loops: [], sessions: [] })
    expect(tooManyRemovals(d)).toBe(false)
  })

  it('counts courses removed on their own, not with their program', () => {
    const loops = Array.from({ length: 4 }, (_, i) => loop(`lp_z${i}`))
    const d = diffContent({ tracks: [t1], loops, sessions: [] }, { tracks: [t1], loops: [], sessions: [] })
    expect(d.loopsOfRemovedTracks).toEqual([])
    expect(tooManyRemovals(d)).toBe(true)
  })

  it('still refuses two programs at once', () => {
    const t2 = track('trk_2')
    const d = diffContent({ tracks: [t1, t2], loops: [], sessions: [] }, { tracks: [], loops: [], sessions: [] })
    expect(tooManyRemovals(d)).toBe(true)
  })
})

describe('diffDone', () => {
  it('lists ticked and unticked steps per session', () => {
    const prev = { ses_1: ['v:a', 't:b'] }
    const next = { ses_1: ['v:a', 'm:c'], ses_2: ['v:z'] }
    const d = diffDone(prev, next)
    expect(d.add).toEqual([{ sessionId: 'ses_1', key: 'm:c' }, { sessionId: 'ses_2', key: 'v:z' }])
    expect(d.remove).toEqual([{ sessionId: 'ses_1', key: 't:b' }])
  })
})
