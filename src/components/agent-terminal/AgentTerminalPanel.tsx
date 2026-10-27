import { useCallback, useEffect, useRef, useState } from 'react'
import { X, RotateCcw, Power, TextCursorInput } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useWorkspaceStore } from '@/store/workspace'
import {
  useSettingsStore,
  AGENT_TERMINAL_MIN_WIDTH,
  AGENT_TERMINAL_MAX_WIDTH,
} from '@/store/settings'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { agentTerminalToken } from '@/lib/agentTerminal/availability'
import { connectAgentTerminal, type AgentTerminalConnection, type AgentTerminalStatus } from '@/lib/agentTerminal/client'
import { onInsertText } from '@/lib/agentTerminal/agentTerminalBus'
import { formatSelectionForAgent } from '@/lib/agentTerminal/selection'

/** CSS variable the floating chrome reads to make room for the docked panel —
 *  set on <html> while open and docked (desktop), removed otherwise. */
const CSS_VAR = '--agent-terminal-w'

/** Arrow-key resize step, in px. */
const KEY_STEP = 16

/** Leave at least this much canvas on narrow (tablet) windows, but never go
 *  below the panel's own minimum. Mirrors DocumentsSidebar. */
const CANVAS_MIN_WIDTH = 360
// xterm sends a plain `\r` for Shift+Enter, so TUIs can't tell it from Enter.
// ESC+CR is what Claude Code's /terminal-setup binds for a soft line break.
const SHIFT_ENTER_SEQUENCE = '\x1b\r'

function clampWidth(value: number): number {
  return Math.min(AGENT_TERMINAL_MAX_WIDTH, Math.max(AGENT_TERMINAL_MIN_WIDTH, value))
}

function clampToViewport(width: number, viewportWidth: number): number {
  return Math.max(AGENT_TERMINAL_MIN_WIDTH, Math.min(width, viewportWidth - CANVAS_MIN_WIDTH))
}

type PanelStatus = AgentTerminalStatus | 'exited'

const STATUS_LABEL: Record<PanelStatus, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  exited: 'Exited',
  disconnected: 'Disconnected',
}

function statusColor(status: PanelStatus): string {
  if (status === 'connected') return 'var(--color-status-live)'
  if (status === 'connecting') return 'var(--color-status-planned)'
  if (status === 'exited') return 'var(--color-status-deprecated)'
  return 'var(--color-status-removed)'
}

function cssToken(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export default function AgentTerminalPanel() {
  const storedWidth = useSettingsStore((s) => s.agentTerminalWidth)
  const update = useSettingsStore((s) => s.update)
  const confirmDelete = useWorkspaceStore((s) => s.confirmDelete)
  const isMobile = useBreakpoint() === 'mobile'

  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const width = dragWidth ?? storedWidth
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : Infinity
  ))
  const [status, setStatus] = useState<PanelStatus>('connecting')

  const rootRef = useRef<HTMLElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const connRef = useRef<AgentTerminalConnection | null>(null)

  useEffect(() => {
    function onResize() { setViewportWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const effectiveWidth = isMobile ? width : clampToViewport(width, viewportWidth)

  // CSS variable lifecycle: set while docked (desktop), removed on unmount and
  // on mobile, where the full-width overlay must not shrink the canvas.
  useEffect(() => {
    const root = document.documentElement
    if (isMobile) {
      root.style.removeProperty(CSS_VAR)
      return undefined
    }
    root.style.setProperty(CSS_VAR, `${effectiveWidth}px`)
    return () => { root.style.removeProperty(CSS_VAR) }
  }, [isMobile, effectiveWidth])

  // Typed keys must never reach window/document shortcuts (mod+k, Space-pan,
  // dialogs). A native listener stops them at the panel root; React's
  // delegated handlers would already be too late for those listeners.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return undefined
    const stop = (e: Event) => e.stopPropagation()
    el.addEventListener('keydown', stop)
    el.addEventListener('keyup', stop)
    return () => {
      el.removeEventListener('keydown', stop)
      el.removeEventListener('keyup', stop)
    }
  }, [])

  // Terminal + socket lifecycle. Closing the panel only closes the socket; the
  // shell keeps running on the server and replays on the next attach.
  useEffect(() => {
    const container = containerRef.current
    const token = agentTerminalToken()
    if (!container || !token) return undefined

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: {
        background: cssToken('--color-bg-panel', '#0f1923'),
        foreground: cssToken('--color-text-primary', '#e6edf3'),
        cursor: cssToken('--color-accent', '#58a6ff'),
        selectionBackground: cssToken('--color-accent-glow', 'rgba(88,166,255,0.15)'),
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    termRef.current = term
    fitRef.current = fit

    const conn = connectAgentTerminal({
      token,
      onMessage: (msg) => {
        if (msg.type === 'replay') {
          term.reset()
          term.write(msg.data)
          setStatus('connected')
        } else if (msg.type === 'output') {
          term.write(msg.data)
        } else if (msg.type === 'exit') {
          term.write(`\r\n[process exited with code ${msg.exitCode}]\r\n`)
          setStatus('exited')
        } else {
          term.write(`\r\n[${msg.message}]\r\n`)
        }
      },
      onStatus: (s) => setStatus((prev) => (s === 'connected' && prev === 'exited' ? prev : s)),
    })
    connRef.current = conn

    const dataSub = term.onData((data) => conn.send({ type: 'input', data }))
    term.attachCustomKeyEventHandler((e) => {
      const isShiftEnter = e.key === 'Enter' && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey
      if (!isShiftEnter) return true
      // Swallow keydown/keypress/keyup so xterm never emits its own `\r`.
      if (e.type === 'keydown') conn.send({ type: 'input', data: SHIFT_ENTER_SEQUENCE })
      return false
    })

    const doFit = () => {
      if (!container.clientWidth || !container.clientHeight) return
      try {
        fit.fit()
      } catch {
        return
      }
      if (term.cols > 0 && term.rows > 0) conn.send({ type: 'resize', cols: term.cols, rows: term.rows })
    }
    // xterm needs a laid-out container: fit after the first paint.
    const raf = requestAnimationFrame(doFit)
    const ro = new ResizeObserver(doFit)
    ro.observe(container)
    window.addEventListener('resize', doFit)
    const unsubInsert = onInsertText((text) => conn.send({ type: 'input', data: text }))

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', doFit)
      unsubInsert()
      dataSub.dispose()
      conn.close()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      connRef.current = null
    }
  }, [])

  // Pointer-drag resize: kept in a ref so stray events after unmount are no-ops.
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)

  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startWidth: dragWidth ?? storedWidth }
  }, [dragWidth, storedWidth])

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current
    if (!drag) return
    // Left-anchored: dragging the right-edge handle right widens the panel.
    setDragWidth(clampWidth(drag.startWidth + (e.clientX - drag.startX)))
  }, [])

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>, persist: boolean) => {
    if (!dragState.current) return
    dragState.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragWidth((w) => {
      if (persist && w !== null) update({ agentTerminalWidth: w })
      return null
    })
  }, [update])

  useEffect(() => () => { dragState.current = null }, [])

  const onResizeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      update({ agentTerminalWidth: clampWidth(width + KEY_STEP) })
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      update({ agentTerminalWidth: clampWidth(width - KEY_STEP) })
    }
  }, [width, update])

  const handleClose = useCallback(() => {
    update({ agentTerminalOpen: false })
    document.getElementById('c4hero-canvas')?.focus()
  }, [update])

  const handleInsertSelection = useCallback(() => {
    const s = useWorkspaceStore.getState()
    const text = formatSelectionForAgent({
      filename: s.activeWorkspaceFilename,
      viewKey: s.activeViewKey,
      elementIds: s.selectedElementIds,
      relationshipId: s.selectedRelationshipId,
    })
    if (text) connRef.current?.send({ type: 'input', data: text })
    termRef.current?.focus()
  }, [])

  const handleRestart = useCallback(() => {
    connRef.current?.send({ type: 'restart' })
    termRef.current?.focus()
  }, [])

  const handleKill = useCallback(() => {
    confirmDelete('Kill the agent terminal shell? Any running process in it will be stopped.', () => {
      connRef.current?.send({ type: 'kill' })
    })
  }, [confirmDelete])

  return (
    <aside
      ref={rootRef}
      aria-label="Agent terminal"
      data-canvas-chrome="agent-terminal"
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        zIndex: 50,
        width: isMobile ? '100vw' : effectiveWidth,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg-panel)',
        borderRight: '1px solid var(--color-border)',
        boxShadow: '16px 0 64px rgba(0,0,0,0.6)',
      }}
    >
      {!isMobile && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize agent terminal"
          aria-valuenow={Math.round(width)}
          aria-valuemin={AGENT_TERMINAL_MIN_WIDTH}
          aria-valuemax={AGENT_TERMINAL_MAX_WIDTH}
          tabIndex={0}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={(e) => endDrag(e, true)}
          onPointerCancel={(e) => endDrag(e, false)}
          onKeyDown={onResizeKeyDown}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: -3,
            width: 6,
            cursor: 'ew-resize',
            touchAction: 'none',
          }}
        />
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 12px 10px 16px',
          borderBottom: '1px solid var(--color-border)',
          flex: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
            Agent terminal
          </span>
          <span
            role="status"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-muted)',
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(status), flex: 'none' }}
            />
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 'none' }}>
          <button className="btn-icon" title="Insert selection" aria-label="Insert selection" onClick={handleInsertSelection}>
            <TextCursorInput size={14} />
          </button>
          {status === 'exited' && (
            <button className="btn-icon" title="Restart shell" aria-label="Restart shell" onClick={handleRestart}>
              <RotateCcw size={14} />
            </button>
          )}
          <button className="btn-icon" title="Kill shell" aria-label="Kill shell" onClick={handleKill}>
            <Power size={14} />
          </button>
          <button className="btn-icon" title="Close" aria-label="Close terminal" onClick={handleClose}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, padding: '8px 0 0 10px', overflow: 'hidden' }} />
    </aside>
  )
}
