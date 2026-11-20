import { describe, expect, it } from 'vitest'
import { generateCode, normalizeCode, promoLive, validCode } from './promo'

describe('promo codes', () => {
  it('writes a code in capitals with the spaces trimmed', () => {
    expect(normalizeCode('  free-2026 ')).toBe('FREE-2026')
  })

  it('accepts letters, digits, dash and underscore, 3 to 32 long', () => {
    expect(validCode('ab')).toBe(false)
    expect(validCode('free 2026')).toBe(false)
    expect(validCode('free_2026')).toBe(true)
  })

  it('generates a code it would itself accept, without look-alike characters', () => {
    const c = generateCode()
    expect(c).toHaveLength(8)
    expect(validCode(c)).toBe(true)
    expect(c).not.toMatch(/[01OI]/)
  })

  it('is live when on and not expired; never expiring is always live', () => {
    const now = Date.parse('2026-11-02T12:00:00Z')
    expect(promoLive({ active: true, expires_at: null }, now)).toBe(true)
    expect(promoLive({ active: true, expires_at: '2026-11-03T00:00:00Z' }, now)).toBe(true)
    expect(promoLive({ active: true, expires_at: '2026-11-01T00:00:00Z' }, now)).toBe(false)
    expect(promoLive({ active: false, expires_at: null }, now)).toBe(false)
  })
})
