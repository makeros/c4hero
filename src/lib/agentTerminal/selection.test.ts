import { describe, it, expect } from 'vitest'
import { formatSelectionForAgent } from './selection.ts'

describe('formatSelectionForAgent', () => {
  it('formats elements with file and view', () => {
    expect(
      formatSelectionForAgent({ filename: 'a.dsl', viewKey: 'ctx', elementIds: ['x', 'y'] }),
    ).toBe('[c4hero file=a.dsl view=ctx elements=x,y] ')
  })

  it('formats a relationship', () => {
    expect(
      formatSelectionForAgent({ filename: 'a.dsl', viewKey: 'ctx', elementIds: [], relationshipId: 'r1' }),
    ).toBe('[c4hero file=a.dsl view=ctx relationship=r1] ')
  })

  it('omits a missing view', () => {
    expect(formatSelectionForAgent({ filename: 'a.dsl', viewKey: null, elementIds: ['x'] })).toBe(
      '[c4hero file=a.dsl elements=x] ',
    )
  })

  it('omits a missing filename', () => {
    expect(formatSelectionForAgent({ filename: null, viewKey: 'ctx', elementIds: ['x'] })).toBe(
      '[c4hero view=ctx elements=x] ',
    )
  })

  it('ends with a space and no newline', () => {
    const text = formatSelectionForAgent({ elementIds: ['x'] })!
    expect(text.endsWith('] ')).toBe(true)
    expect(text).not.toMatch(/[\r\n]/)
  })

  it('returns null when nothing is selected', () => {
    expect(formatSelectionForAgent({ filename: 'a.dsl', viewKey: 'ctx', elementIds: [] })).toBeNull()
  })
})
