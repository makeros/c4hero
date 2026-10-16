/// <reference types="node" />
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { serializeSidecar } from '@/lib/sidecar'
import { sidecarName } from '@/lib/sidecarName'
import { createMicroservicesTemplate } from '@/lib/templates'
import { parseArgs } from '../args'
import type { CliResult } from '../output'
import { elementCommands } from './elements'

let dir: string
let file: string
const template = createMicroservicesTemplate()
const sidecar = () => path.join(dir, sidecarName('ws.dsl'))
const system = template.model.softwareSystems.find((s) => s.containers.length > 0)!
const container = system.containers[0]
const viewKey = Object.values(template.views).flat().find((v) => v.elements.some((e) => e.id === system.id))!.key
const pinned = (id: string) => serializeSidecar({ version: 1, views: { [viewKey]: { elements: { [id]: { pinned: true, x: 1, y: 2 } } } } })

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'c4hero-elements-'))
  file = path.join(dir, 'ws.dsl')
  writeFileSync(file, serializeDSL(createMicroservicesTemplate()))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function run(...argv: string[]): Promise<CliResult> {
  const args = parseArgs([...argv, '--file', file])
  return elementCommands.find((c) => c.name === args.command)!.run(args, { cwd: dir })
}

function reparse() {
  const text = readFileSync(file, 'utf8')
  const { workspace, errors } = parseDSL(text)
  expect(errors).toEqual([])
  return { text, ws: workspace! }
}

describe('add', () => {
  it('derives a readable identifier and re-parses cleanly', async () => {
    const res = await run('add', 'container', '--name', 'Billing Service', '--parent', system.id, '--technology', 'Go', '--description', 'Bills')
    expect(res).toMatchObject({ ok: true, command: 'add', changed: { elements: ['billingService'] } })
    const { text, ws } = reparse()
    expect(text).toContain('billingService')
    const added = ws.model.softwareSystems.find((s) => s.id === system.id)!.containers.find((c) => c.id === 'billingService')!
    expect(added).toMatchObject({ name: 'Billing Service', technology: 'Go', description: 'Bills' })
    expect(added.id).not.toMatch(/^[A-Za-z0-9_-]{8}$/)
  })

  it('warns and reports the final name when the name is already used', async () => {
    const res = await run('add', 'container', '--name', 'Order Service', '--parent', system.id)
    expect(res.data).toMatchObject({ name: 'Order Service 2' })
    expect(res.warnings).toEqual([
      `name 'Order Service' already used; created as 'Order Service 2' (id ${(res.data as { id: string }).id})`,
    ])
  })

  it('accepts softwareSystem as an alias for system', async () => {
    const res = await run('add', 'softwareSystem', '--name', 'Ledger', '--id', 'ledger')
    expect(res).toMatchObject({ ok: true, changed: { elements: ['ledger'] }, data: { name: 'Ledger' } })
    expect(reparse().ws.model.softwareSystems.some((s) => s.id === 'ledger')).toBe(true)
  })

  it('honors --id, --tags and --external', async () => {
    await run('add', 'system', '--name', 'Payments', '--id', 'pay', '--external', '--tags', 'Legacy,Money')
    const { ws } = reparse()
    const pay = ws.model.softwareSystems.find((s) => s.id === 'pay')!
    expect(pay.location).toBe('External')
    expect(pay.tags).toEqual(expect.arrayContaining(['Legacy', 'Money']))
  })

  it('rejects a taken --id and a missing parent without writing', async () => {
    const before = readFileSync(file, 'utf8')
    await expect(run('add', 'person', '--name', 'X', '--id', system.id)).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(run('add', 'container', '--name', 'X')).rejects.toMatchObject({ code: 'USAGE' })
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('places the container into the system container views and warns on locked ones', async () => {
    const doc = createMicroservicesTemplate()
    const cv = doc.views.containerViews.find((v) => v.softwareSystemId === system.id)!
    cv.locked = true
    writeFileSync(file, serializeDSL(doc))
    writeFileSync(sidecar(), serializeSidecar({ version: 1, views: { [cv.key]: { locked: true } } }))
    const res = await run('add', 'container', '--name', 'Billing', '--parent', system.id)
    expect(res.warnings).toEqual([`view '${cv.key}' is layout-locked; new element has no position`])
    const { ws } = reparse()
    expect(ws.views.containerViews.find((v) => v.key === cv.key)!.elements.map((e) => e.id)).toContain('billing')
  })

  it('--dry-run writes nothing and returns a diff', async () => {
    const before = readFileSync(file, 'utf8')
    const res = await run('add', 'person', '--name', 'Auditor', '--dry-run')
    expect((res.data as { diff: string }).diff).toContain('auditor')
    expect(readFileSync(file, 'utf8')).toBe(before)
  })
})

describe('update', () => {
  it('sets typed fields, tags and properties', async () => {
    await run('update', `${system.id}.${container.id}`, '--status', 'Live', '--owner', 'team-a', '--technology', 'Rust',
      '--add-tag', 'Hot', '--property', 'a=1', '--property', 'b=x=y')
    const { text, ws } = reparse()
    expect(text).toContain('c4hero.status')
    const c = ws.model.softwareSystems.find((s) => s.id === system.id)!.containers.find((x) => x.id === container.id)!
    expect(c).toMatchObject({ status: 'Live', owner: 'team-a', technology: 'Rust' })
    expect(c.tags).toContain('Hot')
    expect(c.properties).toMatchObject({ a: '1', b: 'x=y' })

    await run('update', container.id, '--remove-tag', 'Hot', '--remove-property', 'a')
    const again = reparse().ws.model.softwareSystems.find((s) => s.id === system.id)!.containers.find((x) => x.id === container.id)!
    expect(again.tags).not.toContain('Hot')
    expect(again.properties.a).toBeUndefined()
  })

  it('validates status and location', async () => {
    await expect(run('update', system.id, '--status', 'Nope')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('update', container.id, '--location', 'External')).rejects.toMatchObject({ code: 'USAGE' })
    await run('update', system.id, '--location', 'External')
    expect(reparse().ws.model.softwareSystems.find((s) => s.id === system.id)!.location).toBe('External')
  })
})

describe('remove', () => {
  it('cascades children and relationships and prunes the sidecar', async () => {
    const childIds = system.containers.map((c) => c.id)
    writeFileSync(sidecar(), pinned(system.id))
    const res = await run('remove', system.id)
    expect(res.changed?.elements).toEqual([system.id, ...childIds])
    const { ws } = reparse()
    expect(ws.model.softwareSystems.some((s) => s.id === system.id)).toBe(false)
    const text = existsSync(sidecar()) ? readFileSync(sidecar(), 'utf8') : ''
    expect(text).not.toContain(system.id)
  })
})

describe('rename-id', () => {
  it('rewrites references and moves sidecar layout', async () => {
    writeFileSync(sidecar(), pinned(system.id))
    await run('rename-id', system.id, 'renamedSystem')
    const { text } = reparse()
    expect(text).toContain('renamedSystem')
    expect(text).not.toMatch(new RegExp(`(^|\\s)${system.id}\\s*=`, 'm'))
    expect(readFileSync(sidecar(), 'utf8')).toContain('renamedSystem')
  })

  it('rejects invalid and taken identifiers', async () => {
    await expect(run('rename-id', system.id, 'bad id')).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(run('rename-id', system.id, container.id)).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})

describe('move', () => {
  const dsl = `workspace "M" {
  model {
    user = person "User"
    a = softwareSystem "A" {
      web = container "Web" {
        auth = component "Auth"
      }
      db = container "Db"
    }
    b = softwareSystem "B" {
      queue = container "Queue"
    }
    user -> web "Uses"
    web -> db "Reads"
    web -> queue "Publishes"
  }
  views {
    container a cvA {
      include *
    }
    container b cvB {
      include *
    }
    dynamic a dynA {
      user -> web
      web -> db
    }
  }
}
`
  beforeEach(() => writeFileSync(file, dsl))

  it('moves a container, keeps relationships, updates views, drops out-of-scope steps and round-trips', async () => {
    const res = await run('move', 'web', '--to', 'b')
    expect(res).toMatchObject({ ok: true, command: 'move', changed: { elements: ['web', 'auth'] }, data: { id: 'web', from: 'a', to: 'b' } })
    expect(res.changed?.views).toEqual(expect.arrayContaining(['cvA', 'dynA']))
    expect(res.warnings).toHaveLength(2)
    expect(res.warnings[0]).toContain('dynA: user -> web')
    const { ws } = reparse()
    expect(ws.model.softwareSystems.find((s) => s.id === 'b')!.containers.map((c) => c.id)).toEqual(['queue', 'web'])
    expect(ws.model.softwareSystems.find((s) => s.id === 'b')!.containers[1].components.map((c) => c.id)).toEqual(['auth'])
    expect(ws.model.relationships).toHaveLength(3)
    expect(ws.views.containerViews.find((v) => v.key === 'cvA')!.elements.map((e) => e.id)).not.toContain('web')
    expect(ws.views.containerViews.find((v) => v.key === 'cvB')!.elements.map((e) => e.id)).toContain('web')
  })

  it('moves a component to another container', async () => {
    const res = await run('move', 'auth', '--to', 'queue')
    expect(res.changed?.elements).toEqual(['auth'])
    expect(reparse().ws.model.softwareSystems.find((s) => s.id === 'b')!.containers[0].components.map((c) => c.id)).toEqual(['auth'])
  })

  it('--dry-run writes nothing and returns a diff', async () => {
    const res = await run('move', 'web', '--to', 'b', '--dry-run')
    expect((res.data as { diff: string }).diff).toContain('web')
    expect(readFileSync(file, 'utf8')).toBe(dsl)
  })

  it('rejects bad input without writing', async () => {
    await expect(run('move', 'web')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('move', 'user', '--to', 'b')).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(run('move', 'web', '--to', 'db')).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(run('move', 'web', '--to', 'a')).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(run('move', 'nope', '--to', 'b')).rejects.toBeDefined()
    expect(readFileSync(file, 'utf8')).toBe(dsl)
  })
})
