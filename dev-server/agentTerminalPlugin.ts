// Dev-only Vite plugin hosting one guarded, persistent PTY behind a WebSocket.
// It executes code, so it is inert unless scripts/dev.mjs set
// C4HERO_AGENT_TERMINAL=1 (via `--terminal`), and node-pty/ws are imported
// lazily so plain dev and every build never load the native module.

import type { Plugin } from 'vite'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { chmodSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { AGENT_TERMINAL_META, AGENT_TERMINAL_PATH, encodeServerMessage, parseClientMessage } from '../src/lib/agentTerminal/protocol.ts'
import { checkUpgrade } from '../src/lib/agentTerminal/guards.ts'
import { TerminalSession, type PtyLike, type TerminalClient } from '../src/lib/agentTerminal/session.ts'
import { docsRootFor } from '../src/lib/docPath.ts'

const EXEC_BITS = 0o111

// A throw in a ws/http listener would crash the Vite process. Logged once,
// message only: the error text never carries the token.
let warned = false
function logOnce(where: string, err: unknown): void {
  if (warned) return
  warned = true
  // eslint-disable-next-line no-console
  console.error(`[agent-terminal] ${where} failed: ${err instanceof Error ? err.message : String(err)}`)
}

// node-pty 1.1.0 ships prebuilds/darwin-*/spawn-helper without the execute
// bit, so every spawn fails with `posix_spawnp failed`. Add +x at runtime
// instead of a postinstall; a no-op once a fixed prebuild ships.
function ensureSpawnHelperExecutable(): void {
  const require = createRequire(import.meta.url)
  const pkgDir = path.dirname(require.resolve('node-pty/package.json'))
  const candidates = [
    path.join(pkgDir, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
    path.join(pkgDir, 'build', 'Release', 'spawn-helper'),
  ]
  for (const file of candidates) {
    if (!existsSync(file)) continue
    const mode = statSync(file).mode & 0o777
    if ((mode & EXEC_BITS) === EXEC_BITS) continue
    chmodSync(file, mode | EXEC_BITS)
    // eslint-disable-next-line no-console
    console.log(`[agent-terminal] made node-pty spawn-helper executable: ${file}`)
  }
}

export function agentTerminalPlugin(): Plugin {
  const enabled = process.env.C4HERO_AGENT_TERMINAL === '1'
  // Per server start, never logged or persisted.
  const token = randomBytes(32).toString('hex')
  let usable = false

  return {
    name: 'agent-terminal',
    apply: 'serve',
    async configureServer(server) {
      if (!enabled || !server.httpServer) return

      type WsModule = typeof import('ws')
      let ptyModule: typeof import('node-pty')
      let wsModule: WsModule
      try {
        ptyModule = await import('node-pty')
        ensureSpawnHelperExecutable()
        wsModule = await import('ws')
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[agent-terminal] agent terminal disabled: node-pty failed to load: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      usable = true

      const httpServer = server.httpServer
      const workspace = process.env.VITE_DEV_WORKSPACE_PATH
      const resolvedPort = (): number => {
        const addr = httpServer.address()
        return addr && typeof addr === 'object' ? addr.port : server.config.server.port ?? 3004
      }

      const session = new TerminalSession((): PtyLike => {
        const shell = process.env.SHELL || (existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/bash')
        const pty = ptyModule.spawn(shell, ['-l'], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: workspace ? docsRootFor(workspace) : process.cwd(),
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            C4HERO_WORKSPACE: workspace ? path.resolve(workspace) : '',
            C4HERO_DEV_URL: `http://localhost:${resolvedPort()}`,
          } as Record<string, string>,
        })
        return {
          onData: (cb) => void pty.onData(cb),
          onExit: (cb) => void pty.onExit((e) => cb({ exitCode: e.exitCode, signal: e.signal })),
          write: (d) => pty.write(d),
          resize: (c, r) => pty.resize(c, r),
          kill: () => pty.kill(),
        }
      })

      const wss = new wsModule.WebSocketServer({ noServer: true })

      const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
        try {
          handleUpgrade(req, socket, head)
        } catch (err) {
          logOnce('upgrade', err)
          socket.destroy()
        }
      }
      const handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
        const pathname = (req.url ?? '').split('?')[0]
        // Leave every other upgrade (Vite HMR) alone.
        if (pathname !== AGENT_TERMINAL_PATH) return
        const check = checkUpgrade({
          remoteAddress: req.socket.remoteAddress,
          host: req.headers.host,
          origin: req.headers.origin,
          url: req.url,
          port: resolvedPort(),
          token,
        })
        if (!check.ok) {
          socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
          socket.destroy()
          return
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          const client: TerminalClient = {
            send: (msg) => {
              if (ws.readyState === ws.OPEN) ws.send(encodeServerMessage(msg))
            },
          }
          ws.on('message', (raw) => {
            try {
              const msg = parseClientMessage(raw.toString())
              if (!msg) {
                ws.close(1008, 'malformed message')
                return
              }
              session.handle(client, msg)
            } catch (err) {
              logOnce('message handler', err)
            }
          })
          ws.on('error', (err) => logOnce('socket', err))
          ws.on('close', () => session.detach(client))
          try {
            session.attach(client)
          } catch (err) {
            logOnce('attach', err)
          }
        })
      }
      httpServer.on('upgrade', onUpgrade)

      let cleaned = false
      const cleanup = (): void => {
        if (cleaned) return
        cleaned = true
        session.dispose()
        wss.close()
      }
      httpServer.on('close', cleanup)
      process.once('exit', cleanup)
      for (const sig of ['SIGINT', 'SIGTERM'] as const) {
        process.once(sig, () => {
          cleanup()
          // Re-raise so the default exit behaviour still happens.
          process.kill(process.pid, sig)
        })
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // Dev-served HTML only; a cross-origin page cannot read it.
        if (!enabled || !usable || !ctx.server) return html
        return {
          html,
          tags: [{ tag: 'meta', attrs: { name: AGENT_TERMINAL_META, content: token }, injectTo: 'head-prepend' }],
        }
      },
    },
  }
}
