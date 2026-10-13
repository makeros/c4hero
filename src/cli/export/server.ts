/// <reference types="node" />
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface StaticServer {
  url: string
  close(): Promise<void>
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
}

/** The built export viewer: `../viewer` next to the bundled `bin/c4hero.mjs`.
 *  `C4HERO_VIEWER_DIR` overrides it (tests, local experiments). */
export function resolveViewerDir(env: Record<string, string | undefined> = process.env): string {
  return env.C4HERO_VIEWER_DIR || fileURLToPath(new URL('../viewer', import.meta.url))
}

/** Serves `dir` on 127.0.0.1 and a random port. Only files inside `dir` are
 *  reachable; unknown extension-less paths fall back to index.html. */
export async function startStaticServer(dir: string): Promise<StaticServer> {
  const root = realpathSync(dir)
  const send = (res: import('node:http').ServerResponse, status: number, file: string | null, body?: string) => {
    if (!file) {
      res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }).end(body ?? '')
      return
    }
    res.writeHead(status, { 'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' })
    createReadStream(file).on('error', () => res.destroy()).pipe(res)
  }

  const server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, null, 'Method not allowed')
    let pathname: string
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname)
    } catch {
      return send(res, 400, null, 'Bad request')
    }
    if (pathname.includes('\0')) return send(res, 400, null, 'Bad request')

    const candidate = path.join(root, pathname)
    const inside = (p: string) => p === root || p.startsWith(root + path.sep)
    const serveable = (p: string) => {
      if (!inside(p) || !existsSync(p)) return false
      try {
        return inside(realpathSync(p)) && statSync(p).isFile()
      } catch {
        return false
      }
    }
    if (serveable(candidate)) return send(res, 200, candidate)
    if (!path.extname(pathname)) {
      const index = path.join(root, 'index.html')
      if (serveable(index)) return send(res, 200, index)
    }
    send(res, 404, null, 'Not found')
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      }),
  }
}
