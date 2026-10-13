import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { extractSidecar, parseSidecar, serializeSidecar } from '@/lib/sidecar'
import { sidecarName } from '@/lib/sidecarName'
import { createBigBankSample } from '@/lib/templates'
import { allViewsOf } from '@/store/workspace'
import { CliFailure } from './errors'
import { openSession } from './session'

let dir: string
let dslPath: string
let sidecarPath: string

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'c4hero-session-'))
  dslPath = path.join(dir, 'bank.dsl')
  sidecarPath = path.join(dir, sidecarName('bank.dsl'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function failure(fn: () => unknown): CliFailure {
  try {
    fn()
  } catch (e) {
    if (e instanceof CliFailure) return e
    throw e
  }
  throw new Error('expected CliFailure')
}

/** Big Bank written the way the app would, with some hand-placed layout. */
function writeBigBank(): { dsl: string; sidecar: string } {
  const ws = createBigBankSample()
  const view = allViewsOf(ws).find((v) => v.elements.length > 1)!
  view.locked = true
  view.elements[0].pinned = true
  view.elements[0].x = 120
  view.elements[0].y = 80
  view.elements[1].locked = true
  const dsl = serializeDSL(ws)
  const sidecar = serializeSidecar(extractSidecar(ws)!)
  writeFileSync(dslPath, dsl)
  writeFileSync(sidecarPath, sidecar)
  return { dsl, sidecar }
}

describe('openSession / save', () => {
  it('rewrites an unmodified Big Bank byte-for-byte and round-trips the sidecar', () => {
    const { dsl, sidecar } = writeBigBank()
    const session = openSession(dslPath, { force: false })

    expect(serializeDSL(session.workspace())).toBe(dsl)
    const result = session.save({ dryRun: false })

    expect(result.changed).toBe(false)
    expect(readFileSync(dslPath, 'utf8')).toBe(dsl)
    expect(readFileSync(sidecarPath, 'utf8')).toBe(sidecar)
    expect(parseSidecar(readFileSync(sidecarPath, 'utf8'))).toEqual(parseSidecar(sidecar))
    expect(extractSidecar(session.workspace())).toEqual(parseSidecar(sidecar))
  })

  it('writes serializeDSL of the parsed workspace for a non-canonical but lossless file', () => {
    const canonical = serializeDSL(createBigBankSample())
    writeFileSync(dslPath, canonical.replace(/^ {4}/gm, '  '))
    const session = openSession(dslPath, { force: false })
    const result = session.save({ dryRun: false })
    expect(result.changed).toBe(true)
    expect(readFileSync(dslPath, 'utf8')).toBe(serializeDSL(parseDSL(canonical).workspace))
  })

  it('--dry-run reports a diff and writes nothing', () => {
    const { dsl } = writeBigBank()
    const session = openSession(dslPath, { force: false })
    session.actions().updateWorkspaceMeta({ name: 'Renamed Bank' })

    const result = session.save({ dryRun: true })
    expect(result.changed).toBe(true)
    expect(result.diff).toContain('--- a/bank.dsl')
    expect(result.diff).toMatch(/^-.*workspace "/m)
    expect(result.diff).toContain('+workspace "Renamed Bank"')
    expect(readFileSync(dslPath, 'utf8')).toBe(dsl)
  })

  it('save writes the change atomically and leaves no temp files', () => {
    writeBigBank()
    const session = openSession(dslPath, { force: false })
    session.actions().updateWorkspaceMeta({ name: 'Renamed Bank' })
    session.save({ dryRun: false })

    expect(readFileSync(dslPath, 'utf8')).toContain('workspace "Renamed Bank"')
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('applies recorded renames and removals to the sidecar', () => {
    writeBigBank()
    const session = openSession(dslPath, { force: false })
    const ws = session.workspace()
    const view = allViewsOf(ws).find((v) => v.locked)!
    const pinned = view.elements.find((e) => e.pinned)!
    const stale = view.elements.find((e) => e.locked && !e.pinned)!
    const pinnedId = pinned.id
    const staleId = stale.id

    session.recordRename(pinnedId, 'renamedElement')
    session.recordRemoved(staleId)
    // A command would do this through renameElementId; simulate its effect on the store.
    pinned.id = 'renamedElement'
    view.elements = view.elements.filter((e) => e.id !== staleId)
    session.save({ dryRun: false })

    const sidecar = parseSidecar(readFileSync(sidecarPath, 'utf8'))!
    const entry = sidecar.views![view.key].elements!
    expect(entry.renamedElement).toMatchObject({ pinned: true, x: 120, y: 80 })
    expect(entry[pinnedId]).toBeUndefined()
    expect(entry[staleId]).toBeUndefined()
  })

  it('removes a sidecar that no longer has data', () => {
    writeBigBank()
    const session = openSession(dslPath, { force: false })
    for (const v of allViewsOf(session.workspace())) {
      v.locked = undefined
      for (const e of v.elements) {
        e.pinned = undefined
        e.locked = undefined
      }
    }
    const result = session.save({ dryRun: false })
    expect(result.sidecarPath).toBe(sidecarPath)
    expect(existsSync(sidecarPath)).toBe(false)
  })

  it('refuses a lossy file with LOSSY_FILE and the offending lines, unless forced', () => {
    writeFileSync(dslPath, '// keep me\n' + serializeDSL(createBigBankSample()))
    const f = failure(() => openSession(dslPath, { force: false }))
    expect(f.code).toBe('LOSSY_FILE')
    expect(f.candidates?.[0]).toContain('line 1')
    expect(() => openSession(dslPath, { force: true })).not.toThrow()
  })

  it('refuses to write a file that would lose elements on re-parse (keyword id forced past the store)', () => {
    const dsl = serializeDSL(createBigBankSample())
    writeFileSync(dslPath, dsl)
    const session = openSession(dslPath, { force: false })
    const ws = structuredClone(session.workspace())
    ws.model.people[0].id = 'views'
    session.actions().resetWorkspaceTo(ws)

    const f = failure(() => session.save({ dryRun: false }))
    expect(f.code).toBe('VALIDATION')
    expect(readFileSync(dslPath, 'utf8')).toBe(dsl)
    expect(failure(() => session.save({ dryRun: true })).code).toBe('VALIDATION')
  })

  it('fails with PARSE_FAILED on unparseable DSL', () => {
    writeFileSync(dslPath, 'workspace "W" {\n  model {\n    s = softwareSystem "unterminated\n')
    expect(failure(() => openSession(dslPath, { force: true })).code).toBe('PARSE_FAILED')
  })

  it('fails with NOT_FOUND for a missing file', () => {
    expect(failure(() => openSession(path.join(dir, 'missing.dsl'), { force: false })).code).toBe('NOT_FOUND')
  })
})
