/// <reference types="node" />
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseDSL } from '@/lib/dsl'
import { allViewsOf } from '@/store/workspace-helpers'
import { parseArgs } from './args'
import { COMMANDS } from './commands'
import type { CliResult } from './output'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'c4hero-viewkeys-'))
  file = path.join(dir, 'workspace.dsl')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function run(...argv: string[]): Promise<CliResult> {
  const args = parseArgs(argv[0] === 'init' ? argv : [...argv, '--file', file])
  return COMMANDS.find((c) => c.name === args.command)!.run(args, { cwd: dir })
}

const keys = () => allViewsOf(parseDSL(readFileSync(file, 'utf8')).workspace).map((v) => v.key)
const NANOID = /^[A-Za-z]{8}$/

async function seed() {
  await run('init', '--template', 'blank')
  await run('add', 'system', '--name', 'Shop', '--id', 'shop')
}

describe('readable keys for auto-created views', () => {
  it('add container names the auto container view <system>-container', async () => {
    await seed()
    const res = await run('add', 'container', '--name', 'Web', '--parent', 'shop')
    expect(keys()).toContain('shop-container')
    expect(keys().some((k) => NANOID.test(k))).toBe(false)
    expect(res.changed?.views ?? []).not.toContainEqual(expect.stringMatching(NANOID))
    expect(Object.values((res.data as { renamedViews: Record<string, string> }).renamedViews)).toEqual(['shop-container'])
    expect(res.changed?.views ?? []).toEqual([])
  })

  it('add component names the auto component view <container>-component', async () => {
    await seed()
    await run('add', 'container', '--name', 'Web', '--parent', 'shop')
    await run('add', 'component', '--name', 'Button', '--parent', 'web')
    expect(keys()).toContain('web-component')
    expect(keys().some((k) => NANOID.test(k))).toBe(false)
  })

  it('apply addView gives readable keys and reports the final ones', async () => {
    await seed()
    const plan = path.join(dir, 'plan.json')
    writeFileSync(
      plan,
      JSON.stringify({
        operations: [
          { op: 'addView', viewType: 'systemLandscape', title: 'All' },
          { op: 'addView', viewType: 'systemContext', scope: 'shop', title: 'Shop ctx' },
        ],
      }),
    )
    const res = await run('apply', '--plan', plan)
    expect(res.changed?.views?.sort()).toEqual(['landscape', 'shop-context'])
    const renamed = (res.data as { renamedViews: Record<string, string> }).renamedViews
    expect(Object.keys(renamed).every((k) => NANOID.test(k))).toBe(true)
    expect(Object.values(renamed).sort()).toEqual(['landscape', 'shop-context'])
    expect(keys().some((k) => NANOID.test(k))).toBe(false)
  })

  it('apply --dry-run reports saved: false and writes nothing', async () => {
    await seed()
    const before = readFileSync(file, 'utf8')
    const plan = path.join(dir, 'plan.json')
    writeFileSync(plan, JSON.stringify({ operations: [{ op: 'addPerson', ref: 'ann', name: 'Ann', description: 'A user' }] }))
    const dry = await run('apply', '--plan', plan, '--dry-run')
    expect((dry.data as { saved: boolean }).saved).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe(before)
    const real = await run('apply', '--plan', plan)
    expect(real.data).toMatchObject({ applied: 1, saved: true })
  })

  it('view add without --key uses the readable default', async () => {
    await seed()
    const res = await run('view', 'add', '--type', 'context', '--scope', 'shop')
    expect(res.changed?.views).toEqual(['shop-context'])
    expect(keys()).toContain('shop-context')
  })

  it('view add --key keeps the chosen key even when it looks random', async () => {
    await seed()
    await run('view', 'add', '--type', 'context', '--scope', 'shop', '--key', 'AbCdEfGh')
    expect(keys()).toContain('AbCdEfGh')
  })

  it('leaves views that existed before the session untouched', async () => {
    await seed()
    await run('view', 'add', '--type', 'landscape', '--key', 'AbCdEfGh')
    await run('add', 'container', '--name', 'Web', '--parent', 'shop')
    expect(keys()).toEqual(expect.arrayContaining(['AbCdEfGh', 'shop-container']))
  })

  it('moving a container into a system without a container view names that view readably', async () => {
    await seed()
    await run('add', 'system', '--name', 'Ops', '--id', 'ops')
    await run('add', 'container', '--name', 'Web', '--parent', 'shop')
    const res = await run('move', 'web', '--to', 'ops')
    expect(keys()).toContain('ops-container')
    expect(keys().some((k) => NANOID.test(k))).toBe(false)
    expect(res.changed?.views).toContain('ops-container')
  })
})
