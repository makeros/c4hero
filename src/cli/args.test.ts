import { describe, expect, it } from 'vitest'
import { parseArgs } from './args'
import { exitCodeFor, formatResult } from './output'

describe('parseArgs', () => {
  it('splits subcommand and positionals', () => {
    const r = parseArgs(['relate', 'a', 'b'])
    expect(r.command).toBe('relate')
    expect(r.positionals).toEqual(['a', 'b'])
  })

  it('supports --flag value and --flag=value', () => {
    const r = parseArgs(['add', 'container', '--name', 'Order Service', '--id=orders'])
    expect(r.flags).toEqual({ name: ['Order Service'], id: ['orders'] })
    expect(r.positionals).toEqual(['container'])
  })

  it('accumulates repeated flags in order', () => {
    expect(parseArgs(['update', 'x', '--add-tag', 'a', '--add-tag=b']).flags['add-tag']).toEqual(['a', 'b'])
  })

  it('keeps a value containing = intact', () => {
    expect(parseArgs(['update', 'x', '--property=k=v']).flags.property).toEqual(['k=v'])
  })

  it('does not let boolean flags swallow positionals', () => {
    const r = parseArgs(['remove', '--dry-run', 'x'])
    expect(r.flags['dry-run']).toEqual(['true'])
    expect(r.positionals).toEqual(['x'])
  })

  it('treats a trailing or flag-followed flag as boolean', () => {
    expect(parseArgs(['list', '--parent', '--type', 'container']).flags).toEqual({
      parent: ['true'],
      type: ['container'],
    })
  })

  it('extracts --pretty anywhere without recording it as a flag', () => {
    const r = parseArgs(['--pretty', 'list'])
    expect(r.pretty).toBe(true)
    expect(r.command).toBe('list')
    expect(r.flags).toEqual({})
  })

  it('treats everything after -- as positional', () => {
    expect(parseArgs(['add', '--', '--weird']).positionals).toEqual(['--weird'])
  })

  it('returns an undefined command for empty argv', () => {
    expect(parseArgs([]).command).toBeUndefined()
  })
})

describe('output', () => {
  const base = { command: 'x', warnings: [] }

  it('maps error codes to exit codes', () => {
    expect(exitCodeFor({ ...base, ok: true })).toBe(0)
    expect(exitCodeFor({ ...base, ok: false, error: { code: 'NOT_FOUND', message: '' } })).toBe(1)
    expect(exitCodeFor({ ...base, ok: false, error: { code: 'PARSE_FAILED', message: '' } })).toBe(2)
    expect(exitCodeFor({ ...base, ok: false, error: { code: 'LOSSY_FILE', message: '' } })).toBe(3)
    expect(exitCodeFor({ ...base, ok: false, error: { code: 'EXPORT_ENV', message: '' } })).toBe(4)
  })

  it('prints compact JSON by default and human text with pretty', () => {
    const r = { ...base, ok: true }
    expect(JSON.parse(formatResult(r, false))).toEqual(r)
    expect(formatResult(r, true)).toContain('OK x')
  })
})
