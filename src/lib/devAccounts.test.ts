import { describe, expect, it } from 'vitest'
import { parseDevAccount } from './devAccounts'

describe('parseDevAccount', () => {
  it('reads an email and a password', () => {
    expect(parseDevAccount('parent', 'a@b.com:secret1234'))
      .toEqual({ role: 'parent', email: 'a@b.com', password: 'secret1234' })
  })

  it('splits on the first colon, so a password may contain one', () => {
    expect(parseDevAccount('admin', 'a@b.com:pa:ss:word')?.password).toBe('pa:ss:word')
  })

  it('trims spaces around the email but never the password', () => {
    const a = parseDevAccount('student', '  a@b.com : pw ')
    expect(a?.email).toBe('a@b.com')
    expect(a?.password).toBe(' pw ')
  })

  it('is null for anything that is not a pair', () => {
    expect(parseDevAccount('admin', undefined)).toBeNull()
    expect(parseDevAccount('admin', '')).toBeNull()
    expect(parseDevAccount('admin', 'a@b.com')).toBeNull()
    expect(parseDevAccount('admin', 'a@b.com:')).toBeNull()
    expect(parseDevAccount('admin', ':pw')).toBeNull()
  })
})
