/**
 * Tests verifying that `documents` (element/relationship document links)
 * survive the serialize → parse roundtrip via the indexed
 * `c4hero.documents.<n>.path` / `.title` properties convention
 * (src/lib/dsl/documentLinks.ts), the same pattern `status`/`owner` already
 * use (see status-owner-roundtrip.test.ts).
 */
import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import type { Workspace, DocLink } from '@/types/model'

const DOCS_A: DocLink[] = [
  { path: 'architecture/payments-overview.md', title: 'Service overview' },
  { path: 'architecture/payments-adr-003.md', title: 'ADR: event sourcing' },
]

const DOCS_B: DocLink[] = [
  { path: 'runbooks/incident-response.md', title: 'Incident response runbook' },
]

function makeWs(): Workspace {
  return {
    name: 'test',
    model: {
      people: [
        { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {}, documents: DOCS_A },
      ],
      softwareSystems: [
        {
          id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'], properties: {},
          documents: DOCS_B,
          containers: [
            {
              id: 'api', type: 'container', name: 'API', tags: ['Element', 'Container'], properties: {},
              documents: DOCS_A,
              components: [
                { id: 'ctrl', type: 'component', name: 'Controller', tags: ['Element', 'Component'], properties: {}, documents: DOCS_B },
              ],
            },
          ],
        },
      ],
      relationships: [
        {
          id: 'rel-1', sourceId: 'alice', destinationId: 'sys',
          description: 'Uses', tags: ['Relationship'], properties: {},
          documents: DOCS_A,
        },
      ],
      groups: [],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('documents roundtrip', () => {
  it('person documents survive serialize → parse, order preserved', () => {
    const dsl = serializeDSL(makeWs())
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const alice = workspace.model.people.find(p => p.name === 'Alice')
    expect(alice?.documents).toEqual(DOCS_A)
  })

  it('softwareSystem documents survive serialize → parse, order preserved', () => {
    const dsl = serializeDSL(makeWs())
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const app = workspace.model.softwareSystems.find(s => s.name === 'App')
    expect(app?.documents).toEqual(DOCS_B)
  })

  it('container documents survive serialize → parse, order preserved', () => {
    const dsl = serializeDSL(makeWs())
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const api = workspace.model.softwareSystems[0].containers.find(c => c.name === 'API')
    expect(api?.documents).toEqual(DOCS_A)
  })

  it('component documents survive serialize → parse, order preserved', () => {
    const dsl = serializeDSL(makeWs())
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const ctrl = workspace.model.softwareSystems[0].containers[0].components.find(c => c.name === 'Controller')
    expect(ctrl?.documents).toEqual(DOCS_B)
  })

  it('relationship documents survive serialize → parse, order preserved', () => {
    const dsl = serializeDSL(makeWs())
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships.find(r => r.sourceId === 'alice' && r.destinationId === 'sys')
    expect(rel?.documents).toEqual(DOCS_A)
  })

  it('serialize → parse → serialize is stable (byte-identical) for all five kinds', () => {
    const dsl1 = serializeDSL(makeWs())
    const { workspace: parsed, errors } = parseDSL(dsl1)
    expect(errors).toEqual([])
    const dsl2 = serializeDSL(parsed)
    expect(dsl2).toBe(dsl1)
  })

  it('emits indexed c4hero.documents.<n>.path/.title properties', () => {
    const dsl = serializeDSL(makeWs())
    expect(dsl).toContain('"c4hero.documents.0.path" "architecture/payments-overview.md"')
    expect(dsl).toContain('"c4hero.documents.0.title" "Service overview"')
    expect(dsl).toContain('"c4hero.documents.1.path" "architecture/payments-adr-003.md"')
    expect(dsl).toContain('"c4hero.documents.1.title" "ADR: event sourcing"')
  })
})

describe('documents serialization — empty case', () => {
  it('a workspace with no documents set anywhere emits no c4hero.documents.* properties', () => {
    const ws: Workspace = {
      name: 'test',
      model: {
        people: [
          { id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person'], properties: {} },
        ],
        softwareSystems: [
          {
            id: 'sys', type: 'softwareSystem', name: 'App', tags: ['Element', 'Software System'], properties: {},
            containers: [
              {
                id: 'api', type: 'container', name: 'API', tags: ['Element', 'Container'], properties: {},
                components: [
                  { id: 'ctrl', type: 'component', name: 'Controller', tags: ['Element', 'Component'], properties: {} },
                ],
              },
            ],
          },
        ],
        relationships: [
          {
            id: 'rel-1', sourceId: 'alice', destinationId: 'sys',
            description: 'Uses', tags: ['Relationship'], properties: {},
          },
        ],
        groups: [],
      },
      views: {
        systemLandscapeViews: [],
        systemContextViews: [],
        containerViews: [],
        componentViews: [],
        configuration: { styles: { elements: [], relationships: [] } },
      },
    }

    const dsl = serializeDSL(ws)
    expect(dsl).not.toContain('c4hero.documents')

    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    expect(workspace.model.people[0].documents).toBeUndefined()
    expect(workspace.model.softwareSystems[0].documents).toBeUndefined()
    expect(workspace.model.softwareSystems[0].containers[0].documents).toBeUndefined()
    expect(workspace.model.softwareSystems[0].containers[0].components[0].documents).toBeUndefined()
    expect(workspace.model.relationships[0].documents).toBeUndefined()
  })
})

describe('documents parsing — gapped index', () => {
  it('a hand-written fixture with a gap at index 1 hoists only index 0, leaving index 2 in plain properties (element)', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice" {
      properties {
        "c4hero.documents.0.path" "architecture/overview.md"
        "c4hero.documents.0.title" "Overview"
        "c4hero.documents.2.path" "architecture/adr-003.md"
        "c4hero.documents.2.title" "ADR 003"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const alice = workspace.model.people[0]
    expect(alice.documents).toEqual([
      { path: 'architecture/overview.md', title: 'Overview' },
    ])
    expect(alice.properties['c4hero.documents.2.path']).toBe('architecture/adr-003.md')
    expect(alice.properties['c4hero.documents.2.title']).toBe('ADR 003')
    expect(alice.properties['c4hero.documents.1.path']).toBeUndefined()
    expect(alice.properties['c4hero.documents.1.title']).toBeUndefined()
  })

  it('a hand-written fixture with a gap at index 1 hoists only index 0, leaving index 2 in plain properties (relationship)', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice"
    api = softwareSystem "API"
    alice -> api "Uses" {
      properties {
        "c4hero.documents.0.path" "runbooks/incident.md"
        "c4hero.documents.0.title" "Incident runbook"
        "c4hero.documents.2.path" "runbooks/escalation.md"
        "c4hero.documents.2.title" "Escalation"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const rel = workspace.model.relationships[0]
    expect(rel.documents).toEqual([
      { path: 'runbooks/incident.md', title: 'Incident runbook' },
    ])
    expect(rel.properties['c4hero.documents.2.path']).toBe('runbooks/escalation.md')
    expect(rel.properties['c4hero.documents.2.title']).toBe('Escalation')
    expect(rel.properties['c4hero.documents.1.path']).toBeUndefined()
    expect(rel.properties['c4hero.documents.1.title']).toBeUndefined()
  })
})

// Regression tests for code-review finding m2: a hand-written DSL can leave
// a non-hoisted "orphaned" c4hero.documents.* property behind (an incomplete
// entry, or one orphaned by a gap). When the user then edits `documents`
// through the app (simulated here by replacing the `documents` array, as
// `updateElement`/`updateRelationship` do), the serializer must not layer
// freshly derived keys on top of the stale orphan — it must clear the whole
// `c4hero.documents.*` namespace first. See serializer.ts's
// `elementProperties`/`relationshipProperties` comments.
describe('documents serialization — orphaned leftover properties (finding m2)', () => {
  it('a partial leftover (.1.path with no .1.title) does not get silently clobbered or resurrected after the user adds a new document', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice" {
      properties {
        "c4hero.documents.0.path" "architecture/overview.md"
        "c4hero.documents.0.title" "Overview"
        "c4hero.documents.1.path" "orphan.md"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const alice = workspace.model.people[0]
    // Sanity-check the starting shape: only index 0 hoisted, the partial
    // entry at index 1 left as a plain property.
    expect(alice.documents).toEqual([
      { path: 'architecture/overview.md', title: 'Overview' },
    ])
    expect(alice.properties['c4hero.documents.1.path']).toBe('orphan.md')

    // Simulate the user adding document "B" through the inspector — a
    // whole-array replace via updateElement, exactly like the store does.
    const docB: DocLink = { path: 'runbooks/b.md', title: 'B' }
    alice.documents = [...(alice.documents ?? []), docB]

    const dsl2 = serializeDSL(workspace)

    // The orphan's value must not survive anywhere in the output under a
    // key that doesn't correspond to an actual entry in the final
    // `documents` array — it must be fully replaced, not layered over.
    expect(dsl2).not.toContain('orphan.md')

    const { workspace: reparsed, errors: errors2 } = parseDSL(dsl2)
    expect(errors2).toEqual([])
    const aliceReparsed = reparsed.model.people[0]
    // Exactly the two documents the user actually has — no orphan survives,
    // and no accidental clobbering produced a corrupted entry.
    expect(aliceReparsed.documents).toEqual([
      { path: 'architecture/overview.md', title: 'Overview' },
      docB,
    ])
    expect(aliceReparsed.properties['c4hero.documents.1.path']).toBeUndefined()
  })

  it('a gapped leftover (.2.* orphaned by a missing .1.*) does not silently re-hoist into a phantom third document after the user adds a new one and reloads twice', () => {
    const dsl = `
workspace {
  model {
    alice = person "Alice" {
      properties {
        "c4hero.documents.0.path" "architecture/overview.md"
        "c4hero.documents.0.title" "Overview"
        "c4hero.documents.2.path" "architecture/adr-003.md"
        "c4hero.documents.2.title" "ADR 003"
      }
    }
  }
  views {}
}
`
    const { workspace, errors } = parseDSL(dsl)
    expect(errors).toEqual([])
    const alice = workspace.model.people[0]
    expect(alice.documents).toEqual([
      { path: 'architecture/overview.md', title: 'Overview' },
    ])
    expect(alice.properties['c4hero.documents.2.path']).toBe('architecture/adr-003.md')

    // User adds document "B" through the inspector — this would land at
    // index 1 under the old layer-on-top behavior, filling the gap.
    const docB: DocLink = { path: 'runbooks/b.md', title: 'B' }
    alice.documents = [...(alice.documents ?? []), docB]

    const dslAfterFirstSave = serializeDSL(workspace)
    const { workspace: reloadedOnce, errors: errorsOnce } = parseDSL(dslAfterFirstSave)
    expect(errorsOnce).toEqual([])
    const aliceReloadedOnce = reloadedOnce.model.people[0]

    // No phantom third document: exactly the two the user actually has.
    expect(aliceReloadedOnce.documents).toEqual([
      { path: 'architecture/overview.md', title: 'Overview' },
      docB,
    ])
    expect(aliceReloadedOnce.documents).toHaveLength(2)

    // Second reload (serialize → parse again) stays stable — the orphaned
    // ADR entry must not resurface now that index 1 is filled.
    const dslAfterSecondSave = serializeDSL(reloadedOnce)
    const { workspace: reloadedTwice, errors: errorsTwice } = parseDSL(dslAfterSecondSave)
    expect(errorsTwice).toEqual([])
    const aliceReloadedTwice = reloadedTwice.model.people[0]
    expect(aliceReloadedTwice.documents).toEqual([
      { path: 'architecture/overview.md', title: 'Overview' },
      docB,
    ])
    expect(aliceReloadedTwice.documents).toHaveLength(2)
    expect(dslAfterSecondSave).toBe(dslAfterFirstSave)
  })
})

describe('document links on deployment elements', () => {
  const DSL = `workspace {
    model {
        sys = softwareSystem "App"
        prod = deploymentEnvironment "Production" {
            aws = deploymentNode "AWS" {
                properties {
                    "c4hero.documents.0.path" "infra/aws.md"
                    "c4hero.documents.0.title" "AWS account"
                }
                lb = infrastructureNode "Load Balancer" {
                    properties {
                        "c4hero.documents.0.path" "runbooks/lb.md"
                        "c4hero.documents.0.title" "LB runbook"
                        "team" "platform"
                    }
                }
            }
        }
    }
}
`

  it('hoists documents on deployment and infrastructure nodes', () => {
    const { workspace, errors } = parseDSL(DSL)
    expect(errors).toEqual([])
    const node = workspace.model.deploymentEnvironments[0].deploymentNodes[0]
    expect(node.documents).toEqual([{ path: 'infra/aws.md', title: 'AWS account' }])
    expect(node.properties).toEqual({})
    const infra = node.infrastructureNodes[0]
    expect(infra.documents).toEqual([{ path: 'runbooks/lb.md', title: 'LB runbook' }])
    expect(infra.properties).toEqual({ team: 'platform' })
  })

  it('serializes edited documents and stays stable across reloads', () => {
    const { workspace } = parseDSL(DSL)
    const node = workspace.model.deploymentEnvironments[0].deploymentNodes[0]
    node.documents = [...node.documents!, { path: 'infra/network.md', title: 'Network' }]
    node.infrastructureNodes[0].documents = undefined

    const once = serializeDSL(workspace)
    const { workspace: reloaded, errors } = parseDSL(once)
    expect(errors).toEqual([])
    const reNode = reloaded.model.deploymentEnvironments[0].deploymentNodes[0]
    expect(reNode.documents).toEqual([
      { path: 'infra/aws.md', title: 'AWS account' },
      { path: 'infra/network.md', title: 'Network' },
    ])
    expect(reNode.infrastructureNodes[0].documents).toBeUndefined()
    expect(reNode.infrastructureNodes[0].properties).toEqual({ team: 'platform' })
    expect(serializeDSL(reloaded)).toBe(once)
  })
})
