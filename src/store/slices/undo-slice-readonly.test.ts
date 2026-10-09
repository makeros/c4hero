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

describe('undo-slice readOnly guard', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().setReadOnly(false)
  })

  it('undo no-ops when readOnly is true', () => {
    // Build an undo entry while writable.
    useWorkspaceStore.getState().addSoftwareSystem('Extra')
    const workspaceBefore = useWorkspaceStore.getState().workspace
    const undoLenBefore = useWorkspaceStore.getState().undoStack.length
    const redoLenBefore = useWorkspaceStore.getState().redoStack.length
    expect(undoLenBefore).toBeGreaterThan(0)

    useWorkspaceStore.getState().setReadOnly(true)
    useWorkspaceStore.getState().undo()

    expect(useWorkspaceStore.getState().workspace).toBe(workspaceBefore)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoLenBefore)
    expect(useWorkspaceStore.getState().redoStack.length).toBe(redoLenBefore)
  })

  it('redo no-ops when readOnly is true', () => {
    // Build a redo entry while writable: mutate then undo.
    useWorkspaceStore.getState().addSoftwareSystem('Extra')
    useWorkspaceStore.getState().undo()
    const workspaceBefore = useWorkspaceStore.getState().workspace
    const undoLenBefore = useWorkspaceStore.getState().undoStack.length
    const redoLenBefore = useWorkspaceStore.getState().redoStack.length
    expect(redoLenBefore).toBeGreaterThan(0)

    useWorkspaceStore.getState().setReadOnly(true)
    useWorkspaceStore.getState().redo()

    expect(useWorkspaceStore.getState().workspace).toBe(workspaceBefore)
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoLenBefore)
    expect(useWorkspaceStore.getState().redoStack.length).toBe(redoLenBefore)
  })

  it('resetWorkspaceTo no-ops when readOnly is true', () => {
    const workspaceBefore = useWorkspaceStore.getState().workspace
    const undoLenBefore = useWorkspaceStore.getState().undoStack.length
    const target: Workspace = { ...makeWorkspace(), name: 'Replaced' }

    useWorkspaceStore.getState().setReadOnly(true)
    useWorkspaceStore.getState().resetWorkspaceTo(target)

    expect(useWorkspaceStore.getState().workspace).toBe(workspaceBefore)
    expect(useWorkspaceStore.getState().workspace?.name).not.toBe('Replaced')
    expect(useWorkspaceStore.getState().undoStack.length).toBe(undoLenBefore)
  })

  it('canUndo/canRedo still reflect the frozen undo stack correctly when readOnly', () => {
    useWorkspaceStore.getState().addSoftwareSystem('Extra')
    useWorkspaceStore.getState().undo()
    // At this point there's one redo entry and zero undo entries (single mutation, undone once).
    const undoLen = useWorkspaceStore.getState().undoStack.length
    const redoLen = useWorkspaceStore.getState().redoStack.length

    useWorkspaceStore.getState().setReadOnly(true)

    expect(useWorkspaceStore.getState().canUndo()).toBe(undoLen > 0)
    expect(useWorkspaceStore.getState().canRedo()).toBe(redoLen > 0)

    // Since undo()/redo() are no-ops now, the stacks (and thus these reads) stay frozen.
    useWorkspaceStore.getState().undo()
    useWorkspaceStore.getState().redo()
    expect(useWorkspaceStore.getState().canUndo()).toBe(undoLen > 0)
    expect(useWorkspaceStore.getState().canRedo()).toBe(redoLen > 0)
  })

  it('undo and redo still work normally when readOnly is false', () => {
    useWorkspaceStore.getState().addSoftwareSystem('Extra')
    expect(useWorkspaceStore.getState().workspace?.model.softwareSystems.some(s => s.name === 'Extra')).toBe(true)

    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace?.model.softwareSystems.some(s => s.name === 'Extra')).toBe(false)

    useWorkspaceStore.getState().redo()
    expect(useWorkspaceStore.getState().workspace?.model.softwareSystems.some(s => s.name === 'Extra')).toBe(true)
  })
})
