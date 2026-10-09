import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import type { Workspace } from '@/types/model'

function makeWorkspaceWithTag(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person', 'VIP'], properties: {} }],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
      relationships: [{ id: 'r1', sourceId: 'alice', destinationId: 'api', tags: ['Relationship', 'VIP'], properties: {} }],
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
      configuration: {
        styles: {
          elements: [{ tag: 'VIP', background: '#ff0000' }],
          relationships: [{ tag: 'VIP', color: '#ff0000' }],
        },
      },
    },
  }
}

describe('tag-style-slice readOnly guard', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspaceWithTag())
    useWorkspaceStore.getState().setReadOnly(true)
  })

  it('updateElementStyle is a no-op when readOnly', () => {
    const before = useWorkspaceStore.getState().workspace!
    useWorkspaceStore.getState().updateElementStyle({ tag: 'New', background: '#00ff00' })
    const after = useWorkspaceStore.getState().workspace!
    expect(after).toBe(before)
    expect(after.views.configuration.styles.elements).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('removeElementStyle is a no-op when readOnly', () => {
    const before = useWorkspaceStore.getState().workspace!
    useWorkspaceStore.getState().removeElementStyle('VIP')
    const after = useWorkspaceStore.getState().workspace!
    expect(after).toBe(before)
    expect(after.views.configuration.styles.elements).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('renameTag is a no-op when readOnly', () => {
    const before = useWorkspaceStore.getState().workspace!
    useWorkspaceStore.getState().renameTag('VIP', 'Premium')
    const after = useWorkspaceStore.getState().workspace!
    expect(after).toBe(before)
    expect(after.model.people[0].tags).toContain('VIP')
    expect(after.model.people[0].tags).not.toContain('Premium')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('removeTagGlobal is a no-op when readOnly', () => {
    const before = useWorkspaceStore.getState().workspace!
    useWorkspaceStore.getState().removeTagGlobal('VIP')
    const after = useWorkspaceStore.getState().workspace!
    expect(after).toBe(before)
    expect(after.model.people[0].tags).toContain('VIP')
    expect(after.views.configuration.styles.elements).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })
})
