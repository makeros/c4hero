/// <reference types="node" />
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { docPathProblem, docRelativePath, docsRootFor, isInsideRoot, isInsideRootReal, listMarkdownFiles, resolveDocRequest } from './docPath'

describe('docRelativePath', () => {
  const root = path.resolve('/repo')
  it('returns the root-relative POSIX path of a markdown file under the root', () => {
    expect(docRelativePath(root, path.join(root, 'docs', 'a.md'))).toBe('docs/a.md')
    expect(docRelativePath(root, path.join(root, 'B.MARKDOWN'))).toBe('B.MARKDOWN')
  })
  it.each([
    ['outside the root', path.resolve('/elsewhere/a.md')],
    ['a sibling with the root as name prefix', path.resolve('/repo-other/a.md')],
    ['a non-markdown file', path.join(root, 'src', 'a.ts')],
    ['a hidden segment', path.join(root, '.github', 'a.md')],
    ['node_modules', path.join(root, 'node_modules', 'pkg', 'README.md')],
    ['the root itself', root],
  ])('rejects %s', (_label, file) => expect(docRelativePath(root, file)).toBeNull())
})

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

describe('listMarkdownFiles', () => {
  let root: string
  let outside: string
  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'listmd-root-'))
    outside = mkdtempSync(path.join(os.tmpdir(), 'listmd-out-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })
  const write = (rel: string, base = root) => {
    mkdirSync(path.dirname(path.join(base, rel)), { recursive: true })
    writeFileSync(path.join(base, rel), '# x')
  }

  it('lists markdown files recursively as root-relative POSIX paths, skipping other files', () => {
    write('a.md')
    write('docs/b.markdown')
    write('docs/deep/C D.MD')
    write('docs/notes.txt')
    expect(listMarkdownFiles(root)).toEqual({
      files: ['a.md', 'docs/b.markdown', 'docs/deep/C D.MD'],
      truncated: false,
    })
  })
  it('skips hidden segments and node_modules', () => {
    write('a.md')
    write('.git/x.md')
    write('.hidden.md')
    write('docs/.private/y.md')
    write('node_modules/pkg/README.md')
    expect(listMarkdownFiles(root).files).toEqual(['a.md'])
  })
  it('does not follow directory symlinks and drops file symlinks that escape the root', () => {
    write('a.md')
    write('out.md', outside)
    write('sub/in.md', outside)
    symlinkSync(path.join(outside, 'sub'), path.join(root, 'linkdir'))
    symlinkSync(path.join(outside, 'out.md'), path.join(root, 'escape.md'))
    symlinkSync(path.join(root, 'a.md'), path.join(root, 'alias.md'))
    expect(listMarkdownFiles(root).files).toEqual(['a.md', 'alias.md'])
  })
  it('caps the result and flags truncation', () => {
    for (const n of ['a', 'b', 'c']) write(`${n}.md`)
    expect(listMarkdownFiles(root, { limit: 2 })).toEqual({ files: ['a.md', 'b.md'], truncated: true })
    expect(listMarkdownFiles(root, { limit: 3 }).truncated).toBe(false)
  })
  it('returns nothing for a missing root', () => {
    expect(listMarkdownFiles(path.join(root, 'nope'))).toEqual({ files: [], truncated: false })
  })
})
