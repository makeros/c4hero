import type { ContainerInstance, DeploymentNode, SoftwareSystemInstance, Workspace } from '@/types/model'
import type { SidecarData } from '@/lib/sidecar'
import { lex } from '@/lib/dsl/lexer'
import { forEachView } from '@/store/workspace-helpers'

/** The identifier shape the DSL serializer emits unchanged (see
 *  `SerializerContext.registerElement`): no sanitizing, no `e` prefix. */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function eachDeploymentNode(nodes: DeploymentNode[], fn: (n: DeploymentNode) => void): void {
  for (const node of nodes) {
    fn(node)
    eachDeploymentNode(node.children, fn)
  }
}

/** Rewrite every reference to element `oldId` so it points at `newId`:
 *  the element itself (model tree and deployment tree), relationship
 *  endpoints, view scopes, view elements, dynamic-step endpoints, group
 *  membership and deployment instance targets. Implied relationships are
 *  derived on demand and carry no stored ids, so they need no rewrite.
 *  Mutates `ws`; throws when `oldId` is missing, `newId` is taken or not a
 *  valid DSL identifier (reserved words such as `views` included). */
export function renameElementId(ws: Workspace, oldId: string, newId: string): void {
  if (oldId === newId) return
  if (!IDENTIFIER.test(newId)) throw new Error(`Invalid identifier "${newId}"`)
  if (isReservedWord(newId)) throw new Error(`Invalid identifier "${newId}": it is a DSL keyword`)

  const swap = (id: string): string => (id === oldId ? newId : id)
  const holders: { id: string }[] = []
  const instances: (ContainerInstance | SoftwareSystemInstance)[] = []
  for (const p of ws.model.people) holders.push(p)
  for (const sys of ws.model.softwareSystems) {
    holders.push(sys)
    for (const c of sys.containers) {
      holders.push(c)
      holders.push(...c.components)
    }
  }
  for (const env of ws.model.deploymentEnvironments ?? []) {
    eachDeploymentNode(env.deploymentNodes, node => {
      holders.push(node, ...node.infrastructureNodes, ...node.containerInstances, ...node.softwareSystemInstances)
      instances.push(...node.containerInstances, ...node.softwareSystemInstances)
    })
  }
  if (!holders.some(h => h.id === oldId)) throw new Error(`Element "${oldId}" not found`)
  if (holders.some(h => h.id === newId)) throw new Error(`Identifier "${newId}" is already in use`)

  for (const h of holders) h.id = swap(h.id)
  for (const inst of instances) {
    if (inst.type === 'containerInstance') inst.containerId = swap(inst.containerId)
    else inst.softwareSystemId = swap(inst.softwareSystemId)
  }

  for (const rel of ws.model.relationships) {
    rel.sourceId = swap(rel.sourceId)
    rel.destinationId = swap(rel.destinationId)
  }
  for (const group of ws.model.groups) {
    group.elementIds = group.elementIds.map(swap)
  }
  forEachView(ws, view => {
    if (view.softwareSystemId) view.softwareSystemId = swap(view.softwareSystemId)
    if (view.containerId) view.containerId = swap(view.containerId)
    for (const el of view.elements) el.id = swap(el.id)
    for (const step of view.relationships) {
      if (step.sourceId) step.sourceId = swap(step.sourceId)
      if (step.destinationId) step.destinationId = swap(step.destinationId)
    }
  })
}

function rekeyRecord<T>(
  record: Record<string, T> | undefined,
  renames: ReadonlyMap<string, string>,
  removed: ReadonlySet<string>,
): Record<string, T> | undefined {
  if (!record) return undefined
  const out: Record<string, T> = {}
  for (const [key, value] of Object.entries(record)) {
    if (removed.has(key)) continue
    out[renames.get(key) ?? key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** Move sidecar entries (element/relationship records and per-view node
 *  positions and locks) from old ids to new ids and drop removed ids.
 *  View keys are not element ids and are left alone. Pure: returns a new
 *  object. */
export function rekeySidecar(
  sidecar: SidecarData,
  renames: ReadonlyMap<string, string>,
  removed: ReadonlySet<string>,
): SidecarData {
  const out: SidecarData = { version: 1 }
  const elements = rekeyRecord(sidecar.elements, renames, removed)
  if (elements) out.elements = elements
  const relationships = rekeyRecord(sidecar.relationships, renames, removed)
  if (relationships) out.relationships = relationships

  if (sidecar.views) {
    const views: NonNullable<SidecarData['views']> = {}
    for (const [key, view] of Object.entries(sidecar.views)) {
      const entry: NonNullable<SidecarData['views']>[string] = {}
      if (view.locked) entry.locked = view.locked
      const viewElements = rekeyRecord(view.elements, renames, removed)
      if (viewElements) entry.elements = viewElements
      if (entry.locked || entry.elements) views[key] = entry
    }
    if (Object.keys(views).length > 0) out.views = views
  }
  return out
}

/** Derive a camelCase, ASCII-only DSL identifier from a display name that
 *  the serializer emits unchanged and that is not in `taken`
 *  ("Order Service" -> "orderService"; collisions get a numeric suffix). */
export function deriveIdentifier(name: string, taken: ReadonlySet<string> | Iterable<string>): string {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  let base = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
  if (!base) base = 'item'
  else if (/^[0-9]/.test(base)) base = `e${base}`

  const used = taken instanceof Set ? taken : new Set(taken)
  if (!used.has(base) && !isReservedWord(base)) return base
  let i = 2
  while (used.has(`${base}${i}`)) i++
  return `${base}${i}`
}

/** DSL keywords (`model`, `views`, `element`, ...) cannot be variable names:
 *  the parser reads them as keywords. Asking the lexer keeps this in step.
 *  `this` is reserved by Structurizr (the enclosing element) though the lexer
 *  reads it as a plain identifier. */
function isReservedWord(word: string): boolean {
  return word === 'this' || lex(word).tokens.some(t => t.type === 'KEYWORD')
}
