import { describe, expect, it } from 'vitest'
import { markProjects, markSessions, released, totalsOf } from './progressModel'
import type { MySubmission } from '@/lib/api/submissions'
import type { Loop, Session, Task, Title } from '@/lib/types'

const title = (id: string, p: Partial<Title> = {}): Title => ({
  id, order: 1, name: id, estimatedMin: 10, video: null, materials: [], tasks: [], ...p,
})

const task = (id: string, points = 10): Task => ({
  id, order: 1, kind: 'mcq', question: id, points, required: false, options: [],
})

const session = (id: string, loopId: string, order: number, p: Partial<Session> = {}): Session => ({
  id, loopId, code: id, name: id, summary: '', type: 'recorded', status: 'published',
  order, instructorId: null, scheduledAt: null, durationMin: 60,
  titles: [], createdAt: '', updatedAt: '', ...p,
})

const loop = (id: string, index: number): Loop => ({
  id, trackId: 'trk', code: id, name: id, index,
  startDate: '2026-01-01', endDate: '2026-03-01', status: 'running', cohortIds: [],
})

const sub = (sessionId: string, taskId: string, p: Partial<MySubmission> = {}): MySubmission => ({
  id: `${sessionId}:${taskId}`, session_id: sessionId, task_id: taskId, task_kind: 'mcq',
  status: 'graded', is_correct: true, score: 10, points: 10, attempts: 1, feedback: null,
  choice_ids: null, answer_text: null, link_url: null, file_path: null, updated_at: '', ...p,
})

const loops = [loop('l1', 1), loop('l2', 2)]

describe('released', () => {
  it('holds back a draft, and a recording whose date has not come', () => {
    expect(released(session('a', 'l1', 1, { status: 'draft' }))).toBe(false)
    expect(released(session('a', 'l1', 1, { scheduledAt: '2099-01-01T00:00:00Z' }))).toBe(false)
    expect(released(session('a', 'l1', 1))).toBe(true)
  })

  it('opens a live class as soon as it is published — its time is when to turn up', () => {
    expect(released(session('a', 'l1', 1, { type: 'live', scheduledAt: '2099-01-01T00:00:00Z' }))).toBe(true)
  })
})

describe('markSessions', () => {
  const s1 = session('s1', 'l1', 1, { titles: [title('t1', { tasks: [task('q1'), task('q2')] })] })
  const s2 = session('s2', 'l1', 2, { titles: [title('t2', { tasks: [task('q3')] })] })

  it('reads attendance off the student opening the session', () => {
    const marks = markSessions([s1, s2], loops, { s1: ['t:q1'] }, [])
    expect(marks[0].attend).toBe('attended')
    expect(marks[1].attend).toBe('missed')
  })

  it('never calls a session that has not been released a miss', () => {
    const later = session('s3', 'l1', 3, { scheduledAt: '2099-01-01T00:00:00Z' })
    expect(markSessions([later], loops, {}, [])[0].attend).toBe('ahead')
  })

  it('takes an answer handed in as turning up, even with nothing ticked', () => {
    expect(markSessions([s1], loops, {}, [sub('s1', 'q1')])[0].attend).toBe('attended')
  })

  it('scores over what was marked, not over what was asked', () => {
    const marks = markSessions([s1], loops, {}, [
      sub('s1', 'q1', { score: 5 }),
      /* Handed in, not yet marked — it cannot drag the score down. */
      sub('s1', 'q2', { status: 'submitted', score: null }),
    ])
    expect(marks[0].score).toBe(50)
    expect(marks[0].gradedCount).toBe(1)
    expect(marks[0].tasksAnswered).toBe(2)
  })

  it('leaves a session with nothing marked without a score', () => {
    expect(markSessions([s1], loops, { s1: ['t:q1'] }, [])[0].score).toBeNull()
  })

  it('numbers the sessions in the order they are met, course by course', () => {
    const other = session('s9', 'l2', 1)
    const marks = markSessions([other, s2, s1], loops, {}, [])
    expect(marks.map(m => m.id)).toEqual(['s1', 's2', 's9'])
    expect(marks.map(m => m.short)).toEqual(['S1', 'S2', 'S3'])
  })
})

describe('markProjects', () => {
  const project = title('p1', { kind: 'project', tasks: [task('a'), task('b')] })
  const topic = title('t1', { kind: 'topic', tasks: [task('c')] })
  const s1 = session('s1', 'l1', 1, { titles: [topic, project] })

  it('counts only the titles marked as a project', () => {
    expect(markProjects([s1], loops, {}).map(p => p.name)).toEqual(['p1'])
  })

  it('takes the column from the mentor, not from the ticked steps', () => {
    /* Every step done still reads as scheduled while nobody has moved it. */
    expect(markProjects([s1], loops, { s1: ['t:a', 't:b'] })[0].state).toBe('soon')

    const moved = session('s1', 'l1', 1, {
      titles: [topic, { ...project, state: 'building' as const }],
    })
    expect(markProjects([moved], loops, {})[0].state).toBe('building')
  })

  it('reports how far a project being built has got', () => {
    const p = markProjects([s1], loops, { s1: ['t:a'] })[0]
    expect(p.progress).toBe(50)
    expect(p.stepsDone).toBe(1)
    expect(p.stepsTotal).toBe(2)
  })
})

describe('totalsOf', () => {
  const s1 = session('s1', 'l1', 1, { titles: [title('t1', { tasks: [task('q1'), task('q2')] })] })
  const s2 = session('s2', 'l1', 2, { titles: [title('t2', { tasks: [task('q3')] })] })
  const ahead = session('s3', 'l1', 3, { scheduledAt: '2099-01-01T00:00:00Z' })

  it('counts attendance over the released sessions only', () => {
    const marks = markSessions([s1, s2, ahead], loops, { s1: ['t:q1'] }, [])
    const t = totalsOf(marks, [])
    expect(t.opened).toBe(2)
    expect(t.attended).toBe(1)
    expect(t.missed).toBe(1)
    expect(t.ahead).toBe(1)
    expect(t.attendancePct).toBe(50)
  })

  it('averages the score over the sessions that carry one', () => {
    const marks = markSessions([s1, s2], loops, {}, [
      sub('s1', 'q1', { score: 10 }),
      sub('s2', 'q3', { score: 6 }),
    ])
    const t = totalsOf(marks, [])
    expect(t.scored).toBe(2)
    expect(t.score).toBe(80)
  })

  it('has no score at all before anything is marked', () => {
    expect(totalsOf(markSessions([s1], loops, {}, []), []).score).toBeNull()
  })

  it('splits the projects three ways', () => {
    const withProjects = session('s4', 'l1', 4, {
      titles: [
        { ...title('p1', { kind: 'project', tasks: [task('a')] }), state: 'done' as const },
        { ...title('p2', { kind: 'project', tasks: [task('b'), task('c')] }), state: 'building' as const },
        title('p3', { kind: 'project', tasks: [task('d')] }),
      ],
    })
    const projects = markProjects([withProjects], loops, { s4: ['t:a', 't:b'] })
    const t = totalsOf([], projects)
    expect([t.done, t.building, t.soon]).toEqual([1, 1, 1])
    expect(t.projects).toBe(3)
  })
})
