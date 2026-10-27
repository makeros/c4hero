import { AGENT_TERMINAL_META } from './protocol.ts'

/** The dev server injects the token as a <meta> only when started with
 *  `--terminal`. Gating on `import.meta.env.DEV` lets production builds fold
 *  this to a constant `null`. */
export function agentTerminalToken(): string | null {
  if (!import.meta.env.DEV) return null
  const content = document
    .querySelector(`meta[name="${AGENT_TERMINAL_META}"]`)
    ?.getAttribute('content')
  return content || null
}

export function isAgentTerminalAvailable(): boolean {
  return agentTerminalToken() !== null
}
