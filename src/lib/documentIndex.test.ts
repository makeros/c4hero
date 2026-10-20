import { describe, it, expect } from 'vitest'
import type { Workspace, View, DocLink } from '@/types/model'
import { buildDocumentIndex, countDocumentedItems } from './documentIndex'

const docs = (title: string): DocLink[] => [{ path: `docs/${title}.md`, title }]

function baseWorkspace(overrides: Partial<Workspace['model']> = {}, views: Partial<Workspace['views']> = {}): Workspace {
  return {
    name: 'Test',
    model: {
      people: [],
      softwareSystems: [],
      relationships: [],
      groups: [],
      deploymentEnvironments: [],
      ...overrides,
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      dynamicViews: [],
      deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
      ...views,
    },
  }
}

describe('buildDocumentIndex', () => {
  it('excludes elements and relationships without documents', () => {
    const ws = baseWorkspace({
      people: [
        { id: 'alice', type: 'person', name: 'Alice', tags: [], properties: {} },
        { id: 'bob', type: 'person', name: 'Bob', tags: [], properties: {}, documents: docs('Bob doc') },
      ],
      relationships: [
        { id: 'r1', sourceId: 'alice', destinationId: 'bob', tags: [], properties: {} },
      ],
    })

    const index = buildDocumentIndex(ws)

    expect(index).toHaveLength(1)
    expect(index[0].id).toBe('bob')
  })

  it('reports an element in 0, 1 and many views', () => {
    const view1: View = { type: 'container', key: 'view1', title: 'View One', elements: [{ id: 'many' }], relationships: [] }
    const view2: View = { type: 'container', key: 'view2', title: 'View Two', elements: [{ id: 'many' }, { id: 'one' }], relationships: [] }

    const ws = baseWorkspace({
      people: [
        { id: 'zero', type: 'person', name: 'Zero Views', tags: [], properties: {}, documents: docs('a') },
        { id: 'one', type: 'person', name: 'One View', tags: [], properties: {}, documents: docs('b') },
        { id: 'many', type: 'person', name: 'Many Views', tags: [], properties: {}, documents: docs('c') },
      ],
    }, { containerViews: [view1, view2] })

    const index = buildDocumentIndex(ws)
    const byId = Object.fromEntries(index.map((e) => [e.id, e]))

    expect(byId.zero.views).toEqual([])
    expect(byId.one.views).toEqual([{ key: 'view2', title: 'View Two', type: 'container' }])
    expect(byId.many.views.map((v) => v.key)).toEqual(['view1', 'view2'])
  })

  it('counts a relation\'s views only from view.relationships, not view.elements', () => {
    const inRelationships: View = {
      type: 'container', key: 'view-rel', title: 'Has Relationship',
      elements: [{ id: 'src' }, { id: 'dst' }], relationships: [{ id: 'rel1' }],
    }
    const elementsOnly: View = {
      type: 'container', key: 'view-elements-only', title: 'Elements Only',
      elements: [{ id: 'src' }, { id: 'dst' }], relationships: [],
    }

    const ws = baseWorkspace({
      people: [
        { id: 'src', type: 'person', name: 'Source Person', tags: [], properties: {} },
        { id: 'dst', type: 'person', name: 'Dest Person', tags: [], properties: {} },
      ],
      relationships: [
        { id: 'rel1', sourceId: 'src', destinationId: 'dst', tags: [], properties: {}, documents: docs('rel') },
      ],
    }, { containerViews: [inRelationships, elementsOnly] })

    const index = buildDocumentIndex(ws)

    expect(index).toHaveLength(1)
    expect(index[0].views.map((v) => v.key)).toEqual(['view-rel'])
  })

  it('includes deployment and infrastructure nodes with their type labels', () => {
    const ws = baseWorkspace({
      deploymentEnvironments: [{
        id: 'env1',
        name: 'Production',
        deploymentNodes: [{
          id: 'node1',
          type: 'deploymentNode',
          name: 'Primary DC',
          tags: [],
          properties: {},
          documents: docs('dc'),
          children: [],
          containerInstances: [],
          softwareSystemInstances: [],
          infrastructureNodes: [{
            id: 'infra1',
            type: 'infrastructureNode',
            name: 'Edge LB',
            tags: [],
            properties: {},
            documents: docs('lb'),
          }],
        }],
      }],
    })

    const index = buildDocumentIndex(ws)
    const byId = Object.fromEntries(index.map((e) => [e.id, e]))

    expect(byId.node1.typeLabel).toBe('Deployment Node')
    expect(byId.node1.kind).toBe('element')
    expect(byId.infra1.typeLabel).toBe('Infrastructure Node')
    expect(byId.infra1.kind).toBe('element')
  })

  it('names a relation "Source → Target" with description (+ technology) as secondary', () => {
    const ws = baseWorkspace({
      softwareSystems: [
        { id: 'sys1', type: 'softwareSystem', name: 'Web App', tags: [], properties: {}, containers: [] },
      ],
      people: [
        { id: 'cust', type: 'person', name: 'Customer', tags: [], properties: {} },
      ],
      relationships: [
        {
          id: 'rel1', sourceId: 'cust', destinationId: 'sys1', tags: [], properties: {},
          description: 'Visits bigbank.com', technology: 'HTTPS', documents: docs('login flow'),
        },
        {
          id: 'rel2', sourceId: 'missing-src', destinationId: 'missing-dst', tags: [], properties: {},
          documents: docs('no names'),
        },
      ],
    })

    const index = buildDocumentIndex(ws)
    const byId = Object.fromEntries(index.map((e) => [e.id, e]))

    expect(byId.rel1.kind).toBe('relationship')
    expect(byId.rel1.name).toBe('Customer → Web App')
    expect(byId.rel1.typeLabel).toBe('Relation')
    expect(byId.rel1.secondary).toBe('Visits bigbank.com · HTTPS')

    // Falls back to the raw id when no element/deployment name resolves.
    expect(byId.rel2.name).toBe('missing-src → missing-dst')
    expect(byId.rel2.secondary).toBeUndefined()
  })

  it('sorts A-Z case-insensitively, tie-breaking by id', () => {
    const ws = baseWorkspace({
      people: [
        { id: 'p-banana', type: 'person', name: 'Banana', tags: [], properties: {}, documents: docs('x') },
        { id: 'p-apple', type: 'person', name: 'apple', tags: [], properties: {}, documents: docs('x') },
        { id: 'p-apple-2', type: 'person', name: 'Apple', tags: [], properties: {}, documents: docs('x') },
      ],
    })

    const index = buildDocumentIndex(ws)

    expect(index.map((e) => e.id)).toEqual(['p-apple', 'p-apple-2', 'p-banana'])
  })
})

describe('countDocumentedItems', () => {
  it('matches buildDocumentIndex().length across elements, deployment/infra nodes and relationships', () => {
    const ws = baseWorkspace({
      people: [
        { id: 'alice', type: 'person', name: 'Alice', tags: [], properties: {} },
        { id: 'bob', type: 'person', name: 'Bob', tags: [], properties: {}, documents: docs('Bob doc') },
      ],
      relationships: [
        { id: 'r1', sourceId: 'alice', destinationId: 'bob', tags: [], properties: {}, documents: docs('rel') },
      ],
      deploymentEnvironments: [{
        id: 'env1',
        name: 'Production',
        deploymentNodes: [{
          id: 'node1',
          type: 'deploymentNode',
          name: 'Primary DC',
          tags: [],
          properties: {},
          documents: docs('dc'),
          children: [],
          containerInstances: [],
          softwareSystemInstances: [],
          infrastructureNodes: [{
            id: 'infra1',
            type: 'infrastructureNode',
            name: 'Edge LB',
            tags: [],
            properties: {},
            documents: docs('lb'),
          }],
        }],
      }],
    })

    expect(countDocumentedItems(ws)).toBe(buildDocumentIndex(ws).length)
    expect(countDocumentedItems(ws)).toBe(4)
  })

  it('returns 0 when nothing has documents', () => {
    const ws = baseWorkspace({
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: [], properties: {} }],
    })

    expect(countDocumentedItems(ws)).toBe(0)
  })
})
