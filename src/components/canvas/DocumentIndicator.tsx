import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { FileText } from 'lucide-react'
import type { DocLink } from '@/types/model'
import { useAnchoredPopover } from '@/hooks/useAnchoredPopover'
import { useArrowNav } from '@/hooks/useArrowNav'
import { documentViewUrl, openDocument } from '@/lib/documentLinks'

const MENU_WIDTH = 240

/** Always-visible canvas hint that an element/relationship has linked
 *  documents. One document opens directly in a new tab; several open a small
 *  anchored menu. Navigation only, so it stays active in the read-only viewer. */
export default function DocumentIndicator({ documents, subject, color, size = 11, className }: {
  documents: DocLink[]
  /** Name used in the accessible label, e.g. the element name. */
  subject: string
  color?: string
  /** Icon size in px — edge labels use the compact default, node footers a larger one. */
  size?: number
  className?: string
}) {
  const { open, setOpen, toggle, triggerRef, popupRef, coords } = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>({
    width: MENU_WIDTH,
    side: 'auto',
    height: 40 * Math.min(documents.length, 8) + 8,
  })
  const wasOpen = useRef(false)

  // Focus the first item on open; hand focus back to the trigger on close.
  useEffect(() => {
    if (open && coords) popupRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    if (!open && wasOpen.current) triggerRef.current?.focus()
    wasOpen.current = open
  }, [open, coords, popupRef, triggerRef])

  // The canvas pane can swallow bubbling mousedown, so also dismiss on a
  // capture-phase pointerdown outside the menu/trigger.
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

  // React Flow's node wrapper turns Enter/Space/Escape keydowns (which bubble
  // through the menu portal too) into select/unselect; keep them to ourselves.
  // Escape closes the menu explicitly because stopping propagation also hides
  // it from the document-level listener.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && open) { setOpen(false); e.stopPropagation() }
    else if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
  }

  if (documents.length === 0) return null
  const count = documents.length
  const single = count === 1
  const label = `${count} ${single ? 'document' : 'documents'} for ${subject}`
  const tooltip = documents.map((d) => d.title).join('\n')

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`c4-doc-indicator nodrag nopan${className ? ` ${className}` : ''}`}
        style={color ? { color } : undefined}
        title={tooltip}
        aria-label={label}
        aria-haspopup={single ? undefined : 'menu'}
        aria-expanded={single ? undefined : open}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        onClick={(e) => {
          e.stopPropagation()
          if (single) openDocument(documents[0])
          else toggle()
        }}
      >
        <FileText size={size} aria-hidden="true" />
        {!single && <span className="c4-doc-indicator-count">{count}</span>}
      </button>
      {!single && open && coords && createPortal(
        <DocMenu
          popupRef={popupRef}
          role="menu"
          aria-label={label}
          className="c4-doc-menu"
          style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={onKeyDown}
        >
          {documents.map((doc, i) => (
            <a
              key={`${doc.path}-${i}`}
              role="menuitem"
              className="c4-doc-menu-item"
              href={documentViewUrl(doc)}
              target="_blank"
              rel="noopener noreferrer"
              title={doc.path}
              onClick={() => setOpen(false)}
            >
              <span className="c4-doc-menu-title">{doc.title}</span>
              <span className="c4-doc-menu-path">{doc.path}</span>
            </a>
          ))}
        </DocMenu>,
        document.body,
      )}
    </>
  )
}

/** Menu container; owns arrow-key navigation, which needs the element mounted. */
function DocMenu({ popupRef, children, ...rest }: {
  popupRef: RefObject<HTMLDivElement | null>
  children: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>) {
  useArrowNav(popupRef, '[role="menuitem"]')
  return <div ref={popupRef} {...rest}>{children}</div>
}
