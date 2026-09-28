import { describe, expect, it } from 'vitest'
import { whatsappLink } from './format'

describe('whatsappLink', () => {
  it('keeps only the digits of an international number', () => {
    expect(whatsappLink('+20 100 123 4567', 'hi')).toBe('https://wa.me/201001234567?text=hi')
    expect(whatsappLink('0020-100-123-4567', 'hi')).toBe('https://wa.me/201001234567?text=hi')
  })

  it('encodes the message', () => {
    expect(whatsappLink('201001234567', 'Sunday · 2 hours?'))
      .toBe('https://wa.me/201001234567?text=Sunday%20%C2%B7%202%20hours%3F')
  })

  it('gives nothing when no usable number is set', () => {
    expect(whatsappLink('', 'hi')).toBeNull()
    expect(whatsappLink(null, 'hi')).toBeNull()
    expect(whatsappLink('12', 'hi')).toBeNull()
  })
})
