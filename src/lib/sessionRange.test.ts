import { describe, expect, it } from 'vitest'
import { lengthOffered, sessionRange, slotsOf } from './slots'
import { lengthRange } from './enrolTimes'

const win = (
  kind: 'lecture' | 'section', weekday: number | null,
  start: number, end: number, lo: number, hi?: number,
) => ({
  id: `${kind}-${weekday}-${start}-${lo}`,
  kind, weekday, start_min: start, end_min: end, slot_min: lo, slot_max_min: hi ?? null,
})

describe('sessionRange', () => {
  it('reads a window with no longest as one fixed length', () => {
    expect(sessionRange({ start_min: 60, end_min: 180, slot_min: 120 })).toEqual({ min: 120, max: 120 })
  })

  it('spans the two when the admin set a range', () => {
    expect(sessionRange({ start_min: 60, end_min: 300, slot_min: 60, slot_max_min: 180 }))
      .toEqual({ min: 60, max: 180 })
  })

  it('falls back to the whole opening when no length was ever set', () => {
    expect(sessionRange({ start_min: 60, end_min: 180 })).toEqual({ min: 120, max: 120 })
  })
})

describe('slotsOf honours the range', () => {
  const w = { start_min: 60, end_min: 300, slot_min: 60, slot_max_min: 120 }

  it('divides by a length the opening offers', () => {
    expect(slotsOf(w, 120)).toHaveLength(2)
    expect(slotsOf(w, 60)).toHaveLength(4)
  })

  it('offers nothing for a length outside the range', () => {
    expect(slotsOf(w, 30)).toEqual([])
    expect(slotsOf(w, 180)).toEqual([])
    expect(lengthOffered(w, 180)).toBe(false)
  })

  it('still divides by the shortest when the family names none', () => {
    expect(slotsOf(w)).toHaveLength(4)
  })
})

describe('lengthRange', () => {
  it('spans what the one day offers', () => {
    expect(lengthRange([win('lecture', 0, 60, 300, 60, 120)], 'lecture', [0]))
      .toEqual({ min: 60, max: 120 })
  })

  it('keeps only the lengths that run on every day picked', () => {
    const ws = [win('lecture', 0, 60, 300, 60, 120), win('lecture', 2, 60, 300, 90, 180)]
    expect(lengthRange(ws, 'lecture', [0, 2])).toEqual({ min: 90, max: 120 })
  })

  it('widens a day to the union of its own openings', () => {
    const ws = [win('lecture', 0, 60, 300, 60, 90), win('lecture', 0, 600, 900, 120, 150)]
    expect(lengthRange(ws, 'lecture', [0])).toEqual({ min: 60, max: 150 })
  })

  it('gives nothing when no single length runs on both days', () => {
    const ws = [win('lecture', 0, 60, 300, 90, 120), win('lecture', 2, 60, 300, 30, 60)]
    expect(lengthRange(ws, 'lecture', [0, 2])).toBeNull()
  })

  it('gives nothing when a day has no opening at all', () => {
    expect(lengthRange([win('lecture', 0, 60, 300, 60)], 'lecture', [0, 3])).toBeNull()
  })

  it('takes a day-less section on whatever day is asked', () => {
    expect(lengthRange([win('section', null, 60, 300, 45, 90)], 'section', [1, 3]))
      .toEqual({ min: 45, max: 90 })
  })
})
