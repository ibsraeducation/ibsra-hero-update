import { describe, expect, it } from 'vitest'
import {
  durationOk, LECTURE_MAX_MIN, LECTURE_MIN_MIN, LECTURE_STEP_MIN, SECTION_MIN_MIN, stepFor,
} from './schedule'

const sessionOk = (kind: 'lecture' | 'section', min: number) => durationOk(kind, 0, min)

describe('durationOk · lecture', () => {
  it('takes a lecture between half an hour and six', () => {
    expect(sessionOk('lecture', LECTURE_MIN_MIN)).toBe(true)
    expect(sessionOk('lecture', 120)).toBe(true)
    expect(sessionOk('lecture', LECTURE_MAX_MIN)).toBe(true)
  })

  it('refuses one too short to teach in, or longer than a day of them', () => {
    expect(sessionOk('lecture', LECTURE_MIN_MIN - 1)).toBe(false)
    expect(sessionOk('lecture', LECTURE_MAX_MIN + 1)).toBe(false)
  })
})

describe('durationOk · section', () => {
  it('has no ceiling — how long a stand-up runs is the admin’s call', () => {
    expect(sessionOk('section', SECTION_MIN_MIN)).toBe(true)
    expect(sessionOk('section', 60)).toBe(true)
    expect(sessionOk('section', 120)).toBe(true)
    expect(sessionOk('section', 180)).toBe(true)
    expect(sessionOk('section', 480)).toBe(true)
  })

  it('still refuses a sitting too short to put on a calendar', () => {
    expect(sessionOk('section', SECTION_MIN_MIN - 1)).toBe(false)
    expect(sessionOk('section', 0)).toBe(false)
  })
})

describe('the opening is not held to the session’s bounds', () => {
  it('lets a long stretch divide into legal sittings', () => {
    expect(sessionOk('section', 30)).toBe(true)
    expect(sessionOk('lecture', 120)).toBe(true)
  })
})

describe('stepFor', () => {
  it('moves by half hours when the admin’s range sits on them', () => {
    expect(stepFor(60, 120)).toBe(LECTURE_STEP_MIN)
    expect(stepFor(30, 360)).toBe(LECTURE_STEP_MIN)
  })

  it('drops to a finer notch so an odd end is still reachable', () => {
    expect(stepFor(45, 90)).toBe(5)
    expect(stepFor(60, 100)).toBe(5)
  })
})
