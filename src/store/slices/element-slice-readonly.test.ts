import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} }],
      softwareSystems: [{
        id: 'api',
        type: 'softwareSystem',
        name: 'API',
        tags: ['Element', 'Software System'],
        properties: {},
        containers: [{ id: 'web', type: 'container', name: 'Web', tags: ['Element', 'Container'], properties: {}, components: [] }],
      }],
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

describe('element-slice readOnly guard', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().setReadOnly(true)
  })

  it('addPerson is a no-op and returns \'\' when readOnly', () => {
    const before = useWorkspaceStore.getState().workspace!
    const id = useWorkspaceStore.getState().addPerson('Bob')
    const after = useWorkspaceStore.getState().workspace!
    expect(id).toBe('')
    expect(after.model.people).toEqual(before.model.people)
    expect(after.model.people).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('addSoftwareSystem is a no-op and returns \'\' when readOnly', () => {
    const before = useWorkspaceStore.getState().workspace!
    const id = useWorkspaceStore.getState().addSoftwareSystem('Billing')
    const after = useWorkspaceStore.getState().workspace!
    expect(id).toBe('')
    expect(after.model.softwareSystems).toEqual(before.model.softwareSystems)
    expect(after.model.softwareSystems).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('addContainer is a no-op and returns \'\' when readOnly', () => {
    const before = useWorkspaceStore.getState().workspace!
    const id = useWorkspaceStore.getState().addContainer('api', 'DB')
    const after = useWorkspaceStore.getState().workspace!
    expect(id).toBe('')
    expect(after.model.softwareSystems[0].containers).toEqual(before.model.softwareSystems[0].containers)
    expect(after.model.softwareSystems[0].containers).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('addComponent is a no-op and returns \'\' when readOnly', () => {
    const before = useWorkspaceStore.getState().workspace!
    const id = useWorkspaceStore.getState().addComponent('web', 'Auth Handler')
    const after = useWorkspaceStore.getState().workspace!
    expect(id).toBe('')
    expect(after.model.softwareSystems[0].containers[0].components).toEqual(before.model.softwareSystems[0].containers[0].components)
    expect(after.model.softwareSystems[0].containers[0].components).toHaveLength(0)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('updateElement is a no-op when readOnly', () => {
    useWorkspaceStore.getState().updateElement('alice', { name: 'Alice Smith' })
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people[0].name).toBe('Alice')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('updateElementLive is a no-op when readOnly', () => {
    useWorkspaceStore.getState().updateElementLive('alice', { name: 'Alice Live' })
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people[0].name).toBe('Alice')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('updateElementTechnology is a no-op when readOnly', () => {
    useWorkspaceStore.getState().updateElementTechnology('web', 'Node.js')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.softwareSystems[0].containers[0].technology).toBeUndefined()
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('deleteElement is a no-op when readOnly', () => {
    useWorkspaceStore.getState().deleteElement('alice')
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('deleteElements is a no-op when readOnly', () => {
    useWorkspaceStore.getState().deleteElements(['alice'])
    const ws = useWorkspaceStore.getState().workspace!
    expect(ws.model.people).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('duplicateElements is a no-op and returns [] when readOnly', () => {
    const before = useWorkspaceStore.getState().workspace!
    const newIds = useWorkspaceStore.getState().duplicateElements(['alice'])
    const after = useWorkspaceStore.getState().workspace!
    expect(newIds).toEqual([])
    expect(after.model.people).toEqual(before.model.people)
    expect(after.model.people).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('moveElement is a no-op and returns false when readOnly', () => {
    useWorkspaceStore.getState().setReadOnly(false)
    const billing = useWorkspaceStore.getState().addSoftwareSystem('Billing')
    useWorkspaceStore.setState({ undoStack: [] })
    useWorkspaceStore.getState().setReadOnly(true)
    const before = useWorkspaceStore.getState().workspace!
    expect(useWorkspaceStore.getState().moveElement('web', billing)).toBe(false)
    expect(useWorkspaceStore.getState().workspace).toBe(before)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('all ten actions mutate normally when readOnly is false', () => {
    useWorkspaceStore.getState().setReadOnly(false)

    const personId = useWorkspaceStore.getState().addPerson('Bob')
    expect(personId).not.toBe('')
    const sysId = useWorkspaceStore.getState().addSoftwareSystem('Billing')
    expect(sysId).not.toBe('')
    const containerId = useWorkspaceStore.getState().addContainer('api', 'DB')
    expect(containerId).not.toBe('')
    const componentId = useWorkspaceStore.getState().addComponent('web', 'Auth Handler')
    expect(componentId).not.toBe('')

    useWorkspaceStore.getState().updateElement('alice', { name: 'Alice Smith' })
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')!.name).toBe('Alice Smith')

    useWorkspaceStore.getState().updateElementLive('alice', { name: 'Alice Live' })
    expect(useWorkspaceStore.getState().workspace!.model.people.find(p => p.id === 'alice')!.name).toBe('Alice Live')

    useWorkspaceStore.getState().updateElementTechnology('web', 'Node.js')
    expect(useWorkspaceStore.getState().workspace!.model.softwareSystems[0].containers[0].technology).toBe('Node.js')

    const dupIds = useWorkspaceStore.getState().duplicateElements(['alice'])
    expect(dupIds.length).toBeGreaterThan(0)

    const beforeDeleteCount = useWorkspaceStore.getState().workspace!.model.people.length
    useWorkspaceStore.getState().deleteElement('alice')
    expect(useWorkspaceStore.getState().workspace!.model.people.length).toBe(beforeDeleteCount - 1)
  })
})
