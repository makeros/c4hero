// Shared collection logic for Task 3.2 (dev middleware + prod build) and
// Task 3.3 (build:viewer) — neither build path reimplements "which document
// files need to be copied where." See
// specifications/document-links/document-links.plan.md's "File resolution —
// one URL shape, three environments".
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { hasHiddenSegment, hasMarkdownExtension, listMarkdownFiles } from './docPath'
import { extractDocLinks, resolveDocLink, resolveWikilink } from './docLinks'
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

/** Upper bound on documents copied per build (DSL-referenced plus linked). */
export const MAX_COLLECTED_DOCUMENTS = 2000

export interface DocumentCopyPlan {
    /** from: absolute source path on disk; to: path under __docs/ (e.g. `__docs/architecture/overview.md`). */
    copies: Array<{ from: string; to: string }>
    /** Referenced paths with no file on disk, or that fail the project-root containment check. */
    missing: string[]
    /** Non-fatal notes for the caller to print (e.g. the crawl cap was hit). */
    warnings: string[]
}

/**
 * Resolves `docPath` (relative to `resolvedRoot`) to a copyable file, or null
 * when it is absolute, not markdown, hidden, escapes the root (textually or
 * through a symlink), or is not a file. `rel` is the normalised, contained
 * root-relative POSIX path — the only safe source for the destination: a raw
 * `../`-containing path can resolve to a real file inside the root while its
 * own `..` segments, pasted after `__docs/`, would climb out of outDir.
 */
function resolveCopyable(docPath: string, resolvedRoot: string): { from: string; rel: string } | null {
    if (isAbsolute(docPath)) return null
    if (!hasMarkdownExtension(docPath) || hasHiddenSegment(docPath)) return null

    const absolute = resolve(resolvedRoot, docPath)
    const rel = relative(resolvedRoot, absolute)
    const escapesRoot = rel === '' ? false : rel.startsWith('..') || isAbsolute(rel)
    if (escapesRoot) return null

    if (!existsSync(absolute) || !statSync(absolute).isFile()) return null

    // Re-check containment against the REAL path: existsSync/statSync above
    // follow symlinks, so a tracked file that is actually a symlink pointing
    // outside projectRoot would otherwise pass the textual check and still get
    // copied. Resolve both sides fresh (the root itself may involve a symlink,
    // e.g. macOS's /var -> /private/var) so the comparison is apples-to-apples.
    let realAbsolute: string
    let realRoot: string
    try {
        realAbsolute = realpathSync(absolute)
        realRoot = realpathSync(resolvedRoot)
    } catch {
        return null
    }
    const realRel = relative(realRoot, realAbsolute)
    const realEscapesRoot = realRel === '' ? false : realRel.startsWith('..') || isAbsolute(realRel)
    if (realEscapesRoot) return null

    return { from: absolute, rel: rel.split(sep).join('/') }
}

/**
 * Parse each given `.dsl` file, collect every referenced document path across
 * all of them (deduped), resolve each against `projectRoot`, then crawl the
 * copied documents transitively: markdown links, inline-code `.md` mentions
 * and Obsidian wikilinks inside a copied document pull their targets in too
 * (same allowlist/containment checks; capped at MAX_COLLECTED_DOCUMENTS).
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
    const warnings: string[] = []
    const copiedRels = new Set<string>()
    const missingSeen = new Set<string>()
    const queue: Array<{ from: string; rel: string }> = []
    let capWarned = false

    const addMissing = (path: string): void => {
        if (missingSeen.has(path)) return
        missingSeen.add(path)
        missing.push(path)
    }

    const collect = (docPath: string): void => {
        const found = resolveCopyable(docPath, resolvedRoot)
        if (!found) return addMissing(docPath)
        if (copiedRels.has(found.rel)) return
        if (copiedRels.size >= MAX_COLLECTED_DOCUMENTS) {
            if (!capWarned) {
                capWarned = true
                warnings.push(`stopped collecting linked documents after ${MAX_COLLECTED_DOCUMENTS}; some links in the build may not resolve`)
            }
            return
        }
        copiedRels.add(found.rel)
        copies.push({ from: found.from, to: '__docs/' + found.rel })
        queue.push(found)
    }

    for (const docPath of referencedPaths) collect(docPath)

    let rootIndex: string[] | undefined
    for (let i = 0; i < queue.length; i++) {
        const { from, rel } = queue[i]
        let text: string
        try {
            text = readFileSync(from, 'utf8')
        } catch {
            continue
        }
        const { hrefs, wikilinks } = extractDocLinks(text)
        for (const href of hrefs) {
            const link = resolveDocLink(rel, href)
            if (link.kind === 'doc') collect(link.path)
        }
        for (const raw of wikilinks) {
            rootIndex ??= listMarkdownFiles(resolvedRoot).files
            const link = resolveWikilink(rel, raw, rootIndex)
            if (link.kind === 'doc') collect(link.path)
            else if (link.kind === 'unresolved') addMissing(link.path)
        }
    }

    return { copies, missing, warnings }
}

/**
 * Copies the planned documents under `outDir` and writes `__docs/__index.json`
 * (`{ files }`, exactly the copied docs) — the list the viewer resolves
 * wikilinks against. The one place both build paths (vite closeBundle and
 * scripts/build-viewer.mjs) emit documents.
 */
export function writeDocumentCopies(plan: Pick<DocumentCopyPlan, 'copies'>, outDir: string): void {
    for (const { from, to } of plan.copies) {
        const dest = join(outDir, to)
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(from, dest)
    }
    const files = plan.copies.map(({ to }) => to.slice('__docs/'.length)).sort()
    mkdirSync(join(outDir, '__docs'), { recursive: true })
    writeFileSync(join(outDir, '__docs', '__index.json'), JSON.stringify({ files }), 'utf8')
}
