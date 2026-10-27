import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectAgentTerminal, type AgentTerminalStatus } from './client.ts'
import type { ServerMessage } from './protocol.ts'

class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }
  send(d: string) {
    this.sent.push(d)
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }
  drop() {
    this.readyState = 3
    this.onclose?.()
  }
}

function setup() {
  const statuses: AgentTerminalStatus[] = []
  const messages: ServerMessage[] = []
  const conn = connectAgentTerminal({
    token: 'a b&c',
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
  })
  return { conn, statuses, messages }
}
const last = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]

beforeEach(() => {
  vi.useFakeTimers()
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('connectAgentTerminal', () => {
  it('connects to the host with the encoded token', () => {
    const { statuses } = setup()
    expect(last().url).toBe(
      `ws://${location.host}/__agent-terminal?token=a%20b%26c`,
    )
    expect(statuses).toEqual(['connecting'])
    last().open()
    expect(statuses).toEqual(['connecting', 'connected'])
  })

  it('reconnects with 500ms doubling to a 5s cap, reset on open', () => {
    const { statuses } = setup()
    const delays: number[] = []
    for (let i = 0; i < 6; i++) {
      const before = FakeWebSocket.instances.length
      last().drop()
      let waited = 0
      while (FakeWebSocket.instances.length === before) {
        vi.advanceTimersByTime(100)
        waited += 100
      }
      delays.push(waited)
    }
    expect(delays).toEqual([500, 1000, 2000, 4000, 5000, 5000])
    last().open()
    last().drop()
    vi.advanceTimersByTime(499)
    const n = FakeWebSocket.instances.length
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances.length).toBe(n + 1)
    expect(statuses).toContain('disconnected')
  })

  it('does not reconnect after close()', () => {
    const { conn, statuses } = setup()
    last().open()
    conn.close()
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(statuses).not.toContain('disconnected')
  })

  it('cancels a pending reconnect on close()', () => {
    const { conn } = setup()
    last().drop()
    conn.close()
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('parses and forwards server messages, ignoring malformed ones', () => {
    const { messages } = setup()
    last().open()
    last().onmessage?.({ data: JSON.stringify({ type: 'output', data: 'hi' }) })
    last().onmessage?.({ data: 'not json' })
    last().onmessage?.({ data: JSON.stringify({ type: 'nope' }) })
    last().onmessage?.({ data: JSON.stringify({ type: 'output', data: 5 }) })
    expect(messages).toEqual([{ type: 'output', data: 'hi' }])
  })

  it('sends while open and drops while disconnected without queueing', () => {
    const { conn } = setup()
    conn.send({ type: 'input', data: 'lost' })
    const first = last()
    first.open()
    conn.send({ type: 'input', data: 'x' })
    expect(first.sent).toEqual([JSON.stringify({ type: 'input', data: 'x' })])
    first.drop()
    conn.send({ type: 'input', data: 'dropped' })
    vi.advanceTimersByTime(500)
    last().open()
    expect(last().sent).toEqual([])
  })
})
