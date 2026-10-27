// One shared PTY session behind the dev-server terminal. No Node imports: the
// PTY is injected, so the lifecycle is unit-tested with a fake.

import type { ClientMessage, ServerMessage } from './protocol.ts'

export interface PtyLike {
  onData(cb: (data: string) => void): void
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

export interface TerminalClient {
  send(msg: ServerMessage): void
}

const DEFAULT_SCROLLBACK = 256 * 1024

export class TerminalSession {
  private readonly clients = new Set<TerminalClient>()
  private readonly scrollbackBytes: number
  private pty: PtyLike | null = null
  private running = false
  private disposed = false
  // Kept across restarts so a respawned shell starts at the size the panel has.
  private size: { cols: number; rows: number } | null = null
  // Counted in UTF-16 code units, not bytes: close enough for a scrollback cap,
  // and it avoids a Node Buffer dependency.
  private buffer = ''
  private lastExit: Extract<ServerMessage, { type: 'exit' }> | null = null

  private readonly spawn: () => PtyLike

  constructor(spawn: () => PtyLike, opts?: { scrollbackBytes?: number }) {
    this.spawn = spawn
    this.scrollbackBytes = opts?.scrollbackBytes ?? DEFAULT_SCROLLBACK
  }

  attach(client: TerminalClient): void {
    if (this.disposed) return
    this.clients.add(client)
    // Replay first so the client renders history before any live output.
    client.send({ type: 'replay', data: this.buffer })
    if (!this.pty) this.start()
    else if (!this.running && this.lastExit) client.send(this.lastExit)
  }

  // Closing the panel must not kill the shell, so the last detach is a no-op
  // beyond forgetting the client.
  detach(client: TerminalClient): void {
    this.clients.delete(client)
  }

  handle(_client: TerminalClient, msg: ClientMessage): void {
    if (this.disposed) return
    switch (msg.type) {
      case 'input':
        if (this.running) this.pty?.write(msg.data)
        break
      case 'resize':
        this.size = { cols: msg.cols, rows: msg.rows }
        if (this.running) this.pty?.resize(msg.cols, msg.rows)
        break
      case 'restart':
        // Only a dead shell is restarted; a live one would be orphaned.
        if (this.pty && !this.running) this.start()
        break
      case 'kill':
        if (this.running) this.pty?.kill()
        break
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.running) this.pty?.kill()
    this.running = false
    this.clients.clear()
  }

  private start(): void {
    let pty: PtyLike
    try {
      pty = this.spawn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.broadcast({ type: 'error', message: `failed to start shell: ${message}` })
      return
    }
    const restarted = this.pty !== null
    this.pty = pty
    this.lastExit = null
    this.running = true
    pty.onData((data) => {
      if (pty !== this.pty) return
      this.append(data)
      this.broadcast({ type: 'output', data })
    })
    pty.onExit((e) => {
      // A stale exit from a replaced PTY must not mark the new one dead.
      if (pty !== this.pty || this.disposed) return
      this.running = false
      this.lastExit = { type: 'exit', exitCode: e.exitCode, signal: e.signal }
      this.broadcast(this.lastExit)
    })
    if (this.size) pty.resize(this.size.cols, this.size.rows)
    // Every tab still shows the exit state; replay returns them to connected.
    if (restarted) this.broadcast({ type: 'replay', data: this.buffer })
  }

  private append(data: string): void {
    const next = this.buffer + data
    if (next.length <= this.scrollbackBytes) {
      this.buffer = next
      return
    }
    // Drop up to the first newline so replay never starts mid-escape-sequence.
    const kept = next.slice(next.length - this.scrollbackBytes)
    const nl = kept.indexOf('\n')
    this.buffer = nl === -1 ? kept : kept.slice(nl + 1)
  }

  private broadcast(msg: ServerMessage): void {
    for (const c of this.clients) c.send(msg)
  }
}
