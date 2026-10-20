import type { DocLink, Workspace, View } from '@/types/model'
import { allViewsOf, forEachElementHelper } from '@/store/workspace-helpers'
import { walkDeploymentNodes } from '@/lib/deployment'
import { getElementTypeLabel } from '@/lib/elementMeta'

export type DocumentEntryKind = 'element' | 'relationship'

export interface DocumentEntryView {
  key: string
  title: string
  type: View['type']
}

export interface DocumentEntry {
  kind: DocumentEntryKind
  /** Element id or relationship id. */
  id: string
  /** Element name, or "Source → Target" for a relationship. */
  name: string
  /** "Person" | "Software System" | "Container" | "Component" |
   *  "Deployment Node" | "Infrastructure Node" | "Relation" */
  typeLabel: string
  /** Relation description (+ technology), if any. */
  secondary?: string
  /** Non-empty. */
  documents: DocLink[]
  /** Ordered as allViewsOf(ws); [] means "Not in any view". */
  views: DocumentEntryView[]
}

/** Build the id → display-name lookup used for relationship endpoint names.
 *  Covers model elements (people/systems/containers/components) and every
 *  deployment element (nodes, infrastructure nodes, instances) since an
 *  explicit relationship may anchor on either. Instances resolve to the name
 *  of the container/system they instantiate. */
function buildElementNameIndex(ws: Workspace): Map<string, string> {
  const names = new Map<string, string>()
  forEachElementHelper(ws, (el) => { names.set(el.id, el.name) })
  for (const env of ws.model.deploymentEnvironments ?? []) {
    walkDeploymentNodes(env, (node) => {
      names.set(node.id, node.name)
      for (const infra of node.infrastructureNodes) names.set(infra.id, infra.name)
      for (const inst of node.containerInstances) {
        names.set(inst.id, names.get(inst.containerId) ?? inst.containerId)
      }
      for (const inst of node.softwareSystemInstances) {
        names.set(inst.id, names.get(inst.softwareSystemId) ?? inst.softwareSystemId)
      }
    })
  }
  return names
}

function toEntryView(v: View): DocumentEntryView {
  return { key: v.key, title: v.title ?? v.key, type: v.type }
}

/** Build each item's view membership once per call instead of re-scanning
 *  every view per item (O(views) instead of O(items × views)). Lists are
 *  appended in `views` iteration order, so per-item order still matches
 *  `allViewsOf(ws)`. */
function buildViewMembership(views: View[]): {
  byElement: Map<string, DocumentEntryView[]>
  byRelationship: Map<string, DocumentEntryView[]>
} {
  const byElement = new Map<string, DocumentEntryView[]>()
  const byRelationship = new Map<string, DocumentEntryView[]>()
  for (const v of views) {
    const entryView = toEntryView(v)
    for (const el of v.elements) {
      const list = byElement.get(el.id)
      if (list) list.push(entryView)
      else byElement.set(el.id, [entryView])
    }
    for (const rel of v.relationships) {
      const list = byRelationship.get(rel.id)
      if (list) list.push(entryView)
      else byRelationship.set(rel.id, [entryView])
    }
  }
  return { byElement, byRelationship }
}

/** Build the full documents index: every element (incl. deployment /
 *  infrastructure nodes) and explicit relationship that carries at least one
 *  document link, each with the views (explicit membership only) that
 *  contain it, sorted A–Z case-insensitively with an id tie-break. */
export function buildDocumentIndex(ws: Workspace): DocumentEntry[] {
  const views = allViewsOf(ws)
  const { byElement, byRelationship } = buildViewMembership(views)
  const entries: DocumentEntry[] = []

  forEachElementHelper(ws, (el) => {
    if (!el.documents?.length) return
    entries.push({
      kind: 'element',
      id: el.id,
      name: el.name,
      typeLabel: getElementTypeLabel(el),
      documents: el.documents,
      views: byElement.get(el.id) ?? [],
    })
  })

  for (const env of ws.model.deploymentEnvironments ?? []) {
    walkDeploymentNodes(env, (node) => {
      if (node.documents?.length) {
        entries.push({
          kind: 'element',
          id: node.id,
          name: node.name,
          typeLabel: 'Deployment Node',
          documents: node.documents,
          views: byElement.get(node.id) ?? [],
        })
      }
      for (const infra of node.infrastructureNodes) {
        if (!infra.documents?.length) continue
        entries.push({
          kind: 'element',
          id: infra.id,
          name: infra.name,
          typeLabel: 'Infrastructure Node',
          documents: infra.documents,
          views: byElement.get(infra.id) ?? [],
        })
      }
    })
  }

  // Resolving relationship endpoint names needs a full id → name walk of the
  // model — skip it entirely when no relationship actually carries documents.
  const hasDocumentedRelationship = ws.model.relationships.some((rel) => rel.documents?.length)
  const names = hasDocumentedRelationship ? buildElementNameIndex(ws) : null
  for (const rel of ws.model.relationships) {
    if (!rel.documents?.length) continue
    const sourceName = names?.get(rel.sourceId) ?? rel.sourceId
    const destName = names?.get(rel.destinationId) ?? rel.destinationId
    const secondary = [rel.description, rel.technology].filter(Boolean).join(' · ') || undefined
    entries.push({
      kind: 'relationship',
      id: rel.id,
      name: `${sourceName} → ${destName}`,
      typeLabel: 'Relation',
      secondary,
      documents: rel.documents,
      views: byRelationship.get(rel.id) ?? [],
    })
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id))
  return entries
}

/** Cheap count of every element (incl. deployment / infrastructure nodes) and
 *  explicit relationship that carries at least one document link — no view
 *  membership, name resolution, or sort. Used for badge counts where only the
 *  number matters (e.g. the top-pill Documents button). */
export function countDocumentedItems(ws: Workspace): number {
  let count = 0

  forEachElementHelper(ws, (el) => {
    if (el.documents?.length) count++
  })

  for (const env of ws.model.deploymentEnvironments ?? []) {
    walkDeploymentNodes(env, (node) => {
      if (node.documents?.length) count++
      for (const infra of node.infrastructureNodes) {
        if (infra.documents?.length) count++
      }
    })
  }

  for (const rel of ws.model.relationships) {
    if (rel.documents?.length) count++
  }

  return count
}
