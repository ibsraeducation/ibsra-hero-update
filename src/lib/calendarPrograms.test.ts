import { describe, expect, it } from 'vitest'
import { pickProgram, programsOf, trackOfLoop } from './calendarPrograms'
import type { DB } from './types'

const db = {
  tracks: [{ id: 'trk_a', name: 'Robotics' }, { id: 'trk_b', name: 'Discovery' }],
  loops: [
    { id: 'lp_1', trackId: 'trk_a' },
    { id: 'lp_2', trackId: 'trk_a' },
    { id: 'lp_3', trackId: 'trk_b' },
  ],
} as unknown as DB

describe('trackOfLoop', () => {
  it('finds the program behind a course', () => {
    expect(trackOfLoop(db, 'lp_3')).toBe('trk_b')
  })

  it('is null for a course that is gone', () => {
    expect(trackOfLoop(db, 'lp_gone')).toBeNull()
  })
})

describe('programsOf', () => {
  it('counts the sittings under each program, busiest first', () => {
    const rows = [{ loop_id: 'lp_1' }, { loop_id: 'lp_3' }, { loop_id: 'lp_2' }, { loop_id: 'lp_1' }]
    expect(programsOf(rows, db)).toEqual([
      { id: 'trk_a', name: 'Robotics', count: 3 },
      { id: 'trk_b', name: 'Discovery', count: 1 },
    ])
  })

  it('keeps sittings whose course is gone, under one entry', () => {
    expect(programsOf([{ loop_id: 'lp_gone' }], db)).toEqual([
      { id: '', name: 'Other sittings', count: 1 },
    ])
  })

  it('is empty when nothing is booked', () => {
    expect(programsOf([], db)).toEqual([])
  })

  it('breaks a tie by name', () => {
    const rows = [{ loop_id: 'lp_1' }, { loop_id: 'lp_3' }]
    expect(programsOf(rows, db).map(s => s.name)).toEqual(['Discovery', 'Robotics'])
  })
})

describe('pickProgram', () => {
  const slices = programsOf([{ loop_id: 'lp_1' }, { loop_id: 'lp_1' }, { loop_id: 'lp_3' }], db)

  it('opens on the busiest program', () => {
    expect(pickProgram(slices, '')).toBe('trk_a')
  })

  it('keeps the one already chosen', () => {
    expect(pickProgram(slices, 'trk_b')).toBe('trk_b')
  })

  it('moves off a program that has nothing left', () => {
    expect(pickProgram(slices, 'trk_gone')).toBe('trk_a')
  })

  it('is empty when nothing is booked', () => {
    expect(pickProgram([], 'trk_a')).toBe('')
  })
})
