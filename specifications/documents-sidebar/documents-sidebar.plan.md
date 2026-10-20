# Documents sidebar

## Goal

**Goal**: Add a full-height, scrollable sidebar docked on the right of the canvas
that lists every block (element) and relation in the workspace that carries
document links, A–Z, with clickable links (open in a new tab) and clickable
view chips that navigate to the view, center the item and select it.

**Success Measure**: With a workspace whose elements/relations have `documents`,
the user presses `D` (or the "Documents" button in the top pill); the sidebar
docks on the right, the canvas shrinks, and the inspector / zoom HUD shift left
of it. Each row shows the item name, a type badge, its document links and one
chip per view containing it. Clicking a link opens `/document-view?...` in a new
tab; clicking a chip switches to that view (browser Back returns), centers the
item and opens the inspector for it. Open/closed state and width survive a
reload. Works identically in the read-only viewer.

**Do NOT touch / do NOT add**:
- Do not touch `src/lib/markdown.ts`, `src/components/views/DocumentView.tsx`,
  their tests, `package.json`, `package-lock.json` — they carry unrelated
  uncommitted Mermaid work on this branch.
- Do not change the DSL encoding, `DocLink` type, `DocumentIndicator`, or
  `DocumentsTab` (editing stays in the inspector; the sidebar is read/navigate only).
- Do not render markdown inside the sidebar — links open the existing
  `/document-view` page in a new tab via `openDocument`.
- Do not count implied (dashed) relationships when deciding which views show a
  relation.
- No text filter, no collapsible groups in v1.
- Do not import `src/lib/documentCollection.ts` in UI code (Node-only).

## Proposed Solution

### Data — pure index builder

`src/lib/documentIndex.ts`:

```ts
export type DocumentEntryKind = 'element' | 'relationship'
export interface DocumentEntryView { key: string; title: string; type: View['type'] }
export interface DocumentEntry {
  kind: DocumentEntryKind
  id: string                 // element id or relationship id
  name: string               // element name, or "Source → Target"
  typeLabel: string          // "Person" | "Software System" | "Container" | "Component" |
                             // "Deployment Node" | "Infrastructure Node" | "Relation"
  secondary?: string         // relation description (+ technology), if any
  documents: DocLink[]       // non-empty
  views: DocumentEntryView[] // ordered as allViewsOf(ws); [] = "Not in any view"
}
export function buildDocumentIndex(ws: Workspace): DocumentEntry[]
```

- Elements: people, systems, containers, components (`forEachElementHelper`)
  plus deployment nodes and infrastructure nodes walked through every
  deployment environment (`walkDeploymentNodes`). Only items with
  `documents?.length > 0`.
- Relations: `ws.model.relationships` with documents; name built from source /
  destination element names (fallback to id if missing).
- Views for an element: every view (`allViewsOf`) whose `elements` contains the
  id. Views for a relation: every view whose `relationships` contains the id
  (explicit only).
- Sort: case-insensitive `localeCompare` on `name`, tie-break by `id`.
- UI memoizes with `useMemo(() => buildDocumentIndex(ws), [ws])` — immer gives a
  new workspace reference on every edit, so it updates live.

### Navigation — one new store action

`revealInView(viewKey: string, target: { kind: 'element' | 'relationship'; id: string }): void`
in `navigation-slice.ts`:

1. If `viewKey !== activeViewKey`, push the current key onto `viewHistory`
   (breadcrumb/back) and switch the view with the same side effects as
   `setActiveView` (clear selection, clear highlighter). `useRouteSync` already
   does a history **push** on `activeViewKey` change, so browser Back works.
2. Select the target (`selectedElementIds=[id]` or `selectedRelationshipId=id`),
   which opens the inspector.
3. Set `focusElementId = id` (element) or the new `focusRelationshipId = id`.

`Canvas.tsx` gains a sibling effect to the existing `focusElementId` effect: for
`focusRelationshipId` it waits (same ≤60-rAF retry) for an edge whose
`data.relationship.id` matches, then `setCenter` at the midpoint of its source
and target node centers at the current zoom, 300 ms, then clears the id.

### Persistence — settings store

`AppSettings` gains `documentsSidebarOpen: boolean` (default `false`) and
`documentsSidebarWidth: number` (default `340`, clamped to `[280, 640]` by
`normalizeSettings`). Persisted via the existing `c4hero.json` mechanism.

### Layout — docked panel + one CSS variable

`DocumentsSidebar` renders `position: fixed; top: 0; bottom: 0; right: 0;
width: <w>px` with its own scrolling list, a header (title, count, close
button) and a left-edge resize handle (`role="separator"`, pointer drag +
ArrowLeft/ArrowRight keys, persisted on release). While open (and not in
presentation mode, not on mobile) it sets `--docs-sidebar-w: <w>px` on
`document.documentElement` (removed / `0px` when closed or unmounted). All
right-anchored or centered chrome reads that variable:

- `main#c4hero-canvas`: `right: var(--docs-sidebar-w, 0px)` → React Flow resizes
  (true docking; do **not** tag the sidebar `data-canvas-fit-chrome`).
- FloatingInspector, FloatingZoomHud: `right: calc(14px + var(--docs-sidebar-w, 0px))`.
- FloatingTopPill wrapper: `right: var(--docs-sidebar-w, 0px)` (stays centered over canvas).
- Centered chrome (`left: 50%` + translateX(-50%)): BottomHighlighterBar,
  FloatingBottomStrip popover/toast, CanvasHints, FloatingTopPill toast →
  `left: calc((100% - var(--docs-sidebar-w, 0px)) / 2)`.
- MultiSelectBar clamp: subtract the sidebar width from the viewport width.

Mobile (`isMobile`): the sidebar overlays full width (`width: 100vw`) and does
**not** set the variable. The sidebar root carries
`data-canvas-chrome="documents-sidebar"` so the inspector's outside-click
handler does not clear the selection when the sidebar is clicked.

Toggle: "Documents" button (lucide `FileText`, count badge when >0,
`data-active` when open, `title="Documents (D)"`) as the new last button of the
top pill, a `MenuItemRow` in the mobile hamburger, a `toggle-documents-sidebar`
command (`shortcut: 'D'`, category as `toggle-views-panel`), and the `'d'`
global shortcut gated by `isCanvasRoute` (not in `READONLY_BLOCKED_*`).

### Row design

```
┌──────────────────────────────────────────┐
│ Documents (12)                       [×] │
├──────────────────────────────────────────┤
│ [Container] API Application              │
│   📄 Service overview                    │
│   📄 ADR: event sourcing                 │
│   ◻ Containers – Internet Banking  ◻ …  │
│ [Relation] Customer → Web App            │
│   Visits bigbank.com · HTTPS             │
│   📄 Login flow                          │
│   Not in any view                        │
└──────────────────────────────────────────┘
```

Links are `<a href={documentViewUrl(doc)} target="_blank" rel="noopener noreferrer">`
(same as DocumentIndicator's menu) showing `title`, with `path` in `title=`.
Chips are `<button>`s labelled with the view title (`aria-label="Open <item> in
<view title>"`), active-styled when it is the current view. Empty state: "No
document links yet — add them in the inspector's Documents tab."

## Current Implementation Analysis

**Reuse:**
- `documentViewUrl`, `openDocument` — `src/lib/documentLinks.ts`
- `allViewsOf`, `forEachElementHelper`, `buildElementMap` — `src/store/workspace-helpers.ts`, `workspace-selectors.ts`
- `walkDeploymentNodes` — `src/lib/deployment.ts:20`
- `getElementTypeLabel` / `TYPE_ICONS` / `TYPE_COLORS` — `src/lib/elementMeta.tsx`
- `VIEW_TYPE_LABELS` — exported from `src/components/layout/ViewSwitcher.tsx:13`
- focus effect pattern — `src/components/canvas/Canvas.tsx:672-703`
- `.btn-icon` + `data-active` — `src/index.css:1496,1571`
- docked panel styling reference — `src/components/ai/AiPanel.tsx:56-66`
- `isMobile` handling — `FloatingTopPill.tsx:388`
- settings persistence — `src/store/settings.ts` (`normalizeSettings`, `update`)

**Modify:** navigation slice + types, Canvas, settings store, App.tsx, the
right/centered floating chrome listed above, useKeyboardShortcuts, commands.ts.

**Create:** `src/lib/documentIndex.ts`, `src/components/layout/DocumentsSidebar.tsx`,
their tests, an E2E spec.

## Technical Context

- **Stack:** React ^19.2, TypeScript, Vite, zustand ^5 + immer (single store from
  slices in `src/store/slices/*`, types in `src/store/workspace-types.ts`),
  `@xyflow/react` ^12.11, react-router-dom ^7, Tailwind v4 + inline styles with
  CSS variables (`--color-bg-panel`, `--color-surface-1/2/3`, `--color-border`,
  `--color-accent`, `--radius-lg`), lucide-react icons. Dark-only UI.
- **Conventions:** path alias `@/` → `src/`. Floating chrome is `position: fixed`
  with inline styles. Native `title=` + `aria-label` for tooltips. Readonly state:
  `useWorkspaceStore((s) => s.readOnly)`. Navigation-only features stay enabled in
  read-only.
- **Navigation facts:** `setActiveView` (navigation-slice.ts:92-101) clears
  selection and highlighter but does NOT push `viewHistory`; `drillInto`
  (l.103-119) does. Selection set synchronously after the view change survives.
  `useRouteSync` pushes URL history on `activeViewKey` change. Edge ids may be
  `${rel.id}#${step}` in dynamic views — always match `edge.data.relationship.id`.
- **Inspector outside-click:** FloatingInspector.tsx:31-49 ignores targets inside
  `.react-flow, [data-canvas-chrome]`.
- **Unit tests:** vitest (jsdom, globals, `src/test-setup.ts`), colocated
  `*.test.ts(x)`, `@testing-library/react`. Store tests build a workspace literal
  and call `useWorkspaceStore.getState().loadWorkspace(ws)` (see
  `src/store/slices/ui-slice.test.ts`); component test reference:
  `src/components/layout/FloatingViewsPanel.test.tsx`.
- **E2E:** Playwright, `e2e/`, baseURL `http://localhost:3004`, fixture
  `e2e/fixtures/workspace.ts` (`workspace.loadSample()`, `parseAndLoad(dsl)`,
  `setView`, `getWorkspace`, `__testStore()`); documents in DSL as
  `"c4hero.documents.0.path" "<path>"` / `"c4hero.documents.0.title" "<title>"`
  inside an element/relationship `properties { }` block.
- **Commands (verbatim):**
  - single unit test file: `npx vitest run <path>`
  - lint scoped: `npx eslint <paths>`
  - typecheck: `npm run typecheck`
  - full unit: `npm test` · lint: `npm run lint` · build: `npm run build`
  - single E2E spec: `npx playwright test <path>` · full E2E: `npm run test:e2e`
  - dev server: `npm run dev` (port 3004)

## Phases and Tasks

### Phase 1 — Foundations

**Goal:** data index, persisted settings and the reveal-in-view navigation exist and are tested.
**Verification:** `npx vitest run src/lib/documentIndex.test.ts src/store/settings.test.ts src/store/slices/navigation-reveal.test.ts` and `npm run typecheck`.

Parallel group A: Tasks 1.1, 1.2, 1.3 — independent, disjoint files.

- [x] **Task 1.1 — Document index builder.** Create `buildDocumentIndex` exactly
  per the contract in Proposed Solution.
  **Files:** `src/lib/documentIndex.ts` (create), `src/lib/documentIndex.test.ts`
  (create), `src/store/workspace-helpers.ts` (reuse), `src/lib/deployment.ts`
  (reuse), `src/lib/elementMeta.tsx` (reuse).
  **Definition of Done:**
  - [x] Tests cover: items without documents excluded; element in 0 / 1 / many
    views; relation views counted only from `view.relationships`; deployment and
    infrastructure nodes included with their type labels; relation name
    "Source → Target" with description as `secondary`; A–Z case-insensitive order.
  - [x] `npx vitest run src/lib/documentIndex.test.ts` passes.
  - [x] `npx eslint src/lib/documentIndex.ts src/lib/documentIndex.test.ts` clean.

- [x] **Task 1.2 — Persisted sidebar settings.** Add `documentsSidebarOpen`
  (default false) and `documentsSidebarWidth` (default 340, clamp 280–640, non-numbers
  fall back to default) to `AppSettings`, defaults and `normalizeSettings`.
  **Files:** `src/store/settings.ts` (modify), `src/store/settings.test.ts` (modify).
  **Definition of Done:**
  - [x] Tests: defaults; `update({documentsSidebarOpen:true})` persists and reloads;
    width clamped both ways.
  - [x] `npx vitest run src/store/settings.test.ts` passes.
  - [x] `npx eslint src/store/settings.ts src/store/settings.test.ts` clean.

- [x] **Task 1.3 — `revealInView` + relationship focus.** Add
  `focusRelationshipId: string | null`, `clearFocusRelationship()` and
  `revealInView(viewKey, target)` (behaviour in Proposed Solution) to the
  navigation slice and its types. In `Canvas.tsx`, add the relationship-focus
  effect next to the existing `focusElementId` effect (l.672-703).
  **Files:** `src/store/workspace-types.ts` (modify),
  `src/store/slices/navigation-slice.ts` (modify),
  `src/components/canvas/Canvas.tsx` (modify),
  `src/store/slices/navigation-reveal.test.ts` (create).
  **Definition of Done:**
  - [x] Tests: other view → `activeViewKey` changes, previous key pushed to
    `viewHistory`, element selected, `focusElementId` set; same view → no history
    push, selection + focus set; relationship target → `selectedRelationshipId` and
    `focusRelationshipId` set, element selection empty; works when `readOnly` is true.
  - [x] `npx vitest run src/store/slices/navigation-reveal.test.ts src/components/canvas/Canvas.test.tsx` passes.
  - [x] `npx eslint src/store/slices/navigation-slice.ts src/store/workspace-types.ts src/components/canvas/Canvas.tsx src/store/slices/navigation-reveal.test.ts` clean.
  **Stop Rule:** if selection set right after the view switch is cleared by
  another effect (route sync, canvas), stop and report rather than adding timers.

### Phase 2 — Sidebar UI and chrome integration

**Goal:** the sidebar is mounted, toggleable, and the rest of the chrome makes room for it.
**Verification:** `npx vitest run src/components/layout/DocumentsSidebar.test.tsx src/components/layout/FloatingTopPill.test.tsx src/hooks/useKeyboardShortcuts.test.ts` and `npm run typecheck`.

Parallel group B: Tasks 2.1, 2.2 — disjoint files; both depend only on Phase 1.

- [x] **Task 2.1 — `DocumentsSidebar` component + mount.** Build the component per
  Layout and Row design (header with count + close, scrollable list, empty state,
  link anchors via `documentViewUrl`, view chips calling `revealInView`, type badge,
  "Not in any view", resize handle with pointer drag + Arrow keys persisted via
  `useSettingsStore.update`, `--docs-sidebar-w` CSS variable lifecycle,
  `data-canvas-chrome="documents-sidebar"`, `<aside aria-label="Documents">`,
  mobile full-width overlay). Mount it in `App.tsx` `canvasElement` (also in
  read-only; not in presentation mode) and set `main#c4hero-canvas` style
  `right: var(--docs-sidebar-w, 0px)`.
  **Files:** `src/components/layout/DocumentsSidebar.tsx` (create),
  `src/components/layout/DocumentsSidebar.test.tsx` (create), `src/App.tsx` (modify),
  `src/lib/documentIndex.ts` (reuse — created in Task 1.1), `src/lib/documentLinks.ts` (reuse),
  `src/store/settings.ts` (reuse — modified in Task 1.2).
  **Definition of Done:**
  - [x] Tests: hidden when setting closed; lists entries A–Z with links whose
    `href` is the `/document-view?...` URL and `target="_blank"`; chip click calls
    navigation so `activeViewKey` + selection change; "Not in any view" row has no
    chips; empty state; close button flips the setting; renders in read-only;
    CSS variable set when open and cleared when closed.
  - [x] `npx vitest run src/components/layout/DocumentsSidebar.test.tsx` passes.
  - [x] `npx eslint src/components/layout/DocumentsSidebar.tsx src/components/layout/DocumentsSidebar.test.tsx src/App.tsx` clean.

- [x] **Task 2.2 — Toggle entry points + chrome offsets.** Add the "Documents"
  top-pill button (new last button — move the right-edge rounding to it; count
  badge from `buildDocumentIndex` length), the mobile hamburger entry, the
  `toggle-documents-sidebar` command (`shortcut: 'D'`) and the `'d'` global shortcut
  (gated by `isCanvasRoute`, allowed in read-only). Apply the `--docs-sidebar-w`
  offsets listed in Layout to the floating chrome.
  **Files:** `src/components/layout/FloatingTopPill.tsx` (modify),
  `src/components/layout/FloatingTopPill.test.tsx` (modify),
  `src/hooks/useKeyboardShortcuts.ts` (modify), `src/hooks/useKeyboardShortcuts.test.ts` (modify),
  `src/lib/commands.ts` (modify), `src/components/layout/FloatingInspector.tsx` (modify),
  `src/components/layout/FloatingZoomHud.tsx` (modify),
  `src/components/layout/highlighter/BottomHighlighterBar.tsx` (modify),
  `src/components/layout/FloatingBottomStrip.tsx` (modify),
  `src/components/canvas/CanvasHints.tsx` (modify),
  `src/components/layout/MultiSelectBar.tsx` (modify).
  **Definition of Done:**
  - [x] Tests: top-pill button toggles `documentsSidebarOpen` and shows
    `data-active` when open (also in read-only); `d` toggles the setting on a canvas
    route and is ignored while typing in an input.
  - [x] `npx vitest run src/components/layout/FloatingTopPill.test.tsx src/hooks/useKeyboardShortcuts.test.ts` passes.
  - [x] `npx eslint` on every file in **Files:** clean.
  - [x] Every listed chrome file references `--docs-sidebar-w`.
  **Clues:** confirm actual paths with a search before editing — some chrome
  components may live in a different folder than listed; the right-anchored
  values are FloatingInspector.tsx:59-65 and FloatingZoomHud l.18-21.

### Phase 3 — End-to-end coverage

**Goal:** the user journey is locked in by a committed Playwright spec.
**Verification:** `npx playwright test e2e/panels/documents-sidebar.spec.ts`.

- [x] **Task 3.1 — E2E spec.** Using `workspace.parseAndLoad(dsl)` with a small
  workspace (a system with a container view + context view, one element and one
  relation with documents, one element with documents in no view), cover: toggle
  via button and `d`; rows A–Z; link `href`/`target`; chip navigates, URL changes,
  element selected and inspector open; browser Back returns to the previous view;
  relation chip selects the relation; open state + width persist across reload;
  inspector is not overlapped by the sidebar.
  **Files:** `e2e/panels/documents-sidebar.spec.ts` (create), `e2e/fixtures/workspace.ts` (reuse).
  **Definition of Done:**
  - [x] `npx playwright test e2e/panels/documents-sidebar.spec.ts` passes 3 times in a row.

### Phase 4 — Final verification

Parallel group C: Tasks 4.1, 4.2.

- [x] **Task 4.1 — Code review** (`code-reviewer`): plan path + full changed-file
  list; run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  E2E runs in 4.2 — exclude it.
- [x] **Task 4.2 — Functional verification** (`feature-verifier`): execute
  `specifications/documents-sidebar/documents-sidebar.verification.md`.

## Acceptance Criteria

- [x] Sidebar toggles from the top pill, the mobile menu, the command palette and `D`.
- [x] Docked full-height on the right; canvas, inspector, zoom HUD and centered chrome make room; list scrolls independently.
- [x] Lists every element (incl. deployment/infrastructure nodes) and explicit relation with documents, A–Z, with type badges; relations named "Source → Target" with description.
- [x] Links open the rendered document in a new tab.
- [x] One chip per view containing the item; click → view switches (Back returns), item centered and selected, inspector open. "Not in any view" when none.
- [x] Open state and width persist across reloads; width resizable by drag and keyboard.
- [x] Works in the read-only viewer.
- [x] Live-updates when documents are added/removed in the inspector.

## Improvements (Out of Scope)

- Text filter and collapsible rows (deliberately deferred from v1).
- Rendering documents inside the sidebar instead of a new tab.
- Detecting broken links (path missing from `/__docs/__index.json`) and flagging them.
- `focusViewForElements` ignores dynamic and deployment views — unrelated, left as is.
- `VIEW_TYPE_LABELS` duplicated in FloatingViewsPanel.tsx and ViewSwitcher.tsx.

## Deviations and follow-up fixes

- `BottomHighlighterBar` lives at `src/components/layout/highlighter/BottomHighlighterBar.tsx`.
- `FloatingBottomStrip.tsx`: offset applied only to the mounted `ScopeViolationBanner`; `TagManagerPanel` is unmounted dead code.
- Final-review fixes: mobile chip click closes the overlay; resize uses pointer capture (cancel never persists, non-primary buttons ignored); top-pill toast centered over canvas; effective sidebar width capped so the canvas keeps ≥360px (inspector width also bounded); `countDocumentedItems` for the badge + view-membership maps in `buildDocumentIndex`; `aria-pressed` + count in the toggle label, `aria-current` on the active chip, focus returns to the toggle on close.
- Verification finding fixed: focus centering now waits for the view's first-visit auto-fit and shifts the target left by half the open inspector's width (`[data-canvas-chrome="inspector"]`), so the revealed item isn't hidden under the inspector.
- E2E spec locates the toggle via `[data-documents-toggle]` (accessible name now includes the count).
- Known, pre-existing, dev-only: React StrictMode makes each view switch push two history entries under `npm run dev` (one in production builds).
