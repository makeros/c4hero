/// <reference types="node" />
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeDSL } from '@/lib/dsl'
import { createBigBankSample } from '@/lib/templates'
import { parseArgs } from '../args'
import { CliFailure } from '../errors'
import type { BrowserCandidate } from '../export/browser'
import type { CliResult } from '../output'
import { createExportCommand, type ExportDeps } from './export'

let dir: string
let file: string
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const cand = (name: string, warning?: string): BrowserCandidate => ({ name, path: `/bin/${name}`, source: 'default', ...(warning ? { warning } : {}) })

beforeEach(() => {
  dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'c4hero-export-')))
  mkdirSync(path.join(dir, '.git'))
  file = path.join(dir, 'bank.dsl')
  writeFileSync(file, serializeDSL(createBigBankSample()))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

interface Fakes {
  deps: ExportDeps
  closed: string[]
  serverClosed: () => boolean
  injected: string[]
  launches: string[]
}

/** `behaviour[name]` decides what a candidate does: 'ok', 'launch-fails', or 'page-fails'. */
function fakes(candidates: BrowserCandidate[], behaviour: Record<string, 'ok' | 'launch-fails' | 'page-fails'> = {}): Fakes {
  const closed: string[] = []
  const injected: string[] = []
  const launches: string[] = []
  let serverClosed = false
  const deps: ExportDeps = {
    candidates: () => candidates,
    launch: vi.fn(async (c: BrowserCandidate) => {
      if (behaviour[c.name] === 'launch-fails') throw new Error('spawn failed')
      return { cdp: {} as never, close: async () => void (closed.includes(c.name) || closed.push(c.name)) }
    }),
    openPage: vi.fn(async (_cdp, _url, opts) => {
      injected.push(opts.injectScript)
      return {
        sessionId: 's',
        evaluate: (async (expr: string) => {
          if (expr.includes('__c4heroExportReady')) return { ready: true, error: null }
          return { ok: true, mime: 'image/png', base64: PNG.toString('base64') }
        }) as never,
      }
    }),
    startServer: vi.fn(async () => ({ url: 'http://127.0.0.1:1/', close: async () => void (serverClosed = true) })),
    viewerDir: () => dir,
    timeoutMs: 5000,
  }
  // page-fails: wrap launch so the matching candidate's page fails to open
  const origLaunch = deps.launch
  const origOpen = deps.openPage
  let current = ''
  deps.launch = async (c, o) => {
    current = c.name
    launches.push(c.name)
    return origLaunch(c, o)
  }
  deps.openPage = async (cdp, url, o) => {
    if (behaviour[current] === 'page-fails') throw new Error('page crashed')
    return origOpen(cdp, url, o)
  }
  return { deps, closed, serverClosed: () => serverClosed, injected, launches }
}

async function run(deps: ExportDeps, ...argv: string[]): Promise<CliResult> {
  const args = parseArgs(['export', ...argv, '--file', file])
  return createExportCommand(deps).run(args, { cwd: dir })
}

const viewKey = createBigBankSample().views.containerViews[0].key

describe('export command', () => {
  it('writes <dsl-dir>/<view>.<fmt> by default and reports the browser', async () => {
    const f = fakes([cand('Chrome', 'careful')])
    const result = await run(f.deps, '--view', viewKey, '--format', 'png')
    const out = path.join(dir, `${viewKey}.png`)
    expect(result.data).toEqual({ view: viewKey, format: 'png', out, bytes: PNG.length, browser: { name: 'Chrome', source: 'default' } })
    expect(result.warnings).toEqual(['careful'])
    expect(readFileSync(out)).toEqual(PNG)
    expect(f.injected[0]).toContain('__C4HERO_EXPORT_INPUT__')
    expect(f.injected[0]).toContain('"dsl"')
  })

  it('closes the browser and the server on success', async () => {
    const f = fakes([cand('Chrome')])
    await run(f.deps, '--view', viewKey, '--format', 'svg', '--out', 'sub/x.svg')
    expect(existsSync(path.join(dir, 'sub', 'x.svg'))).toBe(true)
    expect(f.closed).toEqual(['Chrome'])
    expect(f.serverClosed()).toBe(true)
  })

  it('rejects an unknown view with candidates before launching anything', async () => {
    const f = fakes([cand('Chrome')])
    const err = await run(f.deps, '--view', 'nope', '--format', 'png').catch((e) => e)
    expect(err).toBeInstanceOf(CliFailure)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.candidates).toContain(viewKey)
    expect(f.launches).toEqual([])
  })

  it('fails with EXPORT_ENV and a C4HERO_BROWSER hint when no browser exists', async () => {
    const f = fakes([])
    const err = await run(f.deps, '--view', viewKey, '--format', 'png').catch((e) => e)
    expect(err.code).toBe('EXPORT_ENV')
    expect(err.message).toContain('C4HERO_BROWSER')
  })

  it('rejects --out outside the project root', async () => {
    const f = fakes([cand('Chrome')])
    const err = await run(f.deps, '--view', viewKey, '--format', 'png', '--out', '../escape.png').catch((e) => e)
    expect(err.code).toBe('USAGE')
    expect(f.launches).toEqual([])
  })

  it.each([
    ['png', 'out.svg'],
    ['svg', 'out'],
    ['png', 'out.PNG.txt'],
    ['png', '.hidden/out.png'],
    ['png', 'sub/.out.png'],
  ])('rejects --format %s with --out %s', async (format, out) => {
    const f = fakes([cand('Chrome')])
    const err = await run(f.deps, '--view', viewKey, '--format', format, '--out', out).catch((e) => e)
    expect(err.code).toBe('USAGE')
    expect(f.launches).toEqual([])
  })

  it('falls back to the next candidate when launching or the page fails', async () => {
    const f = fakes([cand('A'), cand('B'), cand('C')], { A: 'launch-fails', B: 'page-fails' })
    const result = await run(f.deps, '--view', viewKey, '--format', 'png')
    expect((result.data as { browser: { name: string } }).browser.name).toBe('C')
    expect(f.closed).toEqual(['B', 'C'])
    expect(f.serverClosed()).toBe(true)
  })

  it('cleans up and reports EXPORT_ENV when every candidate fails', async () => {
    const f = fakes([cand('A'), cand('B')], { A: 'page-fails', B: 'launch-fails' })
    const err = await run(f.deps, '--view', viewKey, '--format', 'png').catch((e) => e)
    expect(err.code).toBe('EXPORT_ENV')
    expect(err.message).toContain('A: page crashed')
    expect(f.closed).toEqual(['A'])
    expect(f.serverClosed()).toBe(true)
    expect(existsSync(path.join(dir, `${viewKey}.png`))).toBe(false)
  })

  it('surfaces a viewer-side export error without trying other browsers', async () => {
    const f = fakes([cand('A'), cand('B')])
    f.deps.openPage = async () => ({
      sessionId: 's',
      evaluate: (async (expr: string) =>
        expr.includes('__c4heroExportReady') ? { ready: true, error: null } : { ok: false, error: 'boom' }) as never,
    })
    const err = await run(f.deps, '--view', viewKey, '--format', 'png').catch((e) => e)
    expect(err.code).toBe('VALIDATION')
    expect(err.message).toContain('boom')
    expect(f.closed).toEqual(['A'])
    expect(f.serverClosed()).toBe(true)
  })

  it('validates flags', async () => {
    const f = fakes([cand('A')])
    expect((await run(f.deps, '--view', viewKey, '--format', 'gif').catch((e) => e)).code).toBe('USAGE')
    expect((await run(f.deps, '--view', viewKey, '--format', 'png', '--padding', '-1').catch((e) => e)).code).toBe('USAGE')
    expect((await run(f.deps, '--view', viewKey, '--format', 'png', '--theme', 'blue').catch((e) => e)).code).toBe('USAGE')
  })
})
