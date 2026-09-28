import { describe, expect, it } from 'vitest'
import { slotCount, slotLength, slotsOf } from './slots'

/** 01:00 and 03:00 as minutes from midnight. */
const w = (start: number, end: number, slot?: number | null) =>
  ({ start_min: start, end_min: end, slot_min: slot })

describe('slotsOf', () => {
  it('splits 01:00–03:00 at 60 into two sittings', () => {
    expect(slotsOf(w(60, 180, 60))).toEqual([
      { startMin: 60, endMin: 120 },
      { startMin: 120, endMin: 180 },
    ])
  })

  it('splits an afternoon at 45 minutes', () => {
    const out = slotsOf(w(960, 1140, 45))
    expect(out).toHaveLength(4)
    expect(out[0]).toEqual({ startMin: 960, endMin: 1005 })
    expect(out[3]).toEqual({ startMin: 1095, endMin: 1140 })
  })

  it('drops a remainder too short to hold a sitting', () => {
    /* 01:00–03:30 at 60 is two slots; the last half hour is not a lesson. */
    const out = slotsOf(w(60, 210, 60))
    expect(out).toEqual([
      { startMin: 60, endMin: 120 },
      { startMin: 120, endMin: 180 },
    ])
  })

  it('is the whole opening when no length is set', () => {
    expect(slotsOf(w(960, 1080, null))).toEqual([{ startMin: 960, endMin: 1080 }])
    expect(slotsOf(w(960, 1080))).toEqual([{ startMin: 960, endMin: 1080 }])
  })

  it('treats a zero length as no length rather than dividing by it', () => {
    expect(slotsOf(w(960, 1080, 0))).toEqual([{ startMin: 960, endMin: 1080 }])
  })

  it('is one sitting when the length fills the opening exactly', () => {
    expect(slotsOf(w(960, 1080, 120))).toEqual([{ startMin: 960, endMin: 1080 }])
  })

  it('is empty when the length does not fit at all', () => {
    expect(slotsOf(w(960, 1000, 60))).toEqual([])
  })

  it('is empty when the opening is inverted', () => {
    expect(slotsOf(w(1080, 960, 60))).toEqual([])
  })

  it('stops at a sane ceiling rather than a slot a minute', () => {
    expect(slotsOf(w(0, 1440, 1))).toHaveLength(96)
  })

  it('leaves no gap between one sitting and the next', () => {
    const out = slotsOf(w(600, 900, 50))
    expect(out).toHaveLength(6)
    for (let i = 1; i < out.length; i++) expect(out[i].startMin).toBe(out[i - 1].endMin)
  })
})

describe('slotLength', () => {
  it('is the set length, or the whole opening', () => {
    expect(slotLength(w(60, 180, 60))).toBe(60)
    expect(slotLength(w(60, 180, null))).toBe(120)
  })

  it('is never zero, however the window is shaped', () => {
    expect(slotLength(w(180, 60, 0))).toBeGreaterThan(0)
  })
})

describe('slotCount', () => {
  it('counts what the family will be offered', () => {
    expect(slotCount(w(60, 180, 60))).toBe(2)
    expect(slotCount(w(540, 1020, 30))).toBe(16)
  })
})
