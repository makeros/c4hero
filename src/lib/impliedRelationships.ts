import type { Model, Relationship } from '@/types/model'

/** Structurizr's implied relationships: when an explicit relationship exists
 *  between two elements, an implied relationship exists between every
 *  combination of their ancestors (component → container → software
 *  system). E.g. if a component in System A talks to a component in System
 *  B, there's an implied System A → System B relationship, drawn whenever a
 *  view shows the systems but not (both of) the underlying components.
 *
 *  Computed on demand per view, never materialized into `model.relationships`
 *  — same reasoning as deriveInstanceRelationships() in lib/deployment.ts:
 *  storing copies would let a stale one survive editing/deleting the
 *  relationship that implied it. Only active when the workspace opts in via
 *  `!impliedRelationships true` (see Workspace.impliedRelationships). */
export function impliedViewRelationships(
    model: Model,
    viewElementIds: Set<string>,
): Relationship[] {
    // ancestors[elementId] = [elementId, ...parents], nearest first.
    const ancestors = new Map<string, string[]>()
    for (const person of model.people) ancestors.set(person.id, [person.id])
    for (const sys of model.softwareSystems) {
        ancestors.set(sys.id, [sys.id])
        for (const container of sys.containers) {
            ancestors.set(container.id, [container.id, sys.id])
            for (const component of container.components) {
                ancestors.set(component.id, [component.id, container.id, sys.id])
            }
        }
    }

    const explicitPairs = new Set(model.relationships.map(r => `${r.sourceId}→${r.destinationId}`))
    const contributors = new Map<string, Relationship[]>()

    for (const rel of model.relationships) {
        const srcChain = ancestors.get(rel.sourceId) ?? [rel.sourceId]
        const dstChain = ancestors.get(rel.destinationId) ?? [rel.destinationId]
        for (const a of srcChain) {
            for (const b of dstChain) {
                if (a === b) continue
                // Skip pairs where one side is an ancestor (or self) of the
                // other's containment lineage — e.g. a component talking to
                // its own parent container implies nothing: they're already
                // the same branch of the tree, not two things to connect.
                if (srcChain.includes(b) || dstChain.includes(a)) continue
                if (!viewElementIds.has(a) || !viewElementIds.has(b)) continue
                // A real relationship already connects this exact pair — it
                // takes precedence over a synthesized implied one.
                if (explicitPairs.has(`${a}→${b}`)) continue
                const key = `${a}→${b}`
                const list = contributors.get(key)
                if (list) list.push(rel)
                else contributors.set(key, [rel])
            }
        }
    }

    const implied: Relationship[] = []
    for (const [key, rels] of contributors) {
        const [sourceId, destinationId] = key.split('→')
        const [only] = rels
        implied.push({
            id: `implied-${sourceId}-${destinationId}`,
            sourceId,
            destinationId,
            description: rels.length === 1 ? only.description : undefined,
            technology: rels.length === 1 ? only.technology : undefined,
            tags: ['Relationship', 'Implied'],
            properties: {},
        })
    }
    return implied
}
