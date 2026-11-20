import { describe, expect, it } from 'vitest'
import { ANYWHERE, batchOpenTo, inViewerRegion, regionLabel, regionOfZone } from './region'

describe('regionOfZone', () => {
  it('reads the country off a clock', () => {
    expect(regionOfZone('Africa/Cairo')).toBe('EG')
    expect(regionOfZone('America/Toronto')).toBe('CA')
    expect(regionOfZone('America/Vancouver')).toBe('CA')
    expect(regionOfZone('America/New_York')).toBe('US')
  })

  it('says nothing rather than guessing', () => {
    expect(regionOfZone('Europe/Kyiv')).toBeNull()
    expect(regionOfZone('')).toBeNull()
    expect(regionOfZone(undefined)).toBeNull()
  })
})

describe('batchOpenTo', () => {
  it('offers an everywhere batch to everyone, named or not', () => {
    expect(batchOpenTo(ANYWHERE, 'CA')).toBe(true)
    expect(batchOpenTo(ANYWHERE, 'EG')).toBe(true)
    expect(batchOpenTo(ANYWHERE, 'SA')).toBe(true)
    expect(batchOpenTo(null, null)).toBe(true)
    expect(batchOpenTo(undefined, 'EG')).toBe(true)
  })

  it('keeps a Canada batch for Canada', () => {
    expect(batchOpenTo('CA', 'CA')).toBe(true)
    expect(batchOpenTo('CA', 'EG')).toBe(false)
    /* A clock we do not know is not Canada. */
    expect(batchOpenTo('CA', null)).toBe(false)
  })
})

describe('inViewerRegion', () => {
  const regions = new Map([['b_ca', 'CA'], ['b_eg', 'EG'], ['b_any', ANYWHERE]])
  const windows = [
    { id: 'w1', batch_id: 'b_ca' },
    { id: 'w2', batch_id: 'b_eg' },
    { id: 'w3', batch_id: 'b_any' },
    { id: 'w4', batch_id: null },
  ]

  it('shows a family in Canada the Canada hours and the open ones', () => {
    expect(inViewerRegion(windows, regions, 'CA').map(w => w.id)).toEqual(['w1', 'w3', 'w4'])
  })

  it('shows a family in Egypt theirs instead', () => {
    expect(inViewerRegion(windows, regions, 'EG').map(w => w.id)).toEqual(['w2', 'w3', 'w4'])
  })

  it('falls back to what belongs to nobody when the clock is unknown', () => {
    expect(inViewerRegion(windows, regions, null).map(w => w.id)).toEqual(['w3', 'w4'])
  })

  it('treats a batch it has never heard of as open to all', () => {
    expect(inViewerRegion([{ id: 'w5', batch_id: 'gone' }], regions, 'EG').map(w => w.id))
      .toEqual(['w5'])
  })
})

describe('regionLabel', () => {
  it('names a region, and calls no region Everywhere', () => {
    expect(regionLabel('CA')).toBe('Canada')
    expect(regionLabel(ANYWHERE)).toBe('Everywhere')
    expect(regionLabel(null)).toBe('Everywhere')
  })
})
