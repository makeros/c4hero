import { describe, expect, it } from 'vitest'
import {
  CHEAT_DECISIONS,
  CHEAT_ELEMENTS,
  CHEAT_VIEWS,
  elementViewMatrix,
  type CheatElementKind,
} from './cheatSheet'

const EXPECTED_VIEW_KEYS = [
  'systemLandscape',
  'systemContext',
  'container',
  'component',
  'dynamic',
  'deployment',
  'filtered',
  'custom',
  'image',
]

const KNOWN_KINDS = new Set(CHEAT_ELEMENTS.map((e) => e.kind))

describe('CHEAT_VIEWS', () => {
  it('has exactly the 9 expected view keys', () => {
    expect(CHEAT_VIEWS).toHaveLength(9)
    expect(CHEAT_VIEWS.map((v) => v.key).sort()).toEqual([...EXPECTED_VIEW_KEYS].sort())
  })

  it('marks only filtered, custom and image as unsupported', () => {
    const unsupported = CHEAT_VIEWS.filter((v) => !v.supportedInC4hero).map((v) => v.key).sort()
    expect(unsupported).toEqual(['custom', 'filtered', 'image'].sort())
  })

  it('references only known element kinds in allowed and scopes[].allowed', () => {
    for (const view of CHEAT_VIEWS) {
      for (const kind of view.allowed) {
        expect(KNOWN_KINDS.has(kind), `${view.key}.allowed has unknown kind ${kind}`).toBe(true)
      }
      for (const scope of view.scopes ?? []) {
        for (const kind of scope.allowed) {
          expect(KNOWN_KINDS.has(kind), `${view.key} scope ${scope.scope} has unknown kind ${kind}`).toBe(true)
        }
      }
    }
  })

  it('every diagram node kind is allowed on its view (image has no nodes)', () => {
    for (const view of CHEAT_VIEWS) {
      const { nodes, edges } = view.example.diagram
      if (view.key === 'image') {
        expect(nodes).toEqual([])
      }
      for (const node of nodes) {
        expect(view.allowed.includes(node.kind), `${view.key} node ${node.id} has disallowed kind ${node.kind}`).toBe(true)
      }

      const ids = new Set(nodes.map((n) => n.id))
      for (const edge of edges) {
        expect(ids.has(edge.from), `${view.key} edge references unknown node ${edge.from}`).toBe(true)
        expect(ids.has(edge.to), `${view.key} edge references unknown node ${edge.to}`).toBe(true)
      }
    }
  })
})

describe('CHEAT_ELEMENTS', () => {
  it('has all 11 kinds', () => {
    expect(CHEAT_ELEMENTS).toHaveLength(11)
  })

  it('gives every element at least 6 examples', () => {
    for (const el of CHEAT_ELEMENTS) {
      expect(el.examples.length, `${el.kind} has too few examples`).toBeGreaterThanOrEqual(6)
    }
  })
})

describe('CHEAT_DECISIONS', () => {
  it('has at least 25 entries', () => {
    expect(CHEAT_DECISIONS.length).toBeGreaterThanOrEqual(25)
  })

  it('answers with a known kind or not-modeled', () => {
    for (const decision of CHEAT_DECISIONS) {
      const valid = decision.answer === 'not-modeled' || KNOWN_KINDS.has(decision.answer as CheatElementKind)
      expect(valid, `"${decision.thing}" has an unknown answer: ${decision.answer}`).toBe(true)
    }
  })
})

describe('elementViewMatrix', () => {
  const matrix = elementViewMatrix()

  it('covers every kind and every view', () => {
    expect(Object.keys(matrix).sort()).toEqual([...KNOWN_KINDS].sort())
    for (const kind of KNOWN_KINDS) {
      expect(Object.keys(matrix[kind]).sort()).toEqual([...EXPECTED_VIEW_KEYS].sort())
    }
  })

  it('component is not allowed on the container view', () => {
    expect(matrix.component.container).toBe('no')
  })

  it('component is scoped on the dynamic view', () => {
    expect(matrix.component.dynamic).toBe('scoped')
  })

  it('containerInstance is fully allowed on the deployment view', () => {
    expect(matrix.containerInstance.deployment).toBe('yes')
  })

  it('relationship is allowed everywhere except image', () => {
    for (const view of CHEAT_VIEWS) {
      expect(matrix.relationship[view.key]).toBe(view.key === 'image' ? 'no' : 'yes')
    }
  })

  it('group is allowed on every static view, deployment and filtered, nowhere else', () => {
    expect(matrix.group.systemLandscape).toBe('yes')
    expect(matrix.group.systemContext).toBe('yes')
    expect(matrix.group.container).toBe('yes')
    expect(matrix.group.component).toBe('yes')
    expect(matrix.group.deployment).toBe('yes')
    expect(matrix.group.filtered).toBe('yes')
    expect(matrix.group.dynamic).toBe('no')
    expect(matrix.group.custom).toBe('no')
    expect(matrix.group.image).toBe('no')
  })
})
