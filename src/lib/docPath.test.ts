/// <reference types="node" />
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { docPathProblem, isInsideRoot, isInsideRootReal } from './docPath'

describe('docPathProblem', () => {
  it('accepts relative markdown paths', () => {
    expect(docPathProblem('docs/a.md')).toBeNull()
    expect(docPathProblem('docs/A.MARKDOWN')).toBeNull()
  })
  it.each(['../a.md', 'docs/../a.md', '/etc/a.md', 'C:\\a.md', 'docs/.hidden/a.md', '.a.md', 'docs/a.txt', 'a'])(
    'rejects %s',
    (p) => expect(docPathProblem(p)).not.toBeNull(),
  )
})

describe('root containment', () => {
  let root: string
  let outside: string
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'docpath-root-'))
    outside = mkdtempSync(path.join(os.tmpdir(), 'docpath-out-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('isInsideRoot is textual', () => {
    expect(isInsideRoot(root, path.join(root, 'a.md'))).toBe(true)
    expect(isInsideRoot(root, path.join(root, '..', 'a.md'))).toBe(false)
  })
  it('isInsideRootReal follows symlinks and handles missing targets', () => {
    mkdirSync(path.join(root, 'docs'))
    expect(isInsideRootReal(root, path.join(root, 'docs', 'new', 'a.md'))).toBe(true)
    symlinkSync(outside, path.join(root, 'link'))
    expect(isInsideRootReal(root, path.join(root, 'link', 'a.md'))).toBe(false)
  })
})
