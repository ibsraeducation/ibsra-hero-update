import { describe, expect, it } from 'vitest'
import { buildParentNews, buildStudentNews, markSeen, readSeen, seenKey, unseen } from './whatsNew'

describe('buildParentNews', () => {
  const base = {
    childNameOf: { s1: 'Amr' },
    loopNameOf: { l1: 'Sensors 1' },
    trackNameOf: { t1: 'Robotics' },
  }

  it('reports an approved top-up and a rejected one, newest first', () => {
    const items = buildParentNews({
      ...base,
      payments: [
        { id: 'p1', kind: 'topup', status: 'approved', amount_egp: 500, program_name: 'Wallet top-up', student_id: null, reviewed_at: '2026-09-20T10:00:00Z', review_note: null },
        { id: 'p2', kind: 'topup', status: 'rejected', amount_egp: 200, program_name: 'Wallet top-up', student_id: null, reviewed_at: '2026-09-21T10:00:00Z', review_note: 'Amount did not match' },
      ],
      requests: [], enrollments: [], submissions: [], notes: [],
    })
    expect(items).toHaveLength(2)
    expect(items[0].text).toContain("wasn't accepted")
    expect(items[0].text).toContain('Amount did not match')
    expect(items[1].text).toContain('credited with 500 EGP')
  })

  it('ignores a pending payment — nothing has happened yet', () => {
    const items = buildParentNews({
      ...base,
      payments: [{ id: 'p1', kind: 'topup', status: 'pending', amount_egp: 100, program_name: 'x', student_id: null, reviewed_at: null, review_note: null }],
      requests: [], enrollments: [], submissions: [], notes: [],
    })
    expect(items).toHaveLength(0)
  })

  it('reports a kit handed over, named for the hero', () => {
    const items = buildParentNews({
      ...base,
      payments: [{ id: 'p3', kind: 'kit', status: 'approved', amount_egp: 1500, program_name: 'Robotics kit', student_id: 's1', reviewed_at: '2026-09-19T00:00:00Z', fulfilled_at: '2026-09-22T00:00:00Z', review_note: null }],
      requests: [], enrollments: [], submissions: [], notes: [],
    })
    expect(items[0].text).toBe('Robotics kit is ready — handed over to Amr.')
    expect(items[0].at).toBe('2026-09-22T00:00:00Z')
  })

  it('reports an answered request, approved or declined, with the answer note', () => {
    const items = buildParentNews({
      ...base,
      payments: [],
      requests: [
        { id: 'r1', status: 'approved', answered_at: '2026-09-20T09:00:00Z', answer_note: '', student_id: 's1', track_id: 't1', loop_id: null },
        { id: 'r2', status: 'declined', answered_at: '2026-09-21T09:00:00Z', answer_note: 'Not ready yet', student_id: 's1', track_id: 't1', loop_id: null },
      ],
      enrollments: [], submissions: [], notes: [],
    })
    expect(items[1].text).toBe('Your ask for Robotics was opened for Amr.')
    expect(items[0].text).toBe("Your ask for Robotics wasn't opened this time — Not ready yet")
  })

  it('drops an enrolment already explained by an approved request for the same course', () => {
    const items = buildParentNews({
      ...base,
      payments: [],
      requests: [{ id: 'r1', status: 'approved', answered_at: '2026-09-20T09:00:00Z', answer_note: '', student_id: 's1', track_id: null, loop_id: 'l1' }],
      enrollments: [{ student_id: 's1', loop_id: 'l1', enrolled_at: '2026-09-20T09:00:00.001Z' }],
      submissions: [], notes: [],
    })
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('request')
  })

  it('keeps a direct enrolment that has no matching request — e.g. the admin opened it from Students', () => {
    const items = buildParentNews({
      ...base,
      payments: [], requests: [],
      enrollments: [{ student_id: 's1', loop_id: 'l1', enrolled_at: '2026-09-20T09:00:00Z' }],
      submissions: [], notes: [],
    })
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('Sensors 1 opened for Amr.')
  })

  it('reports a graded answer and a mentor note', () => {
    const items = buildParentNews({
      ...base,
      payments: [], requests: [], enrollments: [],
      submissions: [{ id: 'sub1', student_id: 's1', status: 'graded', graded_at: '2026-09-22T08:00:00Z', score: 8, points: 10 }],
      notes: [{ student_id: 's1', day: '2026-09-22' }],
    })
    expect(items.some(i => i.text === "Amr's answer was marked — 8/10.")).toBe(true)
    expect(items.some(i => i.text === 'A new note from your mentor about Amr.')).toBe(true)
  })

  it('caps the feed at 20 items', () => {
    const notes = Array.from({ length: 30 }, (_, i) => ({ student_id: 's1', day: `2026-08-${String(i + 1).padStart(2, '0')}` }))
    const items = buildParentNews({ ...base, payments: [], requests: [], enrollments: [], submissions: [], notes })
    expect(items).toHaveLength(20)
  })
})

describe('buildStudentNews', () => {
  it('reports an opened course, a graded answer and a note', () => {
    const items = buildStudentNews({
      loopNameOf: { l1: 'Sensors 1' },
      enrollments: [{ loop_id: 'l1', enrolled_at: '2026-09-20T09:00:00Z' }],
      submissions: [{ id: 'sub1', session_id: 'ses1', status: 'graded', graded_at: '2026-09-21T09:00:00Z', score: 9, points: 10 }],
      notes: [{ day: '2026-09-22' }],
    })
    expect(items[0].text).toBe('A new note from your mentor.')
    expect(items[1].text).toBe('Your answer was marked — 9/10.')
    expect(items[1].to).toBe('/student/session/ses1')
    expect(items[2].text).toBe('Sensors 1 opened for you.')
  })
})

describe('seen / unseen', () => {
  it('builds a key per role and viewer', () => {
    expect(seenKey('parent', 'p1')).toBe('ibsra.seen.parent.p1')
    expect(seenKey('student', 's1')).toBe('ibsra.seen.student.s1')
  })

  it('everything is unseen with no mark yet', () => {
    const items = [{ id: '1', at: '2026-09-20T00:00:00Z', kind: 'note' as const, text: 'x', to: '/' }]
    expect(unseen(items, null)).toEqual(items)
  })

  it('keeps only items newer than the mark', () => {
    const items = [
      { id: '1', at: '2026-09-19T00:00:00Z', kind: 'note' as const, text: 'old', to: '/' },
      { id: '2', at: '2026-09-21T00:00:00Z', kind: 'note' as const, text: 'new', to: '/' },
    ]
    expect(unseen(items, '2026-09-20T00:00:00Z')).toEqual([items[1]])
  })

  it('round-trips through localStorage when it is available', () => {
    const store = new Map<string, string>()
    // @ts-expect-error — a minimal stand-in for the test environment, which has no DOM.
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
    }
    const key = seenKey('parent', 'p1')
    markSeen(key, '2026-09-22T00:00:00Z')
    expect(readSeen(key)).toBe('2026-09-22T00:00:00Z')
    // @ts-expect-error — clean up the stand-in.
    delete globalThis.localStorage
  })

  it('never throws when storage is unavailable', () => {
    expect(() => markSeen('k', 'v')).not.toThrow()
    expect(readSeen('k')).toBeNull()
  })
})
