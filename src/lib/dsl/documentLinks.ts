// Shared hoist/derive helper for `documents` — element/relationship document
// links. Like `status`/`owner`/`lineStyle`/`interactionStyle`
// (parser-model.ts's `applyStructurizrConventions`, serializer.ts's
// `elementProperties`/`relationshipProperties`), `documents` has no native
// Structurizr keyword, so it travels as reserved-namespace properties inside
// the generic `properties { }` block and is hoisted onto the typed field on
// parse, then re-derived back into properties on serialize. Unlike those
// scalar fields, `documents` is a list, so it's indexed:
// `c4hero.documents.<n>.path` / `c4hero.documents.<n>.title`.
import type { DocLink } from '@/types/model'
import { setUserProperty } from './parser'

const KEY_PREFIX = 'c4hero.documents.'

function pathKey(index: number): string {
    return `${KEY_PREFIX}${index}.path`
}

function titleKey(index: number): string {
    return `${KEY_PREFIX}${index}.title`
}

/**
 * Hoist indexed `c4hero.documents.<n>.path` / `.title` properties into a
 * `DocLink[]`. Indices are read consecutively starting from 0 and parsing
 * stops at the first gap — an index with neither key present ends the scan,
 * and anything from that index on (even if present at a higher index) stays
 * in `rest`, untouched.
 *
 * An entry missing either `.path` or `.title` at a given index is never
 * hoisted as a partial `DocLink` — it's left in `rest` so nothing is
 * silently lost, matching the "only hoist a valid, complete value" rule the
 * `status`/`owner` hoists already follow (parser-model.ts:50-58).
 */
export function parseDocumentsFromProperties(
    properties: Record<string, string>,
): { documents: DocLink[] | undefined; rest: Record<string, string> } {
    const rest: Record<string, string> = { ...properties }
    const documents: DocLink[] = []

    for (let i = 0; ; i++) {
        const pKey = pathKey(i)
        const tKey = titleKey(i)
        const hasPath = Object.prototype.hasOwnProperty.call(properties, pKey)
        const hasTitle = Object.prototype.hasOwnProperty.call(properties, tKey)
        if (!hasPath && !hasTitle) break
        if (!hasPath || !hasTitle) break // partial entry — leave in rest, stop scanning

        documents.push({ path: properties[pKey], title: properties[tKey] })
        delete rest[pKey]
        delete rest[tKey]
    }

    return { documents: documents.length > 0 ? documents : undefined, rest }
}

/**
 * Derive indexed `c4hero.documents.<n>.path` / `.title` properties from a
 * `DocLink[]`. Returns an empty object for `undefined`/empty input so an
 * element or relationship with no documents emits no `c4hero.documents.*`
 * properties at all.
 */
export function documentsToProperties(
    documents: DocLink[] | undefined,
): Record<string, string> {
    const props: Record<string, string> = {}
    if (!documents) return props
    documents.forEach((doc, i) => {
        props[pathKey(i)] = doc.path
        props[titleKey(i)] = doc.title
    })
    return props
}

/**
 * Drop every `c4hero.documents.*` key from a properties map, regardless of
 * index or completeness. Used by the serializer to clear the whole namespace
 * before re-deriving it from `el.documents`/`rel.documents` — see the comment
 * at its call site (`serializer.ts`'s `elementProperties`/
 * `relationshipProperties`) for why a stale/orphaned entry under this prefix
 * is deliberately not preserved across such a re-derive.
 */
export function withoutDocumentProperties(
    properties: Record<string, string>,
): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, val] of Object.entries(properties)) {
        // defineProperty, not assignment — a "__proto__" key would otherwise
        // set the object's prototype instead of being copied as data
        // (same reasoning as parser.ts's setUserProperty).
        if (!key.startsWith(KEY_PREFIX)) setUserProperty(result, key, val)
    }
    return result
}
