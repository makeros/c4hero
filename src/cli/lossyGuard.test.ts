import { describe, expect, it } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { createBigBankSample, createMicroservicesTemplate } from '@/lib/templates'
import { findLossyConstructs } from './lossyGuard'

const wrap = (model: string, views = 'systemContext s { include * }', top = '') => `workspace "W" {
    ${top}
    model {
        ${model}
    }
    views {
        ${views}
    }
}
`
const SYSTEM = 's = softwareSystem "S"'

const kinds = (dsl: string) => findLossyConstructs(dsl).map((f) => `${f.line}:${f.kind}`)

describe('findLossyConstructs', () => {
  it('accepts a canonical serialization of the shipped templates', () => {
    for (const make of [createBigBankSample, createMicroservicesTemplate]) {
      expect(findLossyConstructs(serializeDSL(make()))).toEqual([])
    }
  })

  describe('refuses constructs a rewrite drops', () => {
    it.each([
      ['// line comment', wrap(`${SYSTEM} // note`)],
      ['# line comment', wrap(`# note\n${SYSTEM}`)],
      ['/* block comment */', wrap(`/* note */ ${SYSTEM}`)],
      ['multi-line block comment', wrap(`/*\n note\n*/\n${SYSTEM}`)],
      ['!include', wrap(`!include other.dsl\n${SYSTEM}`)],
      ['!const', wrap(SYSTEM, undefined, '!const NAME "x"')],
      ['!var', wrap(SYSTEM, undefined, '!var NAME "x"')],
      ['!identifiers', wrap(SYSTEM, undefined, '!identifiers hierarchical')],
      ['!docs', wrap(`s = softwareSystem "S" {\n!docs docs\n}`)],
      ['!adrs', wrap(`s = softwareSystem "S" {\n!adrs adrs\n}`)],
      ['!script', wrap(SYSTEM, undefined, '!script x.groovy')],
      ['!plugin', wrap(SYSTEM, undefined, '!plugin x')],
      ['branding', wrap(SYSTEM, 'systemContext s { include * }\nbranding {\nlogo x.png\n}')],
      ['terminology', wrap(SYSTEM, 'systemContext s { include * }\nterminology {\nperson "P"\n}')],
      ['animation', wrap(SYSTEM, 'systemContext s {\ninclude *\nanimation {\ns\n}\n}')],
      ['configuration users', wrap(SYSTEM, undefined, 'configuration {\nusers {\na read\n}\n}')],
      ['unknown statement', wrap(`s = softwareSystem "S" {\nfoo bar\n}`)],
      ['hex-looking # comment', wrap(`#todo fix\n${SYSTEM}`)],
    ])('%s', (_name, dsl) => {
      expect(findLossyConstructs(dsl).length).toBeGreaterThan(0)
      // and the loss is real: the construct does not survive a round trip
      const out = serializeDSL(parseDSL(dsl).workspace)
      expect(findLossyConstructs(out)).toEqual([])
      expect(out).not.toEqual(dsl)
    })
  })

  it('reports the line and kind of each finding, in line order', () => {
    const dsl = wrap(`${SYSTEM} // a\n!include x.dsl`)
    expect(kinds(dsl)).toEqual(['4:comment', '5:directive'])
  })

  describe('constructs that round-trip', () => {
    it('#hex colors are not comments', () => {
      const dsl = wrap(SYSTEM, 'systemContext s { include * }\nstyles {\nelement "Software System" {\nbackground #1168bd\ncolor #ffffff\n}\n}')
      expect(findLossyConstructs(dsl)).toEqual([])
      const out = serializeDSL(parseDSL(dsl).workspace)
      expect(out).toContain('#1168bd')
      expect(out).toContain('#ffffff')
    })

    it('// and # inside strings are not comments', () => {
      const dsl = wrap('s = softwareSystem "S" "see http://x.io/a#frag // really"')
      expect(findLossyConstructs(dsl)).toEqual([])
      expect(serializeDSL(parseDSL(dsl).workspace)).toContain('http://x.io/a#frag // really')
    })

    it('!impliedRelationships true', () => {
      const dsl = wrap(SYSTEM, undefined, '!impliedRelationships true')
      expect(findLossyConstructs(dsl)).toEqual([])
      expect(serializeDSL(parseDSL(dsl).workspace)).toContain('!impliedRelationships true')
    })

    it('!impliedRelationships false is the default, so omitting it keeps the meaning', () => {
      const dsl = wrap(SYSTEM, undefined, '!impliedRelationships false')
      expect(findLossyConstructs(dsl)).toEqual([])
      const reparsed = parseDSL(serializeDSL(parseDSL(dsl).workspace)).workspace
      expect(reparsed.impliedRelationships).toBeFalsy()
    })

    it('workspace configuration scope', () => {
      const dsl = wrap(SYSTEM, undefined, 'configuration {\nscope softwaresystem\n}')
      expect(findLossyConstructs(dsl)).toEqual([])
      expect(serializeDSL(parseDSL(dsl).workspace)).toContain('scope softwaresystem')
    })
  })
})
