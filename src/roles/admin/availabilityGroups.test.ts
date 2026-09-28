import { describe, expect, it } from 'vitest'
import { batchGroups, daysLabel, hourRows, type GroupLabels } from './AvailabilityEditor'
import type { AvailabilityWindowRow } from '@/lib/api/rows'

const w = (over: Partial<AvailabilityWindowRow>): AvailabilityWindowRow => ({
  id: 'w', kind: 'lecture', weekday: 0, start_min: 960, end_min: 1080, slot_min: 60,
  loop_id: 'lp_1', batch_id: 'b_oct', track_id: null, mentor: '', capacity: 4,
  active: true, note: '',
  ...over,
} as AvailabilityWindowRow)

const BATCHES: Record<string, { name: string; startsOn: string }> = {
  b_oct: { name: 'October intake', startsOn: '2026-10-05' },
  b_jan: { name: 'January intake', startsOn: '2027-01-11' },
  b_sep: { name: 'September intake', startsOn: '2026-09-01' },
}

const COURSES: Record<string, string> = {
  lp_1: 'Robotics · Electronics Course',
  lp_2: 'Robotics · Coding Course',
  lp_9: 'Aviation · Drones Course',
}

const label: GroupLabels = {
  course: id => COURSES[id] ?? 'A course that is gone',
  batch: id => BATCHES[id] ?? null,
}

describe('batchGroups', () => {
  it('has nothing to show for nothing published', () => {
    expect(batchGroups([], label)).toEqual([])
  })

  it('puts the intake outside and the course inside', () => {
    const groups = batchGroups([
      w({ id: 'a', batch_id: 'b_oct', loop_id: 'lp_1' }),
      w({ id: 'b', batch_id: 'b_oct', loop_id: 'lp_2' }),
      w({ id: 'c', batch_id: 'b_jan', loop_id: 'lp_1' }),
    ], label)

    expect(groups.map(g => g.batchId)).toEqual(['b_oct', 'b_jan'])
    expect(groups[0].courses.map(c => c.loopId)).toEqual(['lp_2', 'lp_1'])
    expect(groups[1].courses.map(c => c.loopId)).toEqual(['lp_1'])
  })

  it('keeps a course’s two halves together', () => {
    const [g] = batchGroups([
      w({ id: 'lec', kind: 'lecture', weekday: 0 }),
      w({ id: 'sec', kind: 'section', weekday: 1 }),
      w({ id: 'sec2', kind: 'section', weekday: 3 }),
    ], label)

    expect(g.courses).toHaveLength(1)
    expect(g.courses[0].lectures.map(x => x.id)).toEqual(['lec'])
    expect(g.courses[0].sections.map(x => x.id)).toEqual(['sec', 'sec2'])
  })

  it('counts both halves across every course, for the heading while shut', () => {
    const [g] = batchGroups([
      w({ id: 'a', loop_id: 'lp_1', kind: 'lecture' }),
      w({ id: 'b', loop_id: 'lp_2', kind: 'lecture' }),
      w({ id: 'c', loop_id: 'lp_2', kind: 'section', weekday: 2 }),
    ], label)

    expect({ courses: g.courses.length, lectures: g.lectures, sections: g.sections })
      .toEqual({ courses: 2, lectures: 2, sections: 1 })
  })

  it('reads intakes in the order they start', () => {
    const groups = batchGroups([
      w({ id: 'a', batch_id: 'b_jan' }),
      w({ id: 'b', batch_id: 'b_oct' }),
      w({ id: 'c', batch_id: 'b_sep' }),
    ], label)
    expect(groups.map(g => g.batchId)).toEqual(['b_sep', 'b_oct', 'b_jan'])
  })

  it('sorts courses by the name on screen, not the id', () => {
    const [g] = batchGroups([
      w({ id: 'a', loop_id: 'lp_1' }),
      w({ id: 'b', loop_id: 'lp_9' }),
    ], label)
    expect(g.courses.map(c => label.course(c.loopId)))
      .toEqual(['Aviation · Drones Course', 'Robotics · Electronics Course'])
  })

  it('sorts the hours inside a course by day, then by hour', () => {
    const [g] = batchGroups([
      w({ id: 'thu', weekday: 4, start_min: 960 }),
      w({ id: 'sun-late', weekday: 0, start_min: 1080 }),
      w({ id: 'sun-early', weekday: 0, start_min: 600 }),
    ], label)
    expect(g.courses[0].lectures.map(x => x.id)).toEqual(['sun-early', 'sun-late', 'thu'])
  })

  it('puts a day-less section last, having no day to sort on', () => {
    const [g] = batchGroups([
      w({ id: 'daily', kind: 'section', weekday: null }),
      w({ id: 'wed', kind: 'section', weekday: 3 }),
    ], label)
    expect(g.courses[0].sections.map(x => x.id)).toEqual(['wed', 'daily'])
  })

  it('gives windows with no batch a group of their own, at the end', () => {
    const groups = batchGroups([
      w({ id: 'loose', batch_id: null }),
      w({ id: 'jan', batch_id: 'b_jan' }),
      w({ id: 'sep', batch_id: 'b_sep' }),
    ], label)
    expect(groups.map(g => g.key)).toEqual(['b_sep', 'b_jan', 'none'])
    expect(groups[2].batchId).toBeNull()
  })

  it('keeps an intake whose batch record is gone', () => {
    const groups = batchGroups([w({ id: 'a', batch_id: 'b_ghost' })], label)
    expect(groups.map(g => g.batchId)).toEqual(['b_ghost'])
    expect(groups[0].lectures).toBe(1)
  })

  it('gives every fold a key of its own, so two cannot share a memory', () => {
    const groups = batchGroups([
      w({ id: 'a', batch_id: 'b_oct', loop_id: 'lp_1' }),
      w({ id: 'b', batch_id: 'b_oct', loop_id: 'lp_2' }),
      w({ id: 'c', batch_id: 'b_jan', loop_id: 'lp_1' }),
      w({ id: 'd', batch_id: null, loop_id: null }),
    ], label)

    const keys = [...groups.map(g => g.key), ...groups.flatMap(g => g.courses.map(c => c.key))]
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('hourRows', () => {
  it('writes the days of one hour beside each other', () => {
    const [r] = hourRows([
      w({ id: 'sun', weekday: 0 }),
      w({ id: 'tue', weekday: 2 }),
      w({ id: 'thu', weekday: 4 }),
    ])
    expect(r.days).toEqual([0, 2, 4])
    expect(r.windows.map(x => x.id)).toEqual(['sun', 'tue', 'thu'])
  })

  it('keeps a different hour on a line of its own', () => {
    const rows = hourRows([
      w({ id: 'sun', weekday: 0, start_min: 960 }),
      w({ id: 'mon', weekday: 1, start_min: 1080 }),
      w({ id: 'tue', weekday: 2, start_min: 960 }),
    ])
    expect(rows.map(r => r.days)).toEqual([[0, 2], [1]])
  })

  it('will not hide a different mentor behind a shared hour', () => {
    const rows = hourRows([
      w({ id: 'a', weekday: 0, mentor: 'Mahmoud' }),
      w({ id: 'b', weekday: 1, mentor: 'Sara' }),
    ])
    expect(rows).toHaveLength(2)
  })

  it('will not hide a different session length, or one switched off', () => {
    expect(hourRows([
      w({ id: 'a', weekday: 0, slot_min: 60 }),
      w({ id: 'b', weekday: 1, slot_min: 120 }),
    ])).toHaveLength(2)

    expect(hourRows([
      w({ id: 'a', weekday: 0, active: true }),
      w({ id: 'b', weekday: 1, active: false }),
    ])).toHaveLength(2)
  })

  it('will not fold a day-less section in with a dated one', () => {
    const rows = hourRows([
      w({ id: 'daily', kind: 'section', weekday: null }),
      w({ id: 'sun', kind: 'section', weekday: 0 }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.windows[0].id === 'daily')!.days).toEqual([])
  })

  it('reads lines in day order, then by hour', () => {
    const rows = hourRows([
      w({ id: 'thu-late', weekday: 4, start_min: 1200 }),
      w({ id: 'sun-late', weekday: 0, start_min: 1080 }),
      w({ id: 'sun-early', weekday: 0, start_min: 600 }),
    ])
    expect(rows.map(r => r.windows[0].id)).toEqual(['sun-early', 'sun-late', 'thu-late'])
  })

  it('puts a day-less line last, having no day to sort on', () => {
    const rows = hourRows([
      w({ id: 'daily', kind: 'section', weekday: null, start_min: 600 }),
      w({ id: 'wed', kind: 'section', weekday: 3, start_min: 1080 }),
    ])
    expect(rows.map(r => r.windows[0].id)).toEqual(['wed', 'daily'])
  })

  it('has nothing to show for nothing published', () => {
    expect(hourRows([])).toEqual([])
  })
})

describe('daysLabel', () => {
  it('names the days it runs on', () => {
    expect(daysLabel([0, 2, 4])).toBe('Sun, Tue, Thu')
    expect(daysLabel([3])).toBe('Wed')
  })

  it('says what a day-less window means instead of nothing', () => {
    expect(daysLabel([])).toBe('Every free day')
  })
})
