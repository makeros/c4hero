import { render, screen } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import MultiSelectBar from './MultiSelectBar'

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    getNodes: () => [
      { id: 'alice', position: { x: 0, y: 0 }, measured: { width: 200, height: 100 } },
      { id: 'bob', position: { x: 300, y: 0 }, measured: { width: 200, height: 100 } },
    ],
    getZoom: () => 1,
    setNodes: () => {},
    flowToScreenPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
  }),
}))

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [
        { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
        { id: 'bob', type: 'person', name: 'Bob', tags: ['Element', 'Person'], properties: {} },
      ],
      softwareSystems: [],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [{
        type: 'systemLandscape',
        key: 'land',
        elements: [{ id: 'alice' }, { id: 'bob' }],
        relationships: [],
      }],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

beforeEach(() => {
  useWorkspaceStore.getState().closeWorkspace()
  useWorkspaceStore.setState({ readOnly: false })
  useWorkspaceStore.getState().loadWorkspace(makeWs())
  useWorkspaceStore.setState({ activeViewKey: 'land' })
  useWorkspaceStore.getState().selectElements(['alice', 'bob'])
})

describe('MultiSelectBar', () => {
  it('shows bulk mutation actions when not read-only', () => {
    render(<MultiSelectBar />)

    expect(screen.getByText('2 selected')).toBeTruthy()
    expect(screen.getByTitle('Align elements')).toBeTruthy()
    expect(screen.getByTitle(/Lock 2 elements/)).toBeTruthy()
    expect(screen.getByTitle('Group 2 elements')).toBeTruthy()
    expect(screen.getByTitle('Delete 2 elements from the model')).toBeTruthy()
  })

  it('hides all bulk mutation actions when read-only, but keeps the selection indicator', () => {
    useWorkspaceStore.getState().setReadOnly(true)
    render(<MultiSelectBar />)

    expect(screen.getByText('2 selected')).toBeTruthy()
    expect(screen.queryByTitle('Align elements')).toBeNull()
    expect(screen.queryByTitle(/Lock 2 elements/)).toBeNull()
    expect(screen.queryByTitle('Group 2 elements')).toBeNull()
    expect(screen.queryByTitle('Delete 2 elements from the model')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
