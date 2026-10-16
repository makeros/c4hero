import { act } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useWorkspaceStore } from '@/store/workspace'
import { getLockedWorkspace } from '@/lib/lockedWorkspace'
import { loadFromLocalStorage } from '@/lib/fileIO'
import type { Workspace } from '@/types/model'
import App from './App'

// ─── Mutable location stub ──────────────────────────────────────────────
// Overrides the global react-router-dom mock from src/test-setup.ts (which
// pins useLocation to pathname '/') so individual tests can put App on a
// canvas route without needing MemoryRouter's own location to drive it —
// App.tsx reads location via the `useLocation` hook directly.
const routerState = vi.hoisted(() => ({ pathname: '/' }))
const navigateSpy = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigateSpy,
    useLocation: () => ({ pathname: routerState.pathname, search: '', hash: '', state: null, key: 'test' }),
    useParams: () => ({}),
  }
})

vi.mock('@/lib/lockedWorkspace', () => ({
  getLockedWorkspace: vi.fn(),
}))

// Stub out async folder/file-handle I/O so the pre-existing restore-dir-handle
// and refresh-redirect effects resolve synchronously instead of leaving
// pending promises that settle after the test's act() scope — unrelated to
// the locked-workspace bootstrap under test here.
vi.mock('@/lib/folderIO', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/folderIO')>()),
  restoreDirHandle: vi.fn().mockResolvedValue(null),
  getCurrentDirHandle: vi.fn().mockReturnValue(null),
  restoreDirHandleByName: vi.fn().mockResolvedValue(null),
  readDSLFile: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/fileIO', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fileIO')>()),
  loadFromLocalStorage: vi.fn().mockReturnValue(null),
}))

// Heavy canvas-chrome children — irrelevant to startup-bootstrap/AI-panel-gate
// behavior under test here and each has (or will have) its own colocated test.
vi.mock('@/components/layout/FloatingTopPill', () => ({ default: () => null }))
vi.mock('@/components/whatsnew/WhatsNewPill', () => ({ default: () => null }))
vi.mock('@/components/layout/FloatingToolRail', () => ({ default: () => null }))
vi.mock('@/components/layout/FloatingViewsPanel', () => ({ default: () => null }))
vi.mock('@/components/layout/FloatingInspector', () => ({ default: () => null }))
vi.mock('@/components/layout/FloatingBottomStrip', () => ({ default: () => null }))
vi.mock('@/components/layout/highlighter/BottomHighlighterBar', () => ({ default: () => null }))
vi.mock('@/components/layout/FloatingZoomHud', () => ({ default: () => null }))
vi.mock('@/components/layout/MultiSelectBar', () => ({ default: () => null }))
vi.mock('@/components/shared/ConfirmDeleteDialog', () => ({ default: () => null }))
vi.mock('@/components/shared/ZoomConfirmDialog', () => ({ default: () => null }))
vi.mock('@/components/canvas/Canvas', () => ({ default: () => null }))
vi.mock('@/components/canvas/CanvasHints', () => ({ default: () => null }))
vi.mock('@/components/search/SearchDialog', () => ({ default: () => null }))
vi.mock('@/components/welcome/WelcomeScreen', () => ({
  default: () => <div data-testid="welcome-screen" />,
}))
vi.mock('@/components/ai/AiPanel', () => ({
  default: () => <div data-testid="ai-panel" />,
}))
vi.mock('@/components/views/DocumentView', () => ({
  default: () => <div data-testid="document-view" />,
}))

function makeWs(name = 'Locked WS'): Workspace {
  return {
    name,
    model: {
      people: [],
      softwareSystems: [
        { id: 'sys', type: 'softwareSystem', name: 'S', tags: [], properties: {}, containers: [] },
      ],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [{
        type: 'systemLandscape', key: 'land', elements: [{ id: 'sys' }], relationships: [],
      }],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  routerState.pathname = '/'
  useWorkspaceStore.getState().setReadOnly(false)
  useWorkspaceStore.getState().closeWorkspace()
  vi.mocked(getLockedWorkspace).mockReset().mockReturnValue(null)
  vi.mocked(loadFromLocalStorage).mockReset().mockReturnValue(null)
  navigateSpy.mockClear()
})

afterEach(() => {
  useWorkspaceStore.getState().setReadOnly(false)
  useWorkspaceStore.getState().closeWorkspace()
})

describe('App — locked-workspace startup bootstrap', () => {
  it('loads the locked workspace and marks the store read-only when getLockedWorkspace() returns one', async () => {
    const ws = makeWs()
    vi.mocked(getLockedWorkspace).mockReturnValue(ws)
    routerState.pathname = '/collection/demo/locked-ws'

    render(
      <MemoryRouter initialEntries={['/collection/demo/locked-ws']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(useWorkspaceStore.getState().workspace?.name).toBe('Locked WS')
      expect(useWorkspaceStore.getState().readOnly).toBe(true)
    })
  })

  it('leaves startup behavior unchanged when getLockedWorkspace() returns null', async () => {
    vi.mocked(getLockedWorkspace).mockReturnValue(null)
    routerState.pathname = '/'

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    // Unlocked startup renders the welcome screen, with no workspace loaded
    // and readOnly left at its default.
    await screen.findByTestId('welcome-screen')
    expect(useWorkspaceStore.getState().workspace).toBeNull()
    expect(useWorkspaceStore.getState().readOnly).toBe(false)
  })

  it('never renders the AI panel when readOnly is true, even with aiPanelOpen forced true', async () => {
    const ws = makeWs()
    vi.mocked(getLockedWorkspace).mockReturnValue(ws)
    routerState.pathname = '/collection/demo/locked-ws'

    render(
      <MemoryRouter initialEntries={['/collection/demo/locked-ws']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(useWorkspaceStore.getState().readOnly).toBe(true)
    })

    act(() => {
      useWorkspaceStore.getState().setAiPanelOpen(true)
    })

    expect(screen.queryByTestId('ai-panel')).toBeNull()
  })

  it('does not run crash-recovery from localStorage on a /workspace route when a locked workspace is active', async () => {
    const locked = makeWs('Locked WS')
    vi.mocked(getLockedWorkspace).mockReturnValue(locked)
    const recovered = makeWs('Recovered WS')
    vi.mocked(loadFromLocalStorage).mockReturnValue(recovered)
    routerState.pathname = '/workspace/foo'

    render(
      <MemoryRouter initialEntries={['/workspace/foo']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(useWorkspaceStore.getState().readOnly).toBe(true)
    })
    expect(useWorkspaceStore.getState().workspace?.name).toBe('Locked WS')
    expect(loadFromLocalStorage).not.toHaveBeenCalled()
  })

  it('does not redirect away from /document-view when the locked workspace auto-loads', async () => {
    const ws = makeWs()
    vi.mocked(getLockedWorkspace).mockReturnValue(ws)
    routerState.pathname = '/document-view'

    render(
      <MemoryRouter initialEntries={['/document-view?path=docs/readme.md']}>
        <App />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(useWorkspaceStore.getState().workspace?.name).toBe('Locked WS')
    })
    await screen.findByTestId('document-view')
    expect(navigateSpy).not.toHaveBeenCalled()
  })
})
