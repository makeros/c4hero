# C4 cheat sheet

## Goal

**Goal**: Add a standalone `/cheat-sheet` page, opened in a new browser tab from a
`BookOpenText` icon in the canvas top pill. It shows architects what the C4 model
(as Structurizr DSL models it) offers: every element type and what it is for, every
view type and what may appear on it, and many concrete examples. The examples are
conceptual ("Mobile Banking App → Container"), not DSL code.

**Success Measure**: On any canvas (editable or read-only), the top pill shows a
"C4 cheat sheet" link. Clicking it opens `/cheat-sheet` in a new tab. The page,
which needs no workspace, shows:
1. the element catalog, with a definition, "use it for / don't use it for", and
   at least 6 real-world examples per type;
2. all 9 view types, each with its scope, purpose, audience, allowed element
   types, an example scenario and a static mini diagram. Filtered, Custom and
   Image carry a "Not supported in c4hero yet" badge;
3. an element × view matrix;
4. a "What is it?" decision guide with at least 25 everyday things (Postgres,
   Kafka topic, Lambda, Auth0, a Kubernetes pod, a Spring controller, …) mapped to
   the element type they should be modeled as, with a one-line reason.

**Do NOT touch / do NOT add**:
- No DSL/Structurizr code snippets on the page. Keyword names in small `code`
  chips (e.g. `container`) are fine as labels.
- Do not change the model types, the DSL pipeline, the store, or canvas rendering.
- Do not reuse canvas node renderers or React Flow for the mini diagrams. They are
  static HTML/inline SVG.
- No search, filtering, or persisted state on the page in v1.
- Do not add the link in export-viewer mode (the top pill isn't rendered there
  anyway; leave it that way).
- No new dependencies.

## Proposed Solution

**Content as data, page as renderer.** All cheat-sheet content lives in one typed,
pure module, `src/lib/cheatSheet.ts`. The page only renders it. That keeps the
content unit-testable for consistency (every type a view references exists in the
catalog; the matrix is derived from the view definitions, so the two can't
disagree) and lets the content grow without touching layout code.

Contract:

```ts
export type CheatElementKind =
  | 'person' | 'softwareSystem' | 'container' | 'component'
  | 'deploymentNode' | 'infrastructureNode' | 'softwareSystemInstance' | 'containerInstance'
  | 'element'          // custom element (custom views only)
  | 'group' | 'relationship'

export interface CheatExample { name: string; note: string }   // "Mobile Banking App", "iOS/Android app customers use"

export interface CheatElement {
  kind: CheatElementKind
  label: string                 // "Container"
  dslKeyword: string            // "container"
  level: 'static' | 'deployment' | 'other'
  parent?: string               // "Software System" — what it lives inside
  definition: string
  useFor: string[]
  notFor: string[]
  examples: CheatExample[]      // >= 6 per kind
}

export interface CheatViewScope { scope: string; allowed: CheatElementKind[] }

export interface CheatView {
  key: 'systemLandscape' | 'systemContext' | 'container' | 'component'
     | 'dynamic' | 'deployment' | 'filtered' | 'custom' | 'image'
  label: string
  dslKeyword: string
  scope: string                 // "One software system"
  purpose: string
  audience: string
  allowed: CheatElementKind[]   // union across scopes
  scopes?: CheatViewScope[]     // dynamic: *, softwareSystem, container; deployment: *, softwareSystem
  supportedInC4hero: boolean    // false for filtered, custom, image
  example: { title: string; description: string; diagram: CheatDiagramSpec }
  tips: string[]
}

export interface CheatDiagramSpec {
  boundary?: string             // e.g. "Internet Banking System" (dashed box)
  nodes: { id: string; label: string; kind: CheatElementKind; external?: boolean; inBoundary?: boolean; parent?: string }
  [];
  edges: { from: string; to: string; label?: string; order?: number }[]
}

export interface CheatDecision { thing: string; answer: CheatElementKind | 'not-modeled'; reason: string }

export const CHEAT_ELEMENTS: CheatElement[]
export const CHEAT_VIEWS: CheatView[]          // exactly 9 — see the note below
export const CHEAT_DECISIONS: CheatDecision[]  // >= 25
export function elementViewMatrix(): Record<CheatElementKind, Record<CheatView['key'], 'yes' | 'scoped' | 'no'>>
```

Note on the view count: Structurizr has 9 view types: landscape, context,
container, component, dynamic, deployment, filtered, custom and image. The page
shows all 9. Filtered, Custom and Image get the badge.

The content follows the canonical rules in the c4hero plugin's own reference
(`plugins/c4hero/skills/c4hero-modeling/references/c4-modeling-rules.md`) and the
view/element rules:

| View | Allowed |
|---|---|
| systemLandscape | person, softwareSystem (+ group) |
| systemContext | person, softwareSystem (+ group) |
| container | person, softwareSystem, container (+ group) |
| component | person, softwareSystem, container, component (+ group) |
| dynamic `*` / `softwareSystem` / `container` | person, softwareSystem / + container / + container, component |
| deployment `*` / `softwareSystem` | deploymentNode, infrastructureNode, softwareSystemInstance, containerInstance (+ group) |
| filtered | whatever its base static view allows |
| custom | element (custom) |
| image | none (external PlantUML/Mermaid/Kroki/image) |

Relationships are a row in the matrix: "shown when both ends are on the view".

**Page.** `src/components/views/CheatSheet.tsx` is a scrollable page, styled like
`DocumentView`: a `--color-bg-primary` background, a centred column with a max
width of about 1220px, and `--color-surface-1` cards. Sections:
1. Header with a short intro and an anchor nav (Elements · Views · Matrix · What is it?).
2. **The C4 hierarchy**: a compact nested diagram (Person / Software System ⊃
   Container ⊃ Component) plus the deployment hierarchy (Environment ⊃
   Deployment Node ⊃ Infrastructure Node / Instances).
3. **Elements**: one card per `CHEAT_ELEMENTS` entry, with a type-coloured
   accent (`--color-type-*`; deployment kinds use `--color-type-infra`), the
   lucide type icon from `TYPE_ICON_MAP` where one exists, and the definition,
   use for, not for and examples grid.
4. **Views**: one card per `CHEAT_VIEWS` entry, with scope, purpose, audience,
   allowed-type chips, scoped variants (dynamic/deployment), tips, the example
   scenario and a `CheatSheetDiagram` mini diagram. Unsupported views get the
   badge.
5. **Matrix**: a table of element kinds × view keys built from
   `elementViewMatrix()`, showing ✓ / "scoped" / —. It scrolls horizontally inside
   its own wrapper on narrow screens.
6. **What is it?**: a table of `CHEAT_DECISIONS` (thing → type chip → reason).

`document.title` is set to `C4 cheat sheet — c4hero`.

**Mini diagrams.** `src/components/views/CheatSheetDiagram.tsx` renders a
`CheatDiagramSpec` with simple, deterministic layout. Nodes become flex rows of
coloured boxes, grouped into an optional dashed boundary box; external elements
are grey (`--color-type-external`). Edges are listed as compact arrow rows
beneath ("Customer → Web App: uses"), with step numbers for dynamic views. This
avoids writing a layout engine. Deployment specs nest by `parent` into nested
boxes. Image views show a placeholder frame ("external PlantUML/Mermaid/image").

**Entry point.** In `FloatingTopPill.tsx`, add an `<a href="/cheat-sheet"
target="_blank" rel="noopener noreferrer" className="btn-icon">` with
`BookOpenText`, `title`/`aria-label` "C4 cheat sheet". It goes just before the
Documents toggle (Documents keeps the pill's right-edge rounding) and shows
regardless of `readOnly`. On mobile, the hamburger menu gets a "C4 cheat sheet"
row that calls `window.open('/cheat-sheet', '_blank', 'noopener,noreferrer')`.

**Route.** `App.tsx` adds a lazy `<Route path="/cheat-sheet">`, mirroring
`/document-view`. `isStandaloneRoute` in `src/lib/routes.ts` returns true for
`/cheat-sheet` too, so the locked viewer's auto-load and `useRouteSync` never
redirect away from it.

## Current Implementation Analysis

- **Reuse**
  - `src/App.tsx` — the `/document-view` lazy standalone route pattern.
  - `src/lib/routes.ts` — `isStandaloneRoute` (used by `App.tsx` and `src/hooks/useRouteSync.ts`).
  - `src/components/views/DocumentView.tsx` — page shell styling (scroll container, centred card).
  - `src/lib/icons/registry.ts` (`TYPE_ICON_MAP`) and `src/lib/elementMeta.tsx` (`TYPE_COLORS`) — type icons/colours.
  - `src/index.css` tokens: `--color-type-person|system|container|component|external|infra`, `--color-surface-1/2/3`, `--color-border`, `--color-accent`, `--radius-*`.
  - `src/components/layout/FloatingTopPill.tsx` — `btn-icon` button styling, `MenuItemRow` for the mobile menu.
  - `plugins/c4hero/skills/c4hero-modeling/references/c4-modeling-rules.md` — source of truth for modeling guidance wording.
- **To modify**: `src/App.tsx`, `src/lib/routes.ts`, `src/components/layout/FloatingTopPill.tsx`, `src/components/layout/FloatingTopPill.test.tsx`, `src/App.test.tsx`, `docs/FEATURES.md`, `CHANGELOG.md`.
- **To create**: `src/lib/cheatSheet.ts`, `src/lib/cheatSheet.test.ts`, `src/lib/routes.test.ts`, `src/components/views/CheatSheet.tsx`, `src/components/views/CheatSheet.test.tsx`, `src/components/views/CheatSheetDiagram.tsx`, `e2e/cheat-sheet/cheat-sheet.spec.ts`.

## Technical Context

- **Stack:** React ^19.2, TypeScript (strict), Vite, react-router-dom ^7
  (`BrowserRouter`), zustand ^5 + immer, Tailwind v4 plus inline styles with CSS
  variables, lucide-react ^1.34 (`BookOpenText` exists). Dark-only UI.
- **Conventions:** path alias `@/` → `src/`. Inline `style={{…}}` with CSS
  variables is the dominant styling idiom; a scoped `<style>` block is acceptable
  for page-level CSS (see `DocumentView.tsx`). Tooltips use native `title=` plus
  `aria-label`. Standalone pages are lazy-loaded in `App.tsx` inside
  `<Suspense fallback={<LoadingDot />}>`. Read-only state:
  `useWorkspaceStore((s) => s.readOnly)`. Navigation-only features stay enabled in
  read-only. `__EXPORT_MODE__` builds don't render `FloatingTopPill`. Existing
  new-tab links use `target="_blank" rel="noopener noreferrer"`.
- **Unit tests:** vitest (jsdom, globals, `src/test-setup.ts`), colocated
  `*.test.ts(x)`, `@testing-library/react`. Top-pill tests:
  `src/components/layout/FloatingTopPill.test.tsx` (mocks `@xyflow/react` and
  `useBreakpoint`; `setMobile()`; `useWorkspaceStore.setState({ readOnly })`). App
  routing test: `src/App.test.tsx` (mocks lazy pages with `data-testid` stubs; see
  the `/document-view` locked-workspace test near line 189).
- **E2E:** Playwright, `e2e/`, baseURL `http://localhost:3004`, fixture
  `e2e/fixtures/workspace.ts` (`workspace.loadSample()`, `parseAndLoad(dsl)`);
  read-only via `window.__testStore().setReadOnly(true)`. Reference spec for
  new-tab link assertions: `e2e/panels/documents-sidebar.spec.ts:156-167`.
- **Commands (verbatim):**
  - single unit test file: `npx vitest run <path>`
  - lint scoped: `npx eslint <paths>`
  - typecheck: `npm run typecheck`
  - full unit: `npm test` · lint: `npm run lint` · build: `npm run build`
  - single E2E spec: `npx playwright test <path>` · full E2E: `npm run test:e2e`
  - dev server: `npm run dev` (port 3004)

## Phases and Tasks

### Phase 1 — Content and page

**Goal:** the cheat-sheet content exists as tested data, and a page renders it at a route.

Sequential: Task 1.2 imports the module Task 1.1 creates.

- [x] **Task 1.1 — Cheat-sheet content module.** Create `src/lib/cheatSheet.ts`
  exporting the contract types, `CHEAT_ELEMENTS` (all 11 kinds),
  `CHEAT_VIEWS` (all 9 keys, `supportedInC4hero` false only for filtered, custom
  and image), `CHEAT_DECISIONS` (≥ 25 entries), and `elementViewMatrix()`, which is
  derived from `CHEAT_VIEWS` (`scoped` when a kind is allowed only in some
  `scopes`; `group` is `yes` on every static view and deployment; `relationship`
  is `yes` on every view except image). Content must be accurate C4/Structurizr
  guidance (see Proposed Solution table and
  `plugins/c4hero/skills/c4hero-modeling/references/c4-modeling-rules.md`). It must
  be example-rich: ≥ 6 examples per element kind from varied domains (banking,
  e-commerce, healthcare, SaaS, IoT, internal tooling), and each view gets a
  coherent example scenario with a diagram spec of 3–8 nodes. No DSL code blocks.
  Create `src/lib/cheatSheet.test.ts` asserting: 9 views with the expected keys;
  unsupported set = {filtered, custom, image}; every `allowed`/`scopes[].allowed`
  kind exists in `CHEAT_ELEMENTS`; every element has ≥ 6 examples; ≥ 25 decisions,
  each answer a known kind or `not-modeled`; every diagram node's kind is allowed
  on its view (image: no nodes); every edge references existing node ids; the
  matrix spot-checks (component on container view = `no`, component on dynamic =
  `scoped`, containerInstance on deployment = `yes`).
  - **Files:** `src/lib/cheatSheet.ts` (create), `src/lib/cheatSheet.test.ts` (create), `plugins/c4hero/skills/c4hero-modeling/references/c4-modeling-rules.md` (reuse)
  - **Definition of Done:**
    - [x] `npx vitest run src/lib/cheatSheet.test.ts` passes
    - [x] `npx eslint src/lib/cheatSheet.ts src/lib/cheatSheet.test.ts` clean
    - [x] `npm run typecheck` passes
  - **Stop Rule:** if a modeling rule in the reference file contradicts the
    Proposed Solution table, stop and report it rather than picking one.

- [x] **Task 1.2 — Page, diagram and route.** Create
  `src/components/views/CheatSheetDiagram.tsx` (renders a `CheatDiagramSpec` as
  described in Proposed Solution) and `src/components/views/CheatSheet.tsx` (the
  six sections; section `id`s `hierarchy`, `elements`, `views`, `matrix`,
  `what-is-it` for anchor nav; `document.title` = `C4 cheat sheet — c4hero`;
  `<main aria-label="C4 cheat sheet">`; each element/view card is an `<article>`
  with an `h3` naming it; unsupported views show the visible text "Not supported in
  c4hero yet"; works at 375px width without horizontal page scroll — the matrix
  scrolls in its own wrapper). Add the lazy `/cheat-sheet` route to `src/App.tsx`
  next to `/document-view`. Make `isStandaloneRoute` in `src/lib/routes.ts` return
  true for `/cheat-sheet`, and add a `src/lib/routes.test.ts` covering both
  standalone paths and a canvas path. Add `src/components/views/CheatSheet.test.tsx`
  (renders within `MemoryRouter`: all section headings, one article per element
  and per view, the unsupported badge appears exactly 3 times, a known decision
  row, sets `document.title`). In `src/App.test.tsx`, add a test that `/cheat-sheet`
  renders the (stubbed) page and isn't redirected when the locked workspace
  auto-loads, mirroring the `/document-view` test.
  - **Files:** `src/components/views/CheatSheet.tsx` (create), `src/components/views/CheatSheetDiagram.tsx` (create), `src/components/views/CheatSheet.test.tsx` (create), `src/App.tsx` (modify), `src/App.test.tsx` (modify), `src/lib/routes.ts` (modify), `src/lib/routes.test.ts` (create), `src/lib/cheatSheet.ts` (reuse — created in Task 1.1), `src/components/views/DocumentView.tsx` (reuse), `src/lib/icons/registry.ts` (reuse), `src/lib/elementMeta.tsx` (reuse)
  - **Definition of Done:**
    - [x] `npx vitest run src/components/views/CheatSheet.test.tsx src/lib/routes.test.ts src/App.test.tsx` passes
    - [x] `npx eslint src/components/views/CheatSheet.tsx src/components/views/CheatSheetDiagram.tsx src/components/views/CheatSheet.test.tsx src/App.tsx src/App.test.tsx src/lib/routes.ts src/lib/routes.test.ts` clean
    - [x] `npm run typecheck` passes
  - **Clues:** `App.test.tsx:72` stubs `DocumentView`. Add an equivalent stub for
    `@/components/views/CheatSheet`. `useRouteSync.ts:56-59` already honours
    `isStandaloneRoute`.

**Verification:** `npx vitest run src/lib/cheatSheet.test.ts src/components/views/CheatSheet.test.tsx src/App.test.tsx` and `npm run typecheck`

### Phase 2 — Entry point and docs

**Goal:** users can reach the page from the canvas, and the feature is documented.

Parallel group B: Tasks 2.1 and 2.2 — independent, disjoint files.

- [x] **Task 2.1 — Top-pill link.** In `src/components/layout/FloatingTopPill.tsx`,
  add the desktop `<a>` link (BookOpenText, size 15, `btn-icon`, 40×44,
  `title`/`aria-label` "C4 cheat sheet", `href="/cheat-sheet"`,
  `target="_blank"`, `rel="noopener noreferrer"`) right before the Documents toggle,
  rendered in both editable and read-only modes. In the mobile hamburger menu, add a
  `MenuItemRow` "C4 cheat sheet" (BookOpenText) that closes the menu and calls
  `window.open('/cheat-sheet', '_blank', 'noopener,noreferrer')`. Extend
  `FloatingTopPill.test.tsx`: the link exists with those attributes when editable
  and when `readOnly`, and the mobile menu row calls `window.open` with those args.
  Create `e2e/cheat-sheet/cheat-sheet.spec.ts`: after `workspace.loadSample()`, the
  "C4 cheat sheet" link has the href/target/rel; clicking it opens a popup whose URL
  ends with `/cheat-sheet` and shows the "C4 cheat sheet" main landmark with the
  Views heading; also with `__testStore().setReadOnly(true)` the link is visible;
  and navigating directly to `/cheat-sheet` with no workspace renders the page
  (no redirect).
  - **Files:** `src/components/layout/FloatingTopPill.tsx` (modify), `src/components/layout/FloatingTopPill.test.tsx` (modify), `e2e/cheat-sheet/cheat-sheet.spec.ts` (create), `e2e/fixtures/workspace.ts` (reuse)
  - **Definition of Done:**
    - [x] `npx vitest run src/components/layout/FloatingTopPill.test.tsx` passes
    - [x] `npx playwright test e2e/cheat-sheet/cheat-sheet.spec.ts` passes
    - [x] `npx eslint src/components/layout/FloatingTopPill.tsx src/components/layout/FloatingTopPill.test.tsx e2e/cheat-sheet/cheat-sheet.spec.ts` clean

- [x] **Task 2.2 — Docs.** Add a "C4 cheat sheet" bullet to `docs/FEATURES.md`
  under "## C4 modelling", and an `### Added` entry under `## [Unreleased]` in
  `CHANGELOG.md`.
  - **Files:** `docs/FEATURES.md` (modify), `CHANGELOG.md` (modify)
  - **Definition of Done:**
    - [x] `docs/FEATURES.md` contains "cheat sheet" under "## C4 modelling"
    - [x] `CHANGELOG.md` has an `### Added` entry mentioning the cheat sheet under `## [Unreleased]`

**Verification:** `npx playwright test e2e/cheat-sheet/cheat-sheet.spec.ts` and `npm run build`

### Phase 3 — Final verification

Parallel pair: Tasks 3.1 and 3.2.

- [x] **Task 3.1 — Code review** (`code-reviewer`): plan path plus every changed
  file. Runs `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  Functional and E2E verification runs in the parallel verifier. Also reviews the
  content for C4/Structurizr accuracy against the Proposed Solution table.
- [x] **Task 3.2 — Functional verification** (`feature-verifier`): executes
  `specifications/cheat-sheet/cheat-sheet.verification.md`.

## Acceptance Criteria

- [x] A "C4 cheat sheet" icon (BookOpenText) appears in the top pill on desktop, and as a menu row on mobile.
- [x] Activating it opens `/cheat-sheet` in a new tab; the current canvas tab is unchanged.
- [x] The link is present in read-only (locked viewer) mode.
- [x] `/cheat-sheet` renders without a workspace and isn't redirected when one auto-loads.
- [x] The page covers 11 element kinds and 9 view types, a matrix, and a ≥ 25-row decision guide; each view has a mini diagram; Filtered/Custom/Image are badged.
- [x] No DSL code snippets appear on the page.

## Improvements (Out of Scope)

- A search/filter box on the cheat sheet.
- Deep-linking from the canvas inspector ("What is a Container?") to the matching
  `/cheat-sheet#…` anchor.
- An entry in the command palette and a keyboard shortcut.
- Making the page reachable from the welcome screen.
- A "What's new" entry for the release.

## Changelog

- 2026-10-22 — Final review found 1 blocker (page not scrollable: body is `overflow: hidden`) and 11 content/markup issues. All were fixed in one scoped follow-up, and an E2E scroll test was added. Not part of this change: the `DeploymentElementProperties.test.tsx` failure (lucide mock missing `Plus`, from commit 680bf93) and an intermittent `e2e/canvas/theme.spec.ts:89` timeout.
