/// <reference types="node" />
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { createMicroservicesTemplate } from '@/lib/templates'
import { parseArgs } from '../args'
import type { CliResult } from '../output'
import { step } from './dynamic'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'c4hero-dynamic-'))
  file = path.join(dir, 'shop.dsl')
  const ws = createMicroservicesTemplate()
  ws.views.dynamicViews = [
    { type: 'dynamic', key: 'Flow', title: 'Flow', softwareSystemId: 'platform', elements: [], relationships: [] },
  ]
  writeFileSync(file, serializeDSL(ws))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function run(...argv: string[]): Promise<CliResult> {
  return step.run(parseArgs(['step', ...argv, '--file', file]), { cwd: dir })
}

function reparsed() {
  const { workspace, errors } = parseDSL(readFileSync(file, 'utf8'))
  expect(errors).toEqual([])
  return workspace.views.dynamicViews![0]
}

describe('step command', () => {
  it('adds steps and numbers them sequentially', async () => {
    await run('add', '--view', 'Flow', '--from', 'customer', '--to', 'apiGateway')
    const res = await run('add', '--view', 'Flow', '--from', 'apiGateway', '--to', 'orderService', '--description', 'Place order')
    expect(res.changed).toEqual({ views: ['Flow'] })
    const view = reparsed()
    expect(view.relationships.map((s) => [s.sourceId, s.destinationId, s.order])).toEqual([
      ['customer', 'apiGateway', '1'],
      ['apiGateway', 'orderService', '2'],
    ])
  })

  it('moves a step and renumbers', async () => {
    for (const [from, to] of [['customer', 'apiGateway'], ['apiGateway', 'orderService'], ['orderService', 'postgres']]) {
      await run('add', '--view', 'Flow', '--from', from, '--to', to)
    }
    await run('move', '--view', 'Flow', '--index', '3', '--to', '1')
    expect(reparsed().relationships.map((s) => [s.sourceId, s.order])).toEqual([
      ['orderService', '1'],
      ['customer', '2'],
      ['apiGateway', '3'],
    ])
    await expect(run('move', '--view', 'Flow', '--index', '9', '--to', '1')).rejects.toMatchObject({ code: 'USAGE' })
  })

  it('removes a step and renumbers', async () => {
    await run('add', '--view', 'Flow', '--from', 'customer', '--to', 'apiGateway')
    await run('add', '--view', 'Flow', '--from', 'apiGateway', '--to', 'orderService')
    await run('remove', '--view', 'Flow', '--index', '1')
    expect(reparsed().relationships.map((s) => [s.sourceId, s.order])).toEqual([['apiGateway', '1']])
  })

  it('response steps require an existing reverse relationship', async () => {
    await expect(
      run('add', '--view', 'Flow', '--from', 'orderService', '--to', 'customer', '--response'),
    ).rejects.toMatchObject({ code: 'USAGE' })
    await run('add', '--view', 'Flow', '--from', 'apiGateway', '--to', 'customer', '--response')
    const [s] = reparsed().relationships
    expect([s.sourceId, s.destinationId, s.response]).toEqual(['apiGateway', 'customer', true])
  })

  it('rejects forward relationships with --response and unknown or non-dynamic views', async () => {
    await expect(
      run('add', '--view', 'Flow', '--from', 'customer', '--to', 'apiGateway', '--response'),
    ).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('add', '--view', 'Nope', '--from', 'customer', '--to', 'apiGateway')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(run('add', '--view', 'SystemLandscape', '--from', 'customer', '--to', 'platform')).rejects.toMatchObject({ code: 'USAGE' })
  })

  it('dry run leaves the file untouched', async () => {
    const before = readFileSync(file, 'utf8')
    const res = await run('add', '--view', 'Flow', '--from', 'customer', '--to', 'apiGateway', '--dry-run')
    expect((res.data as { diff?: string }).diff).toContain('apiGateway')
    expect(readFileSync(file, 'utf8')).toBe(before)
  })
})
