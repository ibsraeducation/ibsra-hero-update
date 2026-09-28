import { describe, expect, it } from 'vitest'
import { titleKind, titleLabel, titleNumber } from './types'
import type { Title } from './types'

/* A title is either a topic (something taught) or a project (something
   built). Both are the same box, so everything here is about the label. */

type T = Pick<Title, 'id' | 'kind'>
const t = (id: string, kind?: Title['kind']): T => ({ id, kind })

/* topic, project, topic, project — deliberately interleaved, because that is
   where numbering per kind is the only thing that reads right. */
const LIST: T[] = [t('a'), t('b', 'project'), t('c', 'topic'), t('d', 'project')]

describe('titleKind', () => {
  it('reads a title authored before projects existed as a topic', () => {
    expect(titleKind(t('a'))).toBe('topic')
  })

  it('takes the title at its word otherwise', () => {
    expect(titleKind(t('b', 'project'))).toBe('project')
    expect(titleKind(t('c', 'topic'))).toBe('topic')
  })
})

describe('titleNumber', () => {
  it('counts each kind from one, ignoring the other', () => {
    expect(titleNumber(LIST, 'a')).toBe(1)
    expect(titleNumber(LIST, 'c')).toBe(2)
    expect(titleNumber(LIST, 'b')).toBe(1)
    expect(titleNumber(LIST, 'd')).toBe(2)
  })

  it('never renumbers the topics when a project is added', () => {
    const before = LIST.map(x => titleNumber(LIST, x.id))
    const after = [...LIST, t('e', 'project')]
    expect(LIST.map(x => titleNumber(after, x.id))).toEqual(before)
  })

  it('says nothing about a title that is not there', () => {
    expect(titleNumber(LIST, 'gone')).toBe(0)
  })
})

describe('titleLabel', () => {
  it('is the word plus the number, as every screen shows it', () => {
    expect(titleLabel(LIST, 'c')).toBe('Topic 2')
    expect(titleLabel(LIST, 'd')).toBe('Project 2')
  })

  it('is empty for a title that is not there, never "undefined 0"', () => {
    expect(titleLabel(LIST, 'gone')).toBe('')
  })
})
