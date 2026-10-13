/// <reference types="node" />
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { createMicroservicesTemplate } from '@/lib/templates'
import { parseArgs } from '../args'
import type { CliResult } from '../output'
import { relationshipCommands } from './relationships'

let dir: string
let file: string
const template = createMicroservicesTemplate()
const rel = template.model.relationships[0]
const [a, b] = template.model.softwareSystems.length > 1
  ? [template.model.softwareSystems[0].id, template.model.softwareSystems[1].id]
  : [template.model.people[0].id, template.model.softwareSystems[0].id]

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'c4hero-rels-'))
  file = path.join(dir, 'ws.dsl')
  writeFileSync(file, serializeDSL(createMicroservicesTemplate()))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function run(...argv: string[]): Promise<CliResult> {
  const args = parseArgs([...argv, '--file', file])
  return relationshipCommands.find((c) => c.name === args.command)!.run(args, { cwd: dir })
}

function reparse() {
  const text = readFileSync(file, 'utf8')
  const { workspace, errors } = parseDSL(text)
  expect(errors).toEqual([])
  return { text, ws: workspace! }
}

describe('relationship commands', () => {
  it('relate writes style keys and update-rel changes them', async () => {
    const res = await run('relate', a, b, '--description', 'Pings', '--technology', 'gRPC', '--interaction-style', 'Asynchronous', '--line-style', 'Orthogonal', '--tags', 'Hot')
    expect(res).toMatchObject({ ok: true, command: 'relate', changed: { relationships: [`${a}->${b}`] } })
    const { text, ws } = reparse()
    expect(text).toContain('c4hero.lineStyle')
    expect(text).toContain('c4hero.interactionStyle')
    const created = ws.model.relationships.find((r) => r.sourceId === a && r.destinationId === b && r.description === 'Pings')!
    expect(created).toMatchObject({ technology: 'gRPC', interactionStyle: 'Asynchronous', lineStyle: 'Orthogonal' })
    expect(created.tags).toContain('Hot')

    await run('update-rel', `${a}->${b}`, '--match', 'Pings', '--line-style', 'Straight', '--property', 'k=v', '--add-tag', 'More')
    const updated = reparse().ws.model.relationships.find((r) => r.sourceId === a && r.destinationId === b && r.description === 'Pings')!
    expect(updated).toMatchObject({ lineStyle: 'Straight', properties: { k: 'v' } })
    expect(updated.tags).toContain('More')
  })

  it('update-rel changes the technology of an existing edge; unrelate removes it', async () => {
    const before = reparse().ws.model.relationships.length
    const ref = `${rel.sourceId}->${rel.destinationId}`
    await run('update-rel', ref, '--match', rel.description!, '--technology', 'AMQP')
    const edge = reparse().ws.model.relationships.find((r) => r.sourceId === rel.sourceId && r.destinationId === rel.destinationId && r.description === rel.description)
    expect(edge?.technology).toBe('AMQP')
    await run('unrelate', ref, '--match', rel.description!)
    expect(reparse().ws.model.relationships.length).toBe(before - 1)
  })

  it('update-rel <src>-><dst> --description sets the new description', async () => {
    const pair = template.model.relationships.find(
      (r) => template.model.relationships.filter((o) => o.sourceId === r.sourceId && o.destinationId === r.destinationId).length === 1,
    )!
    await run('update-rel', `${pair.sourceId}->${pair.destinationId}`, '--description', 'New')
    const edges = reparse().ws.model.relationships.filter((r) => r.sourceId === pair.sourceId && r.destinationId === pair.destinationId)
    expect(edges.map((r) => r.description)).toEqual(['New'])
  })

  it('--match picks among parallel edges for update-rel and unrelate', async () => {
    await run('relate', a, b, '--description', 'One')
    await run('relate', a, b, '--description', 'Two')
    const ref = `${a}->${b}`
    await expect(run('update-rel', ref, '--technology', 'X')).rejects.toMatchObject({ code: 'AMBIGUOUS' })
    await run('update-rel', ref, '--match', 'Two', '--technology', 'AMQP')
    const edges = () => reparse().ws.model.relationships.filter((r) => r.sourceId === a && r.destinationId === b)
    expect(edges().find((r) => r.description === 'Two')?.technology).toBe('AMQP')
    expect(edges().find((r) => r.description === 'One')?.technology).toBeUndefined()
    await run('unrelate', ref, '--match', 'One')
    expect(edges().map((r) => r.description)).not.toContain('One')
    expect(edges().map((r) => r.description)).toContain('Two')
  })

  it('rejects bad styles and self relationships', async () => {
    await expect(run('relate', a, b, '--line-style', 'Wavy')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('relate', a, a)).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(run('unrelate', 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
