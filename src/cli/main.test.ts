/// <reference types="node" />
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCli } from './main'
import { BOOLEAN_FLAG_NAMES } from './args'
import { COMMANDS } from './commands'
import { acceptedFlags } from './help'

let dir: string

beforeEach(() => {
  errText = ''
  dir = mkdtempSync(path.join(os.tmpdir(), 'c4hero-main-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

interface Out {
  code: number
  text: string
  json: { ok: boolean; command: string; data: { commands: { name: string }[]; usage: string[]; version: string; errors: unknown[]; diff: string }; error?: { code: string; message: string; candidates?: string[] }; changed?: unknown }
}

let errText = ''

async function c4(...argv: string[]): Promise<Out> {
  let text = ''
  const code = await runCli(argv, { cwd: dir, stdout: (t) => (text += t), stderr: (t) => (errText += t) })
  let json: Out['json'] = undefined as never
  try {
    json = JSON.parse(text)
  } catch {
    // pretty output is not JSON
  }
  return { code, text, json }
}

const dsl = () => readFileSync(path.join(dir, 'workspace.dsl'), 'utf8')

describe('help and dispatch', () => {
  it('help lists every command as JSON', async () => {
    const out = await c4('help')
    expect(out.code).toBe(0)
    expect(out.json).toMatchObject({ ok: true, command: 'help' })
    const names = out.json.data.commands.map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining([...COMMANDS.map((c) => c.name), 'version', 'help']))
    for (const n of ['init', 'check', 'apply', 'list', 'show', 'views', 'graph', 'add', 'update', 'remove', 'rename-id', 'relate', 'update-rel', 'unrelate', 'link-doc', 'unlink-doc', 'view', 'style', 'step', 'deploy']) {
      expect(names).toContain(n)
    }
  })

  it('<cmd> --help and help <cmd> print usage with flags', async () => {
    const a = await c4('add', '--help')
    const b = await c4('help', 'add')
    expect(a.json).toEqual(b.json)
    expect(a.json.data.usage.join(' ')).toContain('--technology')
    const rel = await c4('update-rel', '--help')
    expect(rel.json.data.usage.join(' ')).toContain('--match')
    expect((await c4('view', '--help')).json.data.usage.length).toBeGreaterThan(1)
  })

  it('help --pretty is human text; unknown help target fails', async () => {
    const out = await c4('help', '--pretty')
    expect(out.text).toContain('Commands:')
    expect(out.text).toContain('rename-id')
    expect((await c4('help', 'add', '--pretty')).text).toContain('Usage:')
    const bad = await c4('help', 'nope')
    expect(bad.code).toBe(1)
    expect(bad.json.error?.code).toBe('NOT_FOUND')
  })

  it('reports version and unknown commands', async () => {
    expect((await c4('version')).json.data.version).toBeTruthy()
    const out = await c4('frobnicate')
    expect(out.code).toBe(1)
    expect(out.json.error?.code).toBe('UNKNOWN_COMMAND')
  })
})

describe('command groups end to end', () => {
  beforeEach(async () => {
    expect((await c4('init', '--template', 'microservices')).code).toBe(0)
  })

  it('workspace: init then check', async () => {
    const out = await c4('check')
    expect(out).toMatchObject({ code: 0, json: { ok: true, command: 'check' } })
    expect(out.json.data.errors).toEqual([])
  })

  it('read: list, show, views, graph', async () => {
    expect((await c4('list', '--type', 'container')).json.data).toBeTruthy()
    expect((await c4('show', 'apiGateway')).json).toMatchObject({ ok: true, command: 'show' })
    expect((await c4('views')).json.ok).toBe(true)
    expect((await c4('graph')).json.ok).toBe(true)
    const missing = await c4('show', 'nope')
    expect(missing).toMatchObject({ code: 1 })
    expect(missing.json.error?.code).toBe('NOT_FOUND')
  })

  it('elements: add, update, rename-id, remove', async () => {
    const add = await c4('add', 'container', '--name', 'Billing Service', '--parent', 'platform')
    expect(add).toMatchObject({ code: 0, json: { ok: true, command: 'add' } })
    expect(dsl()).toContain('billingService')
    expect((await c4('update', 'billingService', '--description', 'Bills')).code).toBe(0)
    expect((await c4('rename-id', 'billingService', 'billing')).code).toBe(0)
    expect(dsl()).toContain('billing = container')
    expect((await c4('remove', 'billing')).code).toBe(0)
    expect(dsl()).not.toContain('Billing Service')
  })

  it('relationships: relate, update-rel, unrelate', async () => {
    expect((await c4('relate', 'customer', 'orderService', '--description', 'Orders')).code).toBe(0)
    expect((await c4('update-rel', 'customer->orderService', '--match', 'Orders', '--description', 'Places orders')).code).toBe(0)
    expect(dsl()).toContain('Places orders')
    expect((await c4('unrelate', 'customer->orderService', '--match', 'Places orders')).code).toBe(0)
    expect(dsl()).not.toContain('Places orders')
  })

  it('docs: link-doc, unlink-doc', async () => {
    const link = await c4('link-doc', 'apiGateway', '--path', 'docs/gateway.md', '--title', 'Gateway', '--create')
    expect(link).toMatchObject({ code: 0, json: { ok: true, command: 'link-doc' } })
    expect(dsl()).toContain('docs/gateway.md')
    expect((await c4('unlink-doc', 'apiGateway', '--path', 'docs/gateway.md')).code).toBe(0)
    expect(dsl()).not.toContain('docs/gateway.md')
  })

  it('views and styles: view add/update/remove, style element', async () => {
    const add = await c4('view', 'add', '--type', 'container', '--scope', 'platform', '--key', 'Extra')
    expect(add.code).toBe(0)
    expect(dsl()).toContain('Extra')
    expect((await c4('view', 'update', 'Extra', '--title', 'Extra view')).code).toBe(0)
    expect((await c4('style', 'element', '--tag', 'Hot', '--background', '#ff0000')).code).toBe(0)
    expect(dsl()).toContain('#ff0000')
    expect((await c4('view', 'remove', 'Extra')).code).toBe(0)
  })

  it('dynamic: step add, remove', async () => {
    expect((await c4('view', 'add', '--type', 'dynamic', '--scope', 'platform', '--key', 'Flow')).code).toBe(0)
    const add = await c4('step', 'add', '--view', 'Flow', '--from', 'customer', '--to', 'apiGateway', '--description', 'Visits')
    expect(add).toMatchObject({ code: 0, json: { ok: true, command: 'step' } })
    expect((await c4('step', 'remove', '--view', 'Flow', '--index', '1')).code).toBe(0)
  })

  it('deployment: deploy env and node', async () => {
    expect((await c4('deploy', 'env', 'add', 'Production')).code).toBe(0)
    const node = await c4('deploy', 'node', 'add', '--env', 'Production', '--name', 'Web Server', '--technology', 'Linux')
    expect(node).toMatchObject({ code: 0, json: { ok: true, command: 'deploy' } })
    expect(dsl()).toContain('Web Server')
  })

  it('dry-run leaves the file untouched and returns a diff', async () => {
    const before = dsl()
    const out = await c4('add', 'person', '--name', 'Auditor', '--dry-run')
    expect(out.code).toBe(0)
    expect(out.json.data.diff).toContain('Auditor')
    expect(dsl()).toBe(before)
  })
})

describe('flag contract', () => {
  beforeEach(async () => {
    expect((await c4('init', '--template', 'microservices')).code).toBe(0)
  })

  it('rejects a mistyped flag with USAGE listing the accepted ones', async () => {
    const out = await c4('add', 'container', '--name', 'X', '--parent', 'platform', '--descripton', 'oops')
    expect(out.code).toBe(1)
    expect(out.json.error?.code).toBe('USAGE')
    expect(out.json.error?.message).toContain('--descripton')
    expect(out.json.error?.candidates).toContain('--description <value>')
    expect(dsl()).not.toContain('X')
  })

  it('validates per subcommand and still allows global flags', async () => {
    const bad = await c4('view', 'remove', 'Containers', '--title', 'x')
    expect(bad.json.error?.code).toBe('USAGE')
    expect((await c4('list', '--file', 'workspace.dsl')).code).toBe(0)
    expect((await c4('step', 'move', '--view', 'v', '--index', '1', '--to', '2', '--response')).json.error?.code).toBe('USAGE')
  })

  it('declares every boolean in args.ts and no value flag there', () => {
    for (const mod of COMMANDS) {
      const { bySubcommand, ...base } = mod.flags
      for (const set of [base, ...Object.values(bySubcommand ?? {})]) {
        for (const b of set.booleans ?? []) expect(BOOLEAN_FLAG_NAMES.has(b), `${mod.name} --${b}`).toBe(true)
        for (const v of set.values ?? []) expect(BOOLEAN_FLAG_NAMES.has(v), `${mod.name} --${v}`).toBe(false)
      }
      expect(acceptedFlags(mod, undefined === bySubcommand ? undefined : Object.keys(bySubcommand)[0])).not.toBeNull()
    }
  })

  it('help lists the flags generated from the declaration', async () => {
    const out = await c4('help', 'add')
    expect((out.json.data as unknown as { flags: Record<string, string[]> }).flags['']).toContain('--description <value>')
  })

  it('--force=false is false everywhere', async () => {
    writeFileSync(path.join(dir, 'workspace.dsl'), dsl() + '\n// a comment\n')
    const out = await c4('add', 'person', '--name', 'P', '--force=false')
    expect(out.json.error?.code).toBe('LOSSY_FILE')
    expect((await c4('add', 'person', '--name', 'P', '--force')).code).toBe(0)
  })

  it('accepts a positional name for add, and rejects conflicting names', async () => {
    const ok = await c4('add', 'container', 'Shipping Service', '--parent', 'platform')
    expect(ok).toMatchObject({ code: 0, json: { changed: { elements: ['shippingService'] } } })
    expect((await c4('add', 'container', 'A', '--name', 'A', '--parent', 'platform')).code).toBe(0)
    const clash = await c4('add', 'container', 'A', '--name', 'B', '--parent', 'platform')
    expect(clash.json.error?.code).toBe('USAGE')
    expect((await c4('add', 'container', 'A', 'B', '--parent', 'platform')).json.error?.code).toBe('USAGE')
  })

  it('an invalid or taken --id is VALIDATION for model and deployment elements alike', async () => {
    await c4('deploy', 'env', 'add', 'Live')
    expect((await c4('deploy', 'node', 'add', '--env', 'Live', '--name', 'N', '--id', 'platform')).json.error?.code).toBe('VALIDATION')
    expect((await c4('add', 'person', '--name', 'Q', '--id', 'platform')).json.error?.code).toBe('VALIDATION')
    expect((await c4('add', 'person', '--name', 'Q', '--id', 'not valid')).json.error?.code).toBe('VALIDATION')
  })
})

describe('changed semantics', () => {
  beforeEach(async () => {
    expect((await c4('init', '--template', 'microservices')).code).toBe(0)
  })

  it('is {} when nothing changed, and names only what changed otherwise', async () => {
    const first = await c4('link-doc', 'apiGateway', '--path', 'docs/g.md', '--title', 'G')
    expect(first.json.changed).toEqual({ elements: ['apiGateway'] })
    const again = await c4('link-doc', 'apiGateway', '--path', 'docs/g.md', '--title', 'G')
    expect(again.json.changed).toEqual({})
    expect((await c4('link-doc', 'apiGateway', '--path', 'docs/g.md')).json.changed).toEqual({})
    const first2 = await c4('style', 'element', '--tag', 'Hot', '--background', '#ff0000')
    expect(first2.json.changed).toEqual({ styles: ['element:Hot'] })
    expect((await c4('style', 'element', '--tag', 'Hot', '--background', '#ff0000')).json.changed).toEqual({})
    await c4('view', 'add', '--type', 'container', '--scope', 'platform', '--key', 'Extra')
    expect((await c4('view', 'update', 'Extra', '--title', 'T')).json.changed).toEqual({ views: ['Extra'] })
    expect((await c4('view', 'update', 'Extra', '--title', 'T')).json.changed).toEqual({})
  })

  it('re-linking keeps the existing title when --title is absent', async () => {
    await c4('link-doc', 'apiGateway', '--path', 'docs/g.md', '--title', 'Gateway notes')
    await c4('link-doc', 'apiGateway', '--path', 'docs/g.md')
    expect(dsl()).toContain('Gateway notes')
  })

  it('apply gives a new element a fresh id when a deployment node already uses the derived one', async () => {
    await c4('deploy', 'env', 'add', 'Live')
    await c4('deploy', 'node', 'add', '--env', 'Live', '--name', 'Edge Box')
    writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ operations: [{ op: 'addSoftwareSystem', ref: 's', name: 'Edge Box' }] }))
    const out = await c4('apply', '--plan', 'plan.json')
    expect(out.code).toBe(0)
    expect(out.json.changed).toEqual({ elements: ['edgeBox2'], views: expect.any(Array) })
  })
})

describe('unexpected errors', () => {
  it('wraps them as INTERNAL (exit 5) JSON without a stack on stdout', async () => {
    expect((await c4('init', '--template', 'microservices')).code).toBe(0)
    mkdirSync(path.join(dir, 'docs'))
    symlinkSync(path.join(dir, 'missing-target.md'), path.join(dir, 'docs', 'dangling.md'))
    const out = await c4('link-doc', 'apiGateway', '--path', 'docs/dangling.md', '--create')
    expect(out.code).toBe(5)
    expect(out.json).toMatchObject({ ok: false, error: { code: 'INTERNAL' } })
    expect(out.text).not.toContain('    at ')
    expect(errText).toBe('')
  })

  it('prints the stack to stderr only when C4HERO_DEBUG=1', async () => {
    expect((await c4('init', '--template', 'microservices')).code).toBe(0)
    mkdirSync(path.join(dir, 'docs'))
    symlinkSync(path.join(dir, 'missing-target.md'), path.join(dir, 'docs', 'dangling.md'))
    process.env.C4HERO_DEBUG = '1'
    try {
      const out = await c4('link-doc', 'apiGateway', '--path', 'docs/dangling.md', '--create')
      expect(out.text).not.toContain('    at ')
      expect(errText).toContain('EEXIST')
    } finally {
      delete process.env.C4HERO_DEBUG
    }
  })
})
