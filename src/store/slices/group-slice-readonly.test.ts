import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
      relationships: [],
      groups: [{ id: 'g1', name: 'Existing', elementIds: ['alice'] }],
      deploymentEnvironments: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      dynamicViews: [],
      deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('group-slice readOnly guard', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().setReadOnly(true)
  })

  it('addGroup is a no-op and returns \'\' when readOnly', () => {
    const before = useWorkspaceStore.getState().workspace!
    const id = useWorkspaceStore.getState().addGroup('New Group', ['alice'])
    const after = useWorkspaceStore.getState().workspace!
    expect(id).toBe('')
    expect(after.model.groups).toEqual(before.model.groups)
    expect(after.model.groups).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('updateGroup is a no-op when readOnly', () => {
    useWorkspaceStore.getState().updateGroup('g1', { name: 'Renamed' })
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups[0].name).toBe('Existing')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('deleteGroup is a no-op when readOnly', () => {
    useWorkspaceStore.getState().deleteGroup('g1')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.groups).toHaveLength(1)
    expect(ws.model.groups[0].id).toBe('g1')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('addGroup, updateGroup, deleteGroup all mutate when readOnly is false', () => {
    useWorkspaceStore.getState().setReadOnly(false)

    const id = useWorkspaceStore.getState().addGroup('New Group', ['alice'])
    expect(id).not.toBe('')
    expect(useWorkspaceStore.getState().workspace!.model.groups).toHaveLength(2)

    useWorkspaceStore.getState().updateGroup('g1', { name: 'Renamed' })
    expect(useWorkspaceStore.getState().workspace!.model.groups.find(g => g.id === 'g1')!.name).toBe('Renamed')

    useWorkspaceStore.getState().deleteGroup('g1')
    expect(useWorkspaceStore.getState().workspace!.model.groups.find(g => g.id === 'g1')).toBeUndefined()
  })
})
