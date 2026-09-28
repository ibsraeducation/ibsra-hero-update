import { describe, expect, it } from 'vitest'
import { bothClocks, dayKey, hhmmToMin, minToHHMM } from './time'

describe('time', () => {
  it('round-trips minutes and HH:MM', () => {
    expect(minToHHMM(960)).toBe('16:00')
    expect(hhmmToMin('16:00')).toBe(960)
    expect(minToHHMM(0)).toBe('00:00')
    expect(minToHHMM(1439)).toBe('23:59')
  })

  it('buckets an instant into the calendar day it falls on in a given zone', () => {
    /* 2026-10-05 13:00 UTC is 16:00 in Cairo (UTC+3, in DST) — same day
       either side, so this only proves the format, not a crossing. */
    expect(dayKey('2026-10-05T13:00:00Z', 'Africa/Cairo')).toBe('2026-10-05')
    /* The same instant, read in a zone far enough west to be the day
       before — this is the case a naive string split would get wrong. */
    expect(dayKey('2026-10-05T02:00:00Z', 'America/Toronto')).toBe('2026-10-04')
  })

  it('collapses to one clock when the viewer is already in Cairo', () => {
    const iso = '2026-10-05T13:00:00Z'
    expect(bothClocks(iso, 'Africa/Cairo')).toBe('Mon 5 Oct · 16:00 Cairo')
    expect(bothClocks(iso, 'America/Toronto')).toBe('Mon 5 Oct · 16:00 Cairo · 09:00 your time')
  })
})
