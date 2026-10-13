/// <reference types="node" />
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { docPathProblem, docsRootFor, isInsideRoot, isInsideRootReal, resolveDocRequest } from './docPath'

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

describe('docsRootFor / resolveDocRequest', () => {
  let tmp: string
  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'docpath-repo-')))
  })
  afterEach(() => rmSync(tmp, { recursive: true, force: true }))

  it('returns the git root for a workspace directory or .dsl file', () => {
    mkdirSync(path.join(tmp, '.git'))
    mkdirSync(path.join(tmp, 'arch', 'deep'), { recursive: true })
    writeFileSync(path.join(tmp, 'arch', 'workspace.dsl'), '')
    expect(docsRootFor(path.join(tmp, 'arch'))).toBe(tmp)
    expect(docsRootFor(path.join(tmp, 'arch', 'deep'))).toBe(tmp)
    expect(docsRootFor(path.join(tmp, 'arch', 'workspace.dsl'))).toBe(tmp)
  })
  it('accepts a .git file (worktree)', () => {
    mkdirSync(path.join(tmp, 'arch'))
    writeFileSync(path.join(tmp, '.git'), 'gitdir: elsewhere')
    expect(docsRootFor(path.join(tmp, 'arch'))).toBe(tmp)
  })
  it('picks the nearest .git when nested', () => {
    mkdirSync(path.join(tmp, '.git'))
    mkdirSync(path.join(tmp, 'sub', '.git'), { recursive: true })
    mkdirSync(path.join(tmp, 'sub', 'arch'))
    expect(docsRootFor(path.join(tmp, 'sub', 'arch'))).toBe(path.join(tmp, 'sub'))
  })
  it('falls back to the directory itself without git (dir or file)', () => {
    // tmp lives under os.tmpdir(), which is not inside a git repo
    mkdirSync(path.join(tmp, 'arch'))
    writeFileSync(path.join(tmp, 'arch', 'w.dsl'), '')
    expect(docsRootFor(path.join(tmp, 'arch'))).toBe(path.join(tmp, 'arch'))
    expect(docsRootFor(path.join(tmp, 'arch', 'w.dsl'))).toBe(path.join(tmp, 'arch'))
  })

  it('resolves a link written by link-doc against the workspace repo, not elsewhere', () => {
    mkdirSync(path.join(tmp, '.git'))
    mkdirSync(path.join(tmp, 'docs'))
    mkdirSync(path.join(tmp, 'arch'))
    const root = docsRootFor(path.join(tmp, 'arch'))
    expect(resolveDocRequest('docs%2Fguide.md', root)).toEqual({ absolute: path.join(tmp, 'docs', 'guide.md'), rejected: false })
    expect(resolveDocRequest('docs/guide.md', root).rejected).toBe(false)
  })
  it.each(['..%2Fx.md', 'docs%2F.hidden%2Fa.md', 'docs%2Fa.txt', '%2Fetc%2Fa.md'])('rejects %s', (p) => {
    expect(resolveDocRequest(p, tmp).rejected).toBe(true)
  })
  it('throws on malformed encoding', () => {
    expect(() => resolveDocRequest('%E0%A4%A', tmp)).toThrow()
  })
})
