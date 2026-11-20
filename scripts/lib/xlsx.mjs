/* ==========================================================================
   A read-only .xlsx reader, in Node's standard library alone.

   An .xlsx is a ZIP of XML parts, and the two things we need out of it —
   the sheet names and the cell text — do not justify a dependency. So this
   walks the ZIP central directory itself, inflates the parts it wants, and
   pulls values out of the XML with regular expressions.

   What it deliberately does not do: formulas, dates, number formats,
   styles, merged cells. Every value comes back as the string Excel stored.
   The syllabus workbook is text in a grid, which is all this is for.
   ========================================================================== */

import { inflateRawSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

/* ---------------- the ZIP container ---------------- */

/** Every file in the archive, as a map of name → Buffer. */
function unzip(buf) {
  /* The end-of-central-directory record is last, but a trailing comment can
     push it back up to 64KB, so it is found by scanning backwards. */
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 65557; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('not a zip file: no end-of-central-directory record')

  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map()

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central directory entry at ${p}`)
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localAt = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)

    /* The local header repeats the name and extra fields, and its own extra
       length can differ from the central one — so it is read, not assumed. */
    if (buf.readUInt32LE(localAt) !== 0x04034b50) throw new Error(`bad local header for ${name}`)
    const lNameLen = buf.readUInt16LE(localAt + 26)
    const lExtraLen = buf.readUInt16LE(localAt + 28)
    const start = localAt + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compressedSize)

    if (method === 0) out.set(name, raw)
    else if (method === 8) out.set(name, inflateRawSync(raw))
    else throw new Error(`${name}: unsupported compression method ${method}`)

    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/* ---------------- the XML inside it ---------------- */

const ENTITIES = {
  '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&',
}

const unescape = s => s
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  /* &amp; last, so "&amp;lt;" survives as the text "&lt;" rather than
     turning into a "<" that was never in the cell. */
  .replace(/&(lt|gt|quot|apos|amp);/g, m => ENTITIES[m])

/** "BC12" → 54. Zero-based, so it indexes an array of cells. */
function columnIndex(ref) {
  let n = 0
  for (const ch of ref) {
    const c = ch.charCodeAt(0)
    if (c < 65 || c > 90) break
    n = n * 26 + (c - 64)
  }
  return n - 1
}

/** All the <t> text inside one XML fragment, concatenated. A cell split
 *  across runs (bold word in the middle) comes back as one string. */
function textOf(fragment) {
  let out = ''
  for (const m of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += unescape(m[1])
  return out
}

/* ---------------- the workbook ---------------- */

/**
 * Read a workbook.
 * @returns {Map<string, string[][]>} sheet name → rows → cells, both dense
 *   and zero-based. Missing cells are '' rather than holes.
 */
export function readWorkbook(path) {
  const zip = unzip(readFileSync(path))
  const part = name => {
    const b = zip.get(name)
    if (!b) throw new Error(`${path}: missing ${name}`)
    return b.toString('utf8')
  }

  /* Shared strings: most cell text is pooled here and referenced by index. */
  const shared = []
  if (zip.has('xl/sharedStrings.xml')) {
    for (const m of part('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(textOf(m[1]))
    }
  }

  /* A sheet's file name is reached through a relationship id, not directly. */
  const rels = new Map()
  for (const m of part('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1]
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1]
    if (id && target) rels.set(id, target)
  }

  const sheets = new Map()
  for (const m of part('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = /\bname="([^"]+)"/.exec(m[1])?.[1]
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1]
    if (!name || !rid) continue
    const target = rels.get(rid)
    if (!target) continue
    const file = target.startsWith('/')
      ? target.slice(1)
      : 'xl/' + target.replace(/^\.\//, '')
    sheets.set(unescape(name), readSheet(part(file), shared))
  }
  return sheets
}

function readSheet(xml, shared) {
  const rows = []
  let width = 0

  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const index = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1) - 1
    const cells = []
    /* Both forms: <c .../> for an empty cell, <c ...>…</c> for a full one. */
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cm[1])?.[1]
      if (!ref) continue
      const type = /\bt="([^"]+)"/.exec(cm[1])?.[1]
      const body = cm[2] ?? ''
      let value = ''
      if (type === 's') {
        const i = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
        value = i == null ? '' : shared[Number(i)] ?? ''
      } else if (type === 'inlineStr') {
        value = textOf(body)
      } else {
        /* A formula cell carries both <f> and <v>; the cached <v> is the
           value, and <f> is skipped because this reader does not evaluate. */
        value = unescape(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
      }
      cells[columnIndex(ref)] = value
    }
    rows[index] = cells
    width = Math.max(width, cells.length)
  }

  /* Dense, so callers can index any column of any row without guarding. */
  return Array.from({ length: rows.length }, (_, r) =>
    Array.from({ length: width }, (_, c) => rows[r]?.[c] ?? ''))
}
