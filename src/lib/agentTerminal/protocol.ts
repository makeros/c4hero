// Wire protocol between the browser terminal panel and the dev-server PTY
// session. Pure and Node-free: it is bundled into the client and imported by
// the Vite plugin.

export type ClientMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'restart' }
  | { type: 'kill' }

export type ServerMessage =
  | { type: 'replay'; data: string } // sent once per attach, may be ''
  | { type: 'output'; data: string }
  | { type: 'exit'; exitCode: number; signal?: number }
  | { type: 'error'; message: string }

export const AGENT_TERMINAL_PATH = '/__agent-terminal'
export const AGENT_TERMINAL_META = 'c4hero-agent-terminal'

const MIN_DIM = 1
const MAX_DIM = 1000

// Non-integers (NaN, fractions, strings) are rejected; integers are clamped
// into 1..1000, so 0 becomes 1 and a huge value becomes 1000. A PTY with a
// zero or absurd size misbehaves, but a fit race can legitimately report 0.
function parseDim(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null
  return Math.min(MAX_DIM, Math.max(MIN_DIM, v))
}

/** Validates a raw frame from the socket. Returns null for anything that is
 *  not exactly one of the four client shapes. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const m = parsed as Record<string, unknown>
  switch (m.type) {
    case 'input':
      return typeof m.data === 'string' ? { type: 'input', data: m.data } : null
    case 'resize': {
      const cols = parseDim(m.cols)
      const rows = parseDim(m.rows)
      return cols === null || rows === null ? null : { type: 'resize', cols, rows }
    }
    case 'restart':
      return { type: 'restart' }
    case 'kill':
      return { type: 'kill' }
    default:
      return null
  }
}

export function encodeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg)
}
