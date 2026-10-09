import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import type { Workspace } from '@/types/model'

// Integration-level proof for Phase 1 of the locked-readonly-viewer plan:
// each slice's own `*-slice-readonly.test.ts` proves its actions no-op in
// isolation; this file proves the guard holds across every guarded slice
// TOGETHER, against one shared workspace/store instance, the way a real
// read-only session actually exercises the store.

function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person', 'VIP'], properties: {} }],
      softwareSystems: [
        {
          id: 'sys1',
          type: 'softwareSystem',
          name: 'Sys1',
          tags: ['Element', 'Software System'],
          properties: {},
          containers: [{ id: 'web', type: 'container', name: 'Web', tags: ['Element', 'Container'], properties: {}, components: [] }],
        },
        { id: 'sys2', type: 'softwareSystem', name: 'Sys2', tags: ['Element', 'Software System'], properties: {}, containers: [] },
      ],
      relationships: [{ id: 'rel1', sourceId: 'alice', destinationId: 'sys1', description: 'uses', tags: ['Relationship'], properties: {} }],
      groups: [{ id: 'g1', name: 'Group1', elementIds: ['alice'] }],
      deploymentEnvironments: [
        {
          id: 'env1',
          name: 'Live',
          deploymentNodes: [
            {
              id: 'server',
              type: 'deploymentNode',
              name: 'Server',
              tags: ['Element', 'Deployment Node'],
              properties: {},
              children: [],
              infrastructureNodes: [],
              containerInstances: [],
              softwareSystemInstances: [],
            },
          ],
        },
      ],
    },
    views: {
      systemLandscapeViews: [
        {
          type: 'systemLandscape',
          key: 'v1',
          title: 'Landscape',
          elements: [{ id: 'alice' }, { id: 'sys1' }, { id: 'sys2' }],
          relationships: [{ id: 'rel1' }],
        },
      ],
      systemContextViews: [],
      // No container view for sys1 yet, so zoomInto('sys1') hits the
      // content-creating (guarded) branch rather than navigating to an
      // existing child view.
      containerViews: [],
      componentViews: [],
      dynamicViews: [
        {
          type: 'dynamic',
          key: 'dyn1',
          title: 'Flow',
          elements: [{ id: 'alice' }, { id: 'sys1' }],
          relationships: [{ id: 'rel1', sourceId: 'alice', destinationId: 'sys1', order: '1' }],
        },
      ],
      deploymentViews: [{ type: 'deployment', key: 'dep1', environment: 'Live', elements: [], relationships: [] }],
      configuration: { styles: { elements: [{ tag: 'VIP', background: '#ff0000' }], relationships: [] } },
    },
  }
}

describe('cross-slice readOnly guard (Phase 1 integration)', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().setReadOnly(true)
  })

  it('every guarded slice no-ops, in combination, when readOnly is true', () => {
    const workspaceBefore = useWorkspaceStore.getState().workspace
    const assertUnchanged = () => {
      const state = useWorkspaceStore.getState()
      expect(state.workspace).toBe(workspaceBefore)
      expect(state.undoStack).toHaveLength(0)
    }

    // element-slice
    const personId = useWorkspaceStore.getState().addPerson('Bob')
    expect(personId).toBe('')
    assertUnchanged()

    // group-slice
    const groupId = useWorkspaceStore.getState().addGroup('New Group', ['alice'])
    expect(groupId).toBe('')
    assertUnchanged()

    // relationship-slice
    const relId = useWorkspaceStore.getState().addRelationship('alice', 'sys2', 'reads')
    expect(relId).toBe('')
    assertUnchanged()

    // dynamic-step-slice
    useWorkspaceStore.getState().addDynamicStep('dyn1', 'alice', 'sys2', 'new step')
    assertUnchanged()

    // deployment-slice
    const envCreated = useWorkspaceStore.getState().addDeploymentEnvironment('Staging')
    expect(envCreated).toBe(false)
    assertUnchanged()

    // view-slice
    const viewKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'New View')
    expect(viewKey).toBe('')
    assertUnchanged()

    // tag-style-slice
    useWorkspaceStore.getState().renameTag('VIP', 'Premium')
    assertUnchanged()

    // lifecycle-slice
    useWorkspaceStore.getState().updateWorkspaceMeta({ name: 'Renamed Workspace' })
    assertUnchanged()

    // navigation-slice's create-on-zoom path: sys1 has no container view yet,
    // so this is the content-creating branch that must be guarded.
    useWorkspaceStore.getState().setActiveView('v1')
    useWorkspaceStore.getState().zoomInto('sys1')
    expect(useWorkspaceStore.getState().pendingZoomConfirm).toBeNull()
    assertUnchanged()

    useWorkspaceStore.getState().confirmZoomCreate()
    assertUnchanged()
  })

  it('undo-slice no-ops when readOnly is true', () => {
    // undo/redo need a real entry on their stacks to meaningfully prove the
    // guard (an empty stack would no-op on its own) — build one while briefly
    // writable, matching undo-slice-readonly.test.ts's own setup convention.
    useWorkspaceStore.getState().setReadOnly(false)
    useWorkspaceStore.getState().addPerson('Carol')
    const workspaceAfterMutation = useWorkspaceStore.getState().workspace
    const undoLenBefore = useWorkspaceStore.getState().undoStack.length
    expect(undoLenBefore).toBeGreaterThan(0)

    useWorkspaceStore.getState().setReadOnly(true)
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().workspace).toBe(workspaceAfterMutation)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(undoLenBefore)

    // Build a redo entry (undo once while writable), then confirm redo no-ops too.
    useWorkspaceStore.getState().setReadOnly(false)
    useWorkspaceStore.getState().undo()
    const workspaceAfterUndo = useWorkspaceStore.getState().workspace
    const redoLenBefore = useWorkspaceStore.getState().redoStack.length
    expect(redoLenBefore).toBeGreaterThan(0)

    useWorkspaceStore.getState().setReadOnly(true)
    useWorkspaceStore.getState().redo()
    expect(useWorkspaceStore.getState().workspace).toBe(workspaceAfterUndo)
    expect(useWorkspaceStore.getState().redoStack).toHaveLength(redoLenBefore)

    // resetWorkspaceTo no-ops too.
    const target: Workspace = { ...makeWorkspace(), name: 'Replaced' }
    useWorkspaceStore.getState().resetWorkspaceTo(target)
    expect(useWorkspaceStore.getState().workspace?.name).not.toBe('Replaced')
  })

  it('the same calls DO mutate the workspace when readOnly is false', () => {
    useWorkspaceStore.getState().setReadOnly(false)

    const personId = useWorkspaceStore.getState().addPerson('Bob')
    expect(personId).not.toBe('')
    expect(useWorkspaceStore.getState().workspace!.model.people.some(p => p.id === personId)).toBe(true)

    const groupId = useWorkspaceStore.getState().addGroup('New Group', ['alice'])
    expect(groupId).not.toBe('')
    expect(useWorkspaceStore.getState().workspace!.model.groups.some(g => g.id === groupId)).toBe(true)

    const relId = useWorkspaceStore.getState().addRelationship('alice', 'sys2', 'reads')
    expect(relId).not.toBe('')
    expect(useWorkspaceStore.getState().workspace!.model.relationships.some(r => r.id === relId)).toBe(true)

    const stepCountBefore = useWorkspaceStore.getState().workspace!.views.dynamicViews[0].relationships.length
    useWorkspaceStore.getState().addDynamicStep('dyn1', 'alice', 'sys2', 'new step')
    expect(useWorkspaceStore.getState().workspace!.views.dynamicViews[0].relationships.length).toBeGreaterThan(stepCountBefore)

    expect(useWorkspaceStore.getState().addDeploymentEnvironment('Staging')).toBe(true)
    expect(useWorkspaceStore.getState().workspace!.model.deploymentEnvironments.some(e => e.name === 'Staging')).toBe(true)

    const viewKey = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'New View')
    expect(viewKey).not.toBe('')
    expect(useWorkspaceStore.getState().workspace!.views.systemLandscapeViews.some(v => v.key === viewKey)).toBe(true)

    useWorkspaceStore.getState().renameTag('VIP', 'Premium')
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')!.tags).toContain('Premium')

    useWorkspaceStore.getState().updateWorkspaceMeta({ name: 'Renamed Workspace' })
    expect(useWorkspaceStore.getState().workspace!.name).toBe('Renamed Workspace')

    useWorkspaceStore.getState().setActiveView('v1')
    useWorkspaceStore.getState().zoomInto('sys1')
    expect(useWorkspaceStore.getState().pendingZoomConfirm).not.toBeNull()

    const containerViewCountBefore = useWorkspaceStore.getState().workspace!.views.containerViews.length
    useWorkspaceStore.getState().confirmZoomCreate()
    expect(useWorkspaceStore.getState().workspace!.views.containerViews.length).toBeGreaterThan(containerViewCountBefore)

    useWorkspaceStore.getState().addPerson('Carol')
    const undoLenBefore = useWorkspaceStore.getState().undoStack.length
    expect(undoLenBefore).toBeGreaterThan(0)
    useWorkspaceStore.getState().undo()
    expect(useWorkspaceStore.getState().undoStack.length).toBeLessThan(undoLenBefore)
  })
})
