import { describe, expect, it } from 'vitest'
import { fullName, isNationalIdShape, readNationalId } from './nationalId'

/* A fixed "today", so an age never changes under the test on a birthday. */
const NOW = new Date('2026-09-24T00:00:00Z')

describe('readNationalId', () => {
  it('reads the birth date and the age out of a 2000s ID', () => {
    expect(readNationalId('31203082101534', NOW)).toEqual({ birthDate: '2012-03-08', age: 14 })
  })

  it('reads a 1900s one', () => {
    expect(readNationalId('28801152101534', NOW)).toEqual({ birthDate: '1988-01-15', age: 38 })
  })

  it('does not count a birthday that has not come round yet', () => {
    /* Born 25 September, the day after the fixed today. */
    expect(readNationalId('31209252101534', NOW)?.age).toBe(13)
    expect(readNationalId('31209242101534', NOW)?.age).toBe(14)
  })

  it('refuses anything that is not 14 digits', () => {
    expect(readNationalId('3120308210153', NOW)).toBeNull()
    expect(readNationalId('312030821015 4', NOW)).toBeNull()
    expect(readNationalId('3120308210153x', NOW)).toBeNull()
  })

  it('refuses a century digit nobody uses', () => {
    expect(readNationalId('91203082101534', NOW)).toBeNull()
  })

  it('refuses a day the month does not have', () => {
    expect(readNationalId('31202302101534', NOW)).toBeNull()
    expect(readNationalId('31213012101534', NOW)).toBeNull()
  })

  it('refuses a birthday in the future', () => {
    expect(readNationalId('43001012101534', NOW)).toBeNull()
  })

  it('takes the digits with spaces around them', () => {
    expect(readNationalId('  31203082101534  ', NOW)?.age).toBe(14)
  })
})

describe('isNationalIdShape', () => {
  it('is the shape the column stores', () => {
    expect(isNationalIdShape('31203082101534')).toBe(true)
    expect(isNationalIdShape('312')).toBe(false)
  })
})

describe('fullName', () => {
  it('joins the three names a family types', () => {
    expect(fullName('Ahmed', 'Sameh', 'Hassan')).toBe('Ahmed Sameh Hassan')
  })

  it('skips a middle name nobody filled in', () => {
    expect(fullName('Ahmed', '  ', 'Hassan')).toBe('Ahmed Hassan')
  })
})
