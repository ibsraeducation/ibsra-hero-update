import { describe, expect, it } from 'vitest'
import { courseSessionKind, sessionDiffers, sessionKind } from './types'
import type { Loop, Session } from './types'

/* A course says what its sessions are for; a session only speaks up when it
   disagrees. Everything here is about that one asymmetry — because "unset"
   and "set to the same thing the course says" look identical on screen and
   must not behave identically the day the course changes its mind. */

type L = Pick<Loop, 'kind'>
type S = Pick<Session, 'kind'>

const training: L = { kind: 'training' }
const work: L = { kind: 'work' }
/* A course saved before the two kinds existed. */
const old: L = {}

describe('courseSessionKind', () => {
  it('reads a training course as teaching sessions', () => {
    expect(courseSessionKind(training)).toBe('teaching')
  })

  it('reads a work course as work sessions', () => {
    expect(courseSessionKind(work)).toBe('work')
  })

  it('reads a course saved before the kinds existed as teaching', () => {
    expect(courseSessionKind(old)).toBe('teaching')
    expect(courseSessionKind(undefined)).toBe('teaching')
  })
})

describe('sessionKind', () => {
  it('follows the course when the session says nothing', () => {
    expect(sessionKind({}, training)).toBe('teaching')
    expect(sessionKind({}, work)).toBe('work')
  })

  it('takes the session at its word when it says something', () => {
    expect(sessionKind({ kind: 'work' }, training)).toBe('work')
    expect(sessionKind({ kind: 'teaching' }, work)).toBe('teaching')
  })

  /* The hybrid, stated once: one course, both kinds of session inside it. */
  it('lets one course hold both kinds', () => {
    const inside: S[] = [{}, {}, { kind: 'work' }, {}]
    expect(inside.map(s => sessionKind(s, training)))
      .toEqual(['teaching', 'teaching', 'work', 'teaching'])
  })

  /* The reason unset is not stored as 'teaching': these two sessions read
     the same inside a training course and part company the moment the
     course becomes a work course. */
  it('carries a following session when the course changes, and leaves a set one', () => {
    const follows: S = {}
    const pinned: S = { kind: 'teaching' }
    expect(sessionKind(follows, training)).toBe(sessionKind(pinned, training))
    expect(sessionKind(follows, work)).toBe('work')
    expect(sessionKind(pinned, work)).toBe('teaching')
  })
})

describe('sessionDiffers', () => {
  it('is false for a session that follows its course', () => {
    expect(sessionDiffers({}, training)).toBe(false)
    expect(sessionDiffers({}, work)).toBe(false)
  })

  /* Badging this one would put "Teaching" on every card in a training
     course, which says nothing the course has not already said. */
  it('is false for a session that picked what its course already said', () => {
    expect(sessionDiffers({ kind: 'teaching' }, training)).toBe(false)
    expect(sessionDiffers({ kind: 'work' }, work)).toBe(false)
  })

  it('is true only for the odd one out', () => {
    expect(sessionDiffers({ kind: 'work' }, training)).toBe(true)
    expect(sessionDiffers({ kind: 'teaching' }, work)).toBe(true)
  })
})
