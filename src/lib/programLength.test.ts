import { describe, expect, it } from 'vitest'
import {
  askLine, askProblem, availabilityLine, courseHours, hoursLabel, lengthOfAsk, minutesLabel,
  parseAsk, programHours, sectionDays,
} from './programLength'

describe('labels', () => {
  it('says minutes under an hour', () => {
    expect(minutesLabel(30)).toBe('30 min')
    expect(minutesLabel(90)).toBe('1.5 h')
    expect(hoursLabel(4)).toBe('4 h')
  })
})

describe('availabilityLine', () => {
  it('says what the family picked', () => {
    expect(availabilityLine({ lectures_per_week: 2, section_minutes: 60 }))
      .toBe('2 × 2 h lectures a week · 1 h stand-up on the other days')
  })

  it('keeps one lecture singular', () => {
    expect(availabilityLine({ lectures_per_week: 1, section_minutes: 90 }))
      .toBe('1 × 2 h lecture a week · 1.5 h stand-up on the other days')
  })

  it('leaves the stand-up out when they did not want one', () => {
    expect(availabilityLine({ lectures_per_week: 3, section_minutes: null }))
      .toBe('3 × 2 h lectures a week')
  })

  it('drops the trailing words for a table cell', () => {
    expect(availabilityLine({ lectures_per_week: 1, section_minutes: 30 }, { short: true }))
      .toBe('1 × 2 h a week · 30 min stand-up')
  })

  it('is null when the family never said', () => {
    expect(availabilityLine({ lectures_per_week: null, section_minutes: 60 })).toBeNull()
    expect(availabilityLine({})).toBeNull()
  })
})

/* ---------------- the week a family actually picked ---------------- */

const ask = {
  lectures: [{ day: 0, start: 960, min: 120 }],
  sections: [1, 2, 3, 4, 5, 6].map(day => ({ day, start: 1110, min: 60 })),
}

describe('sectionDays', () => {
  it('is every day without a lecture', () => {
    expect(sectionDays([{ day: 0, start: 960, min: 120 }])).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('shrinks as lectures are added', () => {
    expect(sectionDays([
      { day: 0, start: 960, min: 120 },
      { day: 3, start: 960, min: 120 },
    ])).toEqual([1, 2, 4, 5, 6])
  })
})

describe('lengthOfAsk', () => {
  it('counts the real minutes, not a rhythm', () => {
    // 2h of lecture + 6 × 1h of section = 8h a week
    const p = lengthOfAsk(80, ask)
    expect(p.learnHours).toBe(2)
    expect(p.buildHours).toBe(6)
    expect(p.weeklyHours).toBe(8)
    expect(p.weeks).toBe(10)
  })

  it('follows a shorter section straight into a longer program', () => {
    const half = { ...ask, sections: ask.sections.map(s => ({ ...s, min: 30 })) }
    expect(lengthOfAsk(80, half).weeklyHours).toBe(5)
    expect(lengthOfAsk(80, half).weeks).toBe(16)
  })

  it('has no length without a total', () => {
    expect(lengthOfAsk(null, ask).weeks).toBeNull()
  })
})

describe('askProblem', () => {
  it('is happy with a full week', () => {
    expect(askProblem(ask)).toBeNull()
  })

  it('wants a lecture', () => {
    expect(askProblem({ lectures: [], sections: [] })).toMatch(/lecture time/)
  })

  it('is happy with a section on some days but not others', () => {
    /* A section is no longer daily -- the admin publishes which days it is
       open on, and the family picks among them -- so a free day without one
       is an answer, not a hole. */
    expect(askProblem({ ...ask, sections: ask.sections.filter(s => s.day !== 2) })).toBeNull()
    expect(askProblem({ ...ask, sections: [{ day: 1, start: 1110, min: 60 }] })).toBeNull()
  })

  it('wants at least one section', () => {
    expect(askProblem({ ...ask, sections: [] })).toMatch(/section time/)
  })

  it('refuses a section on a lecture day', () => {
    expect(askProblem({ ...ask, sections: [{ day: 0, start: 1110, min: 60 }] }))
      .toMatch(/No section on a lecture day .* Sun/)
  })

  it('refuses two sections on one day', () => {
    expect(askProblem({
      ...ask,
      sections: [{ day: 1, start: 600, min: 60 }, { day: 1, start: 1110, min: 60 }],
    })).toMatch(/One section a day .* Mon/)
  })

  it('refuses two lectures on one day', () => {
    expect(askProblem({
      lectures: [{ day: 0, start: 600, min: 120 }, { day: 0, start: 960, min: 120 }],
      sections: [],
    })).toMatch(/same day/)
  })

  it('refuses a third lecture in the week', () => {
    expect(askProblem({
      lectures: [
        { day: 0, start: 960, min: 120 },
        { day: 2, start: 960, min: 120 },
        { day: 4, start: 960, min: 120 },
      ],
      sections: [{ day: 1, start: 1110, min: 60 }],
    })).toMatch(/one lecture or two/)
  })

  it('is happy with one lecture, and with two', () => {
    expect(askProblem({
      lectures: [{ day: 0, start: 960, min: 120 }],
      sections: [{ day: 1, start: 1110, min: 60 }],
    })).toBeNull()
    expect(askProblem({
      lectures: [{ day: 0, start: 960, min: 120 }, { day: 2, start: 960, min: 120 }],
      sections: [{ day: 1, start: 1110, min: 60 }],
    })).toBeNull()
  })

  it('refuses a sitting running past midnight', () => {
    expect(askProblem({
      lectures: [{ day: 0, start: 1400, min: 120 }],
      sections: sectionDays([{ day: 0, start: 1400, min: 120 }]).map(day => ({ day, start: 600, min: 60 })),
    })).toMatch(/midnight/)
  })
})

describe('askLine', () => {
  it('says the lecture and the one section hour', () => {
    expect(askLine(ask)).toBe('Sun 16:00–18:00 · sections 18:30–19:30 on the other 6 days')
  })

  it('spells out days that differ', () => {
    const odd = { ...ask, sections: [{ day: 1, start: 600, min: 60 }, { day: 2, start: 1110, min: 60 }] }
    expect(askLine(odd)).toContain('Mon 10:00–11:00, Tue 18:30–19:30')
  })

  it('is null when nothing was picked', () => {
    expect(askLine(null)).toBeNull()
  })
})

describe('parseAsk', () => {
  it('round-trips what the form wrote', () => {
    expect(parseAsk(JSON.parse(JSON.stringify(ask)))).toEqual(ask)
  })

  it('drops a slot with an impossible day', () => {
    expect(parseAsk({ lectures: [{ day: 9, start: 60, min: 60 }, ask.lectures[0]], sections: [] }))
      .toEqual({ lectures: [ask.lectures[0]], sections: [] })
  })

  it('is null for anything else', () => {
    expect(parseAsk(null)).toBeNull()
    expect(parseAsk('Sunday at four')).toBeNull()
    expect(parseAsk({ lectures: [], sections: [] })).toBeNull()
  })
})

describe('availabilityLine prefers the real week', () => {
  it('reads the days and times when they are there', () => {
    expect(availabilityLine({ lectures_per_week: 1, section_minutes: 60, schedule_ask: ask }))
      .toBe('Sun 16:00–18:00 · sections 18:30–19:30 on the other 6 days')
  })

  it('falls back to the counts an older row carries', () => {
    expect(availabilityLine({ lectures_per_week: 2, section_minutes: 60 }))
      .toBe('2 × 2 h lectures a week · 1 h stand-up on the other days')
  })
})

describe('courseHours adds the sessions up', () => {
  const sessions = [
    { loopId: 'l1', durationMin: 120 },
    { loopId: 'l1', durationMin: 60 },
    { loopId: 'l1', durationMin: 30 },
    { loopId: 'l2', durationMin: 90 },
  ]

  it('counts every session inside the course, lecture or section', () => {
    expect(courseHours({ id: 'l1', durationHours: 99 }, sessions)).toBe(3.5)
    expect(courseHours({ id: 'l2', durationHours: 99 }, sessions)).toBe(1.5)
  })

  it('falls back to the typed hours while the course is empty', () => {
    expect(courseHours({ id: 'l3', durationHours: 12 }, sessions)).toBe(12)
    expect(courseHours({ id: 'l3' }, sessions)).toBeNull()
  })

  it('ignores a session with no length rather than counting it as zero', () => {
    expect(courseHours({ id: 'l4', durationHours: 8 }, [{ loopId: 'l4', durationMin: 0 }])).toBe(8)
  })
})

describe('programHours sums its courses', () => {
  const sessions = [
    { loopId: 'l1', durationMin: 120 },
    { loopId: 'l2', durationMin: 60 },
  ]

  it('adds the courses up from their sessions when it has them', () => {
    expect(programHours([{ id: 'l1' }, { id: 'l2' }], sessions)).toBe(3)
  })

  it('mixes a laid-out course with an empty one that says its hours', () => {
    expect(programHours([{ id: 'l1' }, { id: 'l3', durationHours: 5 }], sessions)).toBe(7)
  })

  it('says nothing when a course has no hours at all', () => {
    expect(programHours([{ id: 'l1' }, { id: 'l3' }], sessions)).toBeNull()
    expect(programHours([], sessions)).toBeNull()
  })

  it('reads the typed hours when nobody passes the sessions', () => {
    expect(programHours([{ id: 'l1', durationHours: 4 }])).toBe(4)
  })
})
