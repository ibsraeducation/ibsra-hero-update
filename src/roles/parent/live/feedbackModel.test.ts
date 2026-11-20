import { describe, expect, it } from 'vitest'
import { markProjects, markSessions, released, summary } from './feedbackModel'
import type { Loop, Session, Task, Title } from '@/lib/types'
import type { SubmissionRow } from '@/lib/api/rows'

const title = (id: string, p: Partial<Title> = {}): Title => ({
  id, order: 1, name: id, estimatedMin: 10, video: null, materials: [], tasks: [], ...p,
})

const task = (id: string): Task => ({
  id, order: 1, kind: 'mcq', question: id, points: 1, required: false, options: [],
})

const session = (id: string, loopId: string, order: number, p: Partial<Session> = {}): Session => ({
  id, loopId, code: id, name: id, summary: '', type: 'recorded', status: 'published',
  order, instructorId: null, scheduledAt: null, durationMin: 60, meetingUrl: null,
  recordingReady: false, titles: [], ...p,
} as Session)

const loop = (id: string, index: number): Loop => ({
  id, trackId: 'trk', code: id, name: id, index,
  startDate: '2026-01-01', endDate: '2026-03-01', status: 'running',
} as Loop)

const sub = (sessionId: string, taskId: string, p: Partial<SubmissionRow> = {}): SubmissionRow => ({
  id: `${sessionId}:${taskId}`, student_id: 'stu', session_id: sessionId, task_id: taskId,
  task_kind: 'mcq', question: '', points: 1, choice_ids: null, answer_text: null, link_url: null,
  file_path: null, is_correct: true, score: 1, auto_graded: true, status: 'graded',
  feedback: null, graded_by: null, graded_at: null, attempts: 1,
  created_at: '', updated_at: '', ...p,
} as SubmissionRow)

describe('released', () => {
  it('holds back a draft, and a recording whose date has not come', () => {
    expect(released(session('a', 'l1', 1, { status: 'draft' }))).toBe(false)
    expect(released(session('a', 'l1', 1, { scheduledAt: '2099-01-01T00:00:00Z' }))).toBe(false)
    expect(released(session('a', 'l1', 1))).toBe(true)
  })

  it('opens a live class as soon as it is published, whatever the hour', () => {
    expect(released(session('a', 'l1', 1, { type: 'live', scheduledAt: '2099-01-01T00:00:00Z' }))).toBe(true)
  })
})

describe('markSessions', () => {
  const s1 = session('s1', 'l1', 1, { titles: [title('t1', { tasks: [task('q1'), task('q2')] })] })
  const s2 = session('s2', 'l1', 2, { titles: [title('t2', { tasks: [task('q3')] })] })
  const loops = [loop('l1', 1)]

  it('counts a session they opened as attended, and an untouched one as missed', () => {
    const marks = markSessions([s1, s2], loops, { s1: ['t:q1'] }, [])
    expect(marks[0].attendance).toBe('attended')
    expect(marks[0].attendancePct).toBe(100)
    expect(marks[1].attendance).toBe('missed')
    expect(marks[1].attendancePct).toBe(0)
  })

  it('never calls a session that has not opened a miss', () => {
    const later = session('s3', 'l1', 3, { scheduledAt: '2099-01-01T00:00:00Z' })
    const marks = markSessions([later], loops, {}, [])
    expect(marks[0].attendance).toBe('upcoming')
  })

  it('reads tasks done off what was handed in, not off what was graded', () => {
    const marks = markSessions([s1], loops, {}, [
      sub('s1', 'q1', { status: 'submitted', score: null }),
    ])
    expect(marks[0].tasksDone).toBe(1)
    expect(marks[0].tasksTotal).toBe(2)
    expect(marks[0].tasksPct).toBe(50)
  })

  it('keeps the child in their own order, course by course', () => {
    const other = session('s0', 'l0', 1)
    const marks = markSessions([s2, other, s1], [loop('l0', 0), loop('l1', 1)], {}, [])
    expect(marks.map(m => m.sessionId)).toEqual(['s0', 's1', 's2'])
    expect(marks.map(m => m.short)).toEqual(['Session 1', 'Session 2', 'Session 3'])
  })

  it('leaves focus on the walk-through until something has been graded', () => {
    /* Two steps in the session (two questions), one of them ticked. */
    const walked = markSessions([s1], loops, { s1: ['t:q1'] }, [])
    expect(walked[0].focus).toBe(50)

    /* Same walk-through, and the graded half is full marks. */
    const scored = markSessions([s1], loops, { s1: ['t:q1'] }, [sub('s1', 'q1')])
    expect(scored[0].focus).toBe(75)
  })
})

describe('summary', () => {
  it('counts only the sessions that have opened', () => {
    const loops = [loop('l1', 1)]
    const open = session('s1', 'l1', 1, { titles: [title('t1', { tasks: [task('q1')] })] })
    const later = session('s2', 'l1', 2, { scheduledAt: '2099-01-01T00:00:00Z' })
    const t = summary(markSessions([open, later], loops, { s1: ['t:q1'] }, [sub('s1', 'q1')]))
    expect(t.sessions).toBe(1)
    expect(t.attended).toBe(1)
    expect(t.attendancePct).toBe(100)
    expect(t.tasksDone).toBe(1)
    expect(t.upcoming).toBe(1)
  })

  it('says nothing rather than zero when no session has opened', () => {
    const t = summary([])
    expect(t).toMatchObject({ sessions: 0, attendancePct: 0, focus: 0 })
  })
})

describe('markProjects', () => {
  const built = session('s1', 'l1', 1, {
    titles: [title('p1', { kind: 'project', tasks: [task('q1')] })],
  })
  const ahead = session('s2', 'l1', 2, {
    titles: [
      title('t2', { tasks: [task('q2')] }),
      title('p2', { kind: 'project', order: 2, tasks: [task('q3')] }),
    ],
  })
  const loops = [loop('l1', 1)]

  it('keeps the sequence, and reads the column the mentor set', () => {
    const rows = markProjects([built, ahead], loops, { s1: ['t:q1'] })
    expect(rows.map(r => r.id)).toEqual(['p1', 'p2'])
    /* Finished every step, but nobody has moved it off Scheduled yet. */
    expect(rows[0].progress).toBe(100)
    expect(rows[0].state).toBe('soon')
    expect(rows[1].state).toBe('soon')
  })

  it('still reports how far a half-finished project has got', () => {
    const two = session('s3', 'l1', 3, {
      titles: [{
        ...title('p3', { kind: 'project', tasks: [task('q4'), task('q5')] }),
        state: 'building' as const,
      }],
    })
    const rows = markProjects([two], loops, { s3: ['t:q4'] })
    expect(rows[0]).toMatchObject({ state: 'building', progress: 50 })
  })

  it('leaves the teaching topics out of it', () => {
    expect(markProjects([session('s4', 'l1', 1, { titles: [title('t4')] })], loops, {})).toEqual([])
  })

  /* What a project is called follows the session it sits in, and a session
     that never said falls back to its course. */
  it('carries the kind of session each project sits in', () => {
    const work = { ...loop('l2', 2), kind: 'work' as const }
    const there = session('s5', 'l2', 1, {
      titles: [title('p5', { kind: 'project' })],
    })
    const rows = markProjects([built, there], [loops[0], work], {})
    expect(rows.map(r => r.kind)).toEqual(['teaching', 'work'])
  })

  /* The hybrid: the one build week inside a course that otherwise teaches. */
  it('lets a session disagree with its course', () => {
    const build = session('s6', 'l1', 2, {
      kind: 'work', titles: [title('p6', { kind: 'project' })],
    })
    const rows = markProjects([built, build], loops, {})
    expect(rows.map(r => r.kind)).toEqual(['teaching', 'work'])
  })
})
