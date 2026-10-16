import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findReferencedDocumentPaths, planDocumentCopies, writeDocumentCopies } from './documentCollection'
import { serializeDSL } from './dsl'
import { docsRootFor } from './docPath'
import type { Workspace, DocLink } from '@/types/model'

function ws(overrides: Partial<Workspace['model']> = {}): Workspace {
    return {
        name: 'T',
        model: {
            people: [],
            softwareSystems: [],
            relationships: [],
            groups: [],
            deploymentEnvironments: [],
            ...overrides,
        },
        views: {
            systemLandscapeViews: [],
            systemContextViews: [],
            containerViews: [],
            componentViews: [],
            dynamicViews: [],
            deploymentViews: [],
            configuration: { styles: { elements: [], relationships: [] } },
        },
    }
}

const DOC_A: DocLink = { path: 'docs/a.md', title: 'A' }
const DOC_B: DocLink = { path: 'docs/b.md', title: 'B' }

describe('findReferencedDocumentPaths', () => {
    it('returns an empty array when nothing references a document', () => {
        const w = ws({
            people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {} }],
            relationships: [{ id: 'r1', sourceId: 'p1', destinationId: 'p1', tags: [], properties: {} }],
        })
        expect(findReferencedDocumentPaths([w])).toEqual([])
    })

    it('collects references across element types and relationships', () => {
        const w = ws({
            people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [DOC_A] }],
            softwareSystems: [{
                id: 'sys1', type: 'softwareSystem', name: 'S', tags: [], properties: {},
                containers: [{
                    id: 'c1', type: 'container', name: 'C', tags: [], properties: {},
                    components: [{ id: 'cmp1', type: 'component', name: 'Cmp', tags: [], properties: {}, documents: [DOC_B] }],
                }],
            }],
            relationships: [{ id: 'r1', sourceId: 'p1', destinationId: 'sys1', tags: [], properties: {}, documents: [DOC_B] }],
        })
        expect(findReferencedDocumentPaths([w])).toEqual(['docs/a.md', 'docs/b.md'])
    })

    it('dedupes a path referenced by more than one element', () => {
        const w = ws({
            people: [
                { id: 'p1', type: 'person', name: 'P1', tags: [], properties: {}, documents: [DOC_A] },
                { id: 'p2', type: 'person', name: 'P2', tags: [], properties: {}, documents: [DOC_A] },
            ],
        })
        expect(findReferencedDocumentPaths([w])).toEqual(['docs/a.md'])
    })

    it('collects across multiple workspaces', () => {
        const w1 = ws({ people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [DOC_A] }] })
        const w2 = ws({ people: [{ id: 'p2', type: 'person', name: 'P2', tags: [], properties: {}, documents: [DOC_B] }] })
        expect(findReferencedDocumentPaths([w1, w2])).toEqual(['docs/a.md', 'docs/b.md'])
    })
})

describe('planDocumentCopies', () => {
    let dir: string

    afterEach(() => {
        if (dir) rmSync(dir, { recursive: true, force: true })
    })

    function writeDslFile(workspace: Workspace, name = 'workspace.dsl'): string {
        const filePath = join(dir, name)
        writeFileSync(filePath, serializeDSL(workspace), 'utf8')
        return filePath
    }

    it('returns empty copies/missing for a workspace with no document references', () => {
        dir = mkdtempSync(join(tmpdir(), 'c4hero-doc-collection-'))
        const file = writeDslFile(ws({ people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {} }] }))
        const plan = planDocumentCopies([file], dir)
        expect(plan.copies).toEqual([])
        expect(plan.missing).toEqual([])
    })

    it('plans a copy for an existing referenced file and reports a missing one', () => {
        dir = mkdtempSync(join(tmpdir(), 'c4hero-doc-collection-'))
        mkdirSync(join(dir, 'docs'))
        writeFileSync(join(dir, 'docs', 'a.md'), '# A', 'utf8')
        // 'docs/b.md' is referenced but intentionally never written to disk.
        const file = writeDslFile(ws({
            people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [DOC_A, DOC_B] }],
        }))
        const plan = planDocumentCopies([file], dir)
        expect(plan.copies).toEqual([{ from: join(dir, 'docs', 'a.md'), to: '__docs/docs/a.md' }])
        expect(plan.missing).toEqual(['docs/b.md'])
    })

    it('finds docs via docsRootFor when the workspace sits in a subfolder of its own repo', () => {
        dir = mkdtempSync(join(tmpdir(), 'c4hero-doc-collection-'))
        mkdirSync(join(dir, '.git'))
        mkdirSync(join(dir, 'docs'))
        mkdirSync(join(dir, 'arch'))
        writeFileSync(join(dir, 'docs', 'a.md'), '# A', 'utf8')
        const file = join(dir, 'arch', 'workspace.dsl')
        writeFileSync(file, serializeDSL(ws({
            people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [DOC_A] }],
        })), 'utf8')
        const plan = planDocumentCopies([file], docsRootFor(join(dir, 'arch')))
        expect(plan.copies).toEqual([{ from: join(dir, 'docs', 'a.md'), to: '__docs/docs/a.md' }])
        expect(plan.missing).toEqual([])
    })

    it('dedupes a path referenced by two elements into a single copy', () => {
        dir = mkdtempSync(join(tmpdir(), 'c4hero-doc-collection-'))
        mkdirSync(join(dir, 'docs'))
        writeFileSync(join(dir, 'docs', 'a.md'), '# A', 'utf8')
        const file = writeDslFile(ws({
            people: [
                { id: 'p1', type: 'person', name: 'P1', tags: [], properties: {}, documents: [DOC_A] },
                { id: 'p2', type: 'person', name: 'P2', tags: [], properties: {}, documents: [DOC_A] },
            ],
        }))
        const plan = planDocumentCopies([file], dir)
        expect(plan.copies).toEqual([{ from: join(dir, 'docs', 'a.md'), to: '__docs/docs/a.md' }])
        expect(plan.missing).toEqual([])
    })

    it('does not throw when a referenced file is missing on disk', () => {
        dir = mkdtempSync(join(tmpdir(), 'c4hero-doc-collection-'))
        const file = writeDslFile(ws({
            people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [DOC_A] }],
        }))
        expect(() => planDocumentCopies([file], dir)).not.toThrow()
        const plan = planDocumentCopies([file], dir)
        expect(plan.copies).toEqual([])
        expect(plan.missing).toEqual(['docs/a.md'])
    })

    it('rejects a path-traversal attempt via a relative "../" escape instead of copying outside the project root', () => {
        dir = mkdtempSync(join(tmpdir(), 'c4hero-doc-collection-'))
        // A real file that genuinely exists just outside projectRoot, so a bug
        // that fails to guard would otherwise succeed in copying it.
        writeFileSync(join(dir, '..', 'secret.md'), '# secret', 'utf8')
        try {
            const escaped: DocLink = { path: '../secret.md', title: 'Secret' }
            const file = writeDslFile(ws({
                people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [escaped] }],
            }))
            const plan = planDocumentCopies([file], dir)
            expect(plan.copies).toEqual([])
            expect(plan.missing).toEqual(['../secret.md'])
        } finally {
            rmSync(join(dir, '..', 'secret.md'), { force: true })
        }
    })

    it('rejects an absolute path instead of copying it', () => {
        dir = mkdtempSync(join(tmpdir(), 'c4hero-doc-collection-'))
        const absolute: DocLink = { path: '/etc/passwd', title: 'Absolute' }
        const file = writeDslFile(ws({
            people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [absolute] }],
        }))
        const plan = planDocumentCopies([file], dir)
        expect(plan.copies).toEqual([])
        expect(plan.missing).toEqual(['/etc/passwd'])
    })

    // M1 regression: `to` must be built from the normalized/contained `rel`,
    // never the raw `docPath`. A path with leading `../` segments can resolve
    // to a real SOURCE file back inside projectRoot (passing a source-only
    // containment check) while those same `../` segments, pasted verbatim
    // after `__docs/` by a caller joining `to` against its own outDir
    // (vite.config.ts / scripts/build-viewer.mjs), would climb back OUT of
    // dist/ or dist-viewer/ entirely. Proven here is the end state: such a
    // path never reaches `copies` — it's rejected entirely.
    it('M1: rejects a "../" path whose SOURCE resolves back inside projectRoot, instead of building an unsafe destination from it', () => {
        const tmpRoot = mkdtempSync(join(tmpdir(), 'c4hero-doc-collection-'))
        try {
            // Nested two levels so "../../a/project/<file>" cancels back to
            // exactly projectRoot -- the shape the finding describes.
            const projectRoot = join(tmpRoot, 'a', 'project')
            mkdirSync(projectRoot, { recursive: true })
            writeFileSync(join(projectRoot, 'ok.md'), '# ok', 'utf8')

            const traversal: DocLink = { path: '../../a/project/ok.md', title: 'Traversal' }
            const dslFile = join(projectRoot, 'workspace.dsl')
            writeFileSync(
                dslFile,
                serializeDSL(ws({
                    people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [traversal] }],
                })),
                'utf8',
            )

            const plan = planDocumentCopies([dslFile], projectRoot)
            expect(plan.copies).toEqual([])
            expect(plan.missing).toEqual(['../../a/project/ok.md'])
        } finally {
            rmSync(tmpRoot, { recursive: true, force: true })
        }
    })

    // M2 regression: a tracked file can itself be a symlink whose target
    // lives outside projectRoot. existsSync/statSync/readFileSync all follow
    // symlinks, so the textual containment check alone isn't enough -- the
    // REAL path must be re-checked.
    it('M2: rejects a path that is a symlink pointing outside projectRoot', () => {
        const tmpRoot = mkdtempSync(join(tmpdir(), 'c4hero-doc-collection-'))
        try {
            const projectRoot = join(tmpRoot, 'project')
            mkdirSync(join(projectRoot, 'docs'), { recursive: true })

            // A real file genuinely outside projectRoot.
            const secretPath = join(tmpRoot, 'secret.md')
            writeFileSync(secretPath, '# secret', 'utf8')

            // A symlink INSIDE projectRoot whose target escapes it.
            const linkPath = join(projectRoot, 'docs', 'link.md')
            symlinkSync(secretPath, linkPath)

            const linked: DocLink = { path: 'docs/link.md', title: 'Linked' }
            const dslFile = join(projectRoot, 'workspace.dsl')
            writeFileSync(
                dslFile,
                serializeDSL(ws({
                    people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [linked] }],
                })),
                'utf8',
            )

            const plan = planDocumentCopies([dslFile], projectRoot)
            expect(plan.copies).toEqual([])
            expect(plan.missing).toEqual(['docs/link.md'])
        } finally {
            rmSync(tmpRoot, { recursive: true, force: true })
        }
    })

    // M3 regression: only markdown-extension paths are ever planned for
    // copy, even when the referenced file genuinely exists and is otherwise
    // a valid, contained path.
    it('M3: rejects a non-markdown-extension reference even though the file exists on disk', () => {
        dir = mkdtempSync(join(tmpdir(), 'c4hero-doc-collection-'))
        writeFileSync(join(dir, 'notes.txt'), 'plain text', 'utf8')
        const nonMarkdown: DocLink = { path: 'notes.txt', title: 'Notes' }
        const file = writeDslFile(ws({
            people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [nonMarkdown] }],
        }))
        const plan = planDocumentCopies([file], dir)
        expect(plan.copies).toEqual([])
        expect(plan.missing).toEqual(['notes.txt'])
    })

    // M3 regression: a hidden-segment path (e.g. reaching into .git/) is
    // rejected even though it carries a markdown extension.
    it('M3: rejects a path with a hidden-directory segment (e.g. .git/...) even with a markdown extension', () => {
        dir = mkdtempSync(join(tmpdir(), 'c4hero-doc-collection-'))
        mkdirSync(join(dir, '.git'))
        writeFileSync(join(dir, '.git', 'config.md'), 'fake', 'utf8')
        const hidden: DocLink = { path: '.git/config.md', title: 'Hidden' }
        const file = writeDslFile(ws({
            people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [hidden] }],
        }))
        const plan = planDocumentCopies([file], dir)
        expect(plan.copies).toEqual([])
        expect(plan.missing).toEqual(['.git/config.md'])
    })
})

describe('transitive document collection', () => {
    let dir: string
    let out: string

    afterEach(() => {
        if (dir) rmSync(dir, { recursive: true, force: true })
        if (out) rmSync(out, { recursive: true, force: true })
    })

    function setup(files: Record<string, string>, rootDoc = 'docs/a.md'): string {
        dir = mkdtempSync(join(tmpdir(), 'c4hero-doc-crawl-'))
        for (const [rel, body] of Object.entries(files)) {
            mkdirSync(join(dir, rel, '..'), { recursive: true })
            writeFileSync(join(dir, rel), body, 'utf8')
        }
        const dsl = join(dir, 'workspace.dsl')
        writeFileSync(dsl, serializeDSL(ws({
            people: [{ id: 'p1', type: 'person', name: 'P', tags: [], properties: {}, documents: [{ path: rootDoc, title: 'A' }] }],
        })), 'utf8')
        return dsl
    }

    it('follows links, mentions and wikilinks transitively and lists exactly the copied docs in the index', () => {
        const dsl = setup({
            'docs/a.md': '# A\n\nSee [[B]] and [[Missing note]] and [[B\\|again]].',
            'docs/sub/B.md': 'B mentions `c.md` and ![[#top]]',
            'docs/sub/c.md': '[d](../d.md#x) and [e](https://example.com/e.md)',
            'docs/d.md': '# D',
            'docs/unlinked.md': 'nobody links here',
        })
        const plan = planDocumentCopies([dsl], dir)

        expect(plan.copies.map((c) => c.to)).toEqual([
            '__docs/docs/a.md',
            '__docs/docs/sub/B.md',
            '__docs/docs/sub/c.md',
            '__docs/docs/d.md',
        ])
        expect(plan.missing).toEqual(['docs/Missing note.md'])
        expect(plan.warnings).toEqual([])

        out = mkdtempSync(join(tmpdir(), 'c4hero-doc-out-'))
        writeDocumentCopies(plan, out)
        expect(existsSync(join(out, '__docs/docs/sub/c.md'))).toBe(true)
        expect(existsSync(join(out, '__docs/docs/unlinked.md'))).toBe(false)
        expect(JSON.parse(readFileSync(join(out, '__docs/__index.json'), 'utf8'))).toEqual({
            files: ['docs/a.md', 'docs/d.md', 'docs/sub/B.md', 'docs/sub/c.md'],
        })
    })

    it('ignores links in fenced and inline code, and survives cycles', () => {
        const dsl = setup({
            'docs/a.md': '```\n[x](hidden.md) [[Hidden]]\n```\n`[[AlsoHidden]]` [back](b.md)',
            'docs/b.md': '[a](a.md)',
            'docs/hidden.md': '',
            'docs/Hidden.md': '',
        })
        const plan = planDocumentCopies([dsl], dir)
        expect(plan.copies.map((c) => c.to)).toEqual(['__docs/docs/a.md', '__docs/docs/b.md'])
        expect(plan.missing).toEqual([])
    })

    it('applies the allowlist to linked docs: escapes, hidden segments and non-markdown are missing', () => {
        const outside = mkdtempSync(join(tmpdir(), 'c4hero-doc-outside-'))
        writeFileSync(join(outside, 'secret.md'), 'secret', 'utf8')
        try {
            const dsl = setup({
                'docs/a.md': '[up](../../secret.md) [h](.hidden/h.md) [t](t.txt) [l](link.md)',
                '.hidden/h.md': 'h',
            })
            symlinkSync(join(outside, 'secret.md'), join(dir, 'docs', 'link.md'))
            const plan = planDocumentCopies([dsl], dir)
            expect(plan.copies.map((c) => c.to)).toEqual(['__docs/docs/a.md'])
            expect(plan.missing).toEqual(expect.arrayContaining(['../secret.md', 'docs/link.md']))
            expect(plan.missing).not.toContain('docs/t.txt')
        } finally {
            rmSync(outside, { recursive: true, force: true })
        }
    })

    it('caps the crawl and warns', () => {
        const files: Record<string, string> = { 'docs/a.md': '[n](n0.md)' }
        for (let i = 0; i < 2005; i++) files[`docs/n${i}.md`] = `[n](n${i + 1}.md)`
        const dsl = setup(files)
        const plan = planDocumentCopies([dsl], dir)
        expect(plan.copies).toHaveLength(2000)
        expect(plan.warnings).toHaveLength(1)
    })
})
