import { describe, expect, it } from 'vitest'
import { countPoints, parseInline, parseOutline, plainText, type OutlineNode } from './outline'

/** The tree as nested arrays of text, headings marked with #. */
const shape = (nodes: OutlineNode[]): unknown[] =>
  nodes.map(n => (n.children.length ? [(n.heading ? '# ' : '') + n.text, shape(n.children)] : (n.heading ? '# ' : '') + n.text))

describe('markdown outline', () => {
  it('reads old one-per-line lists as flat points', () => {
    expect(shape(parseOutline('Read a circuit\n\nSolder a board\n'))).toEqual(['Read a circuit', 'Solder a board'])
  })

  it('nests bullets by indentation, with spaces or tabs', () => {
    const md = '- Electronics\n  - Ohm’s law\n    - V = IR\n  - Soldering\n- Coding\n\t- Python'
    expect(shape(parseOutline(md))).toEqual([
      ['Electronics', [['Ohm’s law', ['V = IR']], 'Soldering']],
      ['Coding', ['Python']],
    ])
  })

  it('reads numbered lists, other bullet marks and task boxes', () => {
    expect(shape(parseOutline('1. Plan\n2) Build\n   * [x] Wire it\n+ Ship\n• Present'))).toEqual([
      'Plan', ['Build', ['Wire it']], 'Ship', 'Present',
    ])
  })

  it('groups points under headings, by heading level', () => {
    const md = '# Level 1\n## Week 1\n- A\n  - A1\n## Week 2\n- B\n# Level 2\nC'
    expect(shape(parseOutline(md))).toEqual([
      ['# Level 1', [['# Week 1', [['A', ['A1']]]], ['# Week 2', ['B']]]],
      ['# Level 2', ['C']],
    ])
  })

  it('nests items under a plain label line, but keeps plain lines as siblings', () => {
    const md = '**Week 1:**\n- Sensors\n- Motors\n**Week 2:**\n- Vision\nClosing note\nAnother note'
    expect(shape(parseOutline(md))).toEqual([
      ['**Week 1:**', ['Sensors', 'Motors']],
      ['**Week 2:**', ['Vision']],
      'Closing note',
      'Another note',
    ])
  })

  it('skips rules, code fences, blank bullets and quote marks', () => {
    expect(shape(parseOutline('---\n```\n- \n> - Quoted\n***\n- Real'))).toEqual(['Quoted', 'Real'])
  })

  it('counts points without headings', () => {
    expect(countPoints(parseOutline('# H\n- A\n  - B\n- C'))).toBe(3)
  })

  it('reads inline bold, italic, code and http links only', () => {
    expect(parseInline('Use **Arduino** with *care*, `pinMode` and [docs](https://arduino.cc)')).toEqual([
      { kind: 'text', text: 'Use ' },
      { kind: 'bold', text: 'Arduino' },
      { kind: 'text', text: ' with ' },
      { kind: 'italic', text: 'care' },
      { kind: 'text', text: ', ' },
      { kind: 'code', text: 'pinMode' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', text: 'docs', href: 'https://arduino.cc' },
    ])
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ kind: 'text', text: '[x](javascript:alert(1))' }])
    expect(plainText('snake_case_name and 2 * 3 * 4')).toBe('snake_case_name and 2 * 3 * 4')
  })
})
