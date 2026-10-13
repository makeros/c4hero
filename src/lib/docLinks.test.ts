import { describe, expect, it } from 'vitest'
import { createSlugger, resolveDocLink, slugify } from './docLinks'

describe('resolveDocLink', () => {
  const cur = 'docs/guide/intro.md'
  it('resolves a sibling', () => {
    expect(resolveDocLink(cur, 'other.md')).toEqual({ kind: 'doc', path: 'docs/guide/other.md', fragment: '' })
    expect(resolveDocLink(cur, './other.md')).toEqual({ kind: 'doc', path: 'docs/guide/other.md', fragment: '' })
  })
  it('resolves a subfolder', () => {
    expect(resolveDocLink(cur, 'sub/x.markdown')).toEqual({ kind: 'doc', path: 'docs/guide/sub/x.markdown', fragment: '' })
  })
  it('resolves ../', () => {
    expect(resolveDocLink(cur, '../x.md')).toEqual({ kind: 'doc', path: 'docs/x.md', fragment: '' })
  })
  it('resolves root-relative from the project root', () => {
    expect(resolveDocLink(cur, '/top.md')).toEqual({ kind: 'doc', path: 'top.md', fragment: '' })
  })
  it('decodes encoded spaces', () => {
    expect(resolveDocLink('a.md', 'audit%20questions.md')).toEqual({ kind: 'doc', path: 'audit questions.md', fragment: '' })
  })
  it('keeps a decoded fragment', () => {
    expect(resolveDocLink('a.md', 'b.md#some-section')).toEqual({ kind: 'doc', path: 'b.md', fragment: 'some-section' })
  })
  it('keeps leading .. when escaping the root', () => {
    expect(resolveDocLink('a.md', '../../x.md')).toEqual({ kind: 'doc', path: '../../x.md', fragment: '' })
    expect(resolveDocLink('docs/a.md', '../../x.md')).toEqual({ kind: 'doc', path: '../x.md', fragment: '' })
  })
  it('classifies external, mailto, anchor and other', () => {
    expect(resolveDocLink(cur, 'https://c4hero.com')).toEqual({ kind: 'external' })
    expect(resolveDocLink(cur, 'mailto:a@b.c')).toEqual({ kind: 'external' })
    expect(resolveDocLink(cur, '#intro')).toEqual({ kind: 'anchor', fragment: 'intro' })
    expect(resolveDocLink(cur, 'img.png')).toEqual({ kind: 'other' })
    expect(resolveDocLink(cur, 'javascript:alert(1)')).toEqual({ kind: 'other' })
    expect(resolveDocLink(cur, '')).toEqual({ kind: 'other' })
  })
})

describe('slugify / createSlugger', () => {
  it('strips punctuation and lowercases', () => {
    expect(slugify('Hello, World! (v2) - ok_1')).toBe('hello-world-v2---ok_1')
  })
  it('keeps unicode letters', () => {
    expect(slugify('Zażółć gęślą jaźń')).toBe('zażółć-gęślą-jaźń')
  })
  it('dedupes with -1, -2', () => {
    const s = createSlugger()
    expect([s('Intro'), s('Intro'), s('Intro'), s('Intro 1')]).toEqual(['intro', 'intro-1', 'intro-2', 'intro-1-1'])
  })
})
