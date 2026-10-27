import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs script without type declarations
import { parseDevArgs } from '../../../scripts/devArgs.mjs'

type Result = { viteArgs: string[]; workspacePath?: string; terminal: boolean; error?: string }
const parse = (argv: string[], env: Record<string, string> = {}, platform = 'darwin'): Result =>
  parseDevArgs(argv, env, platform)

let dir: string
let file: string

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'devargs-'))
  file = path.join(dir, 'file.txt')
  writeFileSync(file, '')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('parseDevArgs', () => {
  it('passes plain Vite args through', () => {
    expect(parse(['--port', '1'])).toEqual({
      viteArgs: ['--port', '1'],
      workspacePath: undefined,
      terminal: false,
    })
  })

  it('parses --workspace <dir> and adds --open', () => {
    const r = parse(['--workspace', dir])
    expect(r.workspacePath).toBe(path.resolve(dir))
    expect(r.viteArgs).toEqual(['--open'])
    expect(r.error).toBeUndefined()
  })

  it('parses --workspace=<dir>', () => {
    const r = parse([`--workspace=${dir}`, '--debug'])
    expect(r.workspacePath).toBe(path.resolve(dir))
    expect(r.viteArgs).toEqual(['--debug', '--open'])
  })

  it('does not duplicate an explicit --open', () => {
    expect(parse(['--workspace', dir, '--open']).viteArgs).toEqual(['--open'])
    expect(parse(['--workspace', dir, '--open=firefox']).viteArgs).toEqual(['--open=firefox'])
  })

  it('errors when --workspace has no value', () => {
    expect(parse(['--workspace']).error).toMatch(/requires a directory path/)
  })

  it('errors when the workspace does not exist or is not a directory', () => {
    expect(parse(['--workspace', path.join(dir, 'missing')]).error).toMatch(/does not exist/)
    expect(parse(['--workspace', file]).error).toMatch(/not a directory/)
  })

  it('accepts --terminal with --workspace and strips it from the Vite args', () => {
    const r = parse(['--terminal', '--workspace', dir])
    expect(r.terminal).toBe(true)
    expect(r.error).toBeUndefined()
    expect(r.viteArgs).toEqual(['--open'])
  })

  it('refuses --terminal on Windows', () => {
    expect(parse(['--terminal', '--workspace', dir], {}, 'win32').error).toBe(
      '--terminal is not supported on Windows yet'
    )
  })

  it('refuses --terminal without --workspace', () => {
    expect(parse(['--terminal']).error).toBe('--terminal requires --workspace <dir>')
  })

  it.each(['VITE_HMR_TUNNEL', 'VITE_ALLOWED_HOSTS'])('refuses --terminal when %s is set', (name) => {
    expect(parse(['--terminal', '--workspace', dir], { [name]: 'x' }).error).toBe(
      '--terminal is localhost-only; unset VITE_HMR_TUNNEL/VITE_ALLOWED_HOSTS'
    )
  })

  it.each([['--host'], ['--host=0.0.0.0']])('refuses --terminal with %s', (host) => {
    expect(parse(['--terminal', '--workspace', dir, host]).error).toBe(
      '--terminal is localhost-only; remove --host'
    )
  })

  it('allows --host and tunnel env without --terminal', () => {
    const r = parse(['--workspace', dir, '--host'], { VITE_HMR_TUNNEL: 'x' }, 'win32')
    expect(r.error).toBeUndefined()
    expect(r.terminal).toBe(false)
  })
})
