import { describe, expect, it } from 'vitest'
import { byStage, comesAfter, derivedStage, leadsTo, programEdges, stageOf } from './programs'
import type { Track } from './types'

/* The path is the admin's own connections: which column a program sits in
   and which lines are drawn both come from `nextIds` and nothing else. */

type T = Pick<Track, 'id' | 'stage' | 'nextIds'>
const track = (id: string, nextIds: string[] = [], stage?: Track['stage']): T =>
  ({ id, nextIds, stage })

/* discovery → three specializations → business school */
const DISCOVERY = track('discovery', ['electronics', 'robotics', 'software'])
const ELECTRONICS = track('electronics', ['school'])
const ROBOTICS = track('robotics', ['school'])
const SOFTWARE = track('software', ['school'])
const SCHOOL = track('school')
const ALL: T[] = [DISCOVERY, ELECTRONICS, ROBOTICS, SOFTWARE, SCHOOL]

describe('leadsTo / comesAfter', () => {
  it('reads the connections off the program', () => {
    expect(leadsTo(DISCOVERY, ALL)).toEqual(['electronics', 'robotics', 'software'])
    expect(comesAfter('school', ALL)).toEqual(['electronics', 'robotics', 'software'])
  })

  it('ignores a connection to a program that has been deleted', () => {
    const orphan = track('orphan', ['gone', 'school'])
    expect(leadsTo(orphan, [...ALL, orphan])).toEqual(['school'])
  })
})

describe('programEdges', () => {
  it('returns one line per connection, both ends present', () => {
    expect(programEdges(ALL)).toHaveLength(6)
  })

  it('drops a dangling end and a program pointing at itself', () => {
    const odd = track('odd', ['odd', 'nowhere'])
    expect(programEdges([odd])).toEqual([])
  })
})

describe('derivedStage', () => {
  it('calls the program nothing leads into, that leads on, the foundation', () => {
    expect(derivedStage(DISCOVERY, ALL)).toBe('foundation')
  })

  it('calls the program that is led into, and leads nowhere, the capstone', () => {
    expect(derivedStage(SCHOOL, ALL)).toBe('capstone')
  })

  it('calls everything wired at both ends a specialization', () => {
    expect(derivedStage(ELECTRONICS, ALL)).toBe('specialization')
    expect(derivedStage(ROBOTICS, ALL)).toBe('specialization')
  })

  it('never claims an unconnected program is both ends of the path', () => {
    const fresh = track('fresh')
    expect(derivedStage(fresh, [...ALL, fresh])).toBe('specialization')
  })

  it('moves a program between columns as soon as a line is drawn', () => {
    const lone = track('lone')
    const before = [...ALL, lone]
    expect(derivedStage(lone, before)).toBe('specialization')
    const wired = track('lone', ['electronics'])
    expect(derivedStage(wired, [...ALL, wired])).toBe('foundation')
  })
})

describe('stageOf', () => {
  it('reads the connections when the program says nothing', () => {
    expect(stageOf(SCHOOL, ALL)).toBe('capstone')
  })

  it("lets the program's own answer win", () => {
    const forced = track('school', [], 'foundation')
    expect(stageOf(forced, [...ALL, forced])).toBe('foundation')
  })
})

describe('byStage', () => {
  const grouped = byStage(ALL)

  it('puts the sketch in three columns', () => {
    expect(grouped.foundation.map(t => t.id)).toEqual(['discovery'])
    expect(grouped.specialization.map(t => t.id)).toEqual(['electronics', 'robotics', 'software'])
    expect(grouped.capstone.map(t => t.id)).toEqual(['school'])
  })

  it('puts every program in exactly one column', () => {
    const all = [...grouped.foundation, ...grouped.specialization, ...grouped.capstone]
    expect(new Set(all.map(t => t.id)).size).toBe(ALL.length)
  })

  it('returns every stage, empty ones included', () => {
    const empty = byStage([])
    expect(empty.foundation).toEqual([])
    expect(empty.specialization).toEqual([])
    expect(empty.capstone).toEqual([])
  })
})
