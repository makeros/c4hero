// Access guards for the terminal WebSocket upgrade. The endpoint executes
// code, so every guard must pass before any PTY is touched. Pure and
// Node-free: the plugin hands in plain strings.

import { AGENT_TERMINAL_PATH } from './protocol.ts'

export interface UpgradeRequestInfo {
  remoteAddress: string | undefined
  host: string | undefined
  origin: string | undefined
  url: string | undefined // raw req.url incl. query
  port: number
  token: string
}

export type UpgradeCheck = { ok: true } | { ok: false; reason: string }

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** Constant-time string compare. Unequal lengths still walk the longer one so
 *  timing does not reveal the token length. */
export function tokensEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export function checkUpgrade(req: UpgradeRequestInfo): UpgradeCheck {
  // Backstop for `--host` or an edited vite config: only loopback peers.
  if (!req.remoteAddress || !LOOPBACK.has(req.remoteAddress)) {
    return { ok: false, reason: 'non-loopback remote address' }
  }

  // Host check stops DNS rebinding.
  const hosts = [`localhost:${req.port}`, `127.0.0.1:${req.port}`, `[::1]:${req.port}`]
  if (!req.host || !hosts.includes(req.host)) {
    return { ok: false, reason: 'host is not localhost on the server port' }
  }

  // Origin check plus token stop cross-site WebSocket hijacking.
  if (!req.origin) return { ok: false, reason: 'missing origin' }
  if (!hosts.some((h) => req.origin === `http://${h}`)) {
    return { ok: false, reason: 'foreign origin' }
  }

  let parsed: URL
  try {
    parsed = new URL(req.url ?? '', 'http://localhost')
  } catch {
    return { ok: false, reason: 'unparseable url' }
  }
  if (parsed.pathname !== AGENT_TERMINAL_PATH) {
    return { ok: false, reason: 'wrong path' }
  }

  const token = parsed.searchParams.get('token')
  if (!token) return { ok: false, reason: 'missing token' }
  if (!tokensEqual(token, req.token)) return { ok: false, reason: 'invalid token' }

  return { ok: true }
}
