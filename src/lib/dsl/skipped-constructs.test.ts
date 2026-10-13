import { describe, expect, it } from 'vitest'
import { parseDSL } from '@/lib/dsl'

const wrap = (model: string, views = 'systemLandscape "l" {\n include *\n}') =>
  `workspace "W" {\n model {\n${model}\n }\n views {\n${views}\n }\n}`

const BASE_MODEL = `u = person "U"\ns = softwareSystem "S" {\n api = container "API"\n}\nu -> s "Uses"`

function skippedTexts(source: string): string[] {
  const { errors, skipped } = parseDSL(source)
  expect(errors).toEqual([])
  return skipped.map((k) => k.text)
}

describe('skipped constructs', () => {
  it('records nothing for a fully modelled workspace', () => {
    const src = wrap(
      BASE_MODEL,
      `systemContext s "c" {
 include *
 autoLayout
}
styles {
 element "Person" {
  background #ffffff
  fontSize 20
 }
 relationship "Relationship" {
  dashed true
  thickness 2
 }
}`,
    )
    expect(skippedTexts(src)).toEqual([])
  })

  it('records `-> x` shorthand inside person and component blocks', () => {
    const person = wrap(`s = softwareSystem "S"\nu = person "U" {\n -> s "uses"\n}`)
    expect(skippedTexts(person)).toEqual(['-> s "uses"'])
    const component = wrap(
      `s = softwareSystem "S" {\n api = container "API" {\n  a = component "A"\n  b = component "B" {\n   -> a "x"\n  }\n }\n}`,
    )
    expect(skippedTexts(component)).toEqual(['-> a "x"'])
  })

  it('records element style properties the model has no field for', () => {
    const src = wrap(
      BASE_MODEL,
      `styles {
 element "Person" {
  width 300
  height 200
  metadata false
  description false
  shape Person
 }
}`,
    )
    expect(skippedTexts(src)).toEqual(['width 300', 'height 200', 'metadata false', 'description false'])
  })

  it('records relationship style routing, style, position and width', () => {
    const src = wrap(
      BASE_MODEL,
      `styles {
 relationship "Relationship" {
  routing Curved
  style dashed
  position 40
  width 200
  thickness 2
 }
}`,
    )
    expect(skippedTexts(src)).toEqual(['routing Curved', 'style dashed', 'position 40', 'width 200'])
  })

  it('records relationship exclusions and the view `default` flag', () => {
    const src = wrap(
      BASE_MODEL,
      `systemContext s "c" {
 include *
 exclude "u -> s"
 default
}`,
    )
    expect(skippedTexts(src)).toEqual(['exclude "u -> s"', 'default'])
  })

  it('records dynamic-view parallel blocks without changing the parsed steps', () => {
    const views = `dynamic s "d" {
 u -> s "a"
 {
  u -> s "b"
 }
 autoLayout
}`
    const withBlock = parseDSL(wrap(BASE_MODEL, views))
    expect(withBlock.skipped.map((k) => k.text)).toEqual(['{ ... } (parallel steps)'])
    const flat = parseDSL(wrap(BASE_MODEL, views.replace(/^ \{\n/m, '').replace(/^ \}\n/m, '')))
    const stepsOf = (r: typeof withBlock) => r.workspace.views?.dynamicViews?.[0]?.relationships.map((x) => [x.sourceId, x.destinationId, x.description])
    expect(stepsOf(withBlock)).toEqual(stepsOf(flat))
    expect(stepsOf(withBlock)).toHaveLength(2)
  })

  it('does not change the parsed model', () => {
    const src = wrap(
      `u = person "U" {\n -> s\n}\ns = softwareSystem "S"`,
      `styles {\n element "Person" {\n  width 10\n  background #fff\n }\n}`,
    )
    const { workspace } = parseDSL(src)
    expect(workspace.model.people.map((p) => p.id)).toEqual(['u'])
    expect(workspace.model.relationships).toEqual([])
    expect(workspace.views.configuration.styles.elements).toEqual([{ tag: 'Person', background: '#fff' }])
  })
})
