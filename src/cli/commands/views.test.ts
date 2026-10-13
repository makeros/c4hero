/// <reference types="node" />
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serializeDSL } from '@/lib/dsl'
import { extractSidecar, parseSidecar, serializeSidecar } from '@/lib/sidecar'
import { createBigBankSample } from '@/lib/templates'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'
import { buildInitialViewContent, findViewHelper } from '@/store/workspace-helpers'
import type { Workspace } from '@/types/model'
import { parseArgs } from '../args'
import type { CliResult } from '../output'
import { viewCommands } from './views'

let dir: string
let file: string
let sidecarFile: string

const base = createBigBankSample()
const system = base.model.softwareSystems.find((s) => s.containers.some((c) => c.components.length > 0))!
const container = system.containers.find((c) => c.components.length > 0)!

function reload(): Workspace {
  const sidecarJson = existsSync(sidecarFile) ? readFileSync(sidecarFile, 'utf8') : undefined
  const { workspace, errors } = parseWorkspaceDocument({ content: readFileSync(file, 'utf8'), fallbackName: 'bank', sidecarJson })
  expect(errors).toEqual([])
  return workspace
}

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'c4hero-views-'))
  file = path.join(dir, 'bank.dsl')
  sidecarFile = path.join(dir, 'bank.c4hero.json')
  writeFileSync(file, serializeDSL(createBigBankSample()))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function run(...argv: string[]): Promise<CliResult> {
  const args = parseArgs([...argv, '--file', file])
  return viewCommands.find((c) => c.name === args.command)!.run(args, { cwd: dir })
}

const ids = (list: { id: string }[]) => [...new Set(list.map((e) => e.id))].sort()
const edges = (ws: Workspace, list: { id: string }[]) =>
  [...new Set(list.map((r) => {
    const rel = ws.model.relationships.find((m) => m.id === r.id)!
    return `${rel.sourceId}->${rel.destinationId}`
  }))].sort()

describe('view add', () => {
  const cases: Array<[string, string[]]> = [
    ['landscape', []],
    ['context', ['--scope', system.id]],
    ['container', ['--scope', system.id]],
    ['component', ['--scope', `${system.id}.${container.id}`]],
  ]
  it.each(cases)('auto-populates a %s view like the app', async (type, extra) => {
    const result = await run('view', 'add', '--type', type, '--key', 'v-new', ...extra)
    expect(result.changed?.views).toEqual(['v-new'])
    const view = findViewHelper(reload(), 'v-new')!
    const expectedType = { landscape: 'systemLandscape', context: 'systemContext', container: 'container', component: 'component' }[type]!
    const scopeId = type === 'component' ? container.id : type === 'landscape' ? undefined : system.id
    const expected = buildInitialViewContent(base.model, view.type, scopeId)
    expect(view.type).toBe(expectedType)
    expect(view.elements.length).toBeGreaterThan(0)
    expect(ids(view.elements)).toEqual(ids(expected.elements))
    expect(edges(reload(), view.relationships)).toEqual(edges(base, expected.relationships))
    expect(view.autoLayout?.direction).toBe('TB')
  })

  it('generates a unique default key and title', async () => {
    await run('view', 'add', '--type', 'container', '--scope', system.id)
    await run('view', 'add', '--type', 'container', '--scope', system.id)
    const keys = reload().views.containerViews.map((v) => v.key)
    expect(keys).toContain(`${system.id}-container`)
    expect(keys).toContain(`${system.id}-container-2`)
    expect(findViewHelper(reload(), `${system.id}-container`)!.title).toBe(`${system.name} — Containers`)
  })

  it('rejects duplicate keys, missing or wrong scope, and unknown types', async () => {
    await run('view', 'add', '--type', 'landscape', '--key', 'dup')
    await expect(run('view', 'add', '--type', 'landscape', '--key', 'dup')).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(run('view', 'add', '--type', 'container')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('view', 'add', '--type', 'container', '--scope', container.id)).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(run('view', 'add', '--type', 'nope')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('view', 'add', '--type', 'container', '--scope', 'missing')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('stores the description and does not write on --dry-run', async () => {
    const before = readFileSync(file, 'utf8')
    const dry = await run('view', 'add', '--type', 'landscape', '--key', 'd', '--dry-run')
    expect((dry.data as { diff: string }).diff).toContain('"d"')
    expect(readFileSync(file, 'utf8')).toBe(before)
    await run('view', 'add', '--type', 'landscape', '--key', 'd', '--description', 'All of it')
    expect(findViewHelper(reload(), 'd')!.description).toBe('All of it')
  })
})

describe('view update', () => {
  it('round-trips exclude, include, auto-layout, title and description', async () => {
    await run('view', 'add', '--type', 'container', '--scope', system.id, '--key', 'v')
    const initial = findViewHelper(reload(), 'v')!
    const target = initial.elements.find((e) => e.id !== system.id && !system.containers.some((c) => c.id === e.id)) ?? initial.elements[0]

    await run('view', 'update', 'v', '--exclude', target.id, '--auto-layout', 'LR', '--title', 'Renamed', '--description', 'Desc')
    let view = findViewHelper(reload(), 'v')!
    expect(view.elements.map((e) => e.id)).not.toContain(target.id)
    expect(view.autoLayout?.direction).toBe('LR')
    expect(view.title).toBe('Renamed')
    expect(view.description).toBe('Desc')
    for (const r of view.relationships) {
      const rel = reload().model.relationships.find((m) => m.id === r.id)!
      expect([rel.sourceId, rel.destinationId]).not.toContain(target.id)
    }

    await run('view', 'update', 'v', '--include', target.id)
    view = findViewHelper(reload(), 'v')!
    expect(view.elements.map((e) => e.id)).toContain(target.id)
    expect(ids(view.elements)).toEqual(ids(initial.elements))
  })

  it('include * restores the auto-populated content', async () => {
    await run('view', 'add', '--type', 'landscape', '--key', 'l')
    const full = findViewHelper(reload(), 'l')!.elements.length
    const first = findViewHelper(reload(), 'l')!.elements[0].id
    await run('view', 'update', 'l', '--exclude', first)
    expect(findViewHelper(reload(), 'l')!.elements.length).toBe(full - 1)
    await run('view', 'update', 'l', '--include', '*')
    expect(findViewHelper(reload(), 'l')!.elements.length).toBe(full)
  })

  it('warns when excluding the scope element of its own view', async () => {
    await run('view', 'add', '--type', 'context', '--scope', system.id, '--key', 'c')
    const result = await run('view', 'update', 'c', '--exclude', system.id)
    expect(result.warnings.join(' ')).toContain('scope')
    expect(findViewHelper(reload(), 'c')!.elements.map((e) => e.id)).toContain(system.id)
  })

  it('rejects bad input', async () => {
    await run('view', 'add', '--type', 'container', '--scope', system.id, '--key', 'v')
    await expect(run('view', 'update', 'nope', '--title', 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(run('view', 'update', 'v')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('view', 'update', 'v', '--auto-layout', 'XX')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('view', 'update', 'v', '--include', 'missing')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('view remove', () => {
  it('removes the view and prunes its sidecar entry', async () => {
    await run('view', 'add', '--type', 'container', '--scope', system.id, '--key', 'gone')
    const ws = reload()
    const gone = findViewHelper(ws, 'gone')!
    gone.elements[0].x = 10
    gone.elements[0].y = 20
    gone.elements[0].locked = true
    gone.locked = true
    const keep = ws.views.systemLandscapeViews[0]
    keep.elements[0].x = 5
    keep.elements[0].y = 6
    keep.elements[0].pinned = true
    writeFileSync(file, serializeDSL(ws))
    writeFileSync(sidecarFile, serializeSidecar(extractSidecar(ws)!))
    expect(parseSidecar(readFileSync(sidecarFile, 'utf8'))!.views).toHaveProperty('gone')

    const result = await run('view', 'remove', 'gone')
    expect(result.changed?.views).toEqual(['gone'])
    expect(findViewHelper(reload(), 'gone')).toBeUndefined()
    const sidecar = parseSidecar(readFileSync(sidecarFile, 'utf8'))!
    expect(sidecar.views).not.toHaveProperty('gone')
    expect(sidecar.views).toHaveProperty(keep.key)
  })

  it('rejects unknown keys and a missing key', async () => {
    await expect(run('view', 'remove', 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(run('view', 'remove')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('view', 'bogus')).rejects.toMatchObject({ code: 'USAGE' })
  })
})

describe('style', () => {
  it('writes element styles that re-parse identically, merging on repeat', async () => {
    await run(
      'style', 'element', '--tag', 'Hot', '--background', '#ff0000', '--color', '#ffffff', '--shape', 'RoundedBox',
      '--border', 'dashed', '--stroke', '#000000', '--thickness', '3', '--font-size', '22', '--opacity', '80', '--icon', 'https://x.test/i.png',
    )
    await run('style', 'element', '--tag', 'Hot', '--shape', 'Hexagon')
    const styles = reload().views.configuration.styles.elements.filter((s) => s.tag === 'Hot')
    expect(styles).toEqual([
      {
        tag: 'Hot', background: '#ff0000', color: '#ffffff', shape: 'Hexagon', border: 'dashed',
        stroke: '#000000', strokeWidth: 3, fontSize: 22, opacity: 80, icon: 'https://x.test/i.png',
      },
    ])
  })

  it('writes relationship styles that re-parse identically, merging on repeat', async () => {
    await run('style', 'relationship', '--tag', 'Async', '--color', '#00ff00', '--thickness', '4', '--dashed', 'true', '--font-size', '18', '--opacity', '70')
    await run('style', 'relationship', '--tag', 'Async', '--dashed', 'false')
    const styles = reload().views.configuration.styles.relationships.filter((s) => s.tag === 'Async')
    expect(styles).toEqual([{ tag: 'Async', color: '#00ff00', thickness: 4, dashed: false, fontSize: 18, opacity: 70 }])
  })

  it('rejects missing tag, missing flags, bad numbers and unknown subcommands', async () => {
    await expect(run('style', 'element', '--background', 'red')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('style', 'element', '--tag', 'T')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('style', 'relationship', '--tag', 'T')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('style', 'element', '--tag', 'T', '--opacity', 'lots')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('style', 'relationship', '--tag', 'T', '--dashed', 'maybe')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('style', 'bogus')).rejects.toMatchObject({ code: 'USAGE' })
  })
})
