import { render, screen, fireEvent } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useSettingsStore, DOCUMENTS_SIDEBAR_DEFAULT_WIDTH } from '@/store/settings'
import type { Workspace } from '@/types/model'
import DocumentsSidebar from './DocumentsSidebar'

const CSS_VAR = '--docs-sidebar-w'

// jsdom has no pointer-capture implementation — stub it so the resize
// handle's setPointerCapture/hasPointerCapture/releasePointerCapture calls
// don't throw.
beforeAll(() => {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.hasPointerCapture = () => true
  Element.prototype.releasePointerCapture = () => {}
})

function setViewportWidth(width: number): () => void {
  const original = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  return () => Object.defineProperty(window, 'innerWidth', { value: original, configurable: true, writable: true })
}

// Two views (so a chip actually switches), one element with documents in both
// views, one element with documents in no view, and one relation with
// documents in only the first view — mirrors the plan's row-design mock.
function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [
        { id: 'cust', type: 'person', name: 'Customer', tags: [], properties: {} },
      ],
      softwareSystems: [
        {
          id: 'api', type: 'softwareSystem', name: 'API Application', tags: [], properties: {},
          documents: [{ path: 'docs/api.md', title: 'Service overview' }, { path: 'docs/adr.md', title: 'ADR: event sourcing' }],
          containers: [],
        },
        {
          id: 'orphan', type: 'softwareSystem', name: 'Aardvark', tags: [], properties: {},
          documents: [{ path: 'docs/orphan.md', title: 'Orphan doc' }],
          containers: [],
        },
      ],
      relationships: [
        {
          id: 'r1', sourceId: 'cust', destinationId: 'api', tags: [], properties: {},
          description: 'Visits bigbank.com', technology: 'HTTPS',
          documents: [{ path: 'docs/login.md', title: 'Login flow' }],
        },
      ],
      groups: [],
    },
    views: {
      systemLandscapeViews: [{
        type: 'systemLandscape', key: 'land', title: 'Landscape',
        elements: [{ id: 'cust' }, { id: 'api' }],
        relationships: [{ id: 'r1' }],
      }],
      systemContextViews: [{
        type: 'systemContext', key: 'ctx', title: 'Containers – Internet Banking', softwareSystemId: 'api',
        elements: [{ id: 'cust' }, { id: 'api' }],
        relationships: [],
      }],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  useWorkspaceStore.getState().setReadOnly(false)
  useWorkspaceStore.getState().closeWorkspace()
  useSettingsStore.setState({ documentsSidebarOpen: false, documentsSidebarWidth: DOCUMENTS_SIDEBAR_DEFAULT_WIDTH })
  document.documentElement.style.removeProperty(CSS_VAR)
})

afterEach(() => {
  document.documentElement.style.removeProperty(CSS_VAR)
})

describe('DocumentsSidebar', () => {
  it('renders nothing when no workspace is loaded', () => {
    useSettingsStore.setState({ documentsSidebarOpen: true })
    const { container } = render(<DocumentsSidebar />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing while the setting is closed', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    const { container } = render(<DocumentsSidebar />)
    expect(container.firstChild).toBeNull()
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('')
  })

  it('lists entries A–Z with document links opening in a new tab', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ documentsSidebarOpen: true })
    const { container } = render(<DocumentsSidebar />)

    // "Aardvark" < "API Application" < "Customer → API Application"
    const text = container.textContent ?? ''
    expect(text.indexOf('Aardvark')).toBeLessThan(text.indexOf('API Application'))
    expect(text.indexOf('API Application')).toBeLessThan(text.indexOf('Customer → API Application'))

    const link = screen.getByText('Service overview').closest('a')!
    expect(link.getAttribute('href')).toBe('/document-view?path=docs%2Fapi.md&title=Service+overview')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('"Not in any view" row has no chips', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ documentsSidebarOpen: true })
    render(<DocumentsSidebar />)

    expect(screen.getByText('Not in any view')).toBeTruthy()
  })

  it('a view chip switches the active view, selects the item and opens the inspector', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ documentsSidebarOpen: true })
    render(<DocumentsSidebar />)

    expect(useWorkspaceStore.getState().activeViewKey).toBe('land')
    fireEvent.click(screen.getByLabelText('Open API Application in Containers – Internet Banking'))

    const state = useWorkspaceStore.getState()
    expect(state.activeViewKey).toBe('ctx')
    expect(state.selectedElementIds).toEqual(['api'])
    expect(state.focusElementId).toBe('api')
  })

  it('a relation chip selects the relation', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ documentsSidebarOpen: true })
    render(<DocumentsSidebar />)

    fireEvent.click(screen.getByLabelText('Open Customer → API Application in Landscape'))

    const state = useWorkspaceStore.getState()
    expect(state.selectedRelationshipId).toBe('r1')
    expect(state.focusRelationshipId).toBe('r1')
  })

  it('shows the empty state when nothing has documents', () => {
    const ws = makeWs()
    ws.model.softwareSystems.forEach((s) => { delete s.documents })
    ws.model.relationships.forEach((r) => { delete r.documents })
    useWorkspaceStore.getState().loadWorkspace(ws)
    useSettingsStore.setState({ documentsSidebarOpen: true })
    render(<DocumentsSidebar />)

    expect(screen.getByText(/No document links yet/)).toBeTruthy()
  })

  it('close button flips the setting', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ documentsSidebarOpen: true })
    render(<DocumentsSidebar />)

    fireEvent.click(screen.getByLabelText('Close documents sidebar'))
    expect(useSettingsStore.getState().documentsSidebarOpen).toBe(false)
  })

  it('renders in read-only', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useWorkspaceStore.getState().setReadOnly(true)
    useSettingsStore.setState({ documentsSidebarOpen: true })
    render(<DocumentsSidebar />)

    expect(screen.getByLabelText('Documents')).toBeTruthy()
  })

  it('sets the CSS variable when open and clears it when closed', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ documentsSidebarOpen: true, documentsSidebarWidth: 400 })
    const { rerender } = render(<DocumentsSidebar />)

    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('400px')

    useSettingsStore.setState({ documentsSidebarOpen: false })
    rerender(<DocumentsSidebar />)
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('')
  })

  it('clears the CSS variable on unmount', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ documentsSidebarOpen: true })
    const { unmount } = render(<DocumentsSidebar />)
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).not.toBe('')

    unmount()
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('')
  })

  it('ArrowLeft/ArrowRight on the resize handle widen/narrow and persist the width', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ documentsSidebarOpen: true, documentsSidebarWidth: 340 })
    render(<DocumentsSidebar />)

    const handle = screen.getByLabelText('Resize documents sidebar')
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(useSettingsStore.getState().documentsSidebarWidth).toBe(356)

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(useSettingsStore.getState().documentsSidebarWidth).toBe(324)
  })

  it('a pointer drag resize persists a clamped width on pointerup', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ documentsSidebarOpen: true, documentsSidebarWidth: 340 })
    render(<DocumentsSidebar />)

    const handle = screen.getByLabelText('Resize documents sidebar')
    fireEvent.pointerDown(handle, { button: 0, clientX: 500 })
    // Dragging the left-edge handle far left would exceed the max width —
    // the persisted value must be clamped, not the raw drag delta.
    fireEvent.pointerMove(handle, { clientX: -500 })
    fireEvent.pointerUp(handle, { clientX: -500 })

    expect(useSettingsStore.getState().documentsSidebarWidth).toBe(640)
  })

  it('a pointercancel aborts the drag without persisting a width', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ documentsSidebarOpen: true, documentsSidebarWidth: 340 })
    render(<DocumentsSidebar />)

    const handle = screen.getByLabelText('Resize documents sidebar')
    fireEvent.pointerDown(handle, { button: 0, clientX: 500 })
    fireEvent.pointerMove(handle, { clientX: 400 })
    fireEvent.pointerCancel(handle, { clientX: 400 })

    expect(useSettingsStore.getState().documentsSidebarWidth).toBe(340)
  })

  it('does not set the CSS variable on mobile (full-width overlay)', () => {
    const restore = setViewportWidth(500)
    try {
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      useSettingsStore.setState({ documentsSidebarOpen: true })
      render(<DocumentsSidebar />)

      expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('')
    } finally {
      restore()
    }
  })

  it('a chip click on mobile also closes the sidebar', () => {
    const restore = setViewportWidth(500)
    try {
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      useSettingsStore.setState({ documentsSidebarOpen: true })
      render(<DocumentsSidebar />)

      fireEvent.click(screen.getByLabelText('Open API Application in Containers – Internet Banking'))

      expect(useWorkspaceStore.getState().activeViewKey).toBe('ctx')
      expect(useSettingsStore.getState().documentsSidebarOpen).toBe(false)
    } finally {
      restore()
    }
  })

  it('marks the current view\'s chip with aria-current', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    useSettingsStore.setState({ documentsSidebarOpen: true })
    render(<DocumentsSidebar />)

    expect(useWorkspaceStore.getState().activeViewKey).toBe('land')
    const activeChip = screen.getByLabelText('Open API Application in Landscape')
    const otherChip = screen.getByLabelText('Open API Application in Containers – Internet Banking')
    expect(activeChip.getAttribute('aria-current')).toBe('true')
    expect(otherChip.getAttribute('aria-current')).toBeNull()
  })
})
