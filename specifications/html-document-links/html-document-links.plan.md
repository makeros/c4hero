# HTML document links

## Task Details

Follow-up to `specifications/document-links/document-links.plan.md` (markdown
document links) and `specifications/documents-sidebar/`. Requirements were
agreed in a planning Q&A on 2026-10-21; the answers are recorded as decisions
in Proposed Solution.

## Goal

**Goal**: Let a document link (`documents[].path`) point at a local `.html` /
`.htm` file, and open it in the browser with its own styles, scripts and
relative assets. This must work in `npm run dev`, `npm run build --
--workspace <dir>` and `build:viewer` bundles, and the HTML must never run on
the c4hero origin.

**Success Measure**: An element links `docs/report.html`, which loads
`report.css`, `chart.js` and `img/logo.png` from next to itself. Clicking the
link in the inspector, the documents sidebar or the canvas indicator opens
`/document-view?path=docs/report.html`. The report renders with its own CSS,
its JS runs and the image shows. Inside the frame, `window.origin === 'null'`
and `localStorage` throws. The same holds in a `build:viewer` bundle served by
a plain static server that sets no headers.

**Do NOT touch / do NOT add**:
- No DSL change. The kind of a document (markdown vs HTML) is inferred from
  the path's extension, and `c4hero.documents.N.path/title` stays as it is.
- Never give the frame `allow-same-origin`. Combined with `allow-scripts`, it
  lets the document remove its own sandbox.
- Do not crawl `<a href>` links from HTML to other `.html` pages. Only
  subresources and links to `.md` files are followed.
- Do not change markdown rendering, its styling, or the rule that dev serves
  any `.md` file under the docs root.
- Do not add `--create` HTML scaffolding to `link-doc`.
- Do not touch the export/plugin viewer build (`exportBuild` in
  `vite.config.ts`). The `document-links` plugin is already disabled there.
- Do not add an inspector badge showing the document type (see Improvements).

## Proposed Solution

### Decisions (from the Q&A)

| # | Decision |
| --- | --- |
| D1 | HTML is shown by the hosted page, never re-rendered. `/document-view?path=x.html` shows a slim 36px top bar (title and path) above a full-bleed `<iframe sandbox>` whose `src` is `/__docs/x.html` (fragment passed through). |
| D2 | Scripts are allowed. Sandbox flags: `allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation`. No `allow-same-origin`, so the frame has an opaque origin. |
| D3 | Two layers of isolation. The iframe `sandbox` attribute works on any host. Where we control response headers (the dev middleware, and Vercel via `vercel.json`), raw `/__docs/*` HTML/asset responses also carry `Content-Security-Policy: sandbox <same flags>`, so opening the raw URL directly is isolated too. On hosts without header control, only the raw URL is unprotected. That is documented and accepted. |
| D4 | Relative assets are supported. The build parses HTML subresources (`<img src/srcset>`, `<script src>`, `<link rel=stylesheet\|icon\|preload href>`, `<source src/srcset>`, `<video src/poster>`, `<audio src>`) and `url(...)`/`@import` inside linked and inline CSS. Assets pass the same containment, hidden-segment and symlink guards as documents, plus an extension allowlist. |
| D5 | Dev serves HTML and assets only if the build would copy them. This is computed by the same `planDocumentCopies` from the dev workspace's `.dsl` files, cached, and invalidated by the file watcher. Markdown keeps today's rule (any `.md` under the root). |
| D6 | Links from markdown to HTML work: `[x](report.html)` resolves, renders as a `/document-view` link, and is crawled by the build. |
| D7 | Links from HTML to markdown work. When serving (dev) and copying (build), `<a href="*.md">` is rewritten to `/document-view?path=<resolved>` with `target="_top"`. Only the served bytes change, never the source file. |
| D8 | Wikilinks: when `[[report]]` matches a markdown file, markdown wins. Otherwise it falls back to `report.html`. An explicit `[[report.html]]` is honoured. |
| D9 | Live reload in dev: any doc-change event reloads an open HTML frame. |

### Why these flags

Opaque origin (`allow-scripts` without `allow-same-origin`): the document's
scripts can't read c4hero's `localStorage` (`src/store/ai-settings.ts`
persists `apiKeys` there) or its IndexedDB folder handles.
`allow-top-navigation-by-user-activation` lets a clicked rewritten `.md` link
(D7, `target=_top`) navigate the tab. `allow-popups*` lets a `target=_blank`
link open unsandboxed.

Known limitation: a script inside the frame that `fetch()`es a sibling file
(for example JSON data) fails CORS because its origin is `null`. Subresource
tags (`<script src>`, `<img>`, CSS) are unaffected.

### Contracts

```ts
// src/lib/docPath.ts
export type DocumentKind = 'markdown' | 'html'
export function documentKind(path: string): DocumentKind | null      // by extension
export function hasDocumentExtension(path: string): boolean          // .md .markdown .html .htm
export function hasAssetExtension(path: string): boolean             // see allowlist below
export function contentTypeFor(path: string): string                 // markdown, html, asset types
export function listDocumentFiles(root: string, opts?: { limit?: number }): { files: string[]; truncated: boolean } // md + html
// docPathProblem: now accepts .html/.htm; message becomes "must end in .md, .markdown, .html or .htm"
```

Asset allowlist: `css js mjs png jpg jpeg gif svg webp avif ico woff woff2 ttf
otf mp4 webm mp3 ogg`. Explicitly excluded: `json`, `map`, `wasm`, `ts`, and
anything else.

```ts
// src/lib/htmlDocLinks.ts — Node-safe (no DOM), parse5-based
export interface HtmlReferences {
  subresources: string[]   // raw src/href/srcset-candidate values, per D4
  docHrefs: string[]       // raw <a href> values ending in .md/.markdown (D7)
}
export function extractHtmlReferences(html: string): HtmlReferences
export function extractCssUrls(css: string): string[]           // url(...) and @import
export function rewriteHtmlDocLinks(html: string, docPath: string): string  // D7, source-location splice
```

```ts
// src/lib/documentCollection.ts — extended
export interface DocumentCopyPlan {
  copies: Array<{ from: string; to: string; kind: 'markdown' | 'html' | 'asset' }>
  missing: string[]
  warnings: string[]
}
export function servedPaths(plan: DocumentCopyPlan): Set<string>  // root-relative paths, for D5
```

`writeDocumentCopies` passes `kind: 'html'` copies through
`rewriteHtmlDocLinks` and copies everything else byte for byte.
`__docs/__index.json` lists documents (markdown and HTML), never assets.

### Serving flow (dev)

```
GET /__docs/<p>
├─ __index.json            → listDocumentFiles(docsRoot)         (md + html, D8)
├─ .md/.markdown           → unchanged behaviour (any md under root)
├─ .html/.htm or asset ext → 404 unless p ∈ servedPaths(cachedPlan)
│    html  → rewriteHtmlDocLinks, text/html
│    asset → contentTypeFor(p)
│    both  → CSP: sandbox <flags>; X-Content-Type-Options: nosniff
└─ anything else           → 400 (as today)
```

`cachedPlan` is built from the `*.dsl` files directly in
`VITE_DEV_WORKSPACE_PATH`, using the same directory listing as `closeBundle`
and loaded with `server.ssrLoadModule('/src/lib/documentCollection.ts')`.
Without `--workspace` there are no DSL files, so no HTML is served in dev.
That matches the build and is expected.

### Service worker

`vite-plugin-pwa`'s workbox `globPatterns` include `**/*.html`/`js`/`css`, so
`dist/__docs/**` would be precached. Its SPA navigation fallback would also
answer the iframe's navigation to `/__docs/x.html` with `index.html`. Both
are fixed with `globIgnores: ['__docs/**', …]` and
`navigateFallbackDenylist: [/^\/__docs\//]`.

## Current Implementation Analysis

**Reuse, no changes:**
- `DocLink` type and DSL round trip (`src/lib/dsl/documentLinks.ts`).
- `documentViewUrl` (`src/lib/documentLinks.ts`). It is generic over the
  path, so the inspector, sidebar and canvas indicator pick up HTML for free.
- `resolveCopyable` containment and symlink checks in
  `src/lib/documentCollection.ts:63-92`. Generalise its extension test and
  keep the rest.
- The `writeDocumentCopies` call sites in `vite.config.ts` `closeBundle` and
  `scripts/build-viewer.mjs`. Neither changes.
- `isInsideRootReal`, `docsRootFor`, `resolveDocRequest`
  (`src/lib/docPath.ts`).
- The `onDocChange` live-reload channel (`src/lib/docLiveReload.ts`).
- `StatusScreen` and the not-found/error states in
  `src/components/views/DocumentView.tsx`.

**To be modified:**
- `src/lib/docPath.ts`: kinds, asset allowlist, content types,
  `listDocumentFiles`, `docRelativePath` accepting HTML and assets.
- `src/lib/docLinks.ts`: `DOC_EXT` gains html/htm, plus the wikilink fallback
  (D8) and `<x.html>` autolinks in `extractDocLinks`. `CODE_DOC_PATH` stays
  markdown-only (see Improvements).
- `src/lib/markdown.ts`: the wikilink label strips `.html`/`.htm` too
  (line 44).
- `src/lib/documentCollection.ts`: crawl HTML, CSS and assets; `kind` on
  copies; `servedPaths`; HTML rewrite on write.
- `vite.config.ts`: dev middleware (D5, D3 headers), watcher notify, PWA
  workbox options.
- `index.html` meta CSP: `frame-src 'none'` becomes `frame-src 'self'`.
- `vercel.json`: exclude `/__docs/` from the global `X-Frame-Options: DENY`
  and `frame-ancestors 'none'` rule, and add a `/__docs/(.*)` rule.
- `src/components/views/DocumentView.tsx`: switch to `HtmlDocumentFrame` by
  kind.
- `src/cli/commands/docs.ts`: title default strips `.html`/`.htm`;
  `--create` with an HTML path is a usage error.
- `plugins/c4hero/skills/c4hero-modeling/SKILL.md` and
  `plugins/c4hero/skills/c4hero-modeling/references/c4hero-conventions.md`:
  document HTML paths.
- `package.json`: add `parse5` to `devDependencies`. It is already present
  transitively via jsdom. It is used only at build and dev time, through
  `ssrLoadModule`.

**To be created:**
- `src/lib/htmlDocLinks.ts` (+ test)
- `src/components/views/HtmlDocumentFrame.tsx` (+ test)

## Technical Context

**Stack**: React 19, TypeScript strict (`tsc -b`), Vite with
`vite-plugin-pwa` (workbox), React Router 7, Vitest + jsdom (unit),
Playwright (`test:e2e`, `webServer: npm run dev`), `marked` + `dompurify`.
Package manager: npm.

**Conventions**:
- Doc-path rules live only in `src/lib/docPath.ts`, which uses `node:path`
  and `node:fs` only. Vite config, the CLI and the build share it. Keep
  `htmlDocLinks.ts` Node-safe in the same way: no DOM, and never import it
  from client code.
- `documentCollection.ts` never throws for a missing or rejected path. It
  goes to `missing`, and the build warns but doesn't fail.
- Node-side modules are loaded by Vite plugins and scripts via
  `server.ssrLoadModule(...)`, not plain `import` (see
  `document-links.plan.md`, Task 3.2 correction).
- Paths are project-root-relative POSIX. Dev's docs root is
  `docsRootFor(VITE_DEV_WORKSPACE_PATH)`.
- Comments explain *why*, at the density of the surrounding code.
  Intentional `console.warn` in `vite.config.ts` gets a narrow
  `eslint-disable-next-line no-console`.

**Commands** (verbatim from `package.json`):
- Unit, one file: `npx vitest run <path>`
- Unit, all: `npm test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint` (scoped: `npx eslint <files>`)
- Build: `npm run build` / `npm run build -- --workspace <dir>`
- Locked viewer: `npm run build:viewer -- --workspace <file>.dsl`
- Plugin bundle: `npm run build:plugin`
- Dev: `npm run dev -- --workspace <dir>`
- E2E: `npm run test:e2e`
- Everything: `npm run check`

## Phases and Tasks

### Phase 1: Path, link and HTML-parsing primitives

**Goal**: The pure building blocks know about HTML documents and assets. No
serving or UI changes yet.

Parallel group A: Tasks 1.1, 1.2, 1.3. They are independent and touch
disjoint files. Task 1.3 imports nothing new from 1.1 or 1.2. It uses the
existing `resolveDocLink` and checks `.md` itself.

- [x] **Task 1.1: HTML and asset rules in `docPath.ts`**
  Add `DocumentKind`, `documentKind`, `hasDocumentExtension`,
  `hasAssetExtension`, `contentTypeFor` and `listDocumentFiles` per
  Contracts. Make `docPathProblem` accept `.html`/`.htm`. Make
  `docRelativePath` return paths for documents and allowlisted assets, so
  the watcher can announce asset changes. Keep `hasMarkdownExtension` and
  `listMarkdownFiles` exported. Callers are switched over in later tasks.
  **Files:** `src/lib/docPath.ts` (modify), `src/lib/docPath.test.ts` (modify)
  **Definition of Done:**
  - [x] `documentKind('a/b.HTML') === 'html'`,
    `documentKind('a.md') === 'markdown'`, `documentKind('a.css') === null`.
  - [x] `hasAssetExtension` accepts each allowlisted extension and rejects
    `.json`, `.map`, `.wasm`, `.ts` and `.env`.
  - [x] `docPathProblem('docs/r.html') === null`, and `docPathProblem('x.css')`
    is non-null.
  - [x] `listDocumentFiles` returns `.md` and `.html` files and skips hidden
    and `node_modules` entries (same fixtures style as the existing
    `listMarkdownFiles` tests).
  - [x] `npx vitest run src/lib/docPath.test.ts` passes.

- [x] **Task 1.2: Markdown↔HTML link resolution**
  In `docLinks.ts`, extend `DOC_EXT` to `md|markdown|html|htm`. In
  `resolveWikilink`, an extensionless target tries the `.md` candidates
  first (relative, root, then index name match) and, only when none match,
  the same lookup with `.html` (D8). An explicit `.html`/`.htm` target is
  used as written. `extractDocLinks` autolinks match `<x.html>` too.
  `CODE_DOC_PATH` stays markdown-only. In `markdown.ts`, strip
  `.html`/`.htm` from wikilink labels.
  **Files:** `src/lib/docLinks.ts` (modify), `src/lib/docLinks.test.ts`
  (modify), `src/lib/markdown.ts` (modify), `src/lib/markdown.test.ts` (modify)
  **Definition of Done:**
  - [x] `resolveDocLink('docs/a.md', 'r.html#x')` →
    `{ kind: 'doc', path: 'docs/r.html', fragment: 'x' }`.
  - [x] With index `['r.md', 'r.html']`, `[[r]]` → `r.md`. With index
    `['r.html']`, `[[r]]` → `r.html`. `[[r.html]]` → `r.html`.
  - [x] `renderMarkdownToSafeHtml('[x](r.html)', { docPath: 'a.md', index })`
    produces an `href` starting `/document-view?path=r.html`.
  - [x] An inline-code mention of `` `index.html` `` is not turned into a
    link.
  - [x] `npx vitest run src/lib/docLinks.test.ts src/lib/markdown.test.ts`
    passes.

- [x] **Task 1.3: `htmlDocLinks.ts`, the Node-side HTML reference extractor and rewriter**
  Implement the Contracts with `parse5` (add to `devDependencies`), using
  source locations to splice attribute values so untouched bytes are
  preserved. `extractHtmlReferences` covers the D4 tag and attribute list,
  splits `srcset` into URLs, and reads inline `<style>` blocks and `style=""`
  attributes through `extractCssUrls`. It skips `data:`, `blob:`, `#…`,
  protocol-relative and any `scheme:` URLs. `rewriteHtmlDocLinks` rewrites
  only `<a href>` values that `resolveDocLink(docPath, href)` classifies as a
  `.md`/`.markdown` doc. It sets `href` to the same
  `/document-view?path=…&title=…#frag` shape as `markdown.ts`'s
  `docViewHref`, with the title taken from the anchor text, and sets
  `target="_top"`. Every other byte is untouched.
  **Files:** `src/lib/htmlDocLinks.ts` (create),
  `src/lib/htmlDocLinks.test.ts` (create), `package.json` (modify),
  `package-lock.json` (modify)
  **Definition of Done:**
  - [x] Extraction fixture: one HTML with `<link rel=stylesheet>`,
    `<script src>`, `<img srcset="a.png 1x, b.png 2x">`,
    `<video poster>`, inline `<style>` with `url(f.woff2)` and
    `@import "x.css"`, a `data:` image, an `https://` script and
    `<a href="n.md">`. Subresources are exactly the local ones and
    `docHrefs` is `['n.md']`.
  - [x] Rewrite: `<a href="../n.md#h">N</a>` in `docs/r.html` becomes
    `href="/document-view?path=n.md&title=N#h" target="_top"`. An
    `<a href="other.html">` and the rest of the document are byte-identical.
  - [x] `npx vitest run src/lib/htmlDocLinks.test.ts` passes, and
    `npm run typecheck` passes.
  **Stop Rule:** If `parse5`'s source-location info can't give attribute
  value offsets reliably, stop and report instead of switching to regex
  rewriting.

**Phase 1 Verification:** `npx vitest run src/lib/docPath.test.ts
src/lib/docLinks.test.ts src/lib/markdown.test.ts src/lib/htmlDocLinks.test.ts`
and `npm run typecheck`.

### Phase 2: Collection, serving, hosting config

**Goal**: `/__docs/*` serves HTML and its assets, isolated and identical in
dev and builds, and nothing (service worker, CSP, `X-Frame-Options`) blocks
framing it.

Parallel group B: Tasks 2.1 and 2.3. They are independent and touch
disjoint files. Task 2.2 depends on 2.1.

- [x] **Task 2.1: Collect HTML documents and their assets**
  Extend `planDocumentCopies`:
  - `collect` accepts any `hasDocumentExtension` path as a document and any
    `hasAssetExtension` path as an asset. Generalise the extension test in
    `resolveCopyable`; the containment and symlink logic is unchanged.
  - Crawl the queue by kind:
    - markdown: as today, plus `.html` targets via the extended
      `resolveDocLink`/`resolveWikilink`, using `listDocumentFiles` as the
      root index.
    - html: `extractHtmlReferences`. Each subresource is resolved relative
      to the HTML file and collected as an asset. Each `docHrefs` entry is
      collected as markdown.
    - css asset: `extractCssUrls`, resolved relative to the CSS file and
      collected as assets.
  - A subresource that fails the allowlist or containment goes to `missing`,
    like documents do.
  - Add a per-asset size cap of 25 MB (with a warning, not copied) and keep
    `MAX_COLLECTED_DOCUMENTS` covering documents and assets together.
  - Add `servedPaths`.
  - `writeDocumentCopies` runs `rewriteHtmlDocLinks` on `html` copies, and
    `__index.json` lists `markdown` and `html` copies only.
  **Files:** `src/lib/documentCollection.ts` (modify),
  `src/lib/documentCollection.test.ts` (modify), `src/lib/htmlDocLinks.ts`
  (reuse, created in Task 1.3), `src/lib/docPath.ts` (reuse, modified in
  Task 1.1)
  **Definition of Done:**
  - [x] Fixture: the DSL links `docs/r.html`, which references
    `r.css` (which `url()`s `img/bg.png`), `app.js`, `../shared/logo.svg`,
    `.secret/x.png` and `n.md`. The plan copies `r.html`, `r.css`,
    `img/bg.png`, `app.js`, `shared/logo.svg` and `n.md` with the correct
    `kind`. `.secret/x.png` is in `missing`.
  - [x] A markdown doc linking `[r](r.html)` pulls in `r.html` and its
    assets.
  - [x] A subresource symlinked outside the root is not copied.
  - [x] After `writeDocumentCopies`, the copied `r.html` has its `n.md` link
    rewritten, and `__index.json` contains `r.html` and `n.md` but no assets.
  - [x] `npx vitest run src/lib/documentCollection.test.ts` passes.

- [x] **Task 2.2: Dev middleware, watcher and service worker**
  In the `document-links` plugin, implement the serving flow:
  - Build a lazily-computed `cachedPlan` from the dev workspace's `*.dsl`
    files via `server.ssrLoadModule('/src/lib/documentCollection.ts')`.
    Reset it when the watcher sees an add, change or unlink of any `.dsl`
    file under the docs root, or of any document/asset path under it
    (`docRelativePath(docsRoot, file) !== null`) — a markdown edit can add or
    remove an HTML link (D6) or wikilink fallback (D8), and any document/
    asset add or unlink changes what there is to crawl.
  - The `__index.json` endpoint returns `listDocumentFiles`.
  - HTML and asset responses go through `servedPaths` membership and carry
    the D3 `Content-Security-Policy: sandbox …` header and `nosniff`. HTML
    is passed through `rewriteHtmlDocLinks`.
  - `notifyDocChange` covers HTML and assets (via the widened
    `docRelativePath`).
  - Workbox gets `globIgnores` `'__docs/**'` and
    `navigateFallbackDenylist: [/^\/__docs\//]`.
  - Keep the 400 path for every other extension, hidden segment or escape.
  **Files:** `vite.config.ts` (modify)
  **Definition of Done:**
  - [x] `npm run typecheck` and `npx eslint vite.config.ts` pass.
  - [x] With `npm run dev -- --workspace <fixture>` (fixture from Task 2.1's
    shape), `curl -i`:
    - `/__docs/docs/r.html` → 200, `content-type: text/html`, `CSP: sandbox …`,
      body has the rewritten `.md` link.
    - `/__docs/docs/app.js` → 200, JS content type.
    - an unreferenced `/__docs/src/main.js` under the root → 404.
    - `/__docs/.env` → 400.
    - `/__docs/docs/n.md` → 200 (unchanged).
    Record the outputs in the task report.
  - [x] The generated `dist/sw.js` after `npm run build` contains the
    `__docs` denylist and no `__docs/` precache entries. Check with
    `grep -c "__docs" dist/sw.js`, and confirm there's no precache URL
    starting `__docs/`.
  **Clues:** the middleware is at `vite.config.ts:85-155` and the workbox
  block at `:220`. `closeBundle` already lists `*.dsl` in a directory; reuse
  that listing, don't copy it.

- [x] **Task 2.3: Allow same-origin framing of `/__docs/`**
  In `index.html`'s meta CSP, change `frame-src 'none'` to
  `frame-src 'self'`. In `vercel.json`:
  - Change the global header rule's `source` to `/((?!__docs/).*)` so
    `X-Frame-Options: DENY` and `frame-ancestors 'none'` stop applying to
    docs.
  - Add a `/__docs/(.*)` rule with `X-Frame-Options: SAMEORIGIN`,
    `X-Content-Type-Options: nosniff`, the HSTS/Referrer headers copied from
    the global rule, and `Content-Security-Policy: sandbox allow-scripts
    allow-popups allow-popups-to-escape-sandbox
    allow-top-navigation-by-user-activation; frame-ancestors 'self'`.
  - In the app CSP, change `frame-src 'none'` to `frame-src 'self'`.
  **Files:** `index.html` (modify), `vercel.json` (modify)
  **Definition of Done:**
  - [x] `index.html` contains `frame-src 'self'` and no `frame-src 'none'`.
  - [x] `vercel.json` is valid JSON
    (`node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`).
    It has exactly one rule whose source matches `/__docs/`, and the global
    rule's CSP contains `frame-src 'self'`.

**Phase 2 Verification:** `npm run build -- --workspace <fixture-dir>`. Then
confirm `dist/__docs/docs/` has `r.html` (with its `.md` link rewritten),
`r.css`, `app.js` and `img/bg.png`, and that `dist/__docs/__index.json` lists
no assets. Also `npm run typecheck`.

### Phase 3: Viewer

**Goal**: `/document-view?path=x.html` shows the sandboxed frame.

- [x] **Task 3.1: `HtmlDocumentFrame` and the `DocumentView` switch**
  Create `HtmlDocumentFrame({ path, title, hash })`:
  - It first `fetch`es `/__docs/<encodeURI(path)>` (same `..` guard as
    `DocumentView`). A 404 shows the existing "Document not found"
    `StatusScreen`, any other failure the error screen. Export
    `StatusScreen` from `DocumentView.tsx`, or move it, without changing its
    look.
  - On success it renders a 36px bar with `var(--color-*)` tokens showing
    the title (or file name) and a muted path. Below the bar, an `<iframe>`
    fills the rest of the viewport on a white background, with
    `src="/__docs/<path><hash>"`, `title={title}` and exactly the D2
    `sandbox` flags.
  - Subscribe to `onDocChange` and remount the iframe (key bump) on any
    event (D9).
  - `DocumentView` renders `HtmlDocumentFrame` when
    `documentKind(path) === 'html'` (import the kind check from a
    client-safe place: `docPath.ts` imports `node:fs`, so add a tiny
    extension helper in `src/lib/documentLinks.ts` or `docLinks.ts`). The
    markdown path is otherwise unchanged. The tab title uses the same
    `title` logic.
  **Files:** `src/components/views/HtmlDocumentFrame.tsx` (create),
  `src/components/views/HtmlDocumentFrame.test.tsx` (create),
  `src/components/views/DocumentView.tsx` (modify),
  `src/components/views/DocumentView.test.tsx` (modify),
  `src/lib/documentLinks.ts` (modify)
  **Definition of Done:**
  - [x] Test: the frame's `sandbox` attribute tokens equal the D2 set
    exactly, with no `allow-same-origin`.
  - [x] Tests: the `src` carries the hash; 404 shows the not-found screen;
    `DocumentView` with `?path=r.html` renders the frame and not
    `.document-view-content`; a doc-change event remounts the iframe.
  - [x] `npx vitest run src/components/views/HtmlDocumentFrame.test.tsx
    src/components/views/DocumentView.test.tsx` passes, and
    `npm run typecheck` passes.
  **Clues:** `DocumentView` is lazy-loaded from `App.tsx`. Keep
  `HtmlDocumentFrame` inside that chunk, with no eager import.
  `isStandaloneRoute()` (`src/lib/routes.ts`) already protects
  `/document-view` from canvas redirects.

**Phase 3 Verification:** run `npm run dev -- --workspace <fixture-dir>`
and open `/document-view?path=docs/r.html`. The report's CSS is applied,
`app.js` ran (the fixture writes a marker into the DOM), and
`frame.contentWindow` access from the parent throws a cross-origin error.
Then `npm run typecheck`.

### Phase 4: CLI and plugin docs

- [x] **Task 4.1: `link-doc` accepts HTML**
  The default title strips `.html`/`.htm` (`docs.ts:114`). `--create` with
  an HTML path throws `CliFailure('USAGE', …)` saying scaffolding is
  markdown-only. Update usage strings (`<repo-relative.md|.html>`). Update
  the skill text (`.md`/`.markdown`/`.html`/`.htm`, with one sentence that
  relative assets next to the HTML are bundled). Regenerate the plugin bin
  with `npm run build:plugin`.
  **Files:** `src/cli/commands/docs.ts` (modify),
  `src/cli/commands/docs.test.ts` (modify),
  `plugins/c4hero/skills/c4hero-modeling/SKILL.md` (modify),
  `plugins/c4hero/skills/c4hero-modeling/references/c4hero-conventions.md`
  (modify), `plugins/c4hero/bin/c4hero.mjs` (modify, generated)
  **Definition of Done:**
  - [x] Tests: `link-doc x --path docs/r.html` stores title `r`;
    `--create` with `.html` fails with `USAGE`; `--path x.css` still fails.
  - [x] `npx vitest run src/cli/commands/docs.test.ts` passes.
  - [x] `grep -c "html" plugins/c4hero/bin/c4hero.mjs` is greater than 0 in
    the `docPathProblem` message (the bundle was regenerated).

- [x] **Task 4.2: Keep `.html` URLs intact on clean-URL static hosts**
  Added after F.2 scenario 7 failed (decision on 2026-10-21). `npx serve`
  strips `.html` by default: it redirects `/__docs/x.html` to `/__docs/x`,
  and `-s` then answers that path with the app's `index.html`, so the frame
  shows a broken app shell. `scripts/build-viewer.mjs` now writes
  `dist-viewer/serve.json` with `{ "cleanUrls": false }` after the build
  finishes, because Vite empties `dist-viewer/`. Document that hosts which
  strip `.html` (for example Cloudflare Pages, or `serve` without this
  file) must have that turned off, next to the existing `build:viewer`
  docs. Other hosts that strip `.html` remain a documented limitation.
  **Files:** `scripts/build-viewer.mjs` (modify),
  `plugins/c4hero/skills/c4hero-modeling/references/c4hero-conventions.md`
  (modify)
  **Definition of Done:**
  - [x] After `npm run build:viewer -- --workspace <fixture>.dsl`,
    `dist-viewer/serve.json` exists and parses to `{ "cleanUrls": false }`.
  - [x] With `npx serve dist-viewer -s`, `curl -i` on a copied
    `/__docs/…/x.html` returns 200 `text/html` with the document body, not
    a 301.

## Security Considerations

- **Same-origin script execution** is the main risk. HTML documents and
  their JS are author-controlled. Defence: the iframe `sandbox` without
  `allow-same-origin` (all hosts), plus the `CSP: sandbox` response header
  (dev and Vercel). Residual risk: on a host we can't configure, someone
  opening a raw `/__docs/*.html` URL directly runs it same-origin. Accepted
  and documented. Never add `allow-same-origin`; a unit test asserts this.
- **Dev file exposure**: the middleware now serves JS, CSS and images. D5
  limits that to the planned set, so arbitrary repo source isn't served.
  Markdown rules, hidden-segment, `..` and symlink guards are unchanged.
  Assets are never `.json`, `.map`, `.env` or `.ts`.
- **Build output escape**: assets go through the same `resolveCopyable`
  normalised-`rel` destination fix (M1) and the real-path containment check
  (M2) from the markdown review.
- **SVG with script**: an SVG served raw is covered by the `CSP: sandbox`
  header where available. Inside the frame, the sandbox covers it anyway.
- **Service worker hijack**: the `/__docs/` navigation denylist stops the SW
  serving `index.html` into the frame.
- **Clickjacking**: `/__docs/` allows only same-origin framing
  (`frame-ancestors 'self'`, `SAMEORIGIN`). The app shell keeps `DENY`.

## Acceptance Criteria

- [x] A `.html`/`.htm` path can be linked from the inspector or with
  `link-doc`, and survives save and reopen (no DSL change).
- [x] Opening it shows the document with its own CSS, JS and relative
  images, below a slim c4hero bar.
- [x] The document runs in an opaque origin in dev, in a production build,
  and in a `build:viewer` bundle served without custom headers.
- [x] Markdown links to HTML docs, HTML links to `.md` docs, and `[[name]]`
  falls back to `name.html` when no markdown matches.
- [x] `npm run build -- --workspace` and `build:viewer` copy the HTML, its
  subresources and the `.md` files it links. Missing or rejected
  subresources warn and don't fail the build.
- [x] Dev serves no HTML or asset file that the build wouldn't copy.
- [x] Editing a linked HTML or CSS file in dev reloads the open frame.
- [x] Markdown documents look and behave exactly as before.

## Improvements (Out of Scope)

- Inspector and sidebar badge or icon per document kind.
- Following `<a href>` between HTML pages (multi-page generated sites such as
  TypeDoc or coverage reports). Today those pages 404 in builds unless also
  linked from the DSL or markdown.
- `fetch()` of sibling data files from inside the sandbox (blocked by the
  opaque origin). It would need serving `/__docs/` with
  `Access-Control-Allow-Origin: null` and a decision about that.
- `link-doc --create` HTML scaffold.
- Inline-code `` `x.html` `` mentions as links. Kept markdown-only to avoid
  linking every `index.html` mention in technical prose.
- Shipping `_headers` and nginx snippets for non-Vercel static hosts, so the
  raw URL is isolated there too.
- Missing-document detection on hosts with an SPA rewrite (F.1 m4). On
  Vercel, `/__docs/missing.html` returns 200 with the app shell, so the
  frame shows the sandboxed shell instead of "Document not found".
  Markdown behaves the same way today. Fix by rejecting a non-`text/html`
  response or by checking `__index.json`.
- Unit tests for the dev middleware's D5/D3 decisions (F.1 m5): 404 off
  the plan, 400 for hidden or escaping paths, the sandbox headers. These
  are covered only by verification scenario 3 today.
- Hosts that strip `.html` other than `serve` (for example Cloudflare
  Pages). They need clean URLs turned off, as documented in Task 4.2.

## Final Verification Phase

Parallel group F: Tasks F.1 and F.2.

- [x] **Task F.1: Code review.** Delegate to `code-reviewer` with this plan's
  path and the full changed-file list. The reviewer runs `npm run lint`,
  `npm run typecheck`, `npm test` and `npm run build`. Functional and E2E
  checks run in F.2, so the reviewer excludes them.
- [x] **Task F.2: Functional verification.** Delegate to `feature-verifier`
  with `specifications/html-document-links/html-document-links.verification.md`.
