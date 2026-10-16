import { describe, expect, it } from 'vitest'
import { parseDSL } from '@/lib/dsl'
import { findLossyConstructs } from './lossyGuard'

/** One case per row of "What c4hero does not round-trip" in
 *  plugins/c4hero/skills/structurizr-dsl/references/dsl-syntax.md. Each is
 *  either refused by the lossy guard or fails to parse; none may pass silently. */
const doc = (model: string, views = 'systemContext a { include * }', top = '') => `workspace "W" {
  ${top}
  model {
    ${model}
  }
  views {
    ${views}
  }
}
`
const A = 'a = softwareSystem "A"'
const AB = 'a = softwareSystem "A"\n    b = softwareSystem "B"'

const ROWS: [string, string, 'guard' | 'parse'][] = [
  ['// comment', doc(`${A} // x`), 'guard'],
  ['# comment', doc(`# x\n${A}`), 'guard'],
  ['/* */ comment', doc(`/* x */\n${A}`), 'guard'],
  ['!include', doc(`!include x.dsl\n${A}`), 'guard'],
  ['!const', doc(A, undefined, '!const N "x"'), 'guard'],
  ['!var', doc(A, undefined, '!var N "x"'), 'guard'],
  ['!identifiers', doc(A, undefined, '!identifiers hierarchical'), 'guard'],
  ['!docs', doc(`a = softwareSystem "A" {\n!docs d\n}`), 'guard'],
  ['!adrs', doc(`a = softwareSystem "A" {\n!adrs d\n}`), 'guard'],
  ['!script', doc(A, undefined, '!script x.groovy'), 'guard'],
  ['!element', doc(`${A}\n!element a {\ndescription "x"\n}`), 'guard'],
  ['!ref', doc(`${A}\n!ref a {\ndescription "x"\n}`), 'guard'],
  ['branding', doc(A, 'systemContext a { include * }\nbranding {\nlogo x.png\n}'), 'guard'],
  ['terminology', doc(A, 'systemContext a { include * }\nterminology {\nperson "P"\n}'), 'guard'],
  ['animation', doc(A, 'systemContext a {\ninclude *\nanimation {\na\n}\n}'), 'guard'],
  ['users', doc(A, undefined, 'configuration {\nusers {\nu read\n}\n}'), 'guard'],
  ['visibility', doc(A, undefined, 'configuration {\nvisibility public\n}'), 'guard'],
  ['theme', doc(A, 'systemContext a { include * }\ntheme default'), 'guard'],
  ['themes', doc(A, 'systemContext a { include * }\nthemes default'), 'guard'],
  ['perspectives', doc(`a = softwareSystem "A" {\nperspectives {\n"Security" "x"\n}\n}`), 'guard'],
  ['workspace-level properties', doc(A, undefined, 'properties {\n"k" "v"\n}'), 'guard'],
  ['this -> x', doc(`a = softwareSystem "A" {\nthis -> b "uses"\n}\nb = softwareSystem "B"`), 'parse'],
  ['-> x shorthand in a softwareSystem', doc(`b = softwareSystem "B"\na = softwareSystem "A" {\n-> b "uses"\n}`), 'guard'],
  ['-> x shorthand in a container', doc(`b = softwareSystem "B"\na = softwareSystem "A" {\nc = container "C" {\n-> b "uses"\n}\n}`), 'guard'],
  ['-> x shorthand in a component', doc(`b = softwareSystem "B"\na = softwareSystem "A" {\nc = container "C" {\nk = component "K" {\n-> b "uses"\n}\n}\n}`), 'guard'],
  ['-> x shorthand in a person', doc(`b = softwareSystem "B"\np = person "P" {\n-> b "uses"\n}\n${A}`), 'guard'],
  ['forward reference', doc(`a -> b "uses"\n${AB.split('\n')[1].trim()}\n${A}`), 'parse'],
  [
    'dotted reference in containerInstance',
    doc(
      `s = softwareSystem "S" {\nc = container "C"\n}\ndeploymentEnvironment "Live" {\nn = deploymentNode "N" {\ncontainerInstance s.c\n}\n}`,
      'systemContext s { include * }',
    ),
    'guard',
  ],
  ['element style width', doc(A, 'styles {\nelement "Element" {\nwidth 300\n}\n}'), 'guard'],
  ['element style height', doc(A, 'styles {\nelement "Element" {\nheight 300\n}\n}'), 'guard'],
  ['element style metadata', doc(A, 'styles {\nelement "Element" {\nmetadata false\n}\n}'), 'guard'],
  ['element style description', doc(A, 'styles {\nelement "Element" {\ndescription false\n}\n}'), 'guard'],
  ['relationship style routing', doc(A, 'styles {\nrelationship "Relationship" {\nrouting Curved\n}\n}'), 'guard'],
  ['relationship style style', doc(A, 'styles {\nrelationship "Relationship" {\nstyle dashed\n}\n}'), 'guard'],
  ['relationship style position', doc(A, 'styles {\nrelationship "Relationship" {\nposition 40\n}\n}'), 'guard'],
  ['relationship style width', doc(A, 'styles {\nrelationship "Relationship" {\nwidth 200\n}\n}'), 'guard'],
  ['view exclude relationship', doc(AB, 'systemLandscape "l" {\ninclude *\nexclude "a -> b"\n}'), 'guard'],
  ['view default', doc(A, 'systemContext a {\ninclude *\ndefault\n}'), 'guard'],
  [
    'dynamic parallel block',
    doc(`${AB}\na -> b "x"`, 'dynamic * "d" {\na -> b "1"\n{\na -> b "2"\n}\n}'),
    'guard',
  ],
  ['unknown keyword', doc(`a = softwareSystem "A" {\nfoo bar\n}`), 'guard'],
]

describe('lossy construct table (dsl-syntax.md)', () => {
  it.each(ROWS)('%s is refused or fails to parse', (_name, dsl, how) => {
    const parsed = parseDSL(dsl)
    if (how === 'parse') {
      expect(parsed.errors.length).toBeGreaterThan(0)
    } else {
      expect(findLossyConstructs(dsl).length).toBeGreaterThan(0)
    }
  })
})
