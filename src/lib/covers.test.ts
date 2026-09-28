import { describe, expect, it } from 'vitest'
import { coversToMarkdown, coversVideos, newSection, parseCovers } from './covers'

const shape = (md: string) => parseCovers(md).map(({ name, body }) => ({ name, body }))

describe('covers', () => {
  it('reads one tab per heading', () => {
    expect(shape('## Electronics\n- Reads a diagram\n- Solders\n## Programming\n- Python')).toEqual([
      { name: 'Electronics', body: '- Reads a diagram\n- Solders' },
      { name: 'Programming', body: '- Python' },
    ])
  })

  it('keeps what sits above the first heading, unnamed', () => {
    expect(shape('- Why build early\n## Electronics\n- Solders')).toEqual([
      { name: '', body: '- Why build early' },
      { name: 'Electronics', body: '- Solders' },
    ])
  })

  it('reads a plain list as one unnamed tab', () => {
    expect(shape('- A\n- B')).toEqual([{ name: '', body: '- A\n- B' }])
  })

  it('keeps a heading with nothing under it', () => {
    expect(shape('## Empty')).toEqual([{ name: 'Empty', body: '' }])
  })

  it('has no tabs for an empty document', () => {
    expect(parseCovers('')).toEqual([])
    expect(parseCovers(null)).toEqual([])
  })

  it('keeps sub-bullets and blank lines inside a tab', () => {
    expect(shape('## A\n- One\n  - Deep\n\n- Two')).toEqual([
      { name: 'A', body: '- One\n  - Deep\n\n- Two' },
    ])
  })

  it('writes tabs back as headings', () => {
    expect(coversToMarkdown([
      newSection('Electronics', '- Solders'),
      newSection('Programming', '- Python'),
    ])).toBe('## Electronics\n- Solders\n## Programming\n- Python')
  })

  it('writes an unnamed tab without a heading', () => {
    expect(coversToMarkdown([newSection('', '- A')])).toBe('- A')
  })

  it('leaves out a tab that is still empty', () => {
    expect(coversToMarkdown([
      newSection('Electronics', '- Solders'),
      newSection('', ''),
    ])).toBe('## Electronics\n- Solders')
  })

  it('pairs each tab with its video by position', () => {
    const tabs = parseCovers('## A\n- One\n## B\n- Two', ['https://a', '', 'https://c'])
    expect(tabs.map(t => t.video)).toEqual(['https://a', ''])
  })

  it('has no video on a tab that was never given one', () => {
    expect(parseCovers('## A\n- One').map(t => t.video)).toEqual([''])
  })

  it('writes the videos in tab order, without trailing blanks', () => {
    expect(coversVideos([
      newSection('A', '- One', 'https://a'),
      newSection('B', '- Two'),
      newSection('C', '- Three'),
    ])).toEqual(['https://a'])
  })

  it('keeps a blank video between two that are set', () => {
    expect(coversVideos([
      newSection('A', '- One', 'https://a'),
      newSection('B', '- Two'),
      newSection('C', '- Three', 'https://c'),
    ])).toEqual(['https://a', '', 'https://c'])
  })

  it('leaves an empty tab out of the videos, as it does of the document', () => {
    const tabs = [newSection('', ''), newSection('B', '- Two', 'https://b')]
    expect(coversVideos(tabs)).toEqual(['https://b'])
    expect(coversToMarkdown(tabs)).toBe('## B\n- Two')
  })

  it('round-trips tabs and their videos together', () => {
    const tabs = [newSection('A', '- One', 'https://a'), newSection('B', '- Two', 'https://b')]
    const back = parseCovers(coversToMarkdown(tabs), coversVideos(tabs))
    expect(back.map(({ name, body, video }) => ({ name, body, video })))
      .toEqual(tabs.map(({ name, body, video }) => ({ name, body, video })))
  })

  it('round-trips a document unchanged', () => {
    const md = '- Loose\n## Electronics\n- Reads a diagram\n  - Ohm’s law\n## Programming\n- Python'
    expect(coversToMarkdown(parseCovers(md))).toBe(md)
  })
})
