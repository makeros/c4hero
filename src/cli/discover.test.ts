import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { discoverWorkspace } from './discover'
import { CliFailure } from './errors'

let root: string
const touch = (rel: string, content = 'workspace {}') => {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}
const failure = (fn: () => unknown): CliFailure => {
  try {
    fn()
  } catch (e) {
    if (e instanceof CliFailure) return e
    throw e
  }
  throw new Error('expected CliFailure')
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'c4hero-discover-')))
  mkdirSync(path.join(root, '.git'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('discoverWorkspace', () => {
  it('uses an explicit --file, resolved against cwd, even when others exist', () => {
    touch('a.dsl')
    const b = touch('docs/b.dsl')
    expect(discoverWorkspace({ file: 'docs/b.dsl', cwd: root })).toBe(b)
  })

  it('reports NOT_FOUND for a missing --file', () => {
    expect(failure(() => discoverWorkspace({ file: 'nope.dsl', cwd: root })).code).toBe('NOT_FOUND')
  })

  it('uses .c4hero/config.json at the git root over a scan', () => {
    touch('a.dsl')
    const pinned = touch('docs/architecture/workspace.dsl')
    touch('.c4hero/config.json', JSON.stringify({ workspace: 'docs/architecture/workspace.dsl' }))
    expect(discoverWorkspace({ cwd: path.join(root, 'docs') })).toBe(pinned)
  })

  it('prefers --file over the config file', () => {
    const a = touch('a.dsl')
    touch('b.dsl')
    touch('.c4hero/config.json', JSON.stringify({ workspace: 'b.dsl' }))
    expect(discoverWorkspace({ file: 'a.dsl', cwd: root })).toBe(a)
  })

  it('finds the single .dsl under the git root from a subdirectory', () => {
    const only = touch('docs/model.dsl')
    mkdirSync(path.join(root, 'src'))
    expect(discoverWorkspace({ cwd: path.join(root, 'src') })).toBe(only)
  })

  it('skips node_modules, dist* and dot-directories', () => {
    const only = touch('model.dsl')
    touch('node_modules/pkg/x.dsl')
    touch('dist-plugin/x.dsl')
    touch('.cache/x.dsl')
    expect(discoverWorkspace({ cwd: root })).toBe(only)
  })

  it('fails with MULTIPLE_WORKSPACES and lists the candidates', () => {
    touch('a.dsl')
    touch('docs/b.dsl')
    const f = failure(() => discoverWorkspace({ cwd: root }))
    expect(f.code).toBe('MULTIPLE_WORKSPACES')
    expect(f.candidates).toEqual(['a.dsl', path.join('docs', 'b.dsl')])
  })

  it('fails with NOT_FOUND when there is no .dsl', () => {
    expect(failure(() => discoverWorkspace({ cwd: root })).code).toBe('NOT_FOUND')
  })

  it('rejects a malformed config file', () => {
    touch('a.dsl')
    touch('.c4hero/config.json', '{ nope')
    expect(failure(() => discoverWorkspace({ cwd: root })).code).toBe('USAGE')
  })
})
