import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import type { LucideIcon } from 'lucide-react'
import { ZoomIn, AlertTriangle, Lock } from 'lucide-react'
import type { C4NodeData } from './types'
import StatusDot from './StatusDot'
import InlineName from './InlineName'
import NodeHandles from './NodeHandles'
import DocumentIndicator from '../DocumentIndicator'
import ZoomViewsCard, { ZOOM_VIEWS_CARD_WIDTH } from './ZoomViewsCard'
import { useWorkspaceStore } from '@/store/workspace'
import { getChildViews } from '@/store/workspace-selectors'
import { useSettingsStore } from '@/store/settings'
import { useZoomLevel } from '@/hooks/useZoomLevel'
import { useAnchoredPopover } from '@/hooks/useAnchoredPopover'
import { pickHighlightReason } from '@/lib/highlight'
import { SHAPE_ICON_MAP } from '@/lib/icons/registry'

interface BaseC4NodeProps {
  data: C4NodeData
  selected?: boolean
  icon: LucideIcon
  typeColor: string
  chipLabel: string
  tint: string
  borderStyle: string
  ariaPrefix: string
  technology?: string
  isExternal?: boolean
}

export default function BaseC4Node({
  data,
  selected: rfSelected,
  icon: Icon,
  typeColor,
  chipLabel,
  tint,
  borderStyle,
  ariaPrefix,
  technology,
  isExternal,
}: BaseC4NodeProps) {
  const storeSelected = useWorkspaceStore((s) => s.selectedElementIds.includes(data.element.id))
  // useShallow does a shallow array compare so the inline filter doesn't
  // create a "new reference every render → infinite re-render" loop.
  const elementViolations = useWorkspaceStore(
    useShallow((s) => s.scopeViolations.filter((v) => v.elementId === data.element.id)),
  )
  const filters = useWorkspaceStore(useShallow((s) => ({
    tags: s.activeTagFilter,
    statuses: s.activeStatusFilter,
    techs: s.activeTechFilter,
    teams: s.activeTeamFilter,
  })))
  const reasonLabel = data.highlighted ? pickHighlightReason(data.element, filters) : null
  const selected = rfSelected || storeSelected
  const { element, childCount, onDrillIn, viewCount = 1 } = data
  const hasDocuments = !!element.documents && element.documents.length > 0
  const desc = element.description ?? ''
  const style = data.style

  // ─── Resolve tag style overrides ──────────────────────────────────
  const ResolvedIcon = (style?.shape && SHAPE_ICON_MAP[style.shape]) || Icon
  const isPerson = style?.shape === 'Person'
  // Theme/tag styles apply to all elements. External elements are distinguished
  // by their dashed border and "External" chip label — not by opting out of color.
  const resolvedTint = style?.background ?? tint
  const resolvedTypeColor = style?.color ?? typeColor

  // Border: default nodes use their type-colored border from `borderStyle`.
  // When a tag style supplies a custom background, derive the border from that
  // fill (a brighter variant) so the node reads as a cohesive shape instead of
  // fighting the hardcoded type color. Explicit tag-style `stroke` still wins.
  const borderParts = borderStyle.split(' ')
  const borderWidth = style?.strokeWidth ?? (parseInt(borderParts[0]) || 2)
  const borderLine = style?.border?.toLowerCase() ?? borderParts[1] ?? (isExternal ? 'dashed' : 'solid')
  const borderColor = style?.stroke
    ?? (style?.background ? `color-mix(in srgb, ${style.background}, white 32%)` : borderParts.slice(2).join(' '))
  const resolvedBorder = selected
    ? `2px solid ${borderColor}`
    : `${borderWidth}px ${borderLine} ${borderColor}`

  // Opacity: Structurizr uses 0–100, CSS uses 0–1
  const resolvedOpacity = style?.opacity != null ? style.opacity / 100 : undefined

  // Font size from tag style (pixels)
  const resolvedFontSize = style?.fontSize

  // Semantic zoom: show different detail levels based on viewport zoom, unless
  // the user has opted to always keep descriptions and labels fully expanded.
  const alwaysExpandDetails = useSettingsStore((s) => s.alwaysExpandDetails)
  const rawZoomLevel = useZoomLevel()
  const zoomLevel = alwaysExpandDetails ? 'full' : rawZoomLevel
  const isCompact = zoomLevel === 'compact'
  const isFull = zoomLevel === 'full'
  const nameClamp = isCompact ? 1 : isFull ? undefined : 2
  const descClamp = isCompact ? undefined : isFull ? undefined : 3

  return (
    <div
      className={`c4-node relative ${selected ? 'selected' : ''} ${isPerson ? 'c4-node-person' : ''}`}
      style={{
        background: resolvedTint,
        border: resolvedBorder,
        // Per-node tier color for selection halo, hover handles, and the
        // connection-target indicator. Cascades to children. Falls back to
        // the theme-wide selection color via the CSS rules.
        ['--node-glow' as string]: borderColor,
        ...(isPerson && { borderRadius: 999, padding: '20px 28px' }),
        ...(resolvedOpacity != null && { opacity: resolvedOpacity }),
      }}
      role="figure"
      aria-label={`${ariaPrefix}: ${element.name}${technology ? ` (${technology})` : ''}${element.description ? ` - ${element.description}` : ''}`}
      aria-selected={selected}
    >
      <StatusDot status={element.status} />
      {elementViolations.length > 0 && (
        <span
          className="c4-node-violation"
          role="img"
          aria-label={elementViolations.map((v) => v.message).join(' | ')}
          title={elementViolations.map((v) => v.message).join('\n')}
        >
          <AlertTriangle size={12} />
          {elementViolations.length > 1 && <span>{elementViolations.length}</span>}
        </span>
      )}

      {/* Row 1: icon + title + action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isPerson ? (
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: `1.5px solid ${resolvedTypeColor}`,
              background: `color-mix(in srgb, ${resolvedTypeColor} 18%, transparent)`,
              color: resolvedTypeColor,
            }}
          >
            <ResolvedIcon size={14} />
          </span>
        ) : (
          <ResolvedIcon size={16} aria-hidden="true" style={{ flexShrink: 0, color: resolvedTypeColor }} />
        )}
        <div style={{ flex: 1, minWidth: 0, ...(resolvedFontSize != null && { fontSize: `${resolvedFontSize}px` }) }}>
          <InlineName elementId={element.id} name={element.name} lineClamp={nameClamp} textColor={style?.color} />
        </div>
        {/* Outside .c4-node-actions on purpose — that container fades out until
            the node is hovered, and a lock nobody can see reads as Auto-arrange
            being broken. */}
        {data.locked && (
          <span
            className="c4-node-lock"
            role="img"
            aria-label={`${element.name} is locked in place`}
            title="Locked — Auto-arrange and dragging leave this where it is"
          >
            <Lock size={11} />
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }} className="c4-node-actions">
          {viewCount > 1 && (
            <span
              className="c4-node-view-count nodrag"
              style={{ color: resolvedTypeColor }}
              title={`Appears in ${viewCount} views`}
              aria-label={`${element.name} appears in ${viewCount} views`}
            >
              {viewCount}×
            </span>
          )}
        </div>
      </div>

      {/* Row 2: description (hidden in compact mode) */}
      {desc && !isCompact && (
        <p
          className={descClamp ? `line-clamp-${descClamp}` : undefined}
          style={{ fontSize: resolvedFontSize != null ? `${Math.round(resolvedFontSize * 0.78)}px` : 'var(--text-xs-plus)', color: style?.color ? `color-mix(in srgb, ${style.color} 70%, ${resolvedTint})` : borderColor, margin: '6px 0 0', lineHeight: '1.4' }}
        >
          {desc}
        </p>
      )}

      {/* Row 3: type chip + technology pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
        <span
          className="c4-type-chip"
          style={{
            background: `color-mix(in srgb, ${resolvedTypeColor} 12%, transparent)`,
            color: resolvedTypeColor,
          }}
        >
          {chipLabel}
        </span>
        {technology && !isCompact && technology.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
          <span
            key={t}
            className="c4-type-chip"
            style={{
              background: `color-mix(in srgb, ${style?.color ?? 'var(--color-text-muted)'} 10%, transparent)`,
              color: style?.color ?? 'var(--color-text-muted)',
              fontWeight: 600,
              textTransform: 'none',
              letterSpacing: 'normal',
            }}
          >
            {t}
          </span>
        ))}
      </div>

      {/* Footer: always-visible, left-aligned node affordances — drill into the
          child diagram and open linked documents. */}
      {(childCount !== undefined || hasDocuments) && (
        <div className="c4-node-footer">
          {childCount !== undefined && (
            <ZoomButton element={element} typeColor={resolvedTypeColor} onDrillIn={onDrillIn} />
          )}
          {hasDocuments && (
            <DocumentIndicator
              documents={element.documents!}
              subject={element.name}
              color={style?.color ?? resolvedTypeColor}
              size={15}
              className="c4-node-footer-btn"
            />
          )}
        </div>
      )}

      <NodeHandles />
      {reasonLabel && (
        <span
          className="c4-highlight-label"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            background: 'var(--canvas-selection, var(--color-accent))',
            color: 'var(--color-bg-primary, #0b0f17)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
          aria-label={`Match: ${reasonLabel}`}
        >
          {reasonLabel}
        </span>
      )}
    </div>
  )
}

/** Zoom button. With one child view (or none) a click drills straight in;
 *  with several it toggles a card listing them, like DocumentIndicator. */
function ZoomButton({ element, typeColor, onDrillIn }: {
  element: C4NodeData['element']
  typeColor: string
  onDrillIn?: (id: string) => void
}) {
  const viewCount = useWorkspaceStore((s) => getChildViews(s.workspace, element).length)
  const hasChoice = viewCount > 1
  // Header + one row per view + "New diagram" button + padding.
  const { open, setOpen, toggle, triggerRef, popupRef, coords } = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>({
    width: ZOOM_VIEWS_CARD_WIDTH,
    side: 'auto',
    height: 30 * Math.min(viewCount, 8) + 90,
  })

  // The canvas pane can swallow bubbling mousedown, so also dismiss on a
  // capture-phase pointerdown outside the card/trigger.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (popupRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, popupRef, triggerRef, setOpen])

  return (
    <>
      <button
        ref={triggerRef}
        className="c4-node-action-btn c4-node-footer-btn nodrag"
        style={{ color: typeColor }}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          if (hasChoice) toggle()
          else onDrillIn?.(element.id)
        }}
        aria-label={`Zoom into ${element.name}`}
        aria-haspopup={hasChoice ? 'menu' : undefined}
        aria-expanded={hasChoice ? open : undefined}
      >
        <ZoomIn size={15} aria-hidden="true" />
      </button>
      {hasChoice && open && coords && createPortal(
        <ZoomViewsCard
          element={element}
          typeColor={typeColor}
          onClose={() => setOpen(false)}
          popupRef={popupRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 1000 }}
        />,
        document.body,
      )}
    </>
  )
}
