import { describe, expect, it } from 'vitest'
import {
  gapLine, planFromPicks, sectionDaysOffered, sectionOn, sectionsOn, sharedGap, slotKey,
  slotsOffered, snapRange, timeGaps, weekFromPicks, type OfferedWindow,
} from './enrolTimes'
import { askProblem } from './programLength'
import type { AvailabilityWindowRow } from './api/rows'
import type { DB } from './types'

const db = {
  tracks: [
    { id: 'trk_a', name: 'Robotics' },
    { id: 'trk_b', name: 'Discovery' },
    { id: 'trk_x', name: 'Unlisted', listed: false },
  ],
  loops: [
    { id: 'lp_1', trackId: 'trk_a', name: 'Loop 1', index: 1 },
    { id: 'lp_2', trackId: 'trk_a', name: 'Loop 2', index: 2 },
    { id: 'lp_3', trackId: 'trk_b', name: 'Loop 1', index: 1 },
    { id: 'lp_x', trackId: 'trk_x', name: 'Hidden', index: 1 },
  ],
} as unknown as DB

const w = (over: Partial<AvailabilityWindowRow>): AvailabilityWindowRow => ({
  id: Math.random().toString(36).slice(2),
  kind: 'lecture',
  weekday: 0,
  start_min: 960,
  end_min: 1080,
  track_id: null,
  loop_id: null,
  batch_id: null,
  slot_min: null,
  mentor: '',
  capacity: 4,
  active: true,
  note: '',
  created_at: '',
  updated_at: '',
  ...over,
})

const both = (loopId: string) => [
  w({ loop_id: loopId, kind: 'lecture' }),
  w({ loop_id: loopId, kind: 'section', weekday: null }),
]

/** Every course covered, so a test can add one gap at a time. */
const covered = [...both('lp_1'), ...both('lp_2'), ...both('lp_3')]

describe('timeGaps', () => {
  it('is empty when every course on sale has both kinds', () => {
    expect(timeGaps(db, covered)).toEqual([])
  })

  it('names a course with nothing published at all', () => {
    expect(timeGaps(db, [...both('lp_2'), ...both('lp_3')])).toEqual([
      { loopId: 'lp_1', course: 'Loop 1', program: 'Robotics', missing: ['lecture', 'section'] },
    ])
  })

  it('names the one kind that is missing', () => {
    const ws = covered.filter(x => !(x.loop_id === 'lp_3' && x.kind === 'section'))
    expect(timeGaps(db, ws)).toEqual([
      { loopId: 'lp_3', course: 'Loop 1', program: 'Discovery', missing: ['section'] },
    ])
  })

  it('counts a window the whole program shares', () => {
    const ws = [
      ...both('lp_2'), ...both('lp_3'),
      w({ track_id: 'trk_a', kind: 'lecture' }),
      w({ track_id: 'trk_a', kind: 'section', weekday: null }),
    ]
    expect(timeGaps(db, ws)).toEqual([])
  })

  it('counts the platform-wide hours, which belong to no course', () => {
    expect(timeGaps(db, [w({ kind: 'lecture' }), w({ kind: 'section', weekday: null })])).toEqual([])
  })

  it('does not count a window switched off', () => {
    const ws = covered.map(x =>
      x.loop_id === 'lp_1' && x.kind === 'lecture' ? { ...x, active: false } : x)
    expect(timeGaps(db, ws).map(g => g.missing)).toEqual([['lecture']])
  })

  it('does not count another course’s window', () => {
    expect(timeGaps(db, both('lp_1')).map(g => g.loopId)).toEqual(['lp_2', 'lp_3'])
  })

  it('leaves an unlisted program alone', () => {
    expect(timeGaps(db, covered).map(g => g.loopId)).toEqual([])
    expect(timeGaps(db, []).map(g => g.loopId)).toEqual(['lp_1', 'lp_2', 'lp_3'])
  })

  it('skips a course taken off the Marketplace on its own', () => {
    const one = {
      ...db,
      loops: db.loops.map(l => (l.id === 'lp_2' ? { ...l, listed: false } : l)),
    } as DB
    expect(timeGaps(one, []).map(g => g.loopId)).toEqual(['lp_1', 'lp_3'])
  })
})

describe('gapLine', () => {
  it('reads as a sentence', () => {
    expect(gapLine(['lecture'])).toBe('no lecture times')
    expect(gapLine(['lecture', 'section'])).toBe('no lecture or section times')
  })
})

describe('sharedGap', () => {
  it('collapses the usual case: every course missing the same kind', () => {
    const ws = [w({ kind: 'lecture' })] // platform-wide lecture hours, no sections
    expect(sharedGap(timeGaps(db, ws), db)).toEqual(['section'])
  })

  it('collapses when nothing at all is published', () => {
    expect(sharedGap(timeGaps(db, []), db)).toEqual(['lecture', 'section'])
  })

  it('names the courses when only some are short', () => {
    const ws = covered.filter(x => !(x.loop_id === 'lp_3' && x.kind === 'section'))
    expect(sharedGap(timeGaps(db, ws), db)).toBeNull()
  })

  it('names the courses when they are short of different kinds', () => {
    const ws = [
      w({ loop_id: 'lp_1', kind: 'lecture' }),
      w({ loop_id: 'lp_2', kind: 'section', weekday: null }),
    ]
    const gaps = timeGaps(db, ws)
    expect(gaps.map(g => g.missing)).toEqual([['section'], ['lecture'], ['lecture', 'section']])
    expect(sharedGap(gaps, db)).toBeNull()
  })

  it('is null when there is no gap', () => {
    expect(sharedGap(timeGaps(db, covered), db)).toBeNull()
  })
})

/* ---------------- the week a family picks ---------------- */

const ow = (id: string, over: Partial<OfferedWindow> = {}): OfferedWindow => ({
  id, kind: 'lecture', weekday: 0, start_min: 960, end_min: 1080, slot_min: null, ...over,
})

/** Sunday opens 16:00–18:00 in one-hour sittings, so it is two choices, not
 *  one; Tuesday is a single 17:00–19:00; the section opens 18:00–19:30 at 45
 *  and carries no day, the shape published before sections had one. Each is
 *  one fixed length, which is what an opening with no longest set means. */
const offered: OfferedWindow[] = [
  ow('lec_sun', { weekday: 0, start_min: 960, end_min: 1080, slot_min: 60 }),
  ow('lec_tue', { weekday: 2, start_min: 1020, end_min: 1140 }),
  ow('sec', { kind: 'section', weekday: null, start_min: 1080, end_min: 1170, slot_min: 45 }),
]

/** The same week republished with a range on it: Tuesday takes an hour to
 *  two, the section half an hour to an hour and a half. */
const ranged: OfferedWindow[] = [
  ow('lec_sun', { weekday: 0, start_min: 960, end_min: 1080, slot_min: 60 }),
  ow('lec_tue', { weekday: 2, start_min: 1020, end_min: 1140, slot_min: 60, slot_max_min: 120 }),
  ow('sec', {
    kind: 'section', weekday: null, start_min: 1080, end_min: 1170,
    slot_min: 30, slot_max_min: 90,
  }),
]

/** The same week with the section published on Monday and Wednesday only —
 *  days the admin opened it on, which is what a section is now. */
const byDay: OfferedWindow[] = [
  ow('lec_sun', { weekday: 0, start_min: 960, end_min: 1080, slot_min: 60 }),
  ow('sec_mon', { kind: 'section', weekday: 1, start_min: 1080, end_min: 1140, slot_min: 60 }),
  ow('sec_wed', { kind: 'section', weekday: 3, start_min: 1080, end_min: 1140, slot_min: 60 }),
  ow('sec_sun', { kind: 'section', weekday: 0, start_min: 1080, end_min: 1140, slot_min: 60 }),
]

const SUN_16 = slotKey('lec_sun', 960)
const SUN_17 = slotKey('lec_sun', 1020)
const SEC_18 = slotKey('sec', 1080)
const SEC_1845 = slotKey('sec', 1125)

describe('slotsOffered', () => {
  it('turns one opening into the sittings a family chooses between', () => {
    expect(slotsOffered(offered, 'lecture').map(s => [s.weekday, s.startMin, s.endMin]))
      .toEqual([[0, 960, 1020], [0, 1020, 1080], [2, 1020, 1140]])
  })

  it('divides a section opening the same way', () => {
    expect(slotsOffered(offered, 'section').map(s => [s.startMin, s.endMin]))
      .toEqual([[1080, 1125], [1125, 1170]])
  })

  it('keeps two sittings of one opening apart by key', () => {
    const keys = slotsOffered(offered, 'lecture').map(s => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('weekFromPicks', () => {
  it('is an empty week until a sitting is ticked', () => {
    expect(weekFromPicks(offered, { lectureKeys: [], sectionByDay: {} }))
      .toEqual({ lectures: [], sections: [] })
  })

  it('takes the ticked sitting, not the whole opening', () => {
    const ask = weekFromPicks(offered, { lectureKeys: [SUN_17], sectionByDay: {} })
    expect(ask.lectures).toEqual([{ day: 0, start: 1020, min: 60 }])
  })

  it('takes only the days ticked, not every day left over', () => {
    const none = weekFromPicks(offered, { lectureKeys: [SUN_16], sectionByDay: {} })
    expect(none.sections).toEqual([])

    const ask = weekFromPicks(offered, {
      lectureKeys: [SUN_16], sectionByDay: { 1: SEC_18, 4: SEC_18 },
    })
    expect(ask.sections.map(s => s.day)).toEqual([1, 4])
    expect(ask.sections.every(s => s.start === 1080 && s.min === 45)).toBe(true)
  })

  it('honours a different section sitting on one day', () => {
    const ask = weekFromPicks(offered, {
      lectureKeys: [SUN_16], sectionByDay: { 3: SEC_1845, 4: SEC_18 },
    })
    expect(ask.sections.find(s => s.day === 3)).toEqual({ day: 3, start: 1125, min: 45 })
    expect(ask.sections.find(s => s.day === 4)).toEqual({ day: 4, start: 1080, min: 45 })
  })

  it('never puts a section on a day the lecture takes, however it is ticked', () => {
    /* Sunday carries their lecture and a section is published on it, so the
       tick is dropped rather than filed and refused by check_plan. */
    const ask = weekFromPicks(byDay, {
      lectureKeys: [SUN_16],
      sectionByDay: { 0: slotKey('sec_sun', 1080), 1: slotKey('sec_mon', 1080) },
    })
    expect(ask.sections.map(s => s.day)).toEqual([1])
  })

  it('only takes a day the admin published a section on', () => {
    /* Tuesday is free of their lecture, but nothing is open on it. */
    const ask = weekFromPicks(byDay, {
      lectureKeys: [SUN_16], sectionByDay: { 2: slotKey('sec_mon', 1080) },
    })
    expect(ask.sections).toEqual([])
  })

  it('lets both sittings of one opening be taken on their own days', () => {
    const ask = weekFromPicks(offered, {
      lectureKeys: [SUN_16, slotKey('lec_tue', 1020)],
      sectionByDay: { 1: SEC_18, 3: SEC_18 },
    })
    expect(ask.lectures.map(l => [l.day, l.start])).toEqual([[0, 960], [2, 1020]])
    expect(ask.sections.map(s => s.day)).toEqual([1, 3])
  })

  it('ignores a pick that is no longer offered', () => {
    /* The day stays ticked and falls back to the first sitting open on it —
       a stale key is not a reason to drop a day they asked for. */
    const ask = weekFromPicks(offered, { lectureKeys: [SUN_16], sectionByDay: { 3: 'sec@999' } })
    expect(ask.sections.find(s => s.day === 3)?.start).toBe(1080)
  })

  it('accepts a week with a lecture and a section, and refuses each half alone', () => {
    expect(askProblem(weekFromPicks(offered, { lectureKeys: [], sectionByDay: {} })))
      .toBe('Pick at least one lecture time.')
    expect(askProblem(weekFromPicks(offered, { lectureKeys: [SUN_16], sectionByDay: {} })))
      .toBe('Pick at least one section time.')
    expect(askProblem(weekFromPicks(offered, {
      lectureKeys: [SUN_16], sectionByDay: { 1: SEC_18 },
    }))).toBeNull()
  })
})

describe('planFromPicks', () => {
  it('sends the window and the minute, so the server books the right hour', () => {
    const plan = planFromPicks(offered, { lectureKeys: [SUN_17], sectionByDay: {} })
    expect(plan[0]).toEqual({ w: 'lec_sun', d: null, s: 1020, m: 60 })
  })

  it('gives each ticked section day its own row with the chosen sitting', () => {
    const plan = planFromPicks(offered, {
      lectureKeys: [SUN_16], sectionByDay: { 1: SEC_18, 3: SEC_1845 },
    })
    const sections = plan.filter(x => x.w === 'sec')
    expect(sections).toHaveLength(2)
    expect(sections.find(x => x.d === 3)).toEqual({ w: 'sec', d: 3, s: 1125, m: 45 })
    expect(sections.find(x => x.d === 1)).toEqual({ w: 'sec', d: 1, s: 1080, m: 45 })
  })

  it('sends a day-carrying section on its own day', () => {
    const plan = planFromPicks(byDay, {
      lectureKeys: [SUN_16], sectionByDay: { 1: slotKey('sec_mon', 1080) },
    })
    expect(plan.filter(x => x.w !== 'lec_sun')).toEqual([{ w: 'sec_mon', d: 1, s: 1080, m: 60 }])
  })

  it('is empty until a lecture is picked', () => {
    expect(planFromPicks(offered, { lectureKeys: [], sectionByDay: {} })).toEqual([])
  })
})

describe('sectionOn', () => {
  it('falls back to the first sitting on offer', () => {
    expect(sectionOn(offered, { lectureKeys: [], sectionByDay: {} }, 3)?.key).toBe(SEC_18)
  })

  it('is null when nothing is published', () => {
    expect(sectionOn([], { lectureKeys: [], sectionByDay: {} }, 3)).toBeNull()
  })

  it('is null on a day nothing is open on', () => {
    expect(sectionOn(byDay, { lectureKeys: [], sectionByDay: {} }, 2)).toBeNull()
  })
})

describe('sectionsOn', () => {
  it('offers a day-carrying section only on its own day', () => {
    expect(sectionsOn(byDay, 1).map(s => s.windowId)).toEqual(['sec_mon'])
    expect(sectionsOn(byDay, 2)).toEqual([])
  })

  it('offers a day-less section on every day', () => {
    expect(sectionsOn(offered, 2).map(s => s.windowId)).toEqual(['sec', 'sec'])
    expect(sectionsOn(offered, 5).map(s => s.windowId)).toEqual(['sec', 'sec'])
  })
})

describe('sectionDaysOffered', () => {
  const sun = [{ day: 0, start: 960, min: 60 }]

  it('is the open days their lecture leaves free', () => {
    expect(sectionDaysOffered(byDay, sun)).toEqual([1, 3])
  })

  it('drops an open day their lecture takes', () => {
    expect(sectionDaysOffered(byDay, [{ day: 1, start: 960, min: 60 }])).toEqual([0, 3])
  })

  it('is every free day when the section carries none of its own', () => {
    expect(sectionDaysOffered(offered, sun)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('is empty when nothing is published', () => {
    expect(sectionDaysOffered([], sun)).toEqual([])
  })
})

describe('the family chooses the session length', () => {
  const sun = [{ day: 0, start: 960, min: 60 }]

  it('cuts a lecture opening into the length they asked for', () => {
    expect(slotsOffered(ranged, 'lecture', 60).filter(s => s.weekday === 2)
      .map(s => [s.startMin, s.endMin])).toEqual([[1020, 1080], [1080, 1140]])

    expect(slotsOffered(ranged, 'lecture', 120).filter(s => s.weekday === 2)
      .map(s => [s.startMin, s.endMin])).toEqual([[1020, 1140]])
  })

  it('cuts a section opening the same way', () => {
    expect(sectionsOn(ranged, 3, 30).map(s => [s.startMin, s.endMin]))
      .toEqual([[1080, 1110], [1110, 1140], [1140, 1170]])

    expect(sectionsOn(ranged, 3, 90).map(s => [s.startMin, s.endMin]))
      .toEqual([[1080, 1170]])
  })

  it('offers nothing on a length no opening can hold', () => {
    expect(slotsOffered(offered, 'lecture', 240)).toEqual([])
    expect(sectionDaysOffered(offered, sun, 240)).toEqual([])
  })

  it('offers nothing on a length outside what the opening was published for', () => {
    expect(slotsOffered(ranged, 'lecture', 30)).toEqual([])
    expect(sectionsOn(ranged, 3, 15)).toEqual([])
  })

  it('holds an opening with no longest set to the one length it published', () => {
    expect(slotsOffered(offered, 'lecture', 60).filter(s => s.weekday === 2)).toEqual([])
    expect(sectionsOn(offered, 3, 30)).toEqual([])
  })

  it('carries the chosen length into the week and the plan', () => {
    const picks = {
      lectureKeys: [slotKey('lec_tue', 1020)],
      sectionByDay: { 1: slotKey('sec', 1080) },
      lectureMin: 60,
      sectionMin: 30,
    }
    const ask = weekFromPicks(ranged, picks)
    expect(ask.lectures).toEqual([{ day: 2, start: 1020, min: 60 }])
    expect(ask.sections).toEqual([{ day: 1, start: 1080, min: 30 }])

    expect(planFromPicks(ranged, picks)).toEqual([
      { w: 'lec_tue', d: null, s: 1020, m: 60 },
      { w: 'sec', d: 1, s: 1080, m: 30 },
    ])
  })

  it('falls back to what the admin published when no length is asked for', () => {
    const picks = { lectureKeys: [SUN_16], sectionByDay: { 1: SEC_18 } }
    expect(weekFromPicks(offered, picks).sections).toEqual([{ day: 1, start: 1080, min: 45 }])
  })

  it('drops a pick whose key belongs to a different length', () => {
    const picks = {
      lectureKeys: [SUN_16],
      sectionByDay: { 1: SEC_1845 },
      sectionMin: 30,
    }
    expect(weekFromPicks(ranged, picks).sections)
      .toEqual([{ day: 1, start: 1080, min: 30 }])
  })
})

describe('snapRange', () => {
  it('keeps a range that already sits on the step', () => {
    expect(snapRange({ min: 60, max: 180 }, 60)).toEqual({ min: 60, max: 180 })
    expect(snapRange({ min: 30, max: 90 }, 30)).toEqual({ min: 30, max: 90 })
  })

  it('pulls the ends in to the steps inside the range', () => {
    expect(snapRange({ min: 45, max: 150 }, 60)).toEqual({ min: 60, max: 120 })
    expect(snapRange({ min: 90, max: 150 }, 60)).toEqual({ min: 120, max: 120 })
    expect(snapRange({ min: 20, max: 100 }, 30)).toEqual({ min: 30, max: 90 })
  })

  it('gives nothing when no step fits', () => {
    expect(snapRange({ min: 90, max: 110 }, 60)).toBeNull()
    expect(snapRange({ min: 35, max: 55 }, 30)).toBeNull()
    expect(snapRange(null, 30)).toBeNull()
  })
})

describe('a length of its own for each section day', () => {
  const picks = {
    lectureKeys: [SUN_16],
    sectionByDay: { 1: SEC_18, 2: SEC_18 },
    sectionMinByDay: { 1: 30, 2: 60 },
  }

  it('gives every day the length it was set to', () => {
    expect(weekFromPicks(ranged, picks).sections).toEqual([
      { day: 1, start: 1080, min: 30 },
      { day: 2, start: 1080, min: 60 },
    ])
  })

  it('carries those lengths into the plan', () => {
    expect(planFromPicks(ranged, picks)).toEqual([
      { w: 'lec_sun', d: null, s: 960, m: 60 },
      { w: 'sec', d: 1, s: 1080, m: 30 },
      { w: 'sec', d: 2, s: 1080, m: 60 },
    ])
  })

  it('falls back to the one length when a day was not set', () => {
    expect(weekFromPicks(ranged, {
      lectureKeys: [SUN_16],
      sectionByDay: { 1: SEC_18, 2: SEC_18 },
      sectionMin: 30,
      sectionMinByDay: { 2: 90 },
    }).sections).toEqual([
      { day: 1, start: 1080, min: 30 },
      { day: 2, start: 1080, min: 90 },
    ])
  })

  it('drops a day whose own length no opening holds', () => {
    expect(weekFromPicks(byDay, {
      lectureKeys: [SUN_16],
      sectionByDay: { 1: slotKey('sec_mon', 1080), 3: slotKey('sec_wed', 1080) },
      sectionMinByDay: { 1: 90, 3: 60 },
    }).sections).toEqual([{ day: 3, start: 1080, min: 60 }])
  })
})
