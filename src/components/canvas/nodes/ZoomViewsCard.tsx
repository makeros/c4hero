import type { CSSProperties, Ref } from 'react'
import { ZoomIn, Plus } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import { getChildViews } from '@/store/workspace-selectors'
import type { ModelElement } from '@/types/model'

interface Props {
  element: ModelElement
  typeColor: string
  /** Called after the card navigates or starts a new diagram. */
  onClose?: () => void
  /** Positioning from the caller — the card is portalled outside the canvas
   *  so it keeps its size at any viewport zoom. */
  popupRef?: Ref<HTMLDivElement>
  style?: CSSProperties
}

export const ZOOM_VIEWS_CARD_WIDTH = 240

function getLevelLabel(element: ModelElement): { level: number; label: string; viewType: string } {
  if (element.type === 'softwareSystem') {
    return { level: 2, label: 'Container diagram', viewType: 'container' }
  }
  return { level: 3, label: 'Component diagram', viewType: 'component' }
}

export default function ZoomViewsCard({ element, typeColor, onClose, popupRef, style }: Props) {
  const activeViewKey = useWorkspaceStore((s) => s.activeViewKey)
  const childViews = getChildViews(useWorkspaceStore.getState().workspace, element)
  const { level, label, viewType } = getLevelLabel(element)

  const navigateToView = (viewKey: string) => {
    onClose?.()
    const s = useWorkspaceStore.getState()
    if (!s.activeViewKey || viewKey === s.activeViewKey) return
    useWorkspaceStore.setState({
      activeViewKey: viewKey,
      viewHistory: [...s.viewHistory, s.activeViewKey],
      selectedElementIds: [],
      selectedRelationshipId: null,
      selectedGroupId: null,
    })
  }

  const createNewDiagram = () => {
    onClose?.()
    const target = element.type === 'softwareSystem' ? 'container' as const : 'component' as const
    useWorkspaceStore.setState({
      pendingZoomConfirm: { elementId: element.id, elementName: element.name, targetType: target },
    })
  }

  return (
    <div
      ref={popupRef}
      className="nodrag nowheel nopan"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        width: ZOOM_VIEWS_CARD_WIDTH,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--color-surface-1)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <div
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: `color-mix(in srgb, ${typeColor} 15%, transparent)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ZoomIn size={11} style={{ color: typeColor }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Level {level} &ndash; {label}
        </span>
      </div>

      {/* Child views list */}
      {childViews.length === 0 ? (
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 10px', lineHeight: 1.45 }}>
          No {viewType} diagrams for this object
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 8 }}>
          {childViews.map(v => (
            <button
              key={v.key}
              onClick={() => navigateToView(v.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', padding: '5px 8px', borderRadius: 6,
                fontSize: 11, fontWeight: 500,
                color: v.key === activeViewKey ? typeColor : 'var(--color-text-primary)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <ZoomIn size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
              {v.title ?? v.key}
            </button>
          ))}
        </div>
      )}

      {/* New diagram button */}
      <button
        onClick={createNewDiagram}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '6px 8px', borderRadius: 7,
          fontSize: 11, fontWeight: 600,
          color: 'var(--color-text-primary)',
          background: 'var(--color-surface-3)',
          border: 'none', cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface-3)' }}
      >
        <Plus size={12} />
        New diagram
      </button>
    </div>
  )
}
