import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import type { Workspace } from '@/types/model'

// Two views so revealInView has somewhere else to switch to, and a relationship
// in the first view so the relationship-target branch has a real id to select.
function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [
        { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
      ],
      softwareSystems: [
        { id: 'sys', type: 'softwareSystem', name: 'Sys', tags: ['Element', 'Software System'], properties: {}, containers: [] },
      ],
      relationships: [
        { id: 'r1', sourceId: 'alice', destinationId: 'sys', description: 'Uses', tags: [], properties: {} },
      ],
      groups: [],
    },
    views: {
      systemLandscapeViews: [{
        type: 'systemLandscape', key: 'landscape', title: 'Landscape',
        elements: [{ id: 'alice' }, { id: 'sys' }],
        relationships: [{ id: 'r1' }], autoLayout: { direction: 'TB' },
      }],
      systemContextViews: [{
        type: 'systemContext', key: 'ctx', softwareSystemId: 'sys', title: 'Context',
        elements: [{ id: 'alice' }, { id: 'sys' }],
        relationships: [{ id: 'r1' }],
      }],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  } as unknown as Workspace
}

describe('revealInView', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().setReadOnly(false)
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().setActiveView('landscape')
  })

  afterEach(() => {
    // readOnly is global store state — never leave it true for later tests.
    useWorkspaceStore.getState().setReadOnly(false)
  })

  it('switching to a different view pushes the previous key onto viewHistory, selects the element and sets focusElementId', () => {
    useWorkspaceStore.getState().revealInView('ctx', { kind: 'element', id: 'sys' })

    const state = useWorkspaceStore.getState()
    expect(state.activeViewKey).toBe('ctx')
    expect(state.viewHistory).toEqual(['landscape'])
    expect(state.selectedElementIds).toEqual(['sys'])
    expect(state.selectedRelationshipId).toBeNull()
    expect(state.focusElementId).toBe('sys')
  })

  it('revealing a target already on the active view does not push history, but still selects and focuses it', () => {
    useWorkspaceStore.getState().revealInView('landscape', { kind: 'element', id: 'sys' })

    const state = useWorkspaceStore.getState()
    expect(state.activeViewKey).toBe('landscape')
    expect(state.viewHistory).toEqual([])
    expect(state.selectedElementIds).toEqual(['sys'])
    expect(state.focusElementId).toBe('sys')
  })

  it('a relationship target sets selectedRelationshipId and focusRelationshipId, with element selection empty', () => {
    useWorkspaceStore.getState().revealInView('ctx', { kind: 'relationship', id: 'r1' })

    const state = useWorkspaceStore.getState()
    expect(state.activeViewKey).toBe('ctx')
    expect(state.selectedRelationshipId).toBe('r1')
    expect(state.focusRelationshipId).toBe('r1')
    expect(state.selectedElementIds).toEqual([])
    expect(state.focusElementId).toBeNull()
  })

  it('still navigates, selects and focuses when readOnly is true', () => {
    useWorkspaceStore.getState().setReadOnly(true)

    useWorkspaceStore.getState().revealInView('ctx', { kind: 'element', id: 'sys' })

    const state = useWorkspaceStore.getState()
    expect(state.activeViewKey).toBe('ctx')
    expect(state.viewHistory).toEqual(['landscape'])
    expect(state.selectedElementIds).toEqual(['sys'])
    expect(state.focusElementId).toBe('sys')
  })
})
