import type { ModelElement, Relationship, Workspace } from '@/types/model'
import { forEachElementHelper } from '@/store/workspace-helpers'
import { CliFailure } from './errors'

const MAX_SUGGESTIONS = 5

/** Every model element mapped to its parent (undefined for top level). */
export function parentMap(ws: Workspace): Map<string, ModelElement | undefined> {
  const parents = new Map<string, ModelElement | undefined>()
  for (const p of ws.model.people) parents.set(p.id, undefined)
  for (const sys of ws.model.softwareSystems) {
    parents.set(sys.id, undefined)
    for (const c of sys.containers) {
      parents.set(c.id, sys)
      for (const comp of c.components) parents.set(comp.id, c)
    }
  }
  return parents
}

function allElements(ws: Workspace): ModelElement[] {
  const out: ModelElement[] = []
  forEachElementHelper(ws, (el) => {
    out.push(el)
  })
  return out
}

function childrenOf(el: ModelElement): ModelElement[] {
  if (el.type === 'softwareSystem') return el.containers
  if (el.type === 'container') return el.components
  return []
}

/** Classic Levenshtein distance, two-row. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** Up to 5 element ids closest to `ref` by edit distance over ids and names. */
export function suggestElements(ws: Workspace, ref: string): string[] {
  const needle = ref.toLowerCase()
  return allElements(ws)
    .map((el) => ({
      id: el.id,
      score: Math.min(editDistance(needle, el.id.toLowerCase()), editDistance(needle, el.name.toLowerCase())),
    }))
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => s.id)
}

function resolveHierarchical(ws: Workspace, ref: string): ModelElement | undefined {
  const segments = ref.split('.')
  if (segments.length < 2) return undefined
  const top = allElements(ws).filter((el) => el.id === segments[0] && parentMap(ws).get(el.id) === undefined)
  let current: ModelElement | undefined = top[0]
  for (const seg of segments.slice(1)) {
    if (!current) return undefined
    current = childrenOf(current).find((c) => c.id === seg)
  }
  return current
}

/** Resolves `<ref>`: an identifier (flat or hierarchical `a.b.c`), then a unique
 *  exact element name. Throws AMBIGUOUS (with candidate ids) or NOT_FOUND
 *  (with up to 5 closest ids). */
export function resolveElement(ws: Workspace, ref: string): ModelElement {
  const elements = allElements(ws)
  const byId = elements.find((el) => el.id === ref)
  if (byId) return byId
  const hierarchical = resolveHierarchical(ws, ref)
  if (hierarchical) return hierarchical
  const byName = elements.filter((el) => el.name === ref)
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) {
    throw new CliFailure(
      'AMBIGUOUS',
      `'${ref}' matches ${byName.length} elements by name. Use an identifier.`,
      byName.map((el) => el.id),
    )
  }
  throw new CliFailure('NOT_FOUND', `No element '${ref}'.`, suggestElements(ws, ref))
}

function describeRel(r: Relationship): string {
  return r.description ? `${r.id} (${r.description})` : r.id
}

/** Resolves `<relRef>`: a relationship id, or `<srcRef>-><dstRef>` with an
 *  optional `--match` description to pick among parallel edges. */
export function resolveRelationship(ws: Workspace, ref: string, match?: string): Relationship {
  const byId = ws.model.relationships.find((r) => r.id === ref)
  if (byId) return byId
  const arrow = ref.indexOf('->')
  if (arrow === -1) {
    throw new CliFailure('NOT_FOUND', `No relationship '${ref}'.`, ws.model.relationships.slice(0, MAX_SUGGESTIONS).map(describeRel))
  }
  const src = resolveElement(ws, ref.slice(0, arrow).trim())
  const dst = resolveElement(ws, ref.slice(arrow + 2).trim())
  let matches = ws.model.relationships.filter((r) => r.sourceId === src.id && r.destinationId === dst.id)
  if (matches.length === 0) {
    throw new CliFailure('NOT_FOUND', `No relationship from '${src.id}' to '${dst.id}'.`)
  }
  if (match !== undefined) {
    matches = matches.filter((r) => r.description === match)
    if (matches.length === 0) {
      throw new CliFailure('NOT_FOUND', `No relationship from '${src.id}' to '${dst.id}' with description '${match}'.`)
    }
  }
  if (matches.length > 1) {
    throw new CliFailure(
      'AMBIGUOUS',
      `${matches.length} relationships from '${src.id}' to '${dst.id}'. Pass --match <description> or a relationship id.`,
      matches.map(describeRel),
    )
  }
  return matches[0]
}
