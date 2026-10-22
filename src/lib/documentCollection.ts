// Shared collection logic for Task 3.2 (dev middleware + prod build) and
// Task 3.3 (build:viewer) — neither build path reimplements "which document
// files need to be copied where." See
// specifications/document-links/document-links.plan.md's "File resolution —
// one URL shape, three environments", extended in
// specifications/html-document-links for HTML documents and their assets
// (D4-D7).
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { hasAssetExtension, hasDocumentExtension, hasHiddenSegment, hasMarkdownExtension, listDocumentFiles } from './docPath'
import { extractDocLinks, resolveDocLink, resolveWikilink } from './docLinks'
import { extractCssUrls, extractHtmlReferences, rewriteHtmlDocLinks } from './htmlDocLinks'
import { parseDSL } from './dsl'
import { forEachElementHelper } from '@/store/workspace-helpers'
import { walkDeploymentNodes } from '@/lib/deployment'
import type { Workspace } from '@/types/model'

/**
 * Collect every `documents[].path` referenced anywhere across the given
 * workspaces — every element in the model tree (people, software systems,
 * their containers, those containers' components), every deployment and
 * infrastructure node, plus every relationship. Deduped, first-seen order
 * preserved.
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
        for (const env of ws.model.deploymentEnvironments ?? []) {
            walkDeploymentNodes(env, (node) => {
                for (const doc of node.documents ?? []) add(doc.path)
                for (const infra of node.infrastructureNodes) {
                    for (const doc of infra.documents ?? []) add(doc.path)
                }
            })
        }
        for (const rel of ws.model.relationships) {
            for (const doc of rel.documents ?? []) add(doc.path)
        }
    }

    return ordered
}

/** Upper bound on documents and assets copied per build (DSL-referenced,
 *  linked and HTML/CSS-referenced, combined). */
export const MAX_COLLECTED_DOCUMENTS = 2000

/** Per-asset size cap (D4 asset crawl): an oversized subresource warns and is
 *  skipped rather than copied, like a missing or rejected one. */
export const MAX_ASSET_BYTES = 25 * 1024 * 1024

export interface DocumentCopyPlan {
    /** from: absolute source path on disk; to: path under __docs/ (e.g. `__docs/architecture/overview.md`). */
    copies: Array<{ from: string; to: string; kind: 'markdown' | 'html' | 'asset' }>
    /** Referenced paths with no file on disk, or that fail the project-root containment check. */
    missing: string[]
    /** Non-fatal notes for the caller to print (e.g. the crawl cap was hit). */
    warnings: string[]
}

/**
 * Resolves `docPath` (relative to `resolvedRoot`) to a copyable file, or null
 * when it is absolute, fails `hasAllowedExtension`, hidden, escapes the root
 * (textually or through a symlink), or is not a file. `rel` is the
 * normalised, contained root-relative POSIX path — the only safe source for
 * the destination: a raw `../`-containing path can resolve to a real file
 * inside the root while its own `..` segments, pasted after `__docs/`, would
 * climb out of outDir. `hasAllowedExtension` lets callers reuse this for both
 * documents (`hasDocumentExtension`) and assets (`hasAssetExtension`).
 */
function resolveCopyable(
    docPath: string,
    resolvedRoot: string,
    hasAllowedExtension: (path: string) => boolean,
): { from: string; rel: string } | null {
    if (isAbsolute(docPath)) return null
    if (!hasAllowedExtension(docPath) || hasHiddenSegment(docPath)) return null

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
 * Resolves a subresource/CSS `url(...)` reference `raw`, found in the file at
 * `fromRel` (project-root-relative POSIX), to a root-relative candidate path.
 * Mirrors `resolveDocLink`'s own path-joining (a leading `/` is root-relative,
 * `..` climbs, escapes keep their leading `..` segments so the containment
 * check in `resolveCopyable` rejects and reports them) but without its
 * markdown/HTML extension gate, since assets can be any allowlisted
 * extension. Any query string or fragment on `raw` is dropped first — it is
 * not part of the filesystem path. The remainder is percent-decoded (e.g.
 * `my%20logo.png` -> `my logo.png`) so an escaped filename resolves to the
 * real file on disk; a malformed escape is left undecoded; it'll simply miss
 * and land in `missing`, same as any other nonexistent path.
 */
function resolveRelativeAsset(fromRel: string, raw: string): string {
    const stripped = raw.split('#')[0].split('?')[0].trim()
    let target: string
    try {
        target = decodeURIComponent(stripped)
    } catch {
        target = stripped
    }
    const base = target.startsWith('/') ? [] : fromRel.split('/').slice(0, -1)
    const out: string[] = []
    let escaped = 0
    for (const seg of [...base, ...target.split('/')]) {
        if (seg === '' || seg === '.') continue
        if (seg === '..') {
            if (out.length > 0 && out[out.length - 1] !== '..') out.pop()
            else escaped++
            continue
        }
        out.push(seg)
    }
    return [...Array<string>(escaped).fill('..'), ...out].join('/')
}

/**
 * Parse each given `.dsl` file, collect every referenced document path across
 * all of them (deduped), resolve each against `projectRoot`, then crawl the
 * copied documents transitively, by kind:
 *  - markdown: links, inline-code `.md` mentions and Obsidian wikilinks
 *    (same as before, now also resolving to `.html` per D8 via the widened
 *    `resolveWikilink`, using `listDocumentFiles` as the root index).
 *  - html: `extractHtmlReferences` — each subresource is resolved relative to
 *    the HTML file and collected as an asset (D4); each `.md`/`.markdown`
 *    `<a href>` is collected as markdown (D7's crawl side).
 *  - css asset: `extractCssUrls`, each resolved relative to the CSS file and
 *    collected as an asset.
 * A subresource that fails the asset allowlist, containment or the
 * `MAX_ASSET_BYTES` size cap goes to `missing`/`warnings`, like documents do.
 * Capped at `MAX_COLLECTED_DOCUMENTS`, counting documents and assets
 * together.
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

    const copies: DocumentCopyPlan['copies'] = []
    const missing: string[] = []
    const warnings: string[] = []
    const copiedRels = new Set<string>()
    const missingSeen = new Set<string>()
    const oversizeSeen = new Set<string>()
    const docQueue: Array<{ from: string; rel: string; kind: 'markdown' | 'html' }> = []
    const cssQueue: Array<{ from: string; rel: string }> = []
    let capWarned = false

    const addMissing = (path: string): void => {
        if (missingSeen.has(path)) return
        missingSeen.add(path)
        missing.push(path)
    }

    /** True (and warns once) when the collection cap is already reached. */
    const atCap = (): boolean => {
        if (copiedRels.size < MAX_COLLECTED_DOCUMENTS) return false
        if (!capWarned) {
            capWarned = true
            warnings.push(`stopped collecting linked documents after ${MAX_COLLECTED_DOCUMENTS}; some links in the build may not resolve`)
        }
        return true
    }

    const collectDoc = (docPath: string): void => {
        const found = resolveCopyable(docPath, resolvedRoot, hasDocumentExtension)
        if (!found) return addMissing(docPath)
        if (copiedRels.has(found.rel)) return
        if (atCap()) return
        copiedRels.add(found.rel)
        const kind = hasMarkdownExtension(found.rel) ? 'markdown' : 'html'
        copies.push({ from: found.from, to: '__docs/' + found.rel, kind })
        docQueue.push({ ...found, kind })
    }

    const collectAsset = (assetPath: string): void => {
        const found = resolveCopyable(assetPath, resolvedRoot, hasAssetExtension)
        if (!found) return addMissing(assetPath)
        if (copiedRels.has(found.rel)) return
        if (atCap()) return
        let size: number
        try {
            size = statSync(found.from).size
        } catch {
            return addMissing(assetPath)
        }
        if (size > MAX_ASSET_BYTES) {
            if (!oversizeSeen.has(found.rel)) {
                oversizeSeen.add(found.rel)
                warnings.push(`skipped ${found.rel}: larger than the ${MAX_ASSET_BYTES / (1024 * 1024)} MB asset size cap`)
            }
            return
        }
        copiedRels.add(found.rel)
        copies.push({ from: found.from, to: '__docs/' + found.rel, kind: 'asset' })
        if (found.rel.toLowerCase().endsWith('.css')) cssQueue.push(found)
    }

    for (const docPath of referencedPaths) collectDoc(docPath)

    let rootIndex: string[] | undefined
    for (let i = 0; i < docQueue.length; i++) {
        const { from, rel, kind } = docQueue[i]
        let text: string
        try {
            text = readFileSync(from, 'utf8')
        } catch {
            continue
        }
        if (kind === 'markdown') {
            const { hrefs, wikilinks } = extractDocLinks(text)
            for (const href of hrefs) {
                const link = resolveDocLink(rel, href)
                if (link.kind === 'doc') collectDoc(link.path)
            }
            for (const raw of wikilinks) {
                rootIndex ??= listDocumentFiles(resolvedRoot).files
                const link = resolveWikilink(rel, raw, rootIndex)
                if (link.kind === 'doc') collectDoc(link.path)
                else if (link.kind === 'unresolved') addMissing(link.path)
            }
        } else {
            const { subresources, docHrefs } = extractHtmlReferences(text)
            for (const raw of subresources) collectAsset(resolveRelativeAsset(rel, raw))
            for (const href of docHrefs) {
                const link = resolveDocLink(rel, href)
                if (link.kind === 'doc') collectDoc(link.path)
            }
        }
    }

    for (let i = 0; i < cssQueue.length; i++) {
        const { from, rel } = cssQueue[i]
        let css: string
        try {
            css = readFileSync(from, 'utf8')
        } catch {
            continue
        }
        for (const raw of extractCssUrls(css)) collectAsset(resolveRelativeAsset(rel, raw))
    }

    return { copies, missing, warnings }
}

/** Root-relative (`__docs/`-remainder) paths of every planned copy — the set
 *  the dev middleware serves from (D5): a `.html`/asset request is 404 unless
 *  its path is a member. */
export function servedPaths(plan: DocumentCopyPlan): Set<string> {
    return new Set(plan.copies.map(({ to }) => to.slice('__docs/'.length)))
}

/**
 * Copies the planned documents under `outDir` and writes `__docs/__index.json`
 * (`{ files }`, the copied markdown and HTML documents only — assets are
 * never listed, D5/D8) — the list the viewer resolves wikilinks against. The
 * one place both build paths (vite closeBundle and scripts/build-viewer.mjs)
 * emit documents. HTML copies are passed through `rewriteHtmlDocLinks` (D7)
 * so their `.md`/`.markdown` links point at `/document-view`; everything else
 * is copied byte for byte.
 */
export function writeDocumentCopies(plan: Pick<DocumentCopyPlan, 'copies'>, outDir: string): void {
    for (const { from, to, kind } of plan.copies) {
        const dest = join(outDir, to)
        mkdirSync(dirname(dest), { recursive: true })
        if (kind === 'html') {
            const rel = to.slice('__docs/'.length)
            writeFileSync(dest, rewriteHtmlDocLinks(readFileSync(from, 'utf8'), rel), 'utf8')
        } else {
            copyFileSync(from, dest)
        }
    }
    const files = plan.copies
        .filter(({ kind }) => kind === 'markdown' || kind === 'html')
        .map(({ to }) => to.slice('__docs/'.length))
        .sort()
    mkdirSync(join(outDir, '__docs'), { recursive: true })
    writeFileSync(join(outDir, '__docs', '__index.json'), JSON.stringify({ files }), 'utf8')
}
