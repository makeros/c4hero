/// <reference types="node" />
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { createBigBankSample, createBlankWorkspace } from '@/lib/templates'
import { parseArgs } from '../args'
import { CliFailure } from '../errors'
import { exitCodeFor, type CliResult } from '../output'
import { workspaceCommands } from './workspace'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'c4hero-ws-'))
  file = path.join(dir, 'workspace.dsl')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function run(...argv: string[]): Promise<CliResult> {
  const args = parseArgs(argv)
  return workspaceCommands.find((c) => c.name === args.command)!.run(args, { cwd: dir })
}

interface Finding { kind: string; message: string; line?: number; id?: string }
interface CheckData { errors: Finding[]; warnings: Finding[]; info: Finding[]; health: { pct: number } | null }

describe('init', () => {
  it('refuses --file outside the project root and creates nothing', async () => {
    const root = path.join(dir, 'proj')
    mkdirSync(path.join(root, '.git'), { recursive: true })
    const args = parseArgs(['init', '--file', '../outside/x.dsl'])
    await expect((async () => workspaceCommands.find((c) => c.name === 'init')!.run(args, { cwd: root }))()).rejects.toMatchObject({ code: 'USAGE' })
    expect(existsSync(path.join(dir, 'outside'))).toBe(false)
  })

  it('writes a parseable template with readable ids and --name', async () => {
    const res = await run('init', '--template', 'microservices', '--name', 'Shop')
    expect(res.ok).toBe(true)
    const { workspace, errors } = parseDSL(readFileSync(file, 'utf8'))
    expect(errors).toEqual([])
    expect(workspace.name).toBe('Shop')
    const ids = workspace.model.softwareSystems.flatMap((s) => [s.id, ...s.containers.map((c) => c.id)])
    expect(ids.every((id) => /^[a-z][A-Za-z0-9]*$/.test(id))).toBe(true)
  })

  it('refuses to overwrite unless --overwrite', async () => {
    await run('init')
    writeFileSync(file, 'sentinel')
    await expect(run('init')).rejects.toBeInstanceOf(CliFailure)
    expect(readFileSync(file, 'utf8')).toBe('sentinel')
    await run('init', '--overwrite')
    expect(readFileSync(file, 'utf8')).not.toBe('sentinel')
  })

  it('rejects an unknown template', async () => {
    await expect(run('init', '--template', 'nope')).rejects.toMatchObject({ code: 'USAGE' })
  })
})

describe('check', () => {
  function gapWorkspace() {
    const ws = createBlankWorkspace()
    ws.model.people.push({ id: 'user', type: 'person', name: 'User', description: 'A user', tags: [], properties: {} })
    ws.model.softwareSystems.push({
      id: 'shop', type: 'softwareSystem', name: 'Shop', description: 'The shop', tags: [], properties: {},
      containers: [
        { id: 'web', type: 'container', name: 'Web', description: 'Frontend', tags: [], properties: {}, components: [] },
        { id: 'lonely', type: 'container', name: 'Lonely', description: 'Unused', technology: 'Go', tags: [], properties: {}, components: [], documents: [{ path: 'docs/gone.md', title: 'Gone' }] },
      ],
    })
    ws.model.relationships.push({ id: 'r1', sourceId: 'user', destinationId: 'web', tags: [], properties: {} })
    return ws
  }

  it('reports exactly the known gap set', async () => {
    writeFileSync(file, serializeDSL(gapWorkspace()))
    const res = await run('check')
    const data = res.data as CheckData
    expect(res.ok).toBe(true)
    expect(data.errors).toEqual([])
    const summary = data.warnings.map((w) => `${w.kind}:${w.id}`).sort()
    expect(summary).toEqual(
      [
        'missing-technology:web',
        'missing-relationship-label:rel-1',
        'orphan:lonely',
        'missing-document:lonely',
      ].sort(),
    )
    expect(data.health?.pct).toBeLessThan(100)
  })

  it('reports lossy constructs as info', async () => {
    writeFileSync(file, '// hi\n' + serializeDSL(gapWorkspace()))
    const data = (await run('check')).data as CheckData
    expect(data.info).toEqual([expect.objectContaining({ kind: 'lossy-comment', line: 1 })])
  })

  it('reports parse errors as data with exit code 2 and line numbers', async () => {
    writeFileSync(file, 'workspace {\n  model {\n    a = person "A" {\n')
    const res = await run('check', '--fast')
    expect(res.ok).toBe(false)
    expect(exitCodeFor(res)).toBe(2)
    const data = res.data as CheckData
    expect(data.errors.length).toBeGreaterThan(0)
    expect(data.errors[0]).toMatchObject({ kind: 'parse' })
    expect(typeof data.errors[0].line).toBe('number')
  })

  it('--fast on Big Bank skips model-health and runs under 300 ms', async () => {
    writeFileSync(file, serializeDSL(createBigBankSample()))
    await run('check', '--fast') // warm module/JIT cost out of the measurement
    const start = performance.now()
    const res = await run('check', '--fast')
    const elapsed = performance.now() - start
    expect(res.ok).toBe(true)
    expect((res.data as CheckData).health).toBeNull()
    expect(elapsed).toBeLessThan(300)
  })
})

describe('apply', () => {
  const plan = {
    operations: [
      { op: 'addSoftwareSystem', ref: 's', name: 'Order Service', description: 'Orders' },
      { op: 'addContainer', ref: 'c', parent: 's', name: 'Order API', technology: 'Node' },
      { op: 'addRelationship', source: 'c', destination: 'ghost', description: 'x' },
      { op: 'bogus' },
    ],
  }

  it('applies per-op, gives readable ids, and reports skips', async () => {
    await run('init')
    const planFile = path.join(dir, 'plan.json')
    writeFileSync(planFile, JSON.stringify(plan))
    const res = await run('apply', '--plan', planFile)
    const data = res.data as { applied: number; skipped: number; refs: Record<string, string>; ops: { status: string; reason?: string }[] }
    expect(res.ok).toBe(true)
    expect(data.applied).toBe(2)
    expect(data.skipped).toBe(2)
    expect(data.refs).toEqual({ s: 'orderService', c: 'orderApi' })
    expect(data.ops.filter((o) => o.status === 'skipped')[0].reason).toBe('unknown source or destination')
    expect(res.warnings.join(' ')).toMatch(/Skipped 1 of 3 changes/)
    expect(res.warnings.join(' ')).toMatch(/Rejected 1 invalid/)
    expect(res.changed?.elements).toEqual(expect.arrayContaining(['orderService', 'orderApi']))

    const dsl = readFileSync(file, 'utf8')
    expect(dsl).toContain('orderService')
    const saved = parseDSL(dsl).workspace
    expect(saved.model.softwareSystems[0].containers[0].id).toBe('orderApi')
    expect((await run('check', '--fast')).ok).toBe(true)
  })

  it('--dry-run leaves the file untouched', async () => {
    await run('init')
    const before = readFileSync(file, 'utf8')
    const planFile = path.join(dir, 'plan.json')
    writeFileSync(planFile, JSON.stringify(plan))
    const res = await run('apply', '--plan', planFile, '--dry-run')
    expect((res.data as { diff: string }).diff).toContain('orderService')
    expect((res.data as { saved: boolean }).saved).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('fails on a missing or malformed plan', async () => {
    await run('init')
    await expect(run('apply')).rejects.toMatchObject({ code: 'USAGE' })
    const bad = path.join(dir, 'bad.json')
    writeFileSync(bad, '{"nope":1}')
    await expect(run('apply', '--plan', bad)).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
