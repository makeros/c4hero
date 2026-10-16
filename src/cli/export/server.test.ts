/// <reference types="node" />
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveViewerDir, startStaticServer, type StaticServer } from './server'

let dir: string
let outside: string
let server: StaticServer

beforeEach(async () => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'c4hero-server-'))
  dir = path.join(base, 'viewer')
  outside = path.join(base, 'secret.txt')
  mkdirSync(path.join(dir, 'assets'), { recursive: true })
  writeFileSync(path.join(dir, 'index.html'), '<html>index</html>')
  writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)')
  writeFileSync(path.join(dir, 'assets', 'app.css'), 'a{}')
  writeFileSync(outside, 'secret')
  symlinkSync(outside, path.join(dir, 'link.txt'))
  server = await startStaticServer(dir)
})
afterEach(async () => {
  await server.close()
  rmSync(path.dirname(dir), { recursive: true, force: true })
})

const get = (p: string) => fetch(new URL(p, server.url))

describe('startStaticServer', () => {
  it('binds to loopback', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
  })

  it('serves files with content types', async () => {
    const js = await get('/assets/app.js')
    expect(js.status).toBe(200)
    expect(js.headers.get('content-type')).toContain('text/javascript')
    expect(await js.text()).toBe('console.log(1)')
    expect((await get('/assets/app.css')).headers.get('content-type')).toContain('text/css')
    expect((await get('/')).headers.get('content-type')).toContain('text/html')
  })

  it('falls back to index.html for extension-less paths only', async () => {
    expect(await (await get('/some/route')).text()).toBe('<html>index</html>')
    expect((await get('/missing.js')).status).toBe(404)
  })

  it('refuses path traversal and symlinks leaving the directory', async () => {
    const raw = await fetch(new URL('/%2e%2e/secret.txt', server.url))
    expect(await raw.text()).not.toContain('secret')
    expect(await (await get('/link.txt')).text()).not.toContain('secret')
  })
})

describe('resolveViewerDir', () => {
  it('prefers C4HERO_VIEWER_DIR', () => {
    expect(resolveViewerDir({ C4HERO_VIEWER_DIR: '/x/viewer' })).toBe('/x/viewer')
  })
})
