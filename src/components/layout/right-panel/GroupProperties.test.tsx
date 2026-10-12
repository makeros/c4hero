import { render, screen } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import GroupProperties from './GroupProperties'

vi.mock('lucide-react', () => ({
  X: () => null,
  Plus: () => null,
  Layers: () => null,
  Trash2: () => null,
  // icon registry icons (elementMeta -> @/lib/icons/registry)
  UserRound: () => null,
  Globe: () => null,
  Box: () => null,
  Puzzle: () => null,
  Database: () => null,
  Monitor: () => null,
  Zap: () => null,
  GitMerge: () => null,
  Smartphone: () => null,
  HardDrive: () => null,
  Circle: () => null,
  Hexagon: () => null,
  Diamond: () => null,
  Bot: () => null,
  Folder: () => null,
  FolderOpen: () => null,
  Server: () => null,
  Boxes: () => null,
}))

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: [], properties: {} }],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: [], properties: {}, containers: [] }],
      relationships: [],
      groups: [{ id: 'g1', name: 'My Team', elementIds: ['alice'] }],
      deploymentEnvironments: [],
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

describe('GroupProperties', () => {
  it('shows delete group and member management controls when not readOnly', () => {
    const group = useWorkspaceStore.getState().workspace!.model.groups[0]
    render(<GroupProperties group={group} onClose={() => {}} />)

    expect(screen.getByDisplayValue('My Team')).toBeTruthy()
    expect(screen.getByLabelText('Delete group')).toBeTruthy()
    expect(screen.getByLabelText(/remove alice from group/i)).toBeTruthy()
    expect(screen.getByPlaceholderText('Search elements...')).toBeTruthy()
  })

  it('hides delete group, remove-member, and add-member controls when readOnly, keeping details visible', () => {
    useWorkspaceStore.setState({ readOnly: true })
    const group = useWorkspaceStore.getState().workspace!.model.groups[0]
    render(<GroupProperties group={group} onClose={() => {}} />)

    expect(screen.getByDisplayValue('My Team')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByLabelText('Delete group')).toBeNull()
    expect(screen.queryByLabelText(/remove alice from group/i)).toBeNull()
    expect(screen.queryByPlaceholderText('Search elements...')).toBeNull()
    // Close button (non-mutating) stays
    expect(screen.getByLabelText('Close panel')).toBeTruthy()
  })
})
