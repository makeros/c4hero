// Browser-side socket to the dev-server PTY session. Reconnects while open so
// a dev-server restart or a flaky socket heals without the user touching the
// panel. The URL carries the access token, so it is never logged.
import {
  AGENT_TERMINAL_PATH,
  type ClientMessage,
  type ServerMessage,
} from './protocol.ts'

export type AgentTerminalStatus = 'connecting' | 'connected' | 'disconnected'

export interface AgentTerminalConnection {
  send(msg: ClientMessage): void
  close(): void
}

const INITIAL_BACKOFF_MS = 500
const MAX_BACKOFF_MS = 5000

// The server only ever sends these four shapes; anything else is dropped.
function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof m !== 'object' || m === null) return null
  const o = m as Record<string, unknown>
  switch (o.type) {
    case 'replay':
    case 'output':
      return typeof o.data === 'string' ? (o as ServerMessage) : null
    case 'exit':
      return typeof o.exitCode === 'number' ? (o as ServerMessage) : null
    case 'error':
      return typeof o.message === 'string' ? (o as ServerMessage) : null
    default:
      return null
  }
}

export function connectAgentTerminal(opts: {
  token: string
  onMessage: (msg: ServerMessage) => void
  onStatus: (status: AgentTerminalStatus) => void
}): AgentTerminalConnection {
  const url = `ws://${location.host}${AGENT_TERMINAL_PATH}?token=${encodeURIComponent(opts.token)}`
  let socket: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let backoff = INITIAL_BACKOFF_MS
  let closed = false

  const connect = () => {
    timer = null
    opts.onStatus('connecting')
    const ws = new WebSocket(url)
    socket = ws
    ws.onopen = () => {
      backoff = INITIAL_BACKOFF_MS
      opts.onStatus('connected')
    }
    ws.onmessage = (e) => {
      const msg = parseServerMessage(e.data)
      if (msg) opts.onMessage(msg)
    }
    ws.onclose = () => {
      if (socket === ws) socket = null
      if (closed) return
      opts.onStatus('disconnected')
      timer = setTimeout(connect, backoff)
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
    }
  }
  connect()

  return {
    send(msg) {
      // Dropped, not queued: replaying stale keystrokes after a reconnect
      // would type into whatever the shell is doing by then.
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg))
      }
    },
    close() {
      closed = true
      if (timer) clearTimeout(timer)
      timer = null
      const ws = socket
      socket = null
      ws?.close()
    },
  }
}
