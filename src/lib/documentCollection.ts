// Shared collection logic for Task 3.2 (dev middleware + prod build) and
// Task 3.3 (build:viewer) — neither build path reimplements "which document
// files need to be copied where." See
// specifications/document-links/document-links.plan.md's "File resolution —
// one URL shape, three environments".
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { hasHiddenSegment, hasMarkdownExtension } from './docPath'
import { parseDSL } from './dsl'
import { forEachElementHelper } from '@/store/workspace-helpers'
import type { Workspace } from '@/types/model'

/**
 * Collect every `documents[].path` referenced anywhere across the given
 * workspaces — every element in the model tree (people, software systems,
 * their containers, those containers' components — mirrors
 * `forEachElementHelper`'s traversal exactly, so deployment-view elements are
 * out of scope here too, matching Task 1.1's `documents` scope) plus every
 * relationship. Deduped, first-seen order preserved.
 */
export function findReferencedDocumentPaths(workspaces: Workspace[]): string[] {
    const seen = new Set<string>()
    const ordered: string[] = []
    const add = (path: string): void => {
        if (seen.has(path)) return
        seen.add(path)
        ordered.push(path)
    }

    for (const ws of workspaces) {
        forEachElementHelper(ws, (el) => {
            for (const doc of el.documents ?? []) add(doc.path)
        })
        for (const rel of ws.model.relationships) {
            for (const doc of rel.documents ?? []) add(doc.path)
        }
    }

    return ordered
}

export interface DocumentCopyPlan {
    /** from: absolute source path on disk; to: path under __docs/ (e.g. `__docs/architecture/overview.md`). */
    copies: Array<{ from: string; to: string }>
    /** Referenced paths with no file on disk, or that fail the project-root containment check. */
    missing: string[]
}

/**
 * Parse each given `.dsl` file, collect every referenced document path across
 * all of them (deduped), and resolve each against `projectRoot`.
 *
 * Never throws on a missing file or a build misconfiguration — that's the
 * expected, handled case for both the prod build (a missing file is a
 * `console.warn`, never a failed build) and the dev middleware (a 404, never
 * a 500). A referenced path is also refused — routed to `missing`, not
 * `copies` — when it would resolve outside `projectRoot` (an absolute path,
 * or a `../` escape): see the plan's Security Considerations, which calls
 * this out for this exact function, not just the dev middleware. Treating a
 * rejected path the same as a missing one keeps the "never throw, never fail
 * the caller's build" contract uniform for both failure modes.
 */
export function planDocumentCopies(dslFilePaths: string[], projectRoot: string): DocumentCopyPlan {
    const workspaces = dslFilePaths.map((filePath) => parseDSL(readFileSync(filePath, 'utf8')).workspace)
    const referencedPaths = findReferencedDocumentPaths(workspaces)
    const resolvedRoot = resolve(projectRoot)

    const copies: Array<{ from: string; to: string }> = []
    const missing: string[] = []

    for (const docPath of referencedPaths) {
        if (isAbsolute(docPath)) { missing.push(docPath); continue }
        if (!hasMarkdownExtension(docPath) || hasHiddenSegment(docPath)) { missing.push(docPath); continue }

        const absolute = resolve(resolvedRoot, docPath)
        const rel = relative(resolvedRoot, absolute)
        const escapesRoot = rel === '' ? false : rel.startsWith('..') || isAbsolute(rel)
        if (escapesRoot) { missing.push(docPath); continue }

        if (!existsSync(absolute) || !statSync(absolute).isFile()) { missing.push(docPath); continue }

        // Re-check containment against the REAL path: existsSync/statSync
        // above follow symlinks, so a tracked file that is actually a symlink
        // pointing outside projectRoot would otherwise pass the textual
        // check above and still get copied. Resolve both sides fresh (the
        // root itself may involve a symlink, e.g. macOS's /var -> /private/var)
        // so the comparison is apples-to-apples.
        let realAbsolute: string
        let realRoot: string
        try {
            realAbsolute = realpathSync(absolute)
            realRoot = realpathSync(resolvedRoot)
        } catch {
            missing.push(docPath)
            continue
        }
        const realRel = relative(realRoot, realAbsolute)
        const realEscapesRoot = realRel === '' ? false : realRel.startsWith('..') || isAbsolute(realRel)
        if (realEscapesRoot) { missing.push(docPath); continue }

        // Destination is built from the already-normalized `rel`, never the
        // raw `docPath` — a raw `../`-containing path can resolve to a real
        // SOURCE file inside projectRoot while its own `..` segments, pasted
        // verbatim after `__docs/`, would climb back OUT of the caller's
        // outDir when joined. `rel` has already been through path
        // resolution/normalization and is confirmed contained, so it's safe
        // to use verbatim.
        copies.push({ from: absolute, to: '__docs/' + rel.split(sep).join('/') })
    }

    return { copies, missing }
}
