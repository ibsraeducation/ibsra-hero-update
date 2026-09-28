import { describe, expect, it } from 'vitest'
import {
  addUp, asPct, attendanceOf, scoreSession, scoreSessions,
  type ScoredSubmission,
} from './scores'
import type { Session, Task, Title, VideoCheck } from './types'

const task = (id: string, points: number): Task => ({
  id, order: 0, kind: 'short', question: id, options: [], required: true, points,
})

const check = (id: string, points: number): VideoCheck => ({
  id, atSec: 30, kind: 'mcq', question: id, options: [], points, required: true,
})

const title = (id: string, tasks: Task[], checks: VideoCheck[] = []): Title => ({
  id, order: 0, name: id, estimatedMin: 10, tasks, materials: [],
  video: checks.length
    ? { provider: 'upload', url: '', durationSec: 600, captions: false, state: 'ready', checks }
    : null,
})

const session = (id: string, titles: Title[]): Session => ({
  id, code: id, loopId: 'lop_1', name: id, summary: '', type: 'recorded',
  status: 'published', order: 0, instructorId: null, scheduledAt: null,
  durationMin: 60, recordingReady: true, titles,
  technicalValues: '', personalValues: '', marketValues: '', assetValue: '',
  technicalSkills: '', marketingSkills: '', personalSkills: '', skills: {},
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
} as unknown as Session)

const sub = (taskId: string, points: number, score: number | null, status = 'graded'): ScoredSubmission =>
  ({ session_id: 'ses_1', task_id: taskId, points, score, status })

describe('asPct', () => {
  it('is null when nothing could be scored, so an empty course never reads as zero', () => {
    expect(asPct({ earned: 0, possible: 0 })).toBe(null)
    expect(asPct({ earned: 0, possible: 10 })).toBe(0)
    expect(asPct({ earned: 7, possible: 10 })).toBe(70)
    expect(asPct({ earned: 2, possible: 3 })).toBe(67)
  })
})

describe('scoreSession', () => {
  const s = session('ses_1', [
    title('ttl_a', [task('t1', 10), task('t2', 10)], [check('c1', 5)]),
    title('ttl_b', [task('t3', 20)]),
  ])

  it('scores each topic on its own marked work', () => {
    const r = scoreSession(s, [sub('t1', 10, 8), sub('t3', 20, 10)])
    expect(r.topics.map(t => [t.id, t.pct])).toEqual([['ttl_a', 80], ['ttl_b', 50]])
  })

  it('keeps tasks and checkpoints apart', () => {
    const r = scoreSession(s, [sub('t1', 10, 8), sub('c1', 5, 5)])
    expect(r.tasks).toEqual({ earned: 8, possible: 10 })
    expect(r.activities).toEqual({ earned: 5, possible: 5 })
  })

  it('counts every task towards focus, answered or not', () => {
    const r = scoreSession(s, [sub('t1', 10, 8)])
    /* 8 earned out of the 40 the session holds — one answer is not the work. */
    expect(r.focus).toEqual({ earned: 8, possible: 40 })
    expect(asPct(r.focus)).toBe(20)
    /* the same answer is full marks on what was actually marked */
    expect(asPct(r.tasks)).toBe(80)
  })

  it('ignores an answer that is waiting to be marked', () => {
    const r = scoreSession(s, [sub('t1', 10, null, 'submitted')])
    expect(r.tasks).toEqual({ earned: 0, possible: 0 })
    expect(asPct(r.tasks)).toBe(null)
    expect(r.focus.earned).toBe(0)
  })

  it('leaves another sitting of work alone', () => {
    const other: ScoredSubmission = { session_id: 'ses_2', task_id: 't1', points: 10, score: 10, status: 'graded' }
    expect(scoreSession(s, [other]).tasks).toEqual({ earned: 0, possible: 0 })
  })
})

describe('attendanceOf', () => {
  const now = Date.parse('2026-03-10T12:00:00Z')
  const at = (endsAt: string, attended: boolean | null) => ({ endsAt, attended })

  it('counts only sittings that have finished', () => {
    expect(attendanceOf([
      at('2026-03-09T10:00:00Z', true),
      at('2026-03-11T10:00:00Z', null),
    ], now)).toEqual({ earned: 1, possible: 1 })
  })

  it('reads an unconfirmed sitting as held but not attended', () => {
    expect(attendanceOf([
      at('2026-03-09T10:00:00Z', true),
      at('2026-03-08T10:00:00Z', null),
      at('2026-03-07T10:00:00Z', false),
    ], now)).toEqual({ earned: 1, possible: 3 })
  })
})

describe('scoreSessions', () => {
  it('adds the courses up and carries the sittings once', () => {
    const a = session('ses_1', [title('ttl_a', [task('t1', 10)])])
    const r = scoreSessions([a], [sub('t1', 10, 5)],
      [{ endsAt: '2026-03-09T10:00:00Z', attended: true }], Date.parse('2026-03-10T12:00:00Z'))
    expect(r.tasks).toEqual({ earned: 5, possible: 10 })
    expect(r.attendance).toEqual({ earned: 1, possible: 1 })
    expect(r.sessions).toHaveLength(1)
  })
})

describe('addUp', () => {
  it('sums tallies', () => {
    expect(addUp([{ earned: 1, possible: 2 }, { earned: 3, possible: 4 }]))
      .toEqual({ earned: 4, possible: 6 })
    expect(addUp([])).toEqual({ earned: 0, possible: 0 })
  })
})
