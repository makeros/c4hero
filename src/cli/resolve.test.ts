import { describe, expect, it } from 'vitest'
import { createBigBankSample } from '@/lib/templates'
import { CliFailure } from './errors'
import { resolveElement, resolveRelationship } from './resolve'

const ws = createBigBankSample()

function failure(fn: () => unknown): CliFailure {
  try {
    fn()
  } catch (e) {
    if (e instanceof CliFailure) return e
    throw e
  }
  throw new Error('expected CliFailure')
}

describe('resolveElement', () => {
  const system = ws.model.softwareSystems.find((s) => s.containers.some((c) => c.components.length > 0))!
  const container = system.containers.find((c) => c.components.length > 0)!
  const component = container.components[0]

  it('resolves a flat id, a hierarchical id and a unique name', () => {
    expect(resolveElement(ws, container.id)).toBe(container)
    expect(resolveElement(ws, `${system.id}.${container.id}`)).toBe(container)
    expect(resolveElement(ws, `${system.id}.${container.id}.${component.id}`)).toBe(component)
    expect(resolveElement(ws, container.name)).toBe(container)
  })

  it('rejects a hierarchical path whose segments are not parent and child', () => {
    expect(failure(() => resolveElement(ws, `${component.id}.${container.id}`)).code).toBe('NOT_FOUND')
  })

  it('reports AMBIGUOUS with candidates for a duplicated name', () => {
    const copy = structuredClone(ws)
    copy.model.people.push({ ...copy.model.people[0], id: 'dupPerson' })
    const err = failure(() => resolveElement(copy, copy.model.people[0].name))
    expect(err.code).toBe('AMBIGUOUS')
    expect(err.candidates).toEqual([copy.model.people[0].id, 'dupPerson'])
  })

  it('reports NOT_FOUND with at most 5 closest matches', () => {
    const err = failure(() => resolveElement(ws, `${container.id}x`))
    expect(err.code).toBe('NOT_FOUND')
    expect(err.candidates!.length).toBeLessThanOrEqual(5)
    expect(err.candidates![0]).toBe(container.id)
  })
})

describe('resolveRelationship', () => {
  const rel = ws.model.relationships[0]

  it('resolves by id and by src->dst', () => {
    expect(resolveRelationship(ws, rel.id)).toBe(rel)
    const parallel = ws.model.relationships.filter((r) => r.sourceId === rel.sourceId && r.destinationId === rel.destinationId)
    if (parallel.length === 1) expect(resolveRelationship(ws, `${rel.sourceId}->${rel.destinationId}`)).toBe(rel)
  })

  it('disambiguates parallel edges with a match description, else AMBIGUOUS', () => {
    const copy = structuredClone(ws)
    const first = copy.model.relationships[0]
    copy.model.relationships.push({ ...first, id: 'parallel', description: 'other' })
    first.description = 'one'
    const ref = `${first.sourceId}->${first.destinationId}`
    expect(failure(() => resolveRelationship(copy, ref)).code).toBe('AMBIGUOUS')
    expect(resolveRelationship(copy, ref, 'other').id).toBe('parallel')
  })

  it('reports NOT_FOUND for an unknown id or missing edge', () => {
    expect(failure(() => resolveRelationship(ws, 'nope')).code).toBe('NOT_FOUND')
    expect(failure(() => resolveRelationship(ws, `${rel.destinationId}->${rel.sourceId}`)).code).toBe('NOT_FOUND')
  })
})
