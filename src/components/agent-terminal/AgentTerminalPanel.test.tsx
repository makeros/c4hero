import { render, screen, fireEvent, act } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useSettingsStore } from '@/store/settings'
import type { ServerMessage } from '@/lib/agentTerminal/protocol'
import type { ClientMessage } from '@/lib/agentTerminal/protocol'

const h = vi.hoisted(() => ({
  calls: [] as string[],
  sent: [] as unknown[],
  onMessage: null as null | ((m: unknown) => void),
  keyHandler: null as null | ((e: KeyboardEvent) => boolean),
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    loadAddon() {}
    open() {}
    focus() {}
    dispose() {}
    onData() { return { dispose() {} } }
    attachCustomKeyEventHandler(fn: (e: KeyboardEvent) => boolean) { h.keyHandler = fn }
    reset() { h.calls.push('reset') }
    write(d: string) { h.calls.push(`write:${d}`) }
  },
}))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('@/lib/agentTerminal/availability', () => ({
  agentTerminalToken: () => 'tok',
  isAgentTerminalAvailable: () => true,
}))
vi.mock('@/lib/agentTerminal/client', () => ({
  connectAgentTerminal: (opts: { onMessage: (m: unknown) => void }) => {
    h.onMessage = opts.onMessage
    return { send: (m: ClientMessage) => { h.sent.push(m) }, close: () => {} }
  },
}))

import AgentTerminalPanel from './AgentTerminalPanel'

const CSS_VAR = '--agent-terminal-w'

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
}

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  h.calls.length = 0
  h.sent.length = 0
  h.onMessage = null
  setViewportWidth(1440)
  useSettingsStore.setState({ agentTerminalOpen: true, agentTerminalWidth: 560 })
  useWorkspaceStore.setState({
    activeWorkspaceFilename: 'shop.dsl',
    activeViewKey: 'ctx',
    selectedElementIds: ['api', 'db'],
    selectedRelationshipId: null,
  })
})

afterEach(() => {
  document.documentElement.style.removeProperty(CSS_VAR)
})

describe('AgentTerminalPanel', () => {
  it('sets the CSS var while open on desktop and removes it on unmount', () => {
    const { unmount } = render(<AgentTerminalPanel />)
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('560px')
    unmount()
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('')
  })

  it('does not set the CSS var on mobile', () => {
    setViewportWidth(500)
    render(<AgentTerminalPanel />)
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('')
  })

  it('keeps keydown events inside the panel away from window listeners', () => {
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    render(<AgentTerminalPanel />)
    fireEvent.keyDown(screen.getByRole('complementary', { name: 'Agent terminal' }), { key: 'k', metaKey: true })
    window.removeEventListener('keydown', onWindowKey)
    expect(onWindowKey).not.toHaveBeenCalled()
  })

  it('Insert selection sends one input message without a carriage return', () => {
    render(<AgentTerminalPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Insert selection' }))
    const inputs = h.sent.filter((m) => (m as ClientMessage).type === 'input') as { data: string }[]
    expect(inputs).toHaveLength(1)
    expect(inputs[0].data).toBe('[c4hero file=shop.dsl view=ctx elements=api,db] ')
    expect(inputs[0].data).not.toContain('\r')
  })

  it('Shift+Enter sends ESC+CR once and stops xterm from sending its own CR', () => {
    render(<AgentTerminalPanel />)
    const key = h.keyHandler!
    const shiftEnter = { key: 'Enter', shiftKey: true, altKey: false, ctrlKey: false, metaKey: false }
    expect(key(new KeyboardEvent('keydown', shiftEnter))).toBe(false)
    expect(key(new KeyboardEvent('keypress', shiftEnter))).toBe(false)
    expect(key(new KeyboardEvent('keyup', shiftEnter))).toBe(false)
    expect(key(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(true)
    const inputs = h.sent.filter((m) => (m as ClientMessage).type === 'input') as { data: string }[]
    expect(inputs.map((m) => m.data)).toEqual(['\x1b\r'])
  })

  it('Close sets agentTerminalOpen to false', () => {
    render(<AgentTerminalPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Close terminal' }))
    expect(useSettingsStore.getState().agentTerminalOpen).toBe(false)
  })

  it('resets the terminal before writing replay data', () => {
    render(<AgentTerminalPanel />)
    act(() => { h.onMessage?.({ type: 'replay', data: 'hello' } satisfies ServerMessage) })
    expect(h.calls).toEqual(['reset', 'write:hello'])
  })

  it('shows Restart after exit and returns to connected on the next replay', () => {
    render(<AgentTerminalPanel />)
    expect(screen.queryByRole('button', { name: 'Restart shell' })).toBeNull()
    act(() => { h.onMessage?.({ type: 'replay', data: '' } satisfies ServerMessage) })
    act(() => { h.onMessage?.({ type: 'exit', exitCode: 1 } satisfies ServerMessage) })
    expect(screen.getByRole('button', { name: 'Restart shell' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Exited')
    fireEvent.click(screen.getByRole('button', { name: 'Restart shell' }))
    expect(h.sent).toContainEqual({ type: 'restart' })
    expect(screen.getByRole('status').textContent).toBe('Exited')
    act(() => { h.onMessage?.({ type: 'replay', data: '' } satisfies ServerMessage) })
    expect(screen.getByRole('status').textContent).toBe('Connected')
    expect(screen.queryByRole('button', { name: 'Restart shell' })).toBeNull()
  })
})
