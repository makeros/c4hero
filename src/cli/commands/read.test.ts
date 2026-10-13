import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serializeDSL } from '@/lib/dsl'
import { createBigBankSample } from '@/lib/templates'
import { allViewsOf } from '@/store/workspace-helpers'
import { parseArgs } from '../args'
import { CliFailure } from '../errors'
import type { CliResult } from '../output'
import { readCommands } from './read'

let dir: string
let file: string
const ws = createBigBankSample()
const system = ws.model.softwareSystems.find((s) => s.containers.length > 0)!
const container = system.containers[0]

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'c4hero-read-'))
  file = path.join(dir, 'bank.dsl')
  const doc = createBigBankSample()
  const target = doc.model.softwareSystems.find((s) => s.id === system.id)!.containers[0]
  target.documents = [{ path: 'docs/a.md', title: 'A' }]
  target.status = 'Live'
  target.owner = 'team-x'
  writeFileSync(file, serializeDSL(doc))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function run(...argv: string[]): Promise<CliResult> {
  const args = parseArgs([...argv, '--file', file])
  const mod = readCommands.find((c) => c.name === args.command)!
  return mod.run(args, { cwd: dir })
}

describe('read commands', () => {
  it('list filters by type and parent', async () => {
    const all = (await run('list')).data as { elements: { id: string; type: string; parent?: string }[] }
    expect(all.elements.length).toBeGreaterThan(3)
    const systems = (await run('list', '--type', 'softwareSystem')).data as typeof all
    expect(systems.elements.every((e) => e.type === 'softwareSystem')).toBe(true)
    const kids = (await run('list', '--parent', system.id)).data as typeof all
    expect(kids.elements.map((e) => e.id)).toEqual(system.containers.map((c) => c.id))
    expect(kids.elements.every((e) => e.parent === system.id)).toBe(true)
  })

  it('list rejects an unknown type', async () => {
    await expect(run('list', '--type', 'bogus')).rejects.toMatchObject({ code: 'USAGE' })
  })

  it('show reports tags, properties, documents, status, owner, location, parent, relationships and views', async () => {
    const data = (await run('show', `${system.id}.${container.id}`)).data as Record<string, unknown>
    expect(data).toMatchObject({
      id: container.id,
      parent: system.id,
      documents: [{ path: 'docs/a.md', title: 'A' }],
      status: 'Live',
      owner: 'team-x',
      location: null,
    })
    for (const key of ['tags', 'properties', 'incoming', 'outgoing', 'views']) expect(data).toHaveProperty(key)
    const expectedViews = allViewsOf(ws).filter((v) => v.elements.some((e) => e.id === container.id)).map((v) => v.key)
    expect((data.views as string[]).sort()).toEqual(expectedViews.sort())
    const sys = (await run('show', system.id)).data as { location: unknown }
    expect(sys.location).not.toBeUndefined()
  })

  it('show surfaces resolution errors', async () => {
    await expect(run('show', 'nope')).rejects.toBeInstanceOf(CliFailure)
    await expect(run('show')).rejects.toMatchObject({ code: 'USAGE' })
  })

  it('views lists every view', async () => {
    const data = (await run('views')).data as { views: { key: string }[] }
    expect(data.views.map((v) => v.key)).toEqual(allViewsOf(ws).map((v) => v.key))
  })

  it('graph returns the whole model, or a neighbourhood', async () => {
    const whole = (await run('graph')).data as { nodes: { id: string }[]; edges: { id: string }[] }
    expect(whole.edges.length).toBe(ws.model.relationships.length)
    const local = (await run('graph', system.id)).data as typeof whole
    expect(local.nodes.map((n) => n.id)).toContain(system.id)
    expect(local.edges.length).toBeGreaterThan(0)
    expect(local.edges.length).toBeLessThanOrEqual(whole.edges.length)
    const ids = new Set(local.nodes.map((n) => n.id))
    expect(local.edges.every((e) => ids.has((e as unknown as { source: string }).source))).toBe(true)
  })
})
