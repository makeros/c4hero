import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [
        { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
        { id: 'bob', type: 'person', name: 'Bob', tags: ['Element', 'Person'], properties: {} },
      ],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
      relationships: [],
      groups: [],
      deploymentEnvironments: [],
    },
    views: {
      systemLandscapeViews: [
        {
          type: 'systemLandscape',
          key: 'v1',
          title: 'Landscape',
          elements: [{ id: 'alice' }, { id: 'api' }],
          relationships: [],
        },
      ],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      dynamicViews: [],
      deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('view-slice readOnly guard', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().setReadOnly(true)
  })

  it('addView is a no-op and returns \'\' when readOnly', () => {
    const activeBefore = useWorkspaceStore.getState().activeViewKey
    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'New View')
    const ws = useWorkspaceStore.getState().workspace!
    expect(key).toBe('')
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
    expect(useWorkspaceStore.getState().activeViewKey).toBe(activeBefore)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('deleteView is a no-op when readOnly', () => {
    useWorkspaceStore.getState().deleteView('v1')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
    expect(ws.views.systemLandscapeViews[0].key).toBe('v1')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('renameView is a no-op when readOnly', () => {
    useWorkspaceStore.getState().renameView('v1', 'Renamed')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.views.systemLandscapeViews[0].title).toBe('Landscape')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('duplicateView is a no-op and returns \'\' when readOnly', () => {
    const newKey = useWorkspaceStore.getState().duplicateView('v1')
    const ws = useWorkspaceStore.getState().workspace!
    expect(newKey).toBe('')
    expect(ws.views.systemLandscapeViews).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('updateNodePosition is a no-op when readOnly', () => {
    useWorkspaceStore.getState().updateNodePosition('alice', 100, 200)
    const el = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0].elements.find(e => e.id === 'alice')!
    expect(el.x).toBeUndefined()
    expect(el.y).toBeUndefined()
    expect(el.pinned).toBeUndefined()
  })

  it('updateNodePositions is a no-op when readOnly', () => {
    useWorkspaceStore.getState().updateNodePositions([{ id: 'alice', x: 10, y: 20 }, { id: 'api', x: 30, y: 40 }])
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.elements.find(e => e.id === 'alice')!.x).toBeUndefined()
    expect(view.elements.find(e => e.id === 'api')!.x).toBeUndefined()
  })

  it('toggleElementInView is a no-op when readOnly', () => {
    useWorkspaceStore.getState().toggleElementInView('v1', 'bob')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.elements).toHaveLength(2)
    expect(view.elements.some(e => e.id === 'bob')).toBe(false)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('removeElementsFromView is a no-op when readOnly', () => {
    useWorkspaceStore.getState().removeElementsFromView('v1', ['alice'])
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.elements).toHaveLength(2)
    expect(view.elements.some(e => e.id === 'alice')).toBe(true)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('setLayoutDirection is a no-op when readOnly', () => {
    const versionBefore = useWorkspaceStore.getState().layoutVersion
    useWorkspaceStore.getState().setLayoutDirection('v1', 'LR')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.autoLayout).toBeUndefined()
    expect(useWorkspaceStore.getState().layoutVersion).toBe(versionBefore)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('resetAndRelayout is a no-op when readOnly', () => {
    const versionBefore = useWorkspaceStore.getState().layoutVersion
    useWorkspaceStore.getState().resetAndRelayout('v1', 'TB')
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.autoLayout).toBeUndefined()
    expect(useWorkspaceStore.getState().layoutVersion).toBe(versionBefore)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('setElementsLocked is a no-op when readOnly', () => {
    useWorkspaceStore.getState().setElementsLocked('v1', ['alice'], true)
    const el = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0].elements.find(e => e.id === 'alice')!
    expect(el.locked).toBeFalsy()
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('unlockAllInView is a no-op when readOnly', () => {
    // Lock an element directly (bypassing the guarded action) to set up state.
    const ws = useWorkspaceStore.getState().workspace!
    ws.views.systemLandscapeViews[0].elements.find(e => e.id === 'api')!.locked = true

    useWorkspaceStore.getState().unlockAllInView('v1')
    const el = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0].elements.find(e => e.id === 'api')!
    expect(el.locked).toBe(true)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('setViewLocked is a no-op when readOnly', () => {
    useWorkspaceStore.getState().setViewLocked('v1', true)
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.locked).toBeFalsy()
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('syncAutoLayoutPositions still functions identically regardless of readOnly', () => {
    // Unguarded on purpose: it's an internal derivation Canvas relies on to
    // canonicalize the initial dagre layout, independent of readOnly.
    useWorkspaceStore.getState().syncAutoLayoutPositions('v1', new Map([
      ['alice', { x: 5, y: 6 }],
      ['api', { x: 7, y: 8 }],
    ]))
    const view = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view.elements.find(e => e.id === 'alice')).toMatchObject({ x: 5, y: 6 })
    expect(view.elements.find(e => e.id === 'api')).toMatchObject({ x: 7, y: 8 })

    // Confirm it behaves the same with readOnly false too.
    useWorkspaceStore.getState().setReadOnly(false)
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().syncAutoLayoutPositions('v1', new Map([
      ['alice', { x: 50, y: 60 }],
    ]))
    const view2 = useWorkspaceStore.getState().workspace!.views.systemLandscapeViews[0]
    expect(view2.elements.find(e => e.id === 'alice')).toMatchObject({ x: 50, y: 60 })
  })

  it('all thirteen guarded actions mutate normally when readOnly is false', () => {
    useWorkspaceStore.getState().setReadOnly(false)

    const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'New View')
    expect(key).not.toBe('')
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews).toHaveLength(2)

    useWorkspaceStore.getState().renameView('v1', 'Renamed')
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === 'v1')!.title).toBe('Renamed')

    const dupKey = useWorkspaceStore.getState().duplicateView('v1')
    expect(dupKey).not.toBe('')
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews).toHaveLength(3)

    useWorkspaceStore.getState().setActiveView('v1')
    useWorkspaceStore.getState().updateNodePosition('alice', 11, 22)
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === 'v1')!.elements.find(e => e.id === 'alice')!.x).toBe(11)

    useWorkspaceStore.getState().updateNodePositions([{ id: 'api', x: 33, y: 44 }])
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === 'v1')!.elements.find(e => e.id === 'api')!.x).toBe(33)

    useWorkspaceStore.getState().toggleElementInView('v1', 'bob')
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === 'v1')!.elements.some(e => e.id === 'bob')).toBe(true)

    useWorkspaceStore.getState().removeElementsFromView('v1', ['bob'])
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === 'v1')!.elements.some(e => e.id === 'bob')).toBe(false)

    useWorkspaceStore.getState().setLayoutDirection('v1', 'LR')
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === 'v1')!.autoLayout?.direction).toBe('LR')

    useWorkspaceStore.getState().resetAndRelayout('v1', 'TB')
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === 'v1')!.autoLayout?.direction).toBe('TB')

    useWorkspaceStore.getState().setElementsLocked('v1', ['alice'], true)
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === 'v1')!.elements.find(e => e.id === 'alice')!.locked).toBe(true)

    useWorkspaceStore.getState().unlockAllInView('v1')
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === 'v1')!.elements.find(e => e.id === 'alice')!.locked).toBeFalsy()

    useWorkspaceStore.getState().setViewLocked('v1', true)
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.find(v => v.key === 'v1')!.locked).toBe(true)

    useWorkspaceStore.getState().deleteView('v1')
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.some(v => v.key === 'v1')).toBe(false)
  })
})
