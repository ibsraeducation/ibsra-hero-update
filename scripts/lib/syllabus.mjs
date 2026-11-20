/* ==========================================================================
   The syllabus workbook's own grammar.

   One sheet per course, five columns wide:

     A  the course, repeated on every row
     B  session number        C  session title
     D  the line's own title  E  what it says

   (The electronics sheet carries two more drafts of column E, from two
   people. The first one that has anything is the one used — see `said`.)

   Two kinds of line, told apart by column D:

     "project 2 - blink an led"  starts a project, and the "step N - …"
     lines under it belong to it.
     anything else is a topic: one thing taught, with its explanation.

   Which is exactly Title.kind — 'topic' or 'project' — so the workbook maps
   onto the session editor without inventing a shape for it.

   Kept apart from the SQL writer so the rules below can be tested on their
   own: they are the only part of the import that has to read a human's
   spelling and guess right.
   ========================================================================== */

/** How long one line is given. A topic is a single idea with its answer; a
 *  project is the build. They only feed the "x min of content" readings. */
export const TOPIC_MIN = 5
export const PROJECT_MIN = 20

/** A session whose title says this is the build week: the student is not
 *  being taught something new, they are making the thing. Everything else
 *  follows its course. ("poject" is in the workbook, not a typo here.) */
export const WORK_SESSION = /graduation\s+(?:project|poject)/i

/* "project 3 -", and the four other ways the workbook writes the same
   heading: "sub project 1 -", "main project 2 -", "proejct 2 -", and one
   with no space before the dash. A number is what makes it a heading —
   "project idea" and "final project plan" are notes a mentor wrote inside a
   session, and they stay topics. */
const IS_PROJECT = /^(?:(?:sub|main)\s+)?(?:project|proejct)\s*\d+\s*[-–—:]?\s*/i
const IS_STEP = /^step\s*(\d+)\s*[-–—:]?\s*/i
/** A cell that is nothing but a link. `<a href="…">` text is not one. */
const IS_URL = /^https?:\/\/\S+$/i

/** Misspellings in the workbook's step labels. These become headings we
 *  generate, so they are worth fixing; nothing a mentor wrote is touched. */
const TIDY = [[/\bwirirng\b/gi, 'wiring'], [/\bdigram\b/gi, 'diagram']]

export const clean = v => String(v ?? '').replace(/ /g, ' ').trim()

/** Column E, or the next draft of it that has anything. */
export const said = row => clean(row[4]) || clean(row[5]) || clean(row[6])

const sentence = s => (s ? s[0].toUpperCase() + s.slice(1) : s)
const tidy = s => TIDY.reduce((acc, [re, to]) => acc.replace(re, to), s)

/* ---------------- a sheet → sessions ---------------- */

/**
 * Group one sheet's rows into sessions of titles. Row order is the only
 * order there is: a step belongs to the project heading above it.
 *
 * @param rows the sheet including its header row
 * @returns [{ no, name, titles: [{ kind, name, summary, steps? }] }]
 */
export function readCourse(rows) {
  const body = rows.slice(1).filter(r => clean(r[0]) && (clean(r[1]) || clean(r[3])))
  const sessions = []
  let current = null
  let project = null

  for (const row of body) {
    const no = clean(row[1])
    const sessionName = clean(row[2])
    /* A cell sometimes carries a second line of notes under the heading. */
    const line = clean(row[3]).split('\n')[0].trim()
    const body_ = said(row)
    if (!line) continue

    if (!current || (no && no !== current.no)) {
      current = { no, name: sentence(sessionName), titles: [] }
      sessions.push(current)
      project = null
    }
    /* A sheet sometimes names the session only on its first row. */
    if (!current.name && sessionName) current.name = sentence(sessionName)

    const step = IS_STEP.exec(line)
    if (step && project) {
      /* Step 0 is the aim, and the workbook repeats the project's own line
         there every single time. It is the project's summary, not a task. */
      if (Number(step[1]) === 0) {
        if (!project.summary) project.summary = body_
        continue
      }
      const label = sentence(tidy(line.slice(step[0].length).trim())) || 'Do the step'
      project.steps.push({ n: Number(step[1]), label, body: body_ })
      continue
    }

    if (IS_PROJECT.test(line)) {
      project = {
        kind: 'project',
        name: sentence(line.replace(IS_PROJECT, '').trim()) || 'Untitled project',
        summary: body_,
        steps: [],
      }
      current.titles.push(project)
      continue
    }

    /* A topic between a project's steps does not close the project — one
       session in the workbook teaches `if` conditions between step 3 and
       step 4, and those two steps belong to the project above them, not to
       the explanation that interrupted it. Only the next project heading,
       or the next session, closes one.

       A step that never had a heading above it is still something a mentor
       wrote, so it lands here as a topic rather than falling out. */
    current.titles.push({ kind: 'topic', name: sentence(line), summary: body_ })
  }
  return sessions
}

/* ---------------- sessions → what the editor holds ---------------- */

const pad = n => String(n).padStart(2, '0')

/* Derived, never random, so a second run lands on the same rows. The shape
   the tables check for is <prefix>_<4–40 alphanumerics>. */
export const loopId = slug => `lp_syl${slug}`
export const sessionId = (slug, i) => `ses_syl${slug}${pad(i + 1)}`
const titleId = (slug, i, j) => `ttl_syl${slug}${pad(i + 1)}${pad(j + 1)}`
const taskId = (slug, i, j, k) => `tsk_syl${slug}${pad(i + 1)}${pad(j + 1)}${pad(k + 1)}`
/* A step owns a recording, and sometimes a file too, so the two are told
   apart by the last letter rather than by another number. */
const clipId = (slug, i, j, k) => `mat_syl${slug}${pad(i + 1)}${pad(j + 1)}${pad(k + 1)}v`
const fileId = (slug, i, j, k) => `mat_syl${slug}${pad(i + 1)}${pad(j + 1)}${pad(k + 1)}f`

/**
 * A session's titles in the JSON shape `sessions.content` holds, plus the
 * answer key that must not travel with it.
 *
 * A topic is taught and then checked: it keeps the mentor's explanation on
 * screen, and carries one question whose model answer is that same
 * explanation. The question is the title itself, because the workbook
 * already writes its titles as questions — "what is a website", "how colors
 * make us feel". The platform asks for this anyway: `readiness()` will not
 * publish a topic with no Q&A.
 *
 * A project is shown and then done: every step is a recording the mentor
 * posts, with the question for that step straight after it. A Title holds
 * one video, so the steps' recordings are materials of kind 'video' — which
 * is what that kind is for — and `flowOrder` is what interleaves them,
 * since the default order would run all the videos and then all the
 * questions.
 *
 * @returns {{ content: object, keys: object }} `keys` is keyed by task id and
 *   belongs in `session_keys`; putting a model answer in `content` is
 *   refused by the table, and rightly.
 */
export function contentOf(slug, sessionIndex, titles) {
  const keys = {}
  const flowOrder = []

  const out = titles.map((t, j) => {
    const id = titleId(slug, sessionIndex, j)
    const base = {
      id,
      order: j,
      name: t.name,
      ...(t.summary ? { summary: t.summary } : {}),
      kind: t.kind,
      video: null,
    }
    /* Listed before anything else although there is no recording yet: an
       unknown key is skipped, so this does nothing today and puts the video
       first the day a mentor adds one. Left out, it would be appended after
       the questions instead. */
    flowOrder.push(`v:${id}`)

    if (t.kind === 'topic') {
      const ask = taskId(slug, sessionIndex, j, 0)
      if (t.summary) keys[ask] = { modelAnswer: t.summary }
      flowOrder.push(`t:${ask}`)
      return {
        ...base,
        estimatedMin: TOPIC_MIN,
        materials: [],
        tasks: [{
          id: ask,
          order: 0,
          kind: 'short',
          category: 'technical',
          question: t.name,
          options: [],
          points: 5,
          required: true,
        }],
      }
    }

    const materials = []
    const tasks = []
    for (const [k, step] of t.steps.entries()) {
      const heading = `Step ${step.n} — ${step.label}`
      const link = IS_URL.test(step.body)
      /* The recording of the step. Empty until the mentor posts it, and
         `readiness()` counts it as missing until they do. */
      const clip = {
        id: clipId(slug, sessionIndex, j, k),
        order: materials.length,
        kind: 'video',
        category: 'video',
        name: heading,
        url: '',
        size: 0,
        ...(step.body && !link ? { note: step.body } : {}),
      }
      materials.push(clip)
      flowOrder.push(`m:${clip.id}`)

      /* A step whose cell is only a link is a reference for it — a wiring
         diagram, a clip of the finished thing. It sits between the
         recording and the question. */
      if (link) {
        const file = {
          id: fileId(slug, sessionIndex, j, k),
          order: materials.length,
          kind: 'link',
          name: heading,
          url: step.body,
          size: 0,
          category: 'material',
        }
        materials.push(file)
        flowOrder.push(`m:${file.id}`)
      }

      /* "Show result" is the one the student answers with a picture of
         what they made; the rest are written up. */
      const shows = /show result|present to class/i.test(step.label)
      const ask = taskId(slug, sessionIndex, j, k)
      tasks.push({
        id: ask,
        order: k,
        kind: shows ? 'imagetext' : 'short',
        category: shows ? 'imagetext' : 'technical',
        question: heading,
        ...(link || !step.body ? {} : { hint: step.body }),
        options: [],
        points: shows ? 10 : 5,
        required: true,
      })
      flowOrder.push(`t:${ask}`)
    }
    return { ...base, estimatedMin: PROJECT_MIN, materials, tasks }
  })

  return { content: { titles: out, flowOrder }, keys }
}
