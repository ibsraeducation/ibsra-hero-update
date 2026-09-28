import { describe, expect, it } from 'vitest'
import {
  clampCloseBefore, closesAt, countdown, isClosed, isLive, parseDay, soonest, subscriptionState,
  worst,
} from './billing'

const at = (iso: string) => parseDay(iso).getTime()

describe('closesAt', () => {
  it('shuts the given number of days ahead of the paid-through date', () => {
    // paid up to the 26th, closing five days early → locked out on the 21st
    const closes = closesAt('2026-12-26', 5)
    expect(closes.getFullYear()).toBe(2026)
    expect(closes.getMonth()).toBe(11)
    expect(closes.getDate()).toBe(21)
    expect(closes.getHours()).toBe(0)
  })

  it('shuts on the date itself when the rule is zero days', () => {
    expect(closesAt('2026-12-26', 0).getDate()).toBe(26)
  })

  it('crosses a month and a year end', () => {
    const closes = closesAt('2027-01-03', 5)
    expect(closes.getFullYear()).toBe(2026)
    expect(closes.getMonth()).toBe(11)
    expect(closes.getDate()).toBe(29)
  })

  it('keeps the rule inside 0–60 days', () => {
    expect(clampCloseBefore(-4)).toBe(0)
    expect(clampCloseBefore(900)).toBe(60)
    expect(clampCloseBefore(Number.NaN)).toBe(5)
  })
})

describe('countdown', () => {
  // paid up to 26 Nov, closing 5 days early → shuts as 21 Nov begins
  const closes = closesAt('2026-11-26', 5)
  const on = (d: number, h = 12) => new Date(2026, 10, d, h).getTime()

  it('counts whole days while there is time', () => {
    expect(countdown(closes, on(17)).label).toBe('3 days left')
    expect(countdown(closes, on(12)).label).toBe('8 days left')
  })

  it('stays quiet over a week out, warns inside one, shouts inside two days', () => {
    expect(countdown(closes, on(12)).urgency).toBe('calm')
    expect(countdown(closes, on(16)).urgency).toBe('soon')
    expect(countdown(closes, on(19)).urgency).toBe('urgent')
  })

  it('switches to hours in the last two days', () => {
    expect(countdown(closes, on(20, 10)).label).toBe('14 hours left')
    expect(countdown(closes, on(20, 23)).label).toBe('1 hour left')
    expect(countdown(closes, new Date(2026, 10, 20, 23, 30).getTime()).label).toBe('30 min left')
  })

  it('is closed once the day has turned', () => {
    const after = countdown(closes, new Date(2026, 10, 21, 0, 30).getTime())
    expect(after.urgency).toBe('closed')
    expect(after.label).toBe('Access closed')
  })
})

describe('isClosed', () => {
  it('never shuts a child who has no subscription at all', () => {
    expect(isClosed(null, 5, at('2030-01-01'))).toBe(false)
  })

  it('shuts five days before the date they paid up to', () => {
    expect(isClosed('2026-11-26', 5, new Date(2026, 10, 20, 23).getTime())).toBe(false)
    expect(isClosed('2026-11-26', 5, new Date(2026, 10, 21, 1).getTime())).toBe(true)
  })
})

describe('soonest', () => {
  it('picks the child whose door shuts first and ignores the unpaid ones', () => {
    const rows = [
      { id: 'a', paidThrough: '2026-12-20' },
      { id: 'b', paidThrough: '2026-11-02' },
      { id: 'c', paidThrough: null },
    ]
    expect(soonest(rows, 5)?.row.id).toBe('b')
    expect(soonest([{ id: 'c', paidThrough: null }], 5)).toBeNull()
  })
})

describe('isLive', () => {
  it('is false for a child who has never paid', () => {
    expect(isLive(null, at('2030-01-01'))).toBe(false)
  })

  it('is true on the paid-through date itself, and the day after is false', () => {
    expect(isLive('2026-11-26', at('2026-11-26'))).toBe(true)
    expect(isLive('2026-11-26', at('2026-11-27'))).toBe(false)
  })

  it('does not use the closing-early rule — it is the raw paid-through date', () => {
    // unlike isClosed, isLive has no closeBefore: it is live right up to the
    // paid-through day even while the platform has already shut early.
    expect(isLive('2026-11-26', at('2026-11-22'))).toBe(true)
  })
})

describe('subscriptionState', () => {
  it('is none with no subscription', () => {
    expect(subscriptionState(null, 5, at('2026-11-22')).state).toBe('none')
  })

  it('is open before closing, closed after', () => {
    expect(subscriptionState('2026-11-26', 5, at('2026-11-20')).state).toBe('open')
    expect(subscriptionState('2026-11-26', 5, at('2026-11-21')).state).toBe('closed')
  })
})

describe('worst', () => {
  const now = at('2026-11-22')

  it('puts a never-paid child ahead of one merely closed', () => {
    const rows = [
      { id: 'a', paidThrough: '2026-12-20' }, // open
      { id: 'b', paidThrough: null },          // none — worst
      { id: 'c', paidThrough: '2026-11-02' },  // closed
    ]
    expect(worst(rows, 5, now)?.row.id).toBe('b')
  })

  it('puts closed ahead of open when nobody is unpaid', () => {
    const rows = [
      { id: 'a', paidThrough: '2026-12-20' }, // open
      { id: 'c', paidThrough: '2026-11-02' }, // closed
    ]
    expect(worst(rows, 5, now)?.row.id).toBe('c')
  })

  it('picks the soonest-closing child among several open ones', () => {
    const rows = [
      { id: 'a', paidThrough: '2026-12-20' },
      { id: 'b', paidThrough: '2026-12-01' },
    ]
    expect(worst(rows, 5, now)?.row.id).toBe('b')
  })

  it('is null with no children', () => {
    expect(worst([], 5, now)).toBeNull()
  })
})
