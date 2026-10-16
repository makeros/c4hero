import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from './workspace'
import { serializeDSL, parseDSL } from '@/lib/dsl'
import type { Container, Relationship, SoftwareSystem, View, Workspace } from '@/types/model'

const base = (type: string, id: string) => ({ id, name: id, tags: ['Element'], properties: {}, type }) as never
const container = (id: string, components: string[] = []): Container => ({
  ...base('container', id), type: 'container',
  components: components.map(c => base('component', c)),
}) as Container
const rel = (id: string, sourceId: string, destinationId: string): Relationship =>
  ({ id, sourceId, destinationId, description: 'uses', tags: ['Relationship'], properties: {} })
const view = (type: View['type'], key: string, scope: Partial<View>, ids: string[], rels: string[] = []): View =>
  ({ type, key, elements: ids.map(id => ({ id, x: 5, y: 5 })), relationships: rels.map(id => ({ id })), ...scope }) as View

function makeWorkspace(): Workspace {
  const a: SoftwareSystem = { ...base('softwareSystem', 'sysA'), type: 'softwareSystem', containers: [container('web', ['auth', 'cache']), container('db')] } as SoftwareSystem
  const b: SoftwareSystem = { ...base('softwareSystem', 'sysB'), type: 'softwareSystem', containers: [container('queue', ['worker'])] } as SoftwareSystem
  const c: SoftwareSystem = { ...base('softwareSystem', 'sysC'), type: 'softwareSystem', containers: [] } as SoftwareSystem
  return {
    name: 'T',
    model: {
      people: [base('person', 'user')],
      softwareSystems: [a, b, c],
      relationships: [rel('r1', 'user', 'web'), rel('r2', 'web', 'db'), rel('r3', 'web', 'queue'), rel('r4', 'auth', 'cache')],
      groups: [{ id: 'g1', name: 'G', elementIds: ['web', 'db', 'auth'] }],
      deploymentEnvironments: [{
        id: 'live', name: 'Live',
        deploymentNodes: [{
          ...base('deploymentNode', 'node'), type: 'deploymentNode', children: [], infrastructureNodes: [],
          softwareSystemInstances: [],
          containerInstances: [{ id: 'webInst', type: 'containerInstance', containerId: 'web', tags: [], properties: {} }],
        } as never],
      }],
    },
    views: {
      systemLandscapeViews: [view('systemLandscape', 'land', {}, ['user', 'sysA', 'sysB'])],
      systemContextViews: [view('systemContext', 'ctxA', { softwareSystemId: 'sysA' }, ['user', 'sysA'])],
      containerViews: [
        view('container', 'cvA', { softwareSystemId: 'sysA' }, ['user', 'web', 'db', 'queue'], ['r1', 'r2', 'r3']),
        view('container', 'cvB', { softwareSystemId: 'sysB' }, ['queue']),
      ],
      componentViews: [
        view('component', 'compWeb', { containerId: 'web' }, ['auth', 'cache', 'db'], ['r4']),
        view('component', 'compQueue', { containerId: 'queue' }, ['worker']),
      ],
      dynamicViews: [
        view('dynamic', 'dynA', { softwareSystemId: 'sysA' }, ['user', 'web', 'db'], []),
        view('dynamic', 'dynWeb', { containerId: 'web' }, ['auth', 'cache'], []),
      ],
      deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

const state = () => useWorkspaceStore.getState()
const ws = () => state().workspace!
const sys = (id: string) => ws().model.softwareSystems.find(s => s.id === id)!
const viewOf = (key: string) => [...ws().views.containerViews, ...ws().views.componentViews, ...ws().views.dynamicViews].find(v => v.key === key)!
const ids = (key: string) => viewOf(key).elements.map(e => e.id)

beforeEach(() => {
  const w = makeWorkspace()
  w.views.dynamicViews[0].relationships = [
    { id: 'r1', sourceId: 'user', destinationId: 'web', order: '1' },
    { id: 'r2', sourceId: 'web', destinationId: 'db', order: '2' },
  ]
  w.views.dynamicViews[1].relationships = [{ id: 'r4', sourceId: 'auth', destinationId: 'cache', order: '1' }]
  state().loadWorkspace(w)
})

describe('moveElement: container to another system', () => {
  it('reparents the container with its components, keeping id, relationships and components', () => {
    expect(state().moveElement('web', 'sysB')).toBe(true)
    expect(sys('sysA').containers.map(c => c.id)).toEqual(['db'])
    const web = sys('sysB').containers.find(c => c.id === 'web')!
    expect(web.components.map(c => c.id)).toEqual(['auth', 'cache'])
    expect(ws().model.relationships.map(r => r.id)).toEqual(['r1', 'r2', 'r3', 'r4'])
  })

  it('leaves old-scope container views and joins the new ones, adding its relationships', () => {
    state().moveElement('web', 'sysB')
    expect(ids('cvA')).toEqual(['user', 'db', 'queue'])
    expect(viewOf('cvA').relationships).toEqual([])
    expect(ids('cvB')).toEqual(['queue', 'web'])
    expect(viewOf('cvB').relationships).toEqual([{ id: 'r3' }])
    expect(viewOf('cvB').elements.find(e => e.id === 'web')).toEqual({ id: 'web' })
  })

  it('keeps landscape/context views, its own component views, groups of its children and deployment instances', () => {
    state().moveElement('web', 'sysB')
    expect(ws().views.systemLandscapeViews[0].elements.map(e => e.id)).toEqual(['user', 'sysA', 'sysB'])
    expect(ids('compWeb')).toEqual(['auth', 'cache', 'db'])
    expect(ws().model.groups[0].elementIds).toEqual(['db', 'auth'])
    const node = ws().model.deploymentEnvironments![0].deploymentNodes[0]
    expect(node.containerInstances[0].containerId).toBe('web')
  })

  it('creates a container view when the new system has none', () => {
    state().moveElement('web', 'sysC')
    const created = ws().views.containerViews.find(v => v.softwareSystemId === 'sysC')!
    expect(created.elements.map(e => e.id)).toContain('web')
  })

  it('drops dynamic steps that left their system scope and re-derives view membership', () => {
    state().moveElement('web', 'sysB')
    const dyn = viewOf('dynA')
    expect(dyn.relationships).toEqual([])
    expect(dyn.elements).toEqual([])
    // container-scoped view of the moved container is untouched
    expect(viewOf('dynWeb').relationships).toHaveLength(1)
  })

  it('keeps steps that stay in scope and renumbers the rest', () => {
    state().moveElement('db', 'sysB')
    const dyn = viewOf('dynA')
    expect(dyn.relationships.map(r => r.id)).toEqual(['r1'])
    expect(dyn.relationships[0].order).toBe('1')
    expect(dyn.elements.map(e => e.id)).toEqual(['user', 'web'])
  })

  it('round-trips through serialize and parse', () => {
    state().moveElement('web', 'sysB')
    const { workspace, errors } = parseDSL(serializeDSL(ws()))
    expect(errors).toEqual([])
    expect(workspace!.model.softwareSystems.find(s => s.id === 'sysB')!.containers.map(c => c.id)).toContain('web')
  })

  it('pushes exactly one undo entry and undo restores the original placement', () => {
    state().moveElement('web', 'sysB')
    expect(state().undoStack).toHaveLength(1)
    state().undo()
    expect(sys('sysA').containers.map(c => c.id)).toEqual(['web', 'db'])
    expect(ids('cvA')).toEqual(['user', 'web', 'db', 'queue'])
  })
})

describe('moveElement: component to another container', () => {
  it('reparents, leaves old component views, joins new ones', () => {
    expect(state().moveElement('auth', 'queue')).toBe(true)
    expect(sys('sysA').containers[0].components.map(c => c.id)).toEqual(['cache'])
    expect(sys('sysB').containers[0].components.map(c => c.id)).toEqual(['worker', 'auth'])
    expect(ids('compWeb')).toEqual(['cache', 'db'])
    expect(viewOf('compWeb').relationships).toEqual([])
    expect(ids('compQueue')).toEqual(['worker', 'auth'])
    expect(ws().model.groups[0].elementIds).toEqual(['web', 'db'])
  })

  it('drops steps of the old container-scoped dynamic view', () => {
    state().moveElement('auth', 'queue')
    expect(viewOf('dynWeb').relationships).toEqual([])
  })

  it('creates a component view when the new container has none', () => {
    state().moveElement('auth', 'db')
    expect(ws().views.componentViews.find(v => v.containerId === 'db')!.elements.map(e => e.id)).toContain('auth')
  })
})

describe('moveElement: refusals', () => {
  it.each([
    ['type mismatch (container to container)', 'web', 'db'],
    ['type mismatch (component to system)', 'auth', 'sysB'],
    ['type mismatch (person)', 'user', 'sysB'],
    ['type mismatch (system)', 'sysA', 'sysB'],
    ['same parent (container)', 'web', 'sysA'],
    ['same parent (component)', 'auth', 'web'],
    ['missing id', 'nope', 'sysB'],
    ['missing parent', 'web', 'nope'],
  ])('returns false and changes nothing on %s', (_n, id, parent) => {
    const before = ws()
    expect(state().moveElement(id, parent)).toBe(false)
    expect(ws()).toBe(before)
    expect(state().undoStack).toHaveLength(0)
  })
})
