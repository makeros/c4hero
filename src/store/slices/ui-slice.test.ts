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

describe('ui-slice setBatchApplying readOnly guard', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().setReadOnly(false)
    useWorkspaceStore.getState().setBatchApplying(false)
  })

  it('does not push an undo snapshot when turning on while readOnly', () => {
    useWorkspaceStore.getState().setReadOnly(true)
    const undoLenBefore = useWorkspaceStore.getState().undoStack.length

    useWorkspaceStore.getState().setBatchApplying(true)

    expect(useWorkspaceStore.getState().batchApplying).toBe(false)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoLenBefore)
  })

  it('pushes an undo snapshot and sets batchApplying when readOnly is false', () => {
    const undoLenBefore = useWorkspaceStore.getState().undoStack.length

    useWorkspaceStore.getState().setBatchApplying(true)

    expect(useWorkspaceStore.getState().batchApplying).toBe(true)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoLenBefore + 1)
  })

  it('turning batchApplying off remains unaffected by readOnly', () => {
    useWorkspaceStore.getState().setBatchApplying(true)
    expect(useWorkspaceStore.getState().batchApplying).toBe(true)

    useWorkspaceStore.getState().setReadOnly(true)
    useWorkspaceStore.getState().setBatchApplying(false)

    expect(useWorkspaceStore.getState().batchApplying).toBe(false)
  })
})
