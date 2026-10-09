import { render, screen } from '@testing-library/react'
import { useWorkspaceStore, getSelectedDeploymentElement } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import DeploymentElementProperties from './DeploymentElementProperties'

vi.mock('lucide-react', () => ({
  X: () => null,
  Trash2: () => null,
  ArrowRight: () => null,
}))

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [],
      softwareSystems: [{ id: 'web', type: 'softwareSystem', name: 'Web', tags: [], properties: {}, containers: [] }],
      relationships: [],
      groups: [],
      deploymentEnvironments: [{
        id: 'env1',
        name: 'Live',
        deploymentNodes: [{
          id: 'node1',
          type: 'deploymentNode',
          name: 'Server',
          tags: [],
          properties: {},
          children: [],
          infrastructureNodes: [],
          containerInstances: [],
          softwareSystemInstances: [{ id: 'inst1', type: 'softwareSystemInstance', softwareSystemId: 'web', tags: [], properties: {} }],
        }],
      }],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  useWorkspaceStore.setState({ readOnly: false })
  useWorkspaceStore.getState().closeWorkspace()
  useWorkspaceStore.getState().loadWorkspace(makeWs())
})

describe('DeploymentElementProperties', () => {
  it('shows the delete button for a deployment node when not readOnly', () => {
    const ws = useWorkspaceStore.getState().workspace!
    const sel = getSelectedDeploymentElement(ws, ['node1'])!
    render(<DeploymentElementProperties sel={sel} onClose={() => {}} />)

    expect(screen.getByText('Server')).toBeTruthy()
    expect(screen.getByLabelText(/delete deployment node/i)).toBeTruthy()
  })

  it('hides the delete button for a deployment node when readOnly, keeping details visible', () => {
    useWorkspaceStore.setState({ readOnly: true })
    const ws = useWorkspaceStore.getState().workspace!
    const sel = getSelectedDeploymentElement(ws, ['node1'])!
    render(<DeploymentElementProperties sel={sel} onClose={() => {}} />)

    expect(screen.getByText('Server')).toBeTruthy()
    expect(screen.queryByLabelText(/delete/i)).toBeNull()
    // Close button (non-mutating) stays
    expect(screen.getByLabelText('Close panel')).toBeTruthy()
  })

  it('hides the delete button for an instance when readOnly, keeping the edit-referenced link', () => {
    useWorkspaceStore.setState({ readOnly: true })
    const ws = useWorkspaceStore.getState().workspace!
    const sel = getSelectedDeploymentElement(ws, ['inst1'])!
    render(<DeploymentElementProperties sel={sel} onClose={() => {}} />)

    expect(screen.queryByLabelText(/delete/i)).toBeNull()
    expect(screen.getByText(/Edit Web/)).toBeTruthy()
  })
})
