import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, FileText, Boxes, Server, ArrowRight } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import {
  useSettingsStore,
  DOCUMENTS_SIDEBAR_MIN_WIDTH,
  DOCUMENTS_SIDEBAR_MAX_WIDTH,
} from '@/store/settings'
import { useBreakpoint } from '@/hooks/useBreakpoint'
import { buildDocumentIndex, type DocumentEntry, type DocumentEntryView } from '@/lib/documentIndex'
import { documentViewUrl } from '@/lib/documentLinks'
import { TYPE_ICONS, TYPE_COLORS } from '@/lib/elementMeta'

/** CSS variable the rest of the floating chrome reads to make room for the
 *  docked sidebar — set on <html> while open and docked (desktop), removed
 *  otherwise (closed, unmounted, or the mobile full-width overlay). */
const CSS_VAR = '--docs-sidebar-w'

/** Arrow-key resize step, in px. */
const KEY_STEP = 16

const ELEMENT_TYPE_KEY: Record<string, string> = {
  Person: 'person',
  'Software System': 'softwareSystem',
  Container: 'container',
  Component: 'component',
}

/** On a narrow (tablet) viewport, a sidebar at its full stored width can crowd
 *  the canvas down to an unusable sliver. Bound it by the viewport instead,
 *  leaving at least 360px for the canvas — but never below the sidebar's own
 *  minimum, so a very narrow window just accepts more crowding. */
const CANVAS_MIN_WIDTH = 360

function clampWidth(value: number): number {
  return Math.min(DOCUMENTS_SIDEBAR_MAX_WIDTH, Math.max(DOCUMENTS_SIDEBAR_MIN_WIDTH, value))
}

function clampToViewport(width: number, viewportWidth: number): number {
  return Math.max(DOCUMENTS_SIDEBAR_MIN_WIDTH, Math.min(width, viewportWidth - CANVAS_MIN_WIDTH))
}

/** Icon + accent color for an entry's type badge. Element types reuse the
 *  canvas's own TYPE_ICONS/TYPE_COLORS; deployment/infrastructure nodes and
 *  relations (which have no canvas node accent) get their own fixed badge. */
function badgeFor(entry: DocumentEntry): { icon: React.ReactNode; color: string } {
  const typeKey = ELEMENT_TYPE_KEY[entry.typeLabel]
  if (typeKey) return { icon: TYPE_ICONS[typeKey], color: TYPE_COLORS[typeKey] }
  if (entry.typeLabel === 'Deployment Node') return { icon: <Boxes size={14} />, color: 'var(--color-type-infra)' }
  if (entry.typeLabel === 'Infrastructure Node') return { icon: <Server size={14} />, color: 'var(--color-type-infra)' }
  return { icon: <ArrowRight size={14} />, color: 'var(--color-text-muted)' }
}

export default function DocumentsSidebar() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const presentationMode = useWorkspaceStore((s) => s.presentationMode)
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const revealInView = useWorkspaceStore((s) => s.revealInView)

  const open = useSettingsStore((s) => s.documentsSidebarOpen)
  const storedWidth = useSettingsStore((s) => s.documentsSidebarWidth)
  const update = useSettingsStore((s) => s.update)

  const isMobile = useBreakpoint() === 'mobile'

  // Live width while a pointer drag is in progress — kept out of the
  // persisted setting until release so every intermediate frame doesn't
  // write to localStorage. `null` means "not dragging — use the stored width".
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const width = dragWidth ?? storedWidth

  // Viewport width, tracked for the tablet-width bound below.
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth : Infinity
  ))
  useEffect(() => {
    function onResize() { setViewportWidth(window.innerWidth) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // The width actually applied to the DOM: the desired (stored/dragged) width,
  // bounded so the canvas keeps a usable minimum on narrow (tablet) windows.
  // Mobile ignores this — it overlays full-width and doesn't dock the canvas.
  const effectiveWidth = isMobile ? width : clampToViewport(width, viewportWidth)

  const entries = useMemo(() => (workspace ? buildDocumentIndex(workspace) : []), [workspace])

  const visible = !!workspace && open && !presentationMode

  // CSS variable lifecycle: set while open and docked (not mobile — the
  // mobile overlay is full-width and must not shrink the canvas underneath
  // it), removed whenever closed, unmounted, or on mobile.
  useEffect(() => {
    const root = document.documentElement
    if (visible && !isMobile) {
      root.style.setProperty(CSS_VAR, `${effectiveWidth}px`)
      return () => { root.style.removeProperty(CSS_VAR) }
    }
    root.style.removeProperty(CSS_VAR)
    return undefined
  }, [visible, isMobile, effectiveWidth])

  // Pointer-drag resize state, kept in a ref (not React state) so a stray
  // move/up/cancel after unmount or a non-primary-button press is a no-op
  // rather than a stale closure writing to state.
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)

  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    // Pointer capture routes subsequent move/up/cancel events to this same
    // element regardless of where the pointer travels, so no window-level
    // listeners are needed (and nothing can leak past pointerup).
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startWidth: dragWidth ?? storedWidth }
  }, [dragWidth, storedWidth])

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current
    if (!drag) return
    // The sidebar is right-anchored — dragging the left-edge handle left
    // (toward screen center) widens it.
    setDragWidth(clampWidth(drag.startWidth + (drag.startX - e.clientX)))
  }, [])

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>, persist: boolean) => {
    if (!dragState.current) return
    dragState.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragWidth((w) => {
      if (persist && w !== null) update({ documentsSidebarWidth: w })
      return null
    })
  }, [update])

  const onResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => endDrag(e, true), [endDrag])
  // A cancelled drag (e.g. the browser takes over the gesture) must not persist a width.
  const onResizePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => endDrag(e, false), [endDrag])

  // Defensive teardown if the sidebar unmounts mid-drag (e.g. closed via the
  // `d` shortcut while dragging) — drop any in-flight drag without persisting.
  useEffect(() => () => { dragState.current = null }, [])

  const onResizeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      update({ documentsSidebarWidth: clampWidth(width + KEY_STEP) })
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      update({ documentsSidebarWidth: clampWidth(width - KEY_STEP) })
    }
  }, [width, update])

  const handleClose = useCallback(() => {
    update({ documentsSidebarOpen: false })
    // Move focus somewhere sensible rather than letting it fall back to
    // <body> — the top-pill Documents toggle if it's on screen, else the canvas.
    const toggle = document.querySelector<HTMLElement>('[data-documents-toggle]')
    const fallback = document.getElementById('c4hero-canvas')
    ;(toggle ?? fallback)?.focus()
  }, [update])

  const handleSelectView = useCallback((entry: DocumentEntry, viewKey: string) => {
    revealInView(viewKey, { kind: entry.kind, id: entry.id })
    // On mobile the sidebar is a full-width overlay — leaving it open hides
    // the view/selection the chip just navigated to.
    if (isMobile) update({ documentsSidebarOpen: false })
  }, [revealInView, isMobile, update])

  if (!visible) return null

  return (
    <aside
      aria-label="Documents"
      data-canvas-chrome="documents-sidebar"
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        right: 0,
        zIndex: 50,
        width: isMobile ? '100vw' : effectiveWidth,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg-panel)',
        borderLeft: '1px solid var(--color-border)',
        boxShadow: '-16px 0 64px rgba(0,0,0,0.6)',
      }}
    >
      {!isMobile && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize documents sidebar"
          aria-valuenow={Math.round(width)}
          aria-valuemin={DOCUMENTS_SIDEBAR_MIN_WIDTH}
          aria-valuemax={DOCUMENTS_SIDEBAR_MAX_WIDTH}
          tabIndex={0}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerCancel}
          onKeyDown={onResizeKeyDown}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: -3,
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
          padding: '14px 14px 12px 16px',
          borderBottom: '1px solid var(--color-border)',
          flex: 'none',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Documents{entries.length > 0 ? ` (${entries.length})` : ''}
        </span>
        <button
          className="btn-icon"
          title="Close"
          aria-label="Close documents sidebar"
          onClick={handleClose}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 10px 14px' }}>
        {entries.length === 0 ? (
          <div
            style={{
              padding: '28px 12px',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-muted)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            No document links yet — add them in the inspector&apos;s Documents tab.
          </div>
        ) : (
          entries.map((entry) => (
            <DocumentRow
              key={`${entry.kind}:${entry.id}`}
              entry={entry}
              activeViewKey={activeViewKey}
              onSelectView={(viewKey) => handleSelectView(entry, viewKey)}
            />
          ))
        )}
      </div>
    </aside>
  )
}

function DocumentRow({ entry, activeViewKey, onSelectView }: {
  entry: DocumentEntry
  activeViewKey: string | null
  onSelectView: (viewKey: string) => void
}) {
  const { icon, color } = badgeFor(entry)

  return (
    <div
      style={{
        padding: '10px 8px',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ display: 'inline-flex', flex: 'none', color }} aria-hidden="true">{icon}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={entry.name}
        >
          {entry.name}
        </span>
      </div>

      {entry.secondary && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', paddingLeft: 21 }}>
          {entry.secondary}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 21 }}>
        {entry.documents.map((doc, i) => (
          <a
            key={`${doc.path}-${i}`}
            href={documentViewUrl(doc)}
            target="_blank"
            rel="noopener noreferrer"
            title={doc.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 'var(--text-sm)',
              color: 'var(--color-accent)',
              textDecoration: 'none',
              overflow: 'hidden',
            }}
          >
            <FileText size={11} style={{ flex: 'none' }} aria-hidden="true" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
          </a>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 21 }}>
        {entry.views.length === 0 ? (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            Not in any view
          </span>
        ) : (
          entry.views.map((v: DocumentEntryView) => (
            <button
              key={v.key}
              data-active={v.key === activeViewKey ? 'true' : undefined}
              aria-current={v.key === activeViewKey ? 'true' : undefined}
              aria-label={`Open ${entry.name} in ${v.title}`}
              onClick={() => onSelectView(v.key)}
              style={{
                fontSize: 'var(--text-xs)',
                padding: '3px 8px',
                borderRadius: 999,
                border: '1px solid var(--color-border)',
                background: v.key === activeViewKey ? 'var(--color-surface-3)' : 'var(--color-surface-1)',
                color: v.key === activeViewKey ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              {v.title}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
