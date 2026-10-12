import { render, screen, fireEvent } from '@testing-library/react'
import { useWorkspaceStore, getAllViews } from '@/store/workspace'
import { useSettingsStore } from '@/store/settings'
import type { Workspace } from '@/types/model'
import FloatingTopPill from './FloatingTopPill'

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ getNodes: () => [], setViewport: () => {} }),
}))

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: vi.fn(() => 'desktop'),
}))

import { useBreakpoint } from '@/hooks/useBreakpoint'

function setMobile(isMobile: boolean) {
  vi.mocked(useBreakpoint).mockReturnValue(isMobile ? 'mobile' : 'desktop')
}

function makeWs(): Workspace {
  return {
    name: 'Test workspace',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [
        { type: 'systemLandscape', key: 'overview', title: 'Overview', elements: [{ id: 'alice' }, { id: 'api' }], relationships: [] },
        { type: 'systemLandscape', key: 'second', title: 'Second Map', elements: [], relationships: [] },
      ],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setMobile(false)
  localStorage.clear()
  useWorkspaceStore.getState().closeWorkspace()
  useWorkspaceStore.setState({ readOnly: false })
  useSettingsStore.setState({ showUndoRedo: false })
})

describe('FloatingTopPill', () => {
  it('renders nothing without a workspace', () => {
    const { container } = render(<FloatingTopPill />)
    expect(container.firstChild).toBeNull()
  })

  describe('logo / home control', () => {
    it('closing the workspace via the logo works normally when not read-only', () => {
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      render(<FloatingTopPill />)
      fireEvent.click(screen.getByLabelText('Close workspace'))
      expect(useWorkspaceStore.getState().workspace).toBeNull()
    })

    it('renders the logo as non-interactive and keeps the workspace loaded when read-only', () => {
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      useWorkspaceStore.setState({ readOnly: true })
      render(<FloatingTopPill />)
      expect(screen.queryByLabelText('Close workspace')).toBeNull()
      expect(useWorkspaceStore.getState().workspace).not.toBeNull()
    })
  })

  describe('workspace-name switcher button', () => {
    it('opens the workspace switcher panel via the workspace-name button when not read-only', async () => {
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      render(<FloatingTopPill />)
      fireEvent.click(screen.getByText('Test workspace'))
      expect(await screen.findByText('Current workspace')).toBeTruthy()
    })

    it('renders the workspace name as non-interactive text and does not open the switcher when read-only', () => {
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      useWorkspaceStore.setState({ readOnly: true })
      render(<FloatingTopPill />)
      const name = screen.getByText('Test workspace')
      expect(name.closest('button')).toBeNull()
      fireEvent.click(name)
      expect(screen.queryByText('Current workspace')).toBeNull()
    })
  })

  describe('hamburger menu (mobile)', () => {
    beforeEach(() => setMobile(true))

    it('shows Workspaces…, AI assistant…, Export…, Command palette, and Undo/Redo when not read-only', () => {
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      useSettingsStore.setState({ showUndoRedo: true })
      render(<FloatingTopPill />)
      fireEvent.click(screen.getByLabelText('More actions'))
      expect(screen.getByText('Workspaces…')).toBeTruthy()
      expect(screen.getByText('AI assistant…')).toBeTruthy()
      expect(screen.getByText('Export…')).toBeTruthy()
      expect(screen.getByText('Command palette')).toBeTruthy()
      expect(screen.getByText('Undo')).toBeTruthy()
      expect(screen.getByText('Redo')).toBeTruthy()
    })

    it('hides Workspaces…, AI assistant…, Undo, and Redo but keeps Export… and Command palette when read-only', () => {
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      useSettingsStore.setState({ showUndoRedo: true })
      useWorkspaceStore.setState({ readOnly: true })
      render(<FloatingTopPill />)
      fireEvent.click(screen.getByLabelText('More actions'))
      expect(screen.queryByText('Workspaces…')).toBeNull()
      expect(screen.queryByText('AI assistant…')).toBeNull()
      expect(screen.queryByText('Undo')).toBeNull()
      expect(screen.queryByText('Redo')).toBeNull()
      expect(screen.getByText('Export…')).toBeTruthy()
      expect(screen.getByText('Command palette')).toBeTruthy()
    })
  })

  describe('view switcher integration', () => {
    it('still switches between existing views when read-only', () => {
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      useWorkspaceStore.setState({ readOnly: true })
      render(<FloatingTopPill />)
      fireEvent.click(screen.getByLabelText('Switch view'))
      fireEvent.click(screen.getByText('Second Map'))
      expect(useWorkspaceStore.getState().activeViewKey).toBe('second')
    })

    it('hides the create-new-view entry point when read-only', () => {
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      useWorkspaceStore.setState({ readOnly: true })
      render(<FloatingTopPill />)
      fireEvent.click(screen.getByLabelText('Switch view'))
      expect(screen.queryByText('New view')).toBeNull()
    })

    it('shows the create-new-view entry point when not read-only', () => {
      useWorkspaceStore.getState().loadWorkspace(makeWs())
      render(<FloatingTopPill />)
      fireEvent.click(screen.getByLabelText('Switch view'))
      expect(screen.getByText('New view')).toBeTruthy()
    })
  })

  it('exposes all views via getAllViews regardless of read-only (sanity check for the fixture)', () => {
    const ws = makeWs()
    useWorkspaceStore.getState().loadWorkspace(ws)
    expect(getAllViews(ws).map((v) => v.key)).toEqual(['overview', 'second'])
  })
})
