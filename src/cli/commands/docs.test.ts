import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serializeDSL } from '@/lib/dsl'
import { createBigBankSample } from '@/lib/templates'
import { parseArgs } from '../args'
import { CliFailure } from '../errors'
import type { CliResult } from '../output'
import { docsCommands } from './docs'

let dir: string
let file: string
const sample = createBigBankSample()
const rel = sample.model.relationships[0]
const element = [...sample.model.people, ...sample.model.softwareSystems].find((e) => e.id === rel.sourceId)!

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'c4hero-docs-'))
  file = path.join(dir, 'bank.dsl')
  writeFileSync(file, serializeDSL(createBigBankSample()))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function run(...argv: string[]): Promise<CliResult> {
  const args = parseArgs([...argv, '--file', file])
  return docsCommands.find((c) => c.name === args.command)!.run(args, { cwd: dir })
}
const dsl = () => readFileSync(file, 'utf8')

describe('link-doc / unlink-doc', () => {
  it('writes consecutive documents keys and re-indexes after removing the middle link', async () => {
    for (const n of ['a', 'b', 'c']) await run('link-doc', element.id, '--path', `docs/${n}.md`, '--title', n.toUpperCase())
    let text = dsl()
    for (const i of [0, 1, 2]) {
      expect(text).toContain(`c4hero.documents.${i}.path`)
      expect(text).toContain(`c4hero.documents.${i}.title`)
    }
    await run('unlink-doc', element.id, '--path', 'docs/b.md')
    text = dsl()
    expect(text).not.toContain('c4hero.documents.2.')
    expect(text).toMatch(/c4hero\.documents\.1\.path"? "?docs\/c\.md/)
    expect(text).not.toContain('docs/b.md')
  })

  it('links a relationship by src->dst, then by its id', async () => {
    const first = await run('link-doc', `${rel.sourceId}->${rel.destinationId}`, '--path', 'docs/r.md', '--match', rel.description ?? '')
    const id = first.changed!.relationships![0]
    const r = await run('link-doc', id, '--path', 'docs/s.md')
    expect((r.data as { documents: unknown[] }).documents).toHaveLength(2)
    expect(dsl()).toContain('docs/s.md')
  })

  it('--match picks among parallel edges for link-doc and unlink-doc', async () => {
    const copy = createBigBankSample()
    const base = copy.model.relationships[0]
    copy.model.relationships.push({ ...base, id: 'parallelEdge', description: 'Parallel' })
    writeFileSync(file, serializeDSL(copy))
    const ref = `${base.sourceId}->${base.destinationId}`
    await expect(run('link-doc', ref, '--path', 'docs/p.md')).rejects.toMatchObject({ code: 'AMBIGUOUS' })
    const linked = await run('link-doc', ref, '--path', 'docs/p.md', '--match', 'Parallel')
    expect(linked.changed!.relationships).toHaveLength(1)
    await expect(run('unlink-doc', ref, '--path', 'docs/p.md')).rejects.toMatchObject({ code: 'AMBIGUOUS' })
    await run('unlink-doc', ref, '--path', 'docs/p.md', '--match', 'Parallel')
    expect(dsl()).not.toContain('docs/p.md')
  })

  it('updates the title instead of duplicating a path', async () => {
    await run('link-doc', element.id, '--path', 'docs/a.md', '--title', 'One')
    const r = await run('link-doc', element.id, '--path', 'docs/a.md', '--title', 'Two')
    expect((r.data as { documents: unknown[]; updatedExisting: boolean })).toMatchObject({ updatedExisting: true })
    expect((r.data as { documents: unknown[] }).documents).toEqual([{ path: 'docs/a.md', title: 'Two' }])
  })

  it('accepts an html path, stripping the extension for the default title', async () => {
    const r = await run('link-doc', element.id, '--path', 'docs/r.html')
    expect((r.data as { documents: Array<{ path: string; title: string }> }).documents).toEqual([{ path: 'docs/r.html', title: 'r' }])
  })

  it('--create refuses an html path', async () => {
    await expect(run('link-doc', element.id, '--path', 'docs/r.html', '--create')).rejects.toMatchObject({ code: 'USAGE' })
  })

  it.each(['../a.md', 'docs/../a.md', '/abs/a.md', 'docs/.hid/a.md', 'docs/a.txt', 'x.css'])('rejects %s', async (p) => {
    const before = dsl()
    await expect(run('link-doc', element.id, '--path', p)).rejects.toBeInstanceOf(CliFailure)
    expect(dsl()).toBe(before)
  })

  it('warns when the file is missing and not when it exists', async () => {
    expect((await run('link-doc', element.id, '--path', 'docs/missing.md')).warnings).toHaveLength(1)
    mkdirSync(path.join(dir, 'docs'))
    writeFileSync(path.join(dir, 'docs/here.md'), '# x')
    expect((await run('link-doc', element.id, '--path', 'docs/here.md')).warnings).toEqual([])
  })

  it('--create scaffolds from the model and never overwrites', async () => {
    const r = await run('link-doc', element.id, '--path', 'docs/new/a.md', '--create')
    expect((r.data as { created: boolean }).created).toBe(true)
    const body = readFileSync(path.join(dir, 'docs/new/a.md'), 'utf8')
    expect(body.startsWith(`# ${element.name}`)).toBe(true)
    expect(body).toContain('## Relationships')

    writeFileSync(path.join(dir, 'docs/keep.md'), 'KEEP')
    const again = await run('link-doc', element.id, '--path', 'docs/keep.md', '--create')
    expect(readFileSync(path.join(dir, 'docs/keep.md'), 'utf8')).toBe('KEEP')
    expect(again.warnings[0]).toMatch(/already exists/)
  })

  it('--create refuses to write through a symlink leaving the root', async () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), 'c4hero-out-'))
    try {
      symlinkSync(outside, path.join(dir, 'link'))
      await expect(run('link-doc', element.id, '--path', 'link/a.md', '--create')).rejects.toBeInstanceOf(CliFailure)
      expect(existsSync(path.join(outside, 'a.md'))).toBe(false)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('dry-run neither writes the file nor the DSL', async () => {
    const before = dsl()
    const r = await run('link-doc', element.id, '--path', 'docs/d.md', '--create', '--dry-run')
    expect(dsl()).toBe(before)
    expect(existsSync(path.join(dir, 'docs/d.md'))).toBe(false)
    expect((r.data as { diff?: string }).diff).toContain('docs/d.md')
  })

  it('unlink-doc fails with NOT_FOUND for an unknown link', async () => {
    await expect(run('unlink-doc', element.id, '--path', 'docs/none.md')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('link-doc on deployment elements', () => {
  beforeEach(() => {
    const copy = createBigBankSample()
    copy.model.deploymentEnvironments = [{
      id: 'prod', name: 'Production',
      deploymentNodes: [{
        id: 'awsNode', type: 'deploymentNode', name: 'AWS', tags: ['Element', 'Deployment Node'], properties: {},
        children: [], containerInstances: [], softwareSystemInstances: [],
        infrastructureNodes: [{ id: 'lbNode', type: 'infrastructureNode', name: 'LB', tags: ['Element', 'Infrastructure Node'], properties: {} }],
      }],
    }]
    writeFileSync(file, serializeDSL(copy))
  })

  it('links and unlinks documents on deployment and infrastructure nodes by id', async () => {
    const node = await run('link-doc', 'awsNode', '--path', 'docs/aws.md', '--title', 'AWS')
    expect(node.data).toMatchObject({ target: 'awsNode', documents: [{ path: 'docs/aws.md', title: 'AWS' }] })
    await run('link-doc', 'lbNode', '--path', 'docs/lb.md', '--title', 'LB')
    expect(dsl()).toContain('docs/aws.md')
    expect(dsl()).toContain('docs/lb.md')
    await run('unlink-doc', 'lbNode', '--path', 'docs/lb.md')
    expect(dsl()).not.toContain('docs/lb.md')
  })
})
