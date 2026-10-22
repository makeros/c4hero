import { describe, it, expect } from 'vitest'
import { isCanvasRoute, isStandaloneRoute } from './routes'

describe('isStandaloneRoute', () => {
  it('is true for /document-view', () => {
    expect(isStandaloneRoute('/document-view')).toBe(true)
  })

  it('is true for /cheat-sheet', () => {
    expect(isStandaloneRoute('/cheat-sheet')).toBe(true)
  })

  it('is false for a canvas path', () => {
    expect(isStandaloneRoute('/collection/my-folder/my-workspace')).toBe(false)
  })
})

describe('isCanvasRoute', () => {
  it('is true for a canvas path', () => {
    expect(isCanvasRoute('/collection/my-folder/my-workspace')).toBe(true)
  })

  it('is true for a canvas path with a view key', () => {
    expect(isCanvasRoute('/collection/my-folder/my-workspace/some-view')).toBe(true)
  })

  it('is false for /cheat-sheet', () => {
    expect(isCanvasRoute('/cheat-sheet')).toBe(false)
  })
})
