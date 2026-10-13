/**
 * Tests for the shared `documents` hoist/derive helper — the indexed
 * `c4hero.documents.<n>.path` / `.title` property convention `documents`
 * follows, mirroring `status`/`owner` (see status-owner-roundtrip.test.ts).
 */
import { describe, it, expect } from 'vitest'
import { parseDocumentsFromProperties, documentsToProperties } from './documentLinks'

describe('parseDocumentsFromProperties', () => {
  it('returns undefined documents and unchanged rest for empty/absent input', () => {
    const properties = { other: 'value' }
    const { documents, rest } = parseDocumentsFromProperties(properties)
    expect(documents).toBeUndefined()
    expect(rest).toEqual({ other: 'value' })
  })

  it('returns undefined documents for a truly empty properties object', () => {
    const { documents, rest } = parseDocumentsFromProperties({})
    expect(documents).toBeUndefined()
    expect(rest).toEqual({})
  })

  it('hoists a single complete entry', () => {
    const properties = {
      'c4hero.documents.0.path': 'docs/a.md',
      'c4hero.documents.0.title': 'Doc A',
      other: 'value',
    }
    const { documents, rest } = parseDocumentsFromProperties(properties)
    expect(documents).toEqual([{ path: 'docs/a.md', title: 'Doc A' }])
    expect(rest).toEqual({ other: 'value' })
  })

  it('hoists several consecutive entries in order', () => {
    const properties = {
      'c4hero.documents.0.path': 'docs/a.md',
      'c4hero.documents.0.title': 'Doc A',
      'c4hero.documents.1.path': 'docs/b.md',
      'c4hero.documents.1.title': 'Doc B',
      'c4hero.documents.2.path': 'docs/c.md',
      'c4hero.documents.2.title': 'Doc C',
    }
    const { documents, rest } = parseDocumentsFromProperties(properties)
    expect(documents).toEqual([
      { path: 'docs/a.md', title: 'Doc A' },
      { path: 'docs/b.md', title: 'Doc B' },
      { path: 'docs/c.md', title: 'Doc C' },
    ])
    expect(rest).toEqual({})
  })

  it('stops at the first gap in indices, leaving later indices in rest', () => {
    const properties = {
      'c4hero.documents.0.path': 'docs/a.md',
      'c4hero.documents.0.title': 'Doc A',
      // index 1 is missing entirely
      'c4hero.documents.2.path': 'docs/c.md',
      'c4hero.documents.2.title': 'Doc C',
    }
    const { documents, rest } = parseDocumentsFromProperties(properties)
    expect(documents).toEqual([{ path: 'docs/a.md', title: 'Doc A' }])
    expect(rest).toEqual({
      'c4hero.documents.2.path': 'docs/c.md',
      'c4hero.documents.2.title': 'Doc C',
    })
  })

  it('leaves a partial entry missing .title entirely in rest, not hoisted', () => {
    const properties = {
      'c4hero.documents.0.path': 'docs/a.md',
      // no title for index 0
    }
    const { documents, rest } = parseDocumentsFromProperties(properties)
    expect(documents).toBeUndefined()
    expect(rest).toEqual({ 'c4hero.documents.0.path': 'docs/a.md' })
  })

  it('leaves a partial entry missing .path entirely in rest, not hoisted', () => {
    const properties = {
      'c4hero.documents.0.title': 'Doc A',
      // no path for index 0
    }
    const { documents, rest } = parseDocumentsFromProperties(properties)
    expect(documents).toBeUndefined()
    expect(rest).toEqual({ 'c4hero.documents.0.title': 'Doc A' })
  })

  it('does not hoist index 1 when index 0 is a partial entry', () => {
    const properties = {
      'c4hero.documents.0.path': 'docs/a.md',
      // index 0 missing .title
      'c4hero.documents.1.path': 'docs/b.md',
      'c4hero.documents.1.title': 'Doc B',
    }
    const { documents, rest } = parseDocumentsFromProperties(properties)
    expect(documents).toBeUndefined()
    expect(rest).toEqual(properties)
  })
})

describe('documentsToProperties', () => {
  it('returns an empty object for undefined', () => {
    expect(documentsToProperties(undefined)).toEqual({})
  })

  it('returns an empty object for an empty array', () => {
    expect(documentsToProperties([])).toEqual({})
  })

  it('derives indexed path/title keys for a single entry', () => {
    expect(documentsToProperties([{ path: 'docs/a.md', title: 'Doc A' }])).toEqual({
      'c4hero.documents.0.path': 'docs/a.md',
      'c4hero.documents.0.title': 'Doc A',
    })
  })

  it('derives indexed path/title keys for several entries, in order', () => {
    expect(
      documentsToProperties([
        { path: 'docs/a.md', title: 'Doc A' },
        { path: 'docs/b.md', title: 'Doc B' },
      ]),
    ).toEqual({
      'c4hero.documents.0.path': 'docs/a.md',
      'c4hero.documents.0.title': 'Doc A',
      'c4hero.documents.1.path': 'docs/b.md',
      'c4hero.documents.1.title': 'Doc B',
    })
  })
})

describe('round-trips within the helper itself', () => {
  it('documentsToProperties → parseDocumentsFromProperties recovers the original list', () => {
    const original = [
      { path: 'docs/a.md', title: 'Doc A' },
      { path: 'docs/b.md', title: 'Doc B' },
    ]
    const { documents } = parseDocumentsFromProperties(documentsToProperties(original))
    expect(documents).toEqual(original)
  })
})
