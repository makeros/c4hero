# Document links

## Goal

**Goal**: Let any element (person/software system/container/component) and any
relationship hold 0..n links to local markdown documents, stored inside the
workspace's own `.dsl` text, and let the user click one to open it — rendered as
styled HTML in a new tab — from the live editor, `npm run dev`, a production
build, and the locked read-only viewer alike.

**Success Measure**: A user adds a document link to an element or a
relationship in the inspector panel, saves the workspace, reopens the `.dsl`
file and the link is still there; clicking it opens a new tab showing the
markdown rendered with c4hero's own styling (not raw text, not a file
download). The same click works after `npm run build` (when the workspace was
included via `--workspace`) and in a `build:viewer` bundle for that workspace.

**Do NOT touch / do NOT add**:
- Do not touch the existing single `url?: string` field on elements or
  relationships — its type, DSL encoding (`url "..."` bare keyword), and
  rendering stay exactly as they are today.
- Do not add remote/external URL support (http(s), Confluence, Notion) for
  document links — local markdown files only, resolved relative to the project
  root.
- Do not add an 11ty (or any other static-site-generator) dependency or build
  step — rendering is client-side markdown→HTML, everywhere.
- Do not touch `src/lib/exportProposal.ts` (the PNG/zip "export for proposal"
  feature) — it produces static images with no interactivity; document links
  have nothing to attach to there.
- Do not add File System Access API / live folder-handle resolution for
  documents (`src/lib/folderIO.ts` is unrelated to this feature) — documents
  resolve via project-root-relative paths served/copied at dev or build time,
  never via a user-granted folder handle.
- Do not add per-item CRUD store actions (`addDocumentLink`, etc.) — document
  links are full-array patches through the existing `updateElement` /
  `updateElementLive` / `updateRelationship` actions, exactly like `tags` and
  `properties` already are.

## Proposed Solution

### Data shape

```ts
export interface DocLink {
  path: string   // project-root-relative path to a local .md file
  title: string
}
```

`documents?: DocLink[]` is added to `BaseElement` and `Relationship`
(`src/types/model.ts`) — additive, optional, no migration.

### DSL storage — reuses the existing hoisted-property convention

The DSL pipeline already has exactly this situation solved for `status`,
`owner`, `lineStyle`, and `interactionStyle`: fields with no native Structurizr
keyword travel as reserved-namespace properties inside the generic
`properties { "key" "val" }` block, and are hoisted onto the typed field during
parse (`applyStructurizrConventions` in `parser-model.ts`,
`applyRelationshipConventions` in `parser-relationship.ts`), then re-derived
back into properties on serialize (`elementProperties()` /
`relationshipProperties()` in `serializer.ts`). `documents` follows the same
pattern, indexed since it's a list rather than a scalar:

```
properties {
    "c4hero.documents.0.path"  "architecture/payments-overview.md"
    "c4hero.documents.0.title" "Service overview"
    "c4hero.documents.1.path"  "architecture/payments-adr-003.md"
    "c4hero.documents.1.title" "ADR: event sourcing"
}
```

Indexed keys (not one JSON-stringified property value) so a `.dsl` file commit
diffs one line per add/edit/remove instead of an unreadable single-line blob —
these files are meant to be committed to git.

A new shared module, `src/lib/dsl/documentLinks.ts`, owns the two directions so
neither `parser-model.ts`/`parser-relationship.ts` nor `serializer.ts`
duplicates the indexed-key convention:

```ts
export function parseDocumentsFromProperties(
  properties: Record<string, string>,
): { documents: DocLink[] | undefined; rest: Record<string, string> }

export function documentsToProperties(
  documents: DocLink[] | undefined,
): Record<string, string>
```

`parseDocumentsFromProperties` only hoists entries where both `.path` and
`.title` are present for a given index (consecutive from 0, stopping at the
first gap) — anything else is left in `rest` untouched, matching the "never
silently lose a value" rule the `status`/`owner` hoists already follow.

### File resolution — one URL shape, three environments

A document link's `path` is project-root-relative. At runtime, in every
environment, the app fetches it from **`/__docs/<path>`** (a fixed mount point,
not the raw path at document root, so it can never collide with a real app
asset) — the environments differ only in how `/__docs/*` gets served:

- **`npm run dev`**: a new Vite `configureServer` middleware reads the
  requested path straight off disk via Node `fs`, relative to the project
  root. 404s on a missing file; rejects (400) any resolved path that escapes
  the project root (`..`, absolute paths, symlink escapes) — this is a Node
  `fs` read ultimately driven by user-authored DSL content, so the guard is
  load-bearing, not defensive boilerplate.
- **`npm run build`** (static, no server at runtime): referenced documents
  must be copied into `dist/__docs/` *before* the build is done. A **new,
  optional** `--workspace <dir>` flag (mirroring the existing convention in
  `scripts/dev.mjs` and `scripts/build-viewer.mjs`) tells the build which
  folder's `.dsl` files to scan for `documents[].path` references.
  **Decision made while planning, flagged for the user to confirm on read:**
  the flag is optional, not required — Vercel's `buildCommand` and CI's build
  job both currently run bare `npm run build` with no arguments
  (`vercel.json`, `.github/workflows/ci.yml:136`), so making it mandatory
  would break the existing deploy pipeline. Omitting it simply skips
  collection (a build-time notice, not an error) — the public hosted instance
  ships with no documents collected, consistent with the self-hosted-per-team
  model already agreed for this feature.
- **`npm run build:viewer -- --workspace <file>.dsl`**: already has exactly
  one known workspace file at build time — parse just that file, collect its
  referenced documents, copy them into `dist-viewer/__docs/`. Same collector
  function as the prod build, parameterized with a single file instead of a
  directory scan.

A shared, pure(-ish) module carries the collection logic so neither build path
reimplements it:

```ts
// src/lib/documentCollection.ts
export function findReferencedDocumentPaths(workspaces: Workspace[]): string[]

export interface DocumentCopyPlan {
  copies: Array<{ from: string; to: string }>  // from: absolute source; to: path under __docs/
  missing: string[]                             // referenced paths with no file on disk
}
export function planDocumentCopies(dslFilePaths: string[], projectRoot: string): DocumentCopyPlan
```

It lives under `src/lib/` (not `scripts/`) so it's covered by the existing
Vitest config (`vite.config.ts`'s `test.include` only matches
`src/**/*.test.{ts,tsx}` — a module under `scripts/` would be untestable by the
project's own test runner). A missing referenced file is a warning, never a
build failure — matches `export-for-proposal`'s own "skip and warn, don't abort
the batch" precedent.

**Correction made during implementation (Tasks 3.2/3.3), replacing the
paragraph originally here:** a plain Node `import` of this module does NOT
work the way `scripts/build-viewer.mjs`'s existing import of
`src/lib/sidecarName.ts` does — `documentCollection.ts`'s own dependency chain
(the `@/*` tsconfig alias via `@/store/workspace-helpers`/`@/types/model`, and
an extensionless `./dsl` directory import) is only resolvable under Vite's
bundler-mode resolution, not under plain Node ESM, and not under Vite's own
config-file bundling step either (both verified empirically, independently,
by the Task 3.2 and Task 3.3 implementers, before either picked a fix — they
converged on the same one). Every consumer — the `vite.config.ts` `closeBundle`
plugin (Task 3.2) and `scripts/build-viewer.mjs` (Task 3.3) — instead spins up
a short-lived Vite dev server in `middlewareMode` (with the `@` alias
configured) and calls `server.ssrLoadModule('/src/lib/documentCollection.ts')`
to obtain a fully-resolved `planDocumentCopies`, then `server.close()`. This is
Vite's own public API for exactly this situation; no logic is duplicated, and
the cost is paid only when collection actually runs (the zero-arg build path
returns before any server is created).

### Rendering — client-side, everywhere, no new build toolchain

A new route, `/document-view` (registered in `App.tsx` alongside the existing
`Routes`), takes the resolved path as a query param, fetches
`/__docs/<path>`, renders the markdown with a small client-side library
(`marked`) sanitized through `DOMPurify`, and styles the result with c4hero's
own existing theme (the `var(--color-*)` custom properties already used
throughout `src/index.css` and the rest of the app — no new theme system).
Opened via a plain `<a href=".../document-view?..." target="_blank"
rel="noopener noreferrer">`, identical in spirit to the existing `url` open
button (`RightPanel.tsx:420-431`).

```ts
// src/lib/markdown.ts
export function renderMarkdownToSafeHtml(markdown: string): string
```

### Editing — a new inspector section, not a new store concept

`src/store/workspace-helpers.ts`'s `ElementPatch` type and
`src/store/slices/relationship-slice.ts`'s `updateRelationship` already handle
whole-field replacement for `tags` and `properties` (array/object
replace-and-diff, not granular add/remove actions). `documents` is added the
same way — no new store actions.

The UI is a new list editor, `DocumentsTab`
(`src/components/layout/right-panel/DocumentsTab.tsx`), modeled on the
existing `PropertiesTab` (`RightPanel.tsx:862-949`) — add row / remove row,
row list rendered as `path` + `title` + an open-link button — but with two
text fields per row instead of `PropertiesTab`'s one key/value pair. Wired into
`ElementProperties` (next to the existing URL block, `RightPanel.tsx:405-442`)
and `RelationshipProperties` (next to its URL block,
`RightPanel.tsx:655-674`). The open-link button renders regardless of
`readOnly` (same as the existing `url` button) since the locked read-only
viewer shows this same panel — only the add/remove/edit controls are
`readOnly`-gated, matching `PropertiesTab`'s and `TagsTab`'s existing pattern.

## Current Implementation Analysis

**Already implemented (reuse, no changes):**
- `properties { }` block parsing/serialization and the `setUserProperty` /
  `mergeDerivedProperties` machinery (`parser-model.ts:658-687`,
  `parser.ts:146-149`, `serializer.ts:411-427`) — the hoist pattern this
  feature extends.
- `status`/`owner`/`lineStyle`/`interactionStyle` hoists
  (`parser-model.ts:27-59`, `parser-relationship.ts:182-193`,
  `serializer.ts:378-399`) — the direct precedent for `documents`.
- `ElementPatch` / `applyElementPatch` (`workspace-helpers.ts:103-137`) and
  `updateRelationship` (`relationship-slice.ts:97-121`) — the patch plumbing
  `documents` plugs into.
- `PropertiesTab` / `TagsTab` (`RightPanel.tsx:751-949`) — the list-editor UX
  `DocumentsTab` is modeled on.
- `safeUrl.ts`'s `normalizeSafeExternalUrl` and the existing `url` open-link
  button (`RightPanel.tsx:405-442`, `:655-674`) — the UI precedent for
  "editable field + conditional open-link icon button."
- `scripts/dev.mjs` and `scripts/build-viewer.mjs` — the `--workspace <path>`
  argv-parsing and `spawn`-into-vite shape the new/modified build scripts
  follow.
- `vite.config.ts`'s `virtual:locked-workspace` plugin
  (`vite.config.ts:42-57`) — the existing precedent for "a Vite plugin that
  reads something off disk at build time and bakes it into the bundle,"
  though this feature copies files rather than inlining text.
- `src/lib/dsl/index.ts`'s `parseDSL(input: string): ParseDSLResult` — the
  entry point the collector module parses discovered `.dsl` files with.

**To be modified:**
- `src/types/model.ts` — new `DocLink` type; `documents?: DocLink[]` on
  `BaseElement`, `Relationship`.
- `src/lib/dsl/parser-model.ts` (`applyStructurizrConventions`),
  `src/lib/dsl/parser-relationship.ts` (`applyRelationshipConventions`),
  `src/lib/dsl/serializer.ts` (`elementProperties`, `relationshipProperties`)
  — wire in the new hoist/derive calls.
- `src/store/workspace-helpers.ts` (`ElementPatch`, `applyElementPatch`),
  `src/store/slices/relationship-slice.ts` (`updateRelationship`).
- `src/components/layout/RightPanel.tsx` — wire `DocumentsTab` into both
  property panels.
- `vite.config.ts` — new dev middleware plugin, new prod-build collector
  plugin.
- `scripts/build-viewer.mjs` — collect+copy the one workspace's documents.
- `package.json` — `build` script now runs through a new wrapper; new
  `marked` + `dompurify` dependencies.
- `src/App.tsx` — new `/document-view` route.

**To be created:**
- `src/lib/dsl/documentLinks.ts` (+ test)
- `src/lib/documentCollection.ts` (+ test)
- `src/lib/markdown.ts` (+ test)
- `src/components/views/DocumentView.tsx` (+ test)
- `src/components/layout/right-panel/DocumentsTab.tsx` (+ test)
- `scripts/build-app.mjs`

## Technical Context

**Stack**: React 19.2.8, TypeScript (strict, `tsc -b`), Vite, Zustand 5 +
immer 11, Vitest (unit), Playwright (`test:e2e`), React Router 7. Package
manager: npm.

**Conventions**:
- Mutations go through immer drafts; undo via `pushUndoSnapshot` — but
  `documents` edits reuse `updateElement`/`updateRelationship`, which already
  call it; no new call sites needed.
- Array/object patch fields are change-detected via `JSON.stringify` equality
  before pushing undo, matching `relationship-slice.ts:115-118`
  (`properties`) and `workspace-helpers.ts:119-122` (`tags`) — follow the same
  comparison for `documents`.
- Reserved property keys are namespaced `c4hero.*` and always stripped from
  the plain properties map once hoisted, so they never leak into
  `PropertiesTab`'s generic key/value editor.
- `readOnly` gates editing controls, never the open-link affordance — see
  `TagsTab`/`PropertiesTab`'s existing `useWorkspaceStore((s) => s.readOnly)`
  guard.

**Testing commands** (verbatim from `package.json`):
- Unit (all): `npm test` / `npm run test:unit`
- Unit (one file): `npx vitest run <path>`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`
- Build (locked viewer): `npm run build:viewer -- --workspace <file>.dsl`
- Dev (optional workspace folder): `npm run dev -- --workspace <dir>`
- E2E: `npm run test:e2e`
- Everything: `npm run check`

## Phases and Tasks

### Phase 1 — Data model & DSL round-trip

**Goal**: `documents` exists as a typed field and survives
`serialize → parse` byte-for-byte via the properties-block convention, with no
UI yet.

- [x] **Task 1.1 — Add the `DocLink` type and `documents` field to the model**
  **Files:** `src/types/model.ts` (modify)
  **Definition of Done:**
  - [x] `DocLink { path: string; title: string }` exported; `documents?:
    DocLink[]` added to `BaseElement` and `Relationship` only (not
    `ContainerInstance`/`SoftwareSystemInstance` — out of scope, see
    Improvements).
  - [x] `npm run typecheck` passes.

- [x] **Task 1.2 — Shared hoist/derive helper**
  **Files:** `src/lib/dsl/documentLinks.ts` (create),
  `src/lib/dsl/documentLinks.test.ts` (create)
  **Definition of Done:**
  - [x] `parseDocumentsFromProperties` and `documentsToProperties` implemented
    per the signatures in Proposed Solution; indices are read consecutively
    from 0 and stop at the first gap; an entry missing either `.path` or
    `.title` is left in `rest` (not hoisted, not dropped).
  - [x] `npx vitest run src/lib/dsl/documentLinks.test.ts` passes, covering:
    empty/absent input, one entry, several entries, a gap in indices, and a
    partial entry (path without title) staying in `rest`.

Parallel group A: Tasks 1.3, 1.4, 1.5 — all depend on Task 1.2, disjoint
files.

- [x] **Task 1.3 — Hoist `documents` on parse (elements)**
  **Files:** `src/lib/dsl/parser-model.ts` (modify)
  **Definition of Done:**
  - [x] `applyStructurizrConventions` (`parser-model.ts:27-59`) calls
    `parseDocumentsFromProperties` and assigns the result to
    `element.documents`, replacing `element.properties` with the returned
    `rest` — same "only fill when unset" discipline as the `owner`/`status`
    hoists it sits beside.
  - [x] `npm run typecheck` passes (no dedicated test file for this task;
    covered by Task 1.6's round-trip test).

- [x] **Task 1.4 — Hoist `documents` on parse (relationships)**
  **Files:** `src/lib/dsl/parser-relationship.ts` (modify)
  **Definition of Done:**
  - [x] `applyRelationshipConventions` (`parser-relationship.ts:182-193`)
    calls `parseDocumentsFromProperties` and assigns the result to
    `rel.documents`, replacing `rel.properties` with `rest`.
  - [x] `npm run typecheck` passes (covered by Task 1.6).

- [x] **Task 1.5 — Derive `documents` on serialize**
  **Files:** `src/lib/dsl/serializer.ts` (modify)
  **Definition of Done:**
  - [x] `elementProperties()` (`serializer.ts:378-385`) and
    `relationshipProperties()` (`serializer.ts:394-399`) each merge in
    `documentsToProperties(el.documents)` / `documentsToProperties(rel.documents)`
    ahead of plain user properties, with the same "derived key wins over a
    colliding user property" precedence the existing merges already use.
  - [x] `npm run typecheck` passes (covered by Task 1.6).

- [x] **Task 1.6 — Round-trip test**
  **Files:** `src/lib/dsl/document-links-roundtrip.test.ts` (create) — named
  to match the existing `status-owner-roundtrip.test.ts` /
  `url-tags-roundtrip.test.ts` convention.
  **Definition of Done:**
  - [x] A workspace with `documents` set on a person, a software system, a
    container, a component, and a relationship serializes, reparses, and
    produces an identical `documents` array each time (order preserved).
  - [x] A workspace with no `documents` set serializes with no
    `c4hero.documents.*` properties at all (empty-case doesn't pollute the
    DSL).
  - [x] A hand-written `.dsl` fixture with a gapped index
    (`c4hero.documents.0.*` + `c4hero.documents.2.*`, no `.1.*`) parses with
    only index 0 hoisted; `c4hero.documents.2.*` survives in plain
    properties.
  - [x] `npx vitest run src/lib/dsl/document-links-roundtrip.test.ts` passes.

**Phase 1 Verification:** `npx vitest run src/lib/dsl/document-links-roundtrip.test.ts
src/lib/dsl/documentLinks.test.ts` and `npm run typecheck` both pass.

### Phase 2 — Store wiring

**Goal**: `documents` is editable through the existing patch actions with
correct undo/no-op semantics.

Parallel group B: Tasks 2.1, 2.2 — independent, disjoint files.

- [x] **Task 2.1 — `ElementPatch` / `applyElementPatch`**
  **Files:** `src/store/workspace-helpers.ts` (modify),
  `src/store/workspace-helpers.test.ts` (modify)
  **Definition of Done:**
  - [x] `ElementPatch` gains `documents?: DocLink[]`.
  - [x] `applyElementPatch` (`workspace-helpers.ts:109-137`) sets
    `el.documents = patch.documents` when `JSON.stringify(patch.documents) !==
    JSON.stringify(el.documents)`, following the existing `'key' in patch`
    convention so `{ documents: undefined }` can explicitly clear it.
  - [x] `npx vitest run src/store/workspace-helpers.test.ts` passes, with new
    cases: setting documents on an element with none, changing them, clearing
    them, and a same-value patch being a no-op (no undo entry).

- [x] **Task 2.2 — `updateRelationship`**
  **Files:** `src/store/slices/relationship-slice.ts` (modify),
  `src/store/workspace-types.ts` (modify — not foreseen when this plan was
  written: `updateRelationship`'s patch type is declared there as a
  `Pick<Relationship, ...>` union, which needed `'documents'` added for
  `tsc -b` to pass; a one-line completion of the already-approved
  `documents` field's type contract, not a design change)
  **Definition of Done:**
  - [x] `updateRelationship` (`relationship-slice.ts:97-121`) gains a
    `'documents' in patch` branch using the same
    `JSON.stringify(patch.documents) !== JSON.stringify(rel.documents)`
    comparison already used for `properties` on the line above it.
  - [x] `npm run typecheck` passes (integration coverage lands in Task 2.3,
    which touches the shared `workspace.test.ts`).

- [x] **Task 2.3 — Integration tests for both patch paths**
  **Files:** `src/store/workspace.test.ts` (modify) — depends on Tasks 2.1
  and 2.2.
  **Definition of Done:**
  - [x] New `updateElement`/`updateElementLive` cases alongside the existing
    ones at `workspace.test.ts:678-710`: sets, changes, clears (`undefined`),
    and no-op same-value documents.
  - [x] New `updateRelationship` cases alongside the existing ones at
    `workspace.test.ts:421-490`: same four cases.
  - [x] `npx vitest run src/store/workspace.test.ts` passes.

**Phase 2 Verification:** `npx vitest run src/store/workspace.test.ts
src/store/workspace-helpers.test.ts` and `npm run typecheck` both pass.

### Phase 3 — File resolution (dev, prod build, locked viewer)

**Goal**: `/__docs/<path>` resolves a referenced document's raw markdown text
in all three run modes.

- [x] **Task 3.1 — Collection module**
  **Files:** `src/lib/documentCollection.ts` (create),
  `src/lib/documentCollection.test.ts` (create)
  **Definition of Done:**
  - [x] `findReferencedDocumentPaths` and `planDocumentCopies` implemented per
    the signatures in Proposed Solution; `planDocumentCopies` parses each
    given `.dsl` path with `parseDSL` (`src/lib/dsl/index.ts`), collects every
    `documents[].path` across all elements and relationships in all of them,
    dedupes, and reports which resolve to a real file under `projectRoot`
    (→ `copies`, each mapped to `__docs/<path>`) versus which don't
    (→ `missing`) — it does not throw on a missing file.
  - [x] `npx vitest run src/lib/documentCollection.test.ts` passes, covering:
    no references, several references across element and relationship types,
    a duplicate reference (counted once), and a reference with no file on
    disk landing in `missing`.

Parallel group C: Tasks 3.2, 3.3 — both depend on Task 3.1, disjoint files.

- [x] **Task 3.2 — Dev middleware + prod build collection**
  **Files:** `vite.config.ts` (modify), `scripts/build-app.mjs` (create),
  `package.json` (modify — `build` script)
  **Definition of Done:**
  - [x] A new Vite plugin's `configureServer` hook serves `GET
    /__docs/<url-encoded-path>` by reading the file off disk relative to the
    project root; 404 when missing; 400 (not a silent pass-through) when the
    resolved path escapes the project root.
  - [x] A new Vite plugin hook (`closeBundle` or `generateBundle`) reads an
    env var set by `scripts/build-app.mjs` naming the `--workspace <dir>`
    passed on the command line (if any), calls `planDocumentCopies`, and
    copies each planned file into `dist/__docs/<path>`; logs a `console.warn`
    per missing file; does nothing (no error) when the flag was omitted.
  - [x] `scripts/build-app.mjs` follows the `--workspace` argv-parsing shape
    of `scripts/dev.mjs`/`scripts/build-viewer.mjs`, but the flag is
    **optional** here — see the "Decision made while planning" in Proposed
    Solution. `package.json`'s `"build"` script becomes `"node
    scripts/build-app.mjs"` (replacing `"tsc -b && vite build"` — the wrapper
    itself still runs `tsc -b` then spawns `vite build`, matching
    `build-viewer.mjs`'s spawn shape).
  - [x] `npm run typecheck` passes; `npm run build` (no `--workspace`, today's
    zero-arg invocation) still succeeds and produces an unchanged `dist/`
    aside from no `dist/__docs/` directory.

- [x] **Task 3.3 — `build:viewer` collection**
  **Files:** `scripts/build-viewer.mjs` (modify)
  **Definition of Done:**
  - [x] After resolving `--workspace <file>.dsl`, calls `planDocumentCopies`
    with that single file and copies the result into `dist-viewer/__docs/`
    before (or via) the `vite build --outDir dist-viewer` spawn; warns, does
    not fail, on a missing referenced file.
  - [x] `npm run typecheck` passes (exercised functionally in Phase 3
    Verification below, which actually runs the script).

**Phase 3 Verification:** ✅ Ran by the orchestrator — `dist-viewer/__docs/phase3-check-docs/overview.md`
collected with correct content via `build:viewer`; a zero-arg `npm run build`
still succeeds with no `dist/__docs/` created. Fixtures cleaned up afterward
(confirmed clean `git status`). Original description below, for reference:
Create a throwaway fixture directory (e.g.
`/tmp/doc-links-fixture/`) containing one `.dsl` file with a `documents` entry
pointing at a markdown file in the same directory, then run `npm run
build:viewer -- --workspace /tmp/doc-links-fixture/demo.dsl` and confirm
`dist-viewer/__docs/<path>` contains the expected file content; also run `npm
run build` (no flag) and confirm it still completes successfully.

### Phase 4 — Markdown render view

**Goal**: Visiting `/document-view?path=...` renders that document's markdown
as styled HTML, sanitized.

- [x] **Task 4.1 — Sanitized markdown renderer**
  **Files:** `package.json` (modify — add `marked`, `dompurify`
  dependencies), `src/lib/markdown.ts` (create),
  `src/lib/markdown.test.ts` (create)
  **Definition of Done:**
  - [x] `renderMarkdownToSafeHtml(markdown: string): string` parses with
    `marked` and sanitizes the output with `DOMPurify` before returning it.
  - [x] `npx vitest run src/lib/markdown.test.ts` passes, covering: headings,
    links, code blocks render as expected HTML; a raw `<script>` tag embedded
    in the source markdown is stripped from the output.

- [x] **Task 4.2 — `DocumentView` route**
  **Files:** `src/components/views/DocumentView.tsx` (create),
  `src/components/views/DocumentView.test.tsx` (create), `src/App.tsx`
  (modify — new `/document-view` route) — depends on Task 4.1 and Task 3.2
  (needs `/__docs/*` to resolve against in dev).
  **Definition of Done:**
  - [x] Reads `path` (and optional `title`) from the query string, fetches
    `/__docs/<path>`, and renders `renderMarkdownToSafeHtml` of the response
    body using the app's existing `var(--color-*)` theme tokens; sets the
    document/tab title from the `title` param when present.
  - [x] Shows a distinct not-found state on a 404 response (does not crash or
    show an empty page).
  - [x] `npx vitest run src/components/views/DocumentView.test.tsx` passes,
    covering: successful render, 404 state, and missing `path` param.

**Phase 4 Verification:** ✅ Ran by the orchestrator via Playwright against a
live `npm run dev` server — `/document-view?path=phase4-check.md&title=...`
rendered a real `heading`/`strong`/`link` element tree (accessibility
snapshot), not raw markdown syntax, and `document.title` reflected the `title`
param. `npm run typecheck` passed. Fixture and dev server cleaned up
afterward. Original description below, for reference: `npm run dev`, visit
`/document-view?path=<a file that exists under the project root>`, confirm
styled HTML renders (not raw markdown, not a download); `npm run typecheck`.

### Phase 5 — Inspector UI (Documents editor)

**Goal**: A user can add, edit, and remove document links on an element or
relationship from the inspector, and open one.

- [x] **Task 5.1 — `DocumentsTab` component**
  **Files:** `src/components/layout/right-panel/DocumentsTab.tsx` (create),
  `src/components/layout/right-panel/DocumentsTab.test.tsx` (create)
  **Definition of Done:**
  - [x] Renders existing rows (path + title + an open-link `<a
    href="/document-view?..." target="_blank" rel="noopener noreferrer">`,
    matching the existing `url` open button at `RightPanel.tsx:420-431`), an
    add-row control, and a per-row remove control, modeled on
    `PropertiesTab` (`RightPanel.tsx:862-949`) but with two fields per row.
  - [x] Add/remove/edit controls are hidden when `readOnly`
    (`useWorkspaceStore((s) => s.readOnly)`); the open-link button is not.
  - [x] `npx vitest run src/components/layout/right-panel/DocumentsTab.test.tsx`
    passes, covering: empty state, adding a row, removing a row, and the
    readOnly-hides-controls-but-not-the-link case. (Note: the task's
    implementer agent stalled mid-report after this verification already
    passed — the orchestrator independently re-ran both commands against the
    files on disk and confirmed them clean before checking these boxes.)

- [x] **Task 5.2 — Wire into the inspector**
  **Files:** `src/components/layout/RightPanel.tsx` (modify),
  `src/components/layout/RightPanel.test.tsx` (modify),
  `src/store/workspace-types.ts` (modify — same category of gap as Task 2.2:
  `updateElement`'s patch type is its own separate `Pick<ModelElement, ...>`
  declaration there, needing `'documents'` added for `tsc -b` to pass) —
  depends on Task 5.1.
  **Definition of Done:**
  - [x] `ElementProperties` renders `DocumentsTab` next to its URL block
    (`RightPanel.tsx:405-442`), wired to `element.documents` via
    `updateElement(element.id, { documents })`.
  - [x] `RelationshipProperties` renders `DocumentsTab` next to its URL block
    (`RightPanel.tsx:655-674`), wired to `relationship.documents` via
    `updateRelationship(relationship.id, { documents })`.
  - [x] `npx vitest run src/components/layout/RightPanel.test.tsx` passes,
    with new cases selecting an element and a relationship, each with
    document links, and confirming the rows render.

**Phase 5 Verification:** ✅ Ran by the orchestrator — `npx vitest run
src/components/layout/RightPanel.test.tsx` (21 passed), `npm run typecheck`
(clean), `npx eslint` on the touched files (clean). All implementation
phases (1-5) are now complete.

## Security Considerations

- **Path traversal** (Task 3.2): the dev middleware resolves the requested
  path against the project root and rejects anything that normalizes outside
  it (`..` segments, absolute paths, symlink escapes) — this is a Node `fs`
  read whose input ultimately originates from user-authored DSL content, so
  the guard is load-bearing. The prod/`build:viewer` paths don't need the same
  runtime guard (the resolution happens once, at build time, on the machine
  running the build — but `planDocumentCopies` should still refuse to copy a
  resolved path outside `projectRoot`, for the same reason).
- **XSS via rendered markdown** (Task 4.1): markdown can embed raw HTML
  (`<script>`, `<img onerror=...>`, etc.) — `DOMPurify` sanitization on the
  rendered output is not optional.
- **CSP**: document fetches are same-origin (`/__docs/*`), so no change is
  needed to `vercel.json`'s existing `Content-Security-Policy` header
  (`connect-src 'self' ...` already covers it); an image embedded in a
  document's own markdown that points at a cross-origin URL will be blocked by
  the existing `img-src 'self' data: blob:` — expected, not a regression to
  fix here.
- **No secret/credential surface**: everything resolved here is a local file
  path under the project root; nothing is fetched cross-origin or
  authenticated.

## Acceptance Criteria

- [ ] An element or a relationship can hold 0 or more `{ path, title }`
  document links, editable from the inspector.
- [ ] Document links are stored in the `.dsl` text (indexed
  `c4hero.documents.*` properties) and survive save → reopen unchanged.
- [ ] Clicking a document link opens a new tab showing the markdown rendered
  as styled HTML — not raw text, not a file download.
- [ ] In `npm run dev`, a document link resolves live from disk with no build
  step.
- [ ] In `npm run build`, a document link resolves when the referencing
  workspace was included via `--workspace <dir>`; the zero-argument build
  still succeeds exactly as today.
- [ ] `build:viewer`'s output resolves its own workspace's document links the
  same way.
- [ ] A referenced file missing at build time produces a warning, not a
  failed build.
- [ ] The existing `url` field's type, DSL encoding, and UI are unchanged.

## Improvements (Out of Scope)

- `ContainerInstance`/`SoftwareSystemInstance` (deployment-view elements)
  don't get `documents` in this plan — they weren't part of the agreed scope;
  adding them later is a small, mechanical follow-up (same `url`-adjacent
  shape they already have).
- No existence-checking in the inspector UI itself (a row doesn't show
  "broken link" if the file is missing) — the `DocumentView` route's
  not-found state is the only feedback surface for now.
- No UI affordance for renaming/moving a referenced file and updating every
  link that pointed at it — paths are typed/edited manually per link.
- `--workspace <dir>` scoping for `npm run build` could later become required
  (matching `build:viewer`) if the zero-arg Vercel/CI invocation is updated at
  the same time — left optional here deliberately (see Proposed Solution).
- The Confluence/Notion/remote-URL case discussed earlier in planning is
  explicitly not this feature — if that's still wanted, it's a separate
  plan (and would reuse the existing `url` field, not `documents`, since
  those aren't markdown files 11ty or any renderer here could process).

## Final Verification Phase

- [x] **Code review** — delegate to `code-reviewer` with this plan's path and
  the full changed-file list (Phases 1–5). Runs lint, typecheck, the full
  unit suite, and the build itself. Functional and E2E verification run in
  the parallel verifier below, so the reviewer excludes those.

  **Verdict: Changes needed → all findings fixed, re-verified together.**
  4 Major findings (confirmed via live probes, not theoretical) + 3 Minor,
  each routed to a scoped fix task:
  - **M1** (destination path built from raw, unnormalized path — could write
    outside `dist/`) — fixed: `to` is now built from the already-normalized
    `rel`, never the raw path.
  - **M2** (symlink escapes not rejected, in both `documentCollection.ts` and
    the dev middleware) — fixed: both now `realpathSync` the candidate and
    root, re-checking containment against the real paths.
  - **M3** (dev middleware served *any* file under the project root —
    confirmed live: `.env.example`, `.git/config`, `package.json` all
    returned 200) — fixed: both the middleware and the collector now reject
    non-`.md`/`.markdown` extensions and any hidden (`.`-prefixed) path
    segment.
  - **M4** (`DocumentView` imported eagerly in `App.tsx`, +26 kB gzip on
    every app load for a new-tab-only route) — fixed: lazy-loaded via the
    same `lazy()`/`Suspense` pattern already used for `SearchDialog`/
    `WelcomeScreen`/`AiPanel`; measured bundle confirms the regression is
    gone.
  - **m1** (`updateElementLive`'s patch type wasn't extended with
    `documents`, masked by `tsconfig.app.json` excluding test files) —
    fixed and the closure was proven by an ad-hoc revert/restore diff, not
    just a passing `tsc -b`.
  - **m2** (round-trip unstable when a hand-written DSL has partial/gapped
    `c4hero.documents.*` leftovers and the user then edits through the app)
    — fixed: every serialize pass now fully clears and re-derives the whole
    `c4hero.documents.*` namespace (clear-and-replace), documented at the
    fix site; regression tests added for both failure shapes.
  - **m3** (new `no-console` lint warning on the intentional `console.warn`
    in `vite.config.ts`) — fixed: narrow `eslint-disable-next-line`.

  All four fix tasks ran in parallel (disjoint files), each independently
  re-verified (including new regression tests and, for the security fixes,
  live-server probes re-confirming each specific exploit is now blocked),
  then the orchestrator ran the full suite once more against everything
  together: `npm run check` (lint + typecheck + test + build) — **153 test
  files / 2650 tests passed, 0 failed, 0 lint warnings, build succeeds**,
  `DocumentView`'s chunk confirmed separate from the main entry bundle.
- [x] **Functional verification** — delegate to `feature-verifier` with
  `specifications/document-links/document-links.verification.md`.

  **Result: 2 PASS, 1 FAIL (fixed), 1 BLOCKED (environment limitation), scenario
  0 PASS.** Evidence under
  `specifications/document-links/verification-evidence/`.
  - **Scenario 0** [E2E]: PASS — 175 passed, 1 skipped; one unrelated flake
    (`collection-workspace-canvas.spec.ts`, a pre-existing navigation-timeout
    journey) re-ran green in isolation, confirmed not a document-links
    regression.
  - **Scenario 1** [BROWSER] inspector add/edit/remove: PASS, both element
    and relationship.
  - **Scenario 2** [BROWSER] click-to-render, dev + production: PASS. `npm
    run build -- --workspace <dir>` collected the document into
    `dist/__docs/...` and `/document-view` rendered identical styled HTML in
    both dev and the production preview.
  - **Scenario 3** [BROWSER] save → reopen round trip: initially **BLOCKED**
    — this automation environment cannot drive the native
    `showDirectoryPicker()`/`showSaveFilePicker()` dialogs the app's primary
    save/open flow uses. **Resolved to PASS** via a scoped re-check: the app
    ships a real, already-built fallback for browsers without the File
    System Access API (`hasFileSystemAccess()` in `src/lib/fileIO.ts`) — a
    hidden `<input type="file">` for open and `downloadBlob()` for save.
    Deleting `window.showOpenFilePicker`/`showSaveFilePicker` via a
    pre-navigation init script forces the app down this real alternate code
    path (confirmed: the welcome screen itself then renders its own
    fallback copy, "Folder collections require a Chromium-based browser..."
    with a single "Open .dsl file" button) — not a weaker substitute, the
    same branch real Firefox/Safari users take. Added a second document
    link, saved (captured the real browser download event), read the
    downloaded file's raw text (confirmed both `c4hero.documents.0.*` and
    `.1.*` entries present and well-formed), reopened that same downloaded
    file through the same fallback input, and confirmed the inspector shows
    both rows afterward — the actual save → reopen proof this scenario
    wanted. The native-picker flow itself remains unexercisable by browser
    automation (a tooling limit, not a product gap), but the round-trip
    behavior it depends on is now proven end-to-end through a real
    alternate path the app already ships.
  - **Scenario 4** [BROWSER] locked viewer: **FAIL, then fixed.** Clicking a
    document link in a `build:viewer` bundle opened `/document-view` but
    immediately redirected back to the canvas instead of rendering the
    document. Root cause was two independent redirect sources — an
    `isCanvasRoute` check in `App.tsx`'s workspace-load effect, and a
    separate, unguarded `navigate()` call in `useRouteSync.ts`'s view-sync
    effect that didn't check the route shape at all. The first fix alone
    was verified insufficient by a live re-test before the second cause was
    found. Both are now guarded by a new `isStandaloneRoute()` helper
    (`src/lib/routes.ts`); re-verified live against a rebuilt locked-viewer
    bundle (after working around a stale-service-worker false negative),
    confirming the document now renders and the viewer's normal boot flow
    is unaffected.

  After this fix, the orchestrator re-ran the full suite once more: `npm
  run check` — **153 test files / 2651 tests passed, 0 failed, clean lint,
  clean build.** Lingering dev/preview servers from verification were
  stopped and scratch build output (`dist/`, `dist-viewer/`,
  `verification-fixtures/`) cleaned up; the working tree now contains only
  the feature's actual changes.
