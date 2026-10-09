import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
      relationships: [{
        id: 'rel1',
        sourceId: 'alice',
        destinationId: 'api',
        description: 'calls',
        tags: ['Relationship'],
        properties: {},
      }],
      groups: [],
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

describe('relationship-slice readOnly guard', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().setReadOnly(true)
  })

  it('addRelationship is a no-op and returns empty string', () => {
    const before = useWorkspaceStore.getState().workspace!
    const relCountBefore = before.model.relationships.length
    const undoStackBefore = useWorkspaceStore.getState().undoStack.length

    const id = useWorkspaceStore.getState().addRelationship('alice', 'api', 'reads')

    expect(id).toBe('')
    const after = useWorkspaceStore.getState().workspace!
    expect(after.model.relationships).toHaveLength(relCountBefore)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(undoStackBefore)
  })

  it('updateRelationship is a no-op', () => {
    const undoStackBefore = useWorkspaceStore.getState().undoStack.length

    useWorkspaceStore.getState().updateRelationship('rel1', { description: 'changed', technology: 'gRPC' })

    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === 'rel1')!
    expect(rel.description).toBe('calls')
    expect(rel.technology).toBeUndefined()
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(undoStackBefore)
  })

  it('reconnectRelationship is a no-op', () => {
    const undoStackBefore = useWorkspaceStore.getState().undoStack.length

    useWorkspaceStore.getState().reconnectRelationship('rel1', 'api', 'alice')

    const rel = useWorkspaceStore.getState().workspace!.model.relationships.find(r => r.id === 'rel1')!
    expect(rel.sourceId).toBe('alice')
    expect(rel.destinationId).toBe('api')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(undoStackBefore)
  })

  it('deleteRelationship is a no-op', () => {
    const undoStackBefore = useWorkspaceStore.getState().undoStack.length

    useWorkspaceStore.getState().deleteRelationship('rel1')

    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.relationships).toHaveLength(1)
    expect(ws.model.relationships[0].id).toBe('rel1')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(undoStackBefore)
  })
})
