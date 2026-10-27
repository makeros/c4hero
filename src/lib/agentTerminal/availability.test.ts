import { describe, it, expect, afterEach } from 'vitest'
import { agentTerminalToken, isAgentTerminalAvailable } from './availability.ts'
import { AGENT_TERMINAL_META } from './protocol.ts'

afterEach(() => {
  document.head.innerHTML = ''
})

function addMeta(content: string) {
  const meta = document.createElement('meta')
  meta.name = AGENT_TERMINAL_META
  meta.content = content
  document.head.appendChild(meta)
}

describe('agent terminal availability', () => {
  it('is unavailable without the meta tag', () => {
    expect(agentTerminalToken()).toBeNull()
    expect(isAgentTerminalAvailable()).toBe(false)
  })

  it('is available and exposes the token with the meta tag', () => {
    addMeta('abc123')
    expect(agentTerminalToken()).toBe('abc123')
    expect(isAgentTerminalAvailable()).toBe(true)
  })

  it('treats an empty token as unavailable', () => {
    addMeta('')
    expect(isAgentTerminalAvailable()).toBe(false)
  })
})
