/**
 * Soundness property of the lossy-file guard (`findLossyConstructs`): when it
 * reports nothing, a parse -> serialize -> parse round trip must yield the same
 * model as the original parse. A violation means a CLI rewrite would silently
 * drop content.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findLossyConstructs } from '@/cli/lossyGuard'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { lex } from '@/lib/dsl/lexer'

const FIXTURES = path.join(__dirname, '__fixtures__')
const SYNTAX_DOC = path.resolve(__dirname, '../../../plugins/c4hero/skills/structurizr-dsl/references/dsl-syntax.md')

/** Round-trip losses the guard does not report. Aim: empty. */
const KNOWN_UNGUARDED: Record<string, string> = {}

/** Words whose absence from the output is not a loss: includes and excludes are
 *  resolved to explicit element lists at parse time, `tags "A,B"` is re-emitted
 *  as the positional tags argument, and `tb` is the default layout direction. */
const RESOLVED_AT_PARSE = new Set(['include', 'exclude', 'element', 'tag', 'tags', 'tb'])

const BASE = (views: string, model = '') => `workspace "W" {
  model {
    u = person "User" "d"
    s = softwareSystem "S" "d" {
      api = container "API" "d" "Node" {
        c1 = component "C1" "d" "TS"
        c2 = component "C2" "d" "TS"
      }
    }
    ${model}
    u -> s "Uses"
    u -> api "Calls"
    c1 -> c2 "Uses"
  }
  views {
    ${views}
  }
}`

const CASES: Record<string, string> = {
  'element style width/height/metadata/description': BASE(
    `systemContext s "ctx" { include * autoLayout }
     styles { element "Person" { width 300 height 200 metadata false description false } }`,
  ),
  'element style fontSize/opacity/stroke': BASE(
    `systemContext s "ctx" { include * autoLayout }
     styles { element "Person" { fontSize 30 opacity 50 stroke #ff0000 strokeWidth 3 icon "x.png" border dashed } }`,
  ),
  'relationship style routing/style/position/width': BASE(
    `systemContext s "ctx" { include * autoLayout }
     styles { relationship "Relationship" { routing Curved style dashed position 40 width 200 thickness 2 } }`,
  ),
  'relationship style dashed/fontSize/opacity': BASE(
    `systemContext s "ctx" { include * autoLayout }
     styles { relationship "Relationship" { dashed true fontSize 20 opacity 80 color #00ff00 } }`,
  ),
  'view exclude relationship': BASE(`systemContext s "ctx" {
      include *
      exclude "u -> s"
      autoLayout
    }`),
  'view exclude relationship unquoted': BASE(`container s "c" { include * exclude u -> api }`),
  'view exclude element': BASE(`container s "c" { include * exclude u }`),
  'dynamic parallel block': BASE(
    `dynamic s "dyn" { u -> s "a"  { s -> api "b" } { s -> api "c" } autoLayout }`,
  ),
  'named relationship': BASE('systemContext s "ctx" { include * }', 'r1 = u -> s "Named"'),
  'shorthand inside person': `workspace "W" { model { s = softwareSystem "S" "d"
    u = person "U" "d" { -> s "uses" } } views { systemLandscape "l" { include * } } }`,
  'shorthand inside component': BASE('systemLandscape "l" { include * }').replace(
    'c2 = component "C2" "d" "TS"',
    'c2 = component "C2" "d" "TS" { -> c1 "x" }',
  ),
  'relationship block props': BASE('systemLandscape "l" { include * }', 'u -> s "x" { tags "A" url "http://x" }'),
  'view-level properties': BASE('systemLandscape "l" { include * properties { "k" "v" } }'),
  'view animation': BASE('systemContext s "ctx" { include * animation { u } }'),
  'view default/title/description': BASE(`systemContext s "ctx" "desc" {
      title "T"
      include *
      default
    }`),
  'filtered view': BASE('filtered "ctx" include "Element"'),
  'custom view': BASE('custom "cv" { include * title "T" }'),
  'image view': BASE('image s "img" { plantuml "x.puml" }'),
  'view autoLayout rank': BASE('systemContext s "ctx" { include * autoLayout lr 300 100 }'),
  'include with expression': BASE('container s "c" { include u api->* }'),
  'include element.tag': BASE('container s "c" { include element.tag==Person }'),
  'dynamic view with extra': BASE('dynamic s "d" { u -> api "x" api -> s "y" title "T" }'),
  'tags/url/properties/perspectives': BASE('systemLandscape "l" { include * }')
    .replace('u = person "User" "d"', 'u = person "User" "d" { tags "X" url "http://u" properties { "a" "b" } perspectives { "p" "d" } }'),
  'deployment': `workspace "W" { model {
    s = softwareSystem "S" { api = container "API" }
    live = deploymentEnvironment "Live" {
      dn = deploymentNode "N" "d" "Tech" 2 { ci = containerInstance api infrastructureNode "LB" "d" "nginx" }
    } }
    views { deployment s "Live" "dep" { include * } } }`,
  'configuration/theme/branding': BASE('systemLandscape "l" { include * }\n theme default\n branding { logo "x" }'),
  'scope + visibility': `workspace "W" { configuration { scope landscape visibility public } model { s = softwareSystem "S" } views { systemLandscape "l" { include * } } }`,
  'group': `workspace "W" { model { group "G" { a = softwareSystem "A" } } views { systemLandscape "l" { include * } } }`,
  'element extra keywords': BASE('systemLandscape "l" { include * }')
    .replace('api = container "API" "d" "Node" {', 'api = container "API" "d" "Node" {\n description "x"\n technology "y"\n location "z"'),
  'workspace description + properties': `workspace "W" "desc" { properties { "a" "b" } model { s = softwareSystem "S" } views { systemLandscape "l" { include * } } }`,
  'multiline strings / unicode': BASE('systemLandscape "l" { include * }', 's2 = softwareSystem "Zażółć \\"q\\"" "line"'),
  'impliedRelationships': `workspace "W" { !impliedRelationships false model { s = softwareSystem "S" } views { systemLandscape "l" { include * } } }`,
}

function corpus(): Record<string, string> {
  const out: Record<string, string> = { ...CASES }
  for (const f of readdirSync(FIXTURES).filter((n) => n.endsWith('.dsl'))) {
    out[`fixture ${f}`] = readFileSync(path.join(FIXTURES, f), 'utf8')
  }
  const md = readFileSync(SYNTAX_DOC, 'utf8')
  const re = /^```dsl[ \t]*\n([\s\S]*?)^```[ \t]*$/gm
  let i = 0
  for (let m; (m = re.exec(md)); ) out[`dsl-syntax.md block #${++i}`] = m[1]
  return out
}

/** Model + views + styles, minus generated relationship ids. */
function normalize(source: string): string {
  const { workspace } = parseDSL(source)
  const ws = structuredClone(workspace) as unknown as { model: { relationships: { id?: string }[]; deploymentEnvironments?: { id: string; name: string }[] } }
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip)
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) o[k] = strip(val)
      return o
    }
    return v
  }
  // The serializer writes `deploymentEnvironment "Name"` without a variable and no
  // DSL construct references one, so the parser mints a fresh id on every parse.
  for (const env of ws.model.deploymentEnvironments ?? []) env.id = env.name
  const rels = ws.model.relationships as { id?: string }[]
  const ids = new Map(rels.map((r, i) => [r.id, `r${i}`]))
  const json = JSON.stringify(strip(ws), (_k, v) => (typeof v === 'string' && ids.has(v) ? ids.get(v) : v), 1)
  return json
}

/** Distinct content tokens (strings, numbers, words) of a source, lowercased. */
function contentTokens(source: string): Set<string> {
  const out = new Set<string>()
  for (const t of lex(source).tokens) {
    if (t.type === 'STRING' || t.type === 'NUMBER' || t.type === 'IDENTIFIER' || t.type === 'KEYWORD') {
      out.add(t.value.toLowerCase())
    }
  }
  return out
}

describe('lossy guard soundness', () => {
  for (const [name, source] of Object.entries(corpus())) {
    it(`no findings implies a lossless round trip: ${name}`, () => {
      const parsed = parseDSL(source)
      if (parsed.errors.length > 0) return // the CLI refuses unparseable files outright
      if (findLossyConstructs(source).length > 0) return
      if (name in KNOWN_UNGUARDED) return
      const again = serializeDSL(parsed.workspace)
      expect(normalize(again), `serialized:\n${again}`).toEqual(normalize(source))
    })

    // A construct the parser accepts but never stores is invisible to the model
    // comparison above, so also require every content token of the source to
    // survive into the serialized output.
    it(`no findings implies no content token is lost: ${name}`, () => {
      const parsed = parseDSL(source)
      if (parsed.errors.length > 0) return
      if (findLossyConstructs(source).length > 0) return
      if (name in KNOWN_UNGUARDED) return
      const kept = contentTokens(serializeDSL(parsed.workspace))
      const lost = [...contentTokens(source)].filter((t) => !kept.has(t) && !RESOLVED_AT_PARSE.has(t))
      expect(lost.join(" | "), name).toEqual("")
    })
  }
})
