import { describe, it, expect } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { renameElementId, rekeySidecar, deriveIdentifier } from './renameIdentifier'
import type { SidecarData } from './sidecar'
import type { Workspace } from '@/types/model'

const DSL = `
workspace "Demo" {
    model {
        customer = person "Customer"
        group "Core" {
            shop = softwareSystem "Shop" {
                webApp = container "Web App" {
                    cart = component "Cart"
                }
                db = container "DB"
                webApp -> db "Reads"
            }
        }
        mail = softwareSystem "Mail"
        customer -> webApp "Browses"
        cart -> mail "Sends"
        deploymentEnvironment "Live" {
            deploymentNode "Server" {
                liveApp = containerInstance webApp
                liveMail = softwareSystemInstance mail
            }
        }
    }
    views {
        systemContext shop "Ctx" {
            include *
        }
        container shop "Cont" {
            include customer webApp db
        }
        component webApp "Comp" {
            include cart
        }
        dynamic shop "Dyn" {
            customer -> webApp "Browses"
            webApp -> db "Reads"
        }
        deployment shop "Live" "Dep" {
            include *
        }
    }
}
`

function load(): Workspace {
  const { workspace, errors } = parseDSL(DSL)
  expect(errors).toEqual([])
  return workspace
}

describe('renameElementId', () => {
  it.each(['webApp', 'shop', 'cart', 'customer'])('leaves no trace of %s in the DSL', oldId => {
    const ws = load()
    expect(serializeDSL(ws)).toContain(oldId)
    renameElementId(ws, oldId, 'zzRenamed')
    const dsl = serializeDSL(ws)
    expect(dsl).not.toMatch(new RegExp(`\\b${oldId}\\b`))
    expect(dsl).toContain('zzRenamed')
    // roundtrip stays stable
    const again = parseDSL(dsl)
    expect(again.errors).toEqual([])
    expect(serializeDSL(again.workspace)).toBe(dsl)
  })

  it('rewrites groups, views, steps and instances structurally', () => {
    const ws = load()
    renameElementId(ws, 'webApp', 'frontend')
    renameElementId(ws, 'shop', 'store')
    expect(ws.model.groups[0].elementIds).toContain('store')
    expect(ws.views.componentViews[0].containerId).toBe('frontend')
    expect(ws.views.containerViews[0].softwareSystemId).toBe('store')
    const step = ws.views.dynamicViews[0].relationships[0]
    expect(step.destinationId).toBe('frontend')
    const node = ws.model.deploymentEnvironments[0].deploymentNodes[0]
    expect(node.containerInstances[0].containerId).toBe('frontend')
  })

  it('renames a deployment instance id', () => {
    const ws = load()
    renameElementId(ws, 'liveApp', 'prodApp')
    expect(serializeDSL(ws)).not.toMatch(/\bliveApp\b/)
  })

  it('rejects missing, taken and invalid identifiers without mutating', () => {
    const ws = load()
    const before = serializeDSL(ws)
    expect(() => renameElementId(ws, 'nope', 'x')).toThrow(/not found/)
    expect(() => renameElementId(ws, 'shop', 'mail')).toThrow(/already in use/)
    expect(() => renameElementId(ws, 'shop', '1bad')).toThrow(/Invalid/)
    expect(() => renameElementId(ws, 'shop', 'has-dash')).toThrow(/Invalid/)
    expect(serializeDSL(ws)).toBe(before)
  })

  it.each(['views', 'model', 'workspace', 'this', 'element', 'group', 'container', 'styles'])(
    'rejects the DSL keyword "%s" as a new id',
    (keyword) => {
      const ws = load()
      const before = serializeDSL(ws)
      expect(() => renameElementId(ws, 'shop', keyword)).toThrow(/Invalid identifier.*keyword/)
      expect(serializeDSL(ws)).toBe(before)
    },
  )

  it('is a no-op when old and new match', () => {
    const ws = load()
    const before = serializeDSL(ws)
    renameElementId(ws, 'shop', 'shop')
    expect(serializeDSL(ws)).toBe(before)
  })
})

describe('rekeySidecar', () => {
  const sidecar: SidecarData = {
    version: 1,
    elements: { a: { owner: 'x' }, gone: { owner: 'y' } },
    relationships: { r1: { lineStyle: 'Straight' } },
    views: {
      v1: {
        locked: true,
        elements: { a: { x: 1, y: 2, pinned: true, locked: true }, gone: { x: 3, y: 4, pinned: true } },
      },
      v2: { elements: { gone: { x: 0, y: 0, pinned: true } } },
    },
  }

  it('moves positions and locks to the new id and prunes removed ids', () => {
    const out = rekeySidecar(sidecar, new Map([['a', 'b']]), new Set(['gone']))
    expect(out.elements).toEqual({ b: { owner: 'x' } })
    expect(out.relationships).toEqual({ r1: { lineStyle: 'Straight' } })
    expect(out.views).toEqual({
      v1: { locked: true, elements: { b: { x: 1, y: 2, pinned: true, locked: true } } },
    })
  })

  it('does not mutate the input', () => {
    const copy = structuredClone(sidecar)
    rekeySidecar(sidecar, new Map([['a', 'b']]), new Set(['gone']))
    expect(sidecar).toEqual(copy)
  })
})

describe('deriveIdentifier', () => {
  it.each([
    ['Order Service', 'orderService'],
    ['API Gateway', 'apiGateway'],
    ['Café Ñandú-DB', 'cafeNanduDb'],
    ['3D Renderer', 'e3dRenderer'],
    ['  ', 'item'],
    ['---', 'item'],
    ['a_b c', 'aBC'],
    ['Model', 'model2'],
    ['Element', 'element2'],
  ])('%s -> %s', (name, expected) => {
    expect(deriveIdentifier(name, new Set())).toBe(expected)
  })

  it('disambiguates against taken identifiers', () => {
    expect(deriveIdentifier('Shop', new Set(['shop', 'shop2']))).toBe('shop3')
  })

  it('produces identifiers the serializer emits unchanged', () => {
    const names = ['Order Service', '3D Renderer', 'Café', '!!!', 'Model', 'Views']
    const taken = new Set<string>()
    const ws = load()
    ws.model.people = []
    ws.model.softwareSystems = []
    ws.model.relationships = []
    ws.model.groups = []
    ws.model.deploymentEnvironments = []
    for (const k of Object.keys(ws.views) as (keyof Workspace['views'])[]) {
      if (k !== 'configuration') (ws.views[k] as unknown[]) = []
    }
    const ids: string[] = []
    for (const name of names) {
      const id = deriveIdentifier(name, taken)
      taken.add(id)
      ids.push(id)
      ws.model.people.push({ id, type: 'person', name, tags: ['Element', 'Person'], properties: {} })
    }
    const dsl = serializeDSL(ws)
    for (const id of ids) expect(dsl).toContain(`${id} = person`)
    const parsed = parseDSL(dsl)
    expect(parsed.errors).toEqual([])
    expect(parsed.workspace.model.people.map(p => p.id)).toEqual(ids)
  })
})
