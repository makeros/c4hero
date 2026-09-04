import { describe, it, expect } from 'vitest'
import { impliedViewRelationships } from './impliedRelationships'
import type { Model } from '@/types/model'

function makeModel(): Model {
  return {
    people: [],
    softwareSystems: [
      {
        id: 'sys-a', type: 'softwareSystem', name: 'System A', tags: [], properties: {},
        containers: [
          {
            id: 'c-a1', type: 'container', name: 'API A', tags: [], properties: {},
            components: [
              { id: 'comp-a1', type: 'component', name: 'Auth', tags: [], properties: {} },
            ],
          },
        ],
      },
      {
        id: 'sys-b', type: 'softwareSystem', name: 'System B', tags: [], properties: {},
        containers: [
          {
            id: 'c-b1', type: 'container', name: 'API B', tags: [], properties: {},
            components: [
              { id: 'comp-b1', type: 'component', name: 'Billing', tags: [], properties: {} },
            ],
          },
        ],
      },
    ],
    relationships: [],
    groups: [],
    deploymentEnvironments: [],
  }
}

function addRelationship(model: Model, sourceId: string, destinationId: string, desc = 'calls') {
  model.relationships.push({
    id: `rel-${model.relationships.length}`,
    sourceId,
    destinationId,
    description: desc,
    tags: ['Relationship'],
    properties: {},
  })
}

/** Every element id in the model — used when a test wants to see every
 *  candidate pair the function would generate, unconstrained by view scope. */
function allIds(model: Model): Set<string> {
  const ids = new Set<string>()
  for (const p of model.people) ids.add(p.id)
  for (const s of model.softwareSystems) {
    ids.add(s.id)
    for (const c of s.containers) {
      ids.add(c.id)
      for (const comp of c.components) ids.add(comp.id)
    }
  }
  return ids
}

describe('impliedViewRelationships', () => {
  it('returns empty array when no explicit relationships exist', () => {
    const model = makeModel()
    expect(impliedViewRelationships(model, allIds(model))).toHaveLength(0)
  })

  it('returns empty array when the relationship is within the same system', () => {
    const model = makeModel()
    addRelationship(model, 'comp-a1', 'c-a1') // component → container within System A
    expect(impliedViewRelationships(model, allIds(model))).toHaveLength(0)
  })

  it('creates implied system→system from component→component across systems, scoped to a system-level view', () => {
    const model = makeModel()
    addRelationship(model, 'comp-a1', 'comp-b1', 'calls billing')
    const viewIds = new Set(['sys-a', 'sys-b']) // only the systems are visible in this view
    const implied = impliedViewRelationships(model, viewIds)
    expect(implied).toHaveLength(1)
    expect(implied[0]).toMatchObject({ sourceId: 'sys-a', destinationId: 'sys-b' })
  })

  it('does not create an implied pair whose endpoints are not both in the view', () => {
    const model = makeModel()
    addRelationship(model, 'comp-a1', 'comp-b1', 'calls billing')
    // Container of A is visible, but System B is not — no implied edge should
    // connect an in-view element to one that isn't in the view.
    const viewIds = new Set(['c-a1'])
    expect(impliedViewRelationships(model, viewIds)).toHaveLength(0)
  })

  it('propagates technology from the sole contributing relationship', () => {
    const model = makeModel()
    addRelationship(model, 'comp-a1', 'comp-b1', 'sends to')
    model.relationships[0].technology = 'gRPC'
    const implied = impliedViewRelationships(model, new Set(['sys-a', 'sys-b']))
    expect(implied[0].technology).toBe('gRPC')
  })

  it('drops description/technology when several relationships imply the same pair', () => {
    const model = makeModel()
    addRelationship(model, 'comp-a1', 'comp-b1', 'first call')
    addRelationship(model, 'c-a1', 'c-b1', 'second call')
    const implied = impliedViewRelationships(model, new Set(['sys-a', 'sys-b']))
    expect(implied).toHaveLength(1)
    expect(implied[0].description).toBeUndefined()
  })

  it('does not duplicate the implied pair for multiple links between the same descendants', () => {
    const model = makeModel()
    addRelationship(model, 'comp-a1', 'comp-b1', 'first call')
    addRelationship(model, 'comp-a1', 'comp-b1', 'second call')
    const implied = impliedViewRelationships(model, new Set(['sys-a', 'sys-b']))
    expect(implied).toHaveLength(1)
  })

  it('does not create an implied relationship when an explicit one already connects the pair', () => {
    const model = makeModel()
    model.relationships.push({
      id: 'explicit-system',
      sourceId: 'sys-a',
      destinationId: 'sys-b',
      description: 'explicit',
      tags: ['Relationship'],
      properties: {},
    })
    addRelationship(model, 'comp-a1', 'comp-b1', 'component link')
    const implied = impliedViewRelationships(model, new Set(['sys-a', 'sys-b']))
    expect(implied).toHaveLength(0)
  })

  it('tags implied relationships as "Implied"', () => {
    const model = makeModel()
    addRelationship(model, 'comp-a1', 'comp-b1')
    const implied = impliedViewRelationships(model, new Set(['sys-a', 'sys-b']))
    expect(implied[0].tags).toEqual(['Relationship', 'Implied'])
  })

  it('draws a container-level implied edge when the view mixes granularities', () => {
    const model = makeModel()
    addRelationship(model, 'comp-a1', 'comp-b1', 'calls billing')
    // Container view of System A: c-a1 is visible, System B is visible as the
    // external collaborator (Structurizr shows the whole related system, not
    // its internals, when only one side is scoped to containers).
    const implied = impliedViewRelationships(model, new Set(['c-a1', 'sys-b']))
    expect(implied).toHaveLength(1)
    expect(implied[0]).toMatchObject({ sourceId: 'c-a1', destinationId: 'sys-b' })
  })
})
