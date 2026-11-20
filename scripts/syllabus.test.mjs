import { describe, expect, it } from 'vitest'
import { contentOf, readCourse } from './lib/syllabus.mjs'

/* contentOf returns the document and the answer key apart; most of these
   only care about the document. */
const contentOf2 = (...a) => contentOf(...a).content

/* The import has to read a human's spelling and guess right, and getting it
   wrong is silent: a missed heading does not fail, it just turns a build
   into a wall of topics. Every case here is one the real workbook contains.

   A row is [course, session no, session title, line, what it says]. */

const row = (no, session, line, says = '') => ['A course', no, session, line, says]
const header = ['titles', 'session no', 'session title', 'titles', 'content']
const sheet = (...rows) => [header, ...rows]

const kinds = titles => titles.map(t => t.kind)
const names = titles => titles.map(t => t.name)

describe('telling a project heading from a topic', () => {
  it('reads every spelling the workbook uses for one', () => {
    const [s] = readCourse(sheet(
      row('1.0', 'Intro', 'project 1 - turn on led'),
      row('1.0', 'Intro', 'sub project 2 - beep without delay'),
      row('1.0', 'Intro', 'main project 3 - obstacle avoider'),
      row('1.0', 'Intro', 'proejct 4 - distance alarm'),
      row('1.0', 'Intro', 'project 5- turn on led from 9v source'),
    ))
    expect(kinds(s.titles)).toEqual(Array(5).fill('project'))
  })

  it('strips the heading, because the editor numbers projects itself', () => {
    const [s] = readCourse(sheet(
      row('1.0', 'Intro', 'sub project 2 - beep without delay (millis)'),
    ))
    expect(names(s.titles)).toEqual(['Beep without delay (millis)'])
  })

  /* Both of these are real lines inside graduation sessions. Neither opens
     a project — a heading is a heading because it is numbered. */
  it('leaves an unnumbered line about projects as a topic', () => {
    const [s] = readCourse(sheet(
      row('9.0', 'Graduation', 'final project plan', 'control page + movement'),
      row('9.0', 'Graduation', 'project idea', 'one website that watches the home'),
    ))
    expect(kinds(s.titles)).toEqual(['topic', 'topic'])
  })

  it('takes only the first line when a cell carries a note under it', () => {
    const [s] = readCourse(sheet(
      row('2.0', 'Serial', 'project 1 - print your name in serial monitor\nproject idea'),
    ))
    expect(names(s.titles)).toEqual(['Print your name in serial monitor'])
  })
})

describe('a project and its steps', () => {
  const [session] = readCourse(sheet(
    row('1.0', 'Electronics', 'what is electricity', 'movement of electrons'),
    row('1.0', 'Electronics', 'project 1 - turn on led', 'connect pins to the nodemcu'),
    row('1.0', 'Electronics', 'step 0 - aim / objective', 'connect pins to the nodemcu'),
    row('1.0', 'Electronics', 'step 1 - hardware required', 'led - nodemcu - wires'),
    row('1.0', 'Electronics', 'step 2 - wirirng digram', 'long pin to 3.3v'),
    row('1.0', 'Electronics', 'step 4 - show result', '(pictures and videos)'),
  ))
  const { titles } = contentOf2('mcu', 0, session.titles)
  const project = titles[1]

  it('keeps the steps on the project, not loose in the session', () => {
    expect(kinds(titles)).toEqual(['topic', 'project'])
    expect(project.tasks).toHaveLength(3)
  })

  /* Step 0 repeats the project's own line in all 107 places it appears, so
     it is the summary. A task saying the same thing twice helps nobody. */
  it('folds step 0 into the summary instead of making a task of it', () => {
    expect(project.summary).toBe('connect pins to the nodemcu')
    expect(project.tasks.map(t => t.question)).not.toContain('Step 0 — Aim / objective')
  })

  it('numbers a step by what the workbook called it, not by its position', () => {
    expect(project.tasks.map(t => t.question)).toEqual([
      'Step 1 — Hardware required',
      'Step 2 — Wiring diagram',
      'Step 4 — Show result',
    ])
  })

  it('asks for a picture of the thing on the step that shows it', () => {
    expect(project.tasks.at(-1)).toMatchObject({ kind: 'imagetext', category: 'imagetext', points: 10 })
    expect(project.tasks[0]).toMatchObject({ kind: 'short', category: 'technical', points: 5 })
  })

  it('puts what the mentor wrote where the student reads it', () => {
    expect(project.tasks[0].hint).toBe('led - nodemcu - wires')
  })
})

describe('the awkward shapes', () => {
  /* Electronics session 2: `if` conditions are taught between step 3 and
     step 4 of the same project. Closing the project on a topic would have
     dropped those last two steps out of it. */
  it('carries a project across the topics that interrupt its steps', () => {
    const [s] = readCourse(sheet(
      row('2.0', 'Serial', 'project 2 - control led using serial monitor'),
      row('2.0', 'Serial', 'step 1 - hardware used'),
      row('2.0', 'Serial', 'step 3 - before coding'),
      row('2.0', 'Serial', 'what is control statements'),
      row('2.0', 'Serial', 'what is if condition'),
      row('2.0', 'Serial', 'step 4 - coding'),
      row('2.0', 'Serial', 'step 5 - show result'),
    ))
    const { titles } = contentOf2('mcu', 1, s.titles)
    expect(kinds(titles)).toEqual(['project', 'topic', 'topic'])
    expect(titles[0].tasks.map(t => t.question)).toEqual([
      'Step 1 — Hardware used',
      'Step 3 — Before coding',
      'Step 4 — Coding',
      'Step 5 — Show result',
    ])
  })

  it('closes a project at the next heading, not before', () => {
    const [s] = readCourse(sheet(
      row('6.0', 'Avoider', 'main project 1 - obstacle avoider'),
      row('6.0', 'Avoider', 'step 1 - hardware used'),
      row('6.0', 'Avoider', 'sub project 1 - beep without delay'),
      row('6.0', 'Avoider', 'step 1 - hardware used'),
    ))
    const { titles } = contentOf2('rob', 5, s.titles)
    expect(titles.map(t => t.tasks.length)).toEqual([1, 1])
  })

  it('closes a project at the next session', () => {
    const sessions = readCourse(sheet(
      row('1.0', 'One', 'project 1 - a thing'),
      row('2.0', 'Two', 'step 1 - hardware used'),
    ))
    expect(sessions).toHaveLength(2)
    expect(kinds(sessions[1].titles)).toEqual(['topic'])
  })

  /* A step with no heading above it is still something a mentor wrote. */
  it('keeps an orphan step rather than dropping it', () => {
    const [s] = readCourse(sheet(row('1.0', 'One', 'step 1 - hardware used', 'a wire')))
    expect(s.titles).toEqual([{ kind: 'topic', name: 'Step 1 - hardware used', summary: 'a wire' }])
  })
})

describe('a step that is only a link', () => {
  const [s] = readCourse(sheet(
    row('1.0', 'Electronics', 'project 1 - turn on led'),
    row('1.0', 'Electronics', 'step 3 - wiring digram', 'https://drive.google.com/file/d/abc/view'),
    row('1.0', 'Electronics', 'step 4 - show result', '<a href="https://google.com">google</a>'),
  ))
  const project = contentOf2('mcu', 0, s.titles).titles[0]

  it('hangs the link on the project as a file, beside the step recording', () => {
    expect(project.materials.map(m => m.kind)).toEqual(['video', 'link', 'video'])
    expect(project.materials[1]).toMatchObject({
      kind: 'link', name: 'Step 3 — Wiring diagram', url: 'https://drive.google.com/file/d/abc/view',
    })
  })

  /* The link is the reference, not the recording — pointing the step's
     video at a wiring diagram would be the wrong thing in the player. */
  it('leaves the step recording empty rather than pointing it at the link', () => {
    expect(project.materials[0]).toMatchObject({ kind: 'video', url: '' })
  })

  it('still asks the student for the step, with the file beside it', () => {
    expect(project.tasks).toHaveLength(2)
    expect(project.tasks[0].hint).toBeUndefined()
  })

  /* A cell that merely mentions a URL is prose, not a file. */
  it('does not mistake written-out HTML for a link', () => {
    expect(project.tasks[1].hint).toBe('<a href="https://google.com">google</a>')
  })
})

describe('the three columns of content', () => {
  it('falls back to the next draft when the first is empty', () => {
    const [s] = readCourse([
      ['titles', 'session no', 'session title', 'titles', 'content', 'amr content', 'ahmed content'],
      ['A course', '1.0', 'Electronics', 'led polarity', '', '', 'the long leg is positive'],
    ])
    expect(s.titles[0].summary).toBe('the long leg is positive')
  })

  it('leaves a line with nothing written against it as a title alone', () => {
    const [s] = readCourse(sheet(row('2.0', 'Serial', 'what is serial monitor')))
    const { titles } = contentOf2('mcu', 1, s.titles)
    expect(titles[0].name).toBe('What is serial monitor')
    expect(titles[0].summary).toBeUndefined()
  })
})

describe('ids', () => {
  const [s] = readCourse(sheet(
    row('1.0', 'One', 'a topic'),
    row('1.0', 'One', 'project 1 - a build'),
    row('1.0', 'One', 'step 1 - hardware used'),
  ))

  /* Re-running the import has to land on the same rows, or it would add a
     second copy of everything each time the workbook changes. */
  it('derives every id from where the thing sits, so a re-run is an update', () => {
    expect(JSON.stringify(contentOf('web', 0, s.titles)))
      .toBe(JSON.stringify(contentOf('web', 0, s.titles)))
  })

  it('shapes them the way the tables check for', () => {
    const { titles } = contentOf2('web', 0, s.titles)
    const ids = titles.flatMap(t => [t.id, ...t.tasks.map(k => k.id), ...t.materials.map(m => m.id)])
    expect(ids).toHaveLength(5)
    for (const id of ids) expect(id).toMatch(/^[a-z]{2,4}_[A-Za-z0-9]{4,40}$/)
  })

  it('never repeats one', () => {
    const { titles } = contentOf2('web', 0, s.titles)
    const ids = titles.flatMap(t => [t.id, ...t.tasks.map(k => k.id), ...t.materials.map(m => m.id)])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps two courses apart', () => {
    const web = contentOf2('web', 0, s.titles).titles[0].id
    const mcu = contentOf2('mcu', 0, s.titles).titles[0].id
    expect(web).not.toBe(mcu)
  })
})

describe('a topic is taught, then checked', () => {
  const [s] = readCourse(sheet(
    row('1.0', 'Electronics', 'what is electricity', 'movement of electrons'),
    row('1.0', 'Electronics', 'what is serial monitor'),
  ))
  const { content, keys } = contentOf('mcu', 0, s.titles)

  /* `readiness()` will not publish a topic with no Q&A, so this is the
     platform's own rule as much as the syllabus's. */
  it('gives every topic exactly one question', () => {
    expect(content.titles.map(t => t.tasks.length)).toEqual([1, 1])
  })

  /* The workbook already writes its titles as questions — "what is a
     website", "how colors make us feel" — so the title is the question. */
  it('asks the title itself', () => {
    expect(content.titles[0].tasks[0]).toMatchObject({
      question: 'What is electricity', kind: 'short', category: 'technical', required: true,
    })
  })

  it('keeps the explanation on screen for the student', () => {
    expect(content.titles[0].summary).toBe('movement of electrons')
  })

  /* …and gives the mentor the same words to mark against. They travel
     apart: the table refuses a `modelAnswer` anywhere inside `content`. */
  it('gives the mentor the explanation as the answer key', () => {
    const ask = content.titles[0].tasks[0].id
    expect(keys[ask]).toEqual({ modelAnswer: 'movement of electrons' })
    expect(JSON.stringify(content)).not.toContain('modelAnswer')
  })

  it('leaves out an answer key for a title nobody has written against yet', () => {
    expect(keys[content.titles[1].tasks[0].id]).toBeUndefined()
  })
})

describe('a project step is shown, then done', () => {
  const [s] = readCourse(sheet(
    row('1.0', 'Electronics', 'project 1 - turn on led', 'the aim'),
    row('1.0', 'Electronics', 'step 1 - hardware used', 'led - nodemcu - wires'),
    row('1.0', 'Electronics', 'step 4 - show result', '(pictures and videos)'),
  ))
  const { content } = contentOf('mcu', 0, s.titles)
  const project = content.titles[0]

  it('gives every step a recording of its own', () => {
    expect(project.materials.map(m => m.kind)).toEqual(['video', 'video'])
    expect(project.materials[0]).toMatchObject({
      kind: 'video', category: 'video', name: 'Step 1 — Hardware used', url: '',
      note: 'led - nodemcu - wires',
    })
  })

  it('keeps the question after it', () => {
    expect(project.tasks.map(t => t.question))
      .toEqual(['Step 1 — Hardware used', 'Step 4 — Show result'])
    expect(project.tasks.at(-1)).toMatchObject({ kind: 'imagetext', points: 10 })
  })

  /* The default order runs a title's materials and then its tasks, which
     would be every recording followed by every question. The sequence is
     what puts each question back beside the step it belongs to. */
  it('interleaves them, because the default order would not', () => {
    const [clip1, clip2] = project.materials
    const [ask1, ask2] = project.tasks
    expect(content.flowOrder).toEqual([
      `v:${project.id}`, `m:${clip1.id}`, `t:${ask1.id}`, `m:${clip2.id}`, `t:${ask2.id}`,
    ])
  })

  /* Nothing is recorded yet, so the key does nothing today; it is listed so
     the topic's own video lands first rather than after its questions on
     the day a mentor adds one. */
  it('reserves the title’s own recording at the front', () => {
    expect(content.flowOrder[0]).toBe(`v:${project.id}`)
  })

  it('lists every item exactly once, and nothing that does not exist', () => {
    const real = new Set([
      `v:${project.id}`,
      ...project.materials.map(m => `m:${m.id}`),
      ...project.tasks.map(t => `t:${t.id}`),
    ])
    expect(new Set(content.flowOrder).size).toBe(content.flowOrder.length)
    for (const key of content.flowOrder) expect(real.has(key)).toBe(true)
  })
})
