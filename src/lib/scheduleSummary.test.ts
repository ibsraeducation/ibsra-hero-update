import { describe, expect, it } from 'vitest'
import { summarize, weekdayIn, type SummaryItem } from './scheduleSummary'
import type { DB } from './types'

const db = {
  tracks: [{ id: 'trk_a', name: 'Robotics' }, { id: 'trk_b', name: 'Discovery' }],
  loops: [
    { id: 'lp_1', trackId: 'trk_a', name: 'Loop 1', code: 'RB-1' },
    { id: 'lp_2', trackId: 'trk_b', name: 'Loop 2', code: 'DS-2' },
  ],
} as unknown as DB

const TZ = 'Africa/Cairo'

/** A booked sitting. Cairo is UTC+3 in October, so 13:00Z reads 16:00. */
const sat = (day: number, hour: number, over: Partial<SummaryItem> = {}): SummaryItem => ({
  startsAt: `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`,
  durationMin: 120,
  kind: 'lecture',
  loopId: 'lp_1',
  studentId: 'st_1',
  ...over,
})

describe('weekdayIn', () => {
  it('reads the day in the given zone, Sunday first', () => {
    expect(weekdayIn('2026-10-04T13:00:00Z', TZ)).toBe(0)
    expect(weekdayIn('2026-10-06T13:00:00Z', TZ)).toBe(2)
  })

  it('can land on a different day than UTC does', () => {
    // 22:00 UTC on Sunday is already Monday 01:00 in Dubai.
    expect(weekdayIn('2026-10-04T22:00:00Z', 'Asia/Dubai')).toBe(1)
  })
})

describe('summarize', () => {
  it('folds a weekly lecture into one row over its run', () => {
    const [p] = summarize([sat(4, 13), sat(11, 13), sat(18, 13)], db, TZ)
    expect(p.name).toBe('Robotics')
    expect(p.courses[0].rows).toHaveLength(1)
    expect(p.courses[0].rows[0]).toMatchObject({
      weekday: 0, from: '16:00', to: '18:00', sittings: 3, heroes: 1, open: false,
    })
    expect(p.courses[0].rows[0].firstAt).toBe('2026-10-04T13:00:00Z')
    expect(p.courses[0].rows[0].lastAt).toBe('2026-10-18T13:00:00Z')
  })

  it('counts a sitting once however many heroes are in it', () => {
    const rows = summarize(
      [sat(4, 13), sat(4, 13, { studentId: 'st_2' }), sat(11, 13, { studentId: 'st_2' })],
      db, TZ)[0].courses[0].rows
    expect(rows[0]).toMatchObject({ sittings: 2, heroes: 2 })
  })

  it('keeps two weekly hours apart', () => {
    const rows = summarize([sat(4, 13), sat(6, 15)], db, TZ)[0].courses[0].rows
    expect(rows.map(r => [r.weekday, r.from])).toEqual([[0, '16:00'], [2, '18:00']])
  })

  it('keeps lectures and sections apart at the same hour', () => {
    const rows = summarize(
      [sat(4, 13), sat(4, 13, { kind: 'section', durationMin: 120 })], db, TZ)[0].courses[0].rows
    expect(rows.map(r => r.kind)).toEqual(['lecture', 'section'])
  })

  it('splits programs, busiest first, and names each course', () => {
    const out = summarize([sat(4, 13), sat(11, 13), sat(6, 15, { loopId: 'lp_2' })], db, TZ)
    expect(out.map(p => [p.name, p.sittings])).toEqual([['Robotics', 2], ['Discovery', 1]])
    expect(out[0].courses[0]).toMatchObject({ name: 'Loop 1', code: 'RB-1' })
  })

  it('gathers sittings whose course is gone under one entry', () => {
    const [p] = summarize([sat(4, 13, { loopId: 'lp_gone' })], db, TZ)
    expect(p.name).toBe('Other sittings')
    expect(p.courses[0].name).toBe('Other sittings')
  })

  it('totals the free seats of an open window and counts no heroes', () => {
    const open = (day: number): SummaryItem => ({
      ...sat(day, 13), studentId: undefined, open: true, windowId: 'w_1', free: 3,
    })
    const rows = summarize([open(4), open(11)], db, TZ)[0].courses[0].rows
    expect(rows[0]).toMatchObject({ open: true, sittings: 2, heroes: 0, free: 6 })
  })

  it('keeps two windows offering the same hour apart', () => {
    const open = (windowId: string): SummaryItem => ({
      ...sat(4, 13), studentId: undefined, open: true, windowId, free: 2,
    })
    expect(summarize([open('w_1'), open('w_2')], db, TZ)[0].courses[0].rows).toHaveLength(2)
  })

  it('leaves open rows out of the sitting counts a program is ranked by', () => {
    const out = summarize([
      sat(4, 13, { loopId: 'lp_2' }),
      { ...sat(4, 13), studentId: undefined, open: true, windowId: 'w_1', free: 4 },
      { ...sat(11, 13), studentId: undefined, open: true, windowId: 'w_1', free: 4 },
    ], db, TZ)
    expect(out.map(p => p.name)).toEqual(['Discovery', 'Robotics'])
    expect(out[1].sittings).toBe(0)
  })

  it('is empty when nothing is scheduled', () => {
    expect(summarize([], db, TZ)).toEqual([])
  })
})
