# Export for proposal

## Task Details

Source: `docs/feature-requests/export-for-proposal.md`.

## Goal

**Goal**: Add an "Export for proposal" command that lets the user pick any subset of
the current workspace's views and downloads one white-background, light-theme PNG per
selected view — each cropped to that view's content bounding box, named
`<ProjectName>-<ViewName>.png` — bundled into a single zip.

**Success Measure**: From the command palette or the top-pill Export menu, a user can
open a view picker, select N views, click Export, and receive one zip download
containing N correctly-named, light/white, content-cropped PNGs — without manually
switching views or resizing the browser window.

**Do NOT touch / do NOT add**:
- Do not change the existing single-view `export-png` / `export-svg` commands or
  `ExportDialog`'s current PNG/SVG/DSL rows — add alongside, don't modify their
  behavior.
- Do not add SVG export to the proposal package (PNG only, per the feature request).
- Do not build a generic "headless render any view" system — reuse the existing
  mounted Canvas/React Flow instance by switching `activeViewKey`, exactly like every
  other view-navigation command in this codebase already does.

## Proposed Solution

Batch export works by driving the **single already-mounted** React Flow instance
through each selected view in turn (there is no offscreen/headless renderer in this
codebase — see Current Implementation Analysis): for each view, switch
`activeViewKey`, wait until React Flow has measured that view's nodes, capture a PNG
cropped to the content bounding box with a forced light/white style, then move to the
next view and restore the view the user started on. This mirrors the existing
`view-${key}` navigation commands (`src/lib/commands.ts`) and the rAF-based
measurement-polling pattern Canvas already uses internally for its own fit-to-view
logic (`src/components/canvas/Canvas.tsx`, `fitContentNodes`) — no new architecture,
just a new consumer of the same signals.

**Cropping approach**: instead of capturing `.react-flow__renderer` (the live
viewport, whatever pan/zoom happens to be active — today's behavior), capture
`.react-flow__viewport` (the panned/zoomed inner layer) with its `transform`
overridden to translate the content bounding box to the origin, and explicit
`width`/`height` set to the bounding box size. This crops to content regardless of
live pan/zoom, so no `fitView`/viewport-restore call is needed before capture at all
— only *measurement* (real DOM node sizes) needs to be ready, not framing.

**Decisions made while planning** (flagged for the user to confirm on read):
- Delivery is always a single zip, even for a single selected view — simpler and
  deterministic, per the feature request's "individually or as a zip" alternative.
- A view with no elements (empty bounding box) is skipped with a warning shown after
  export, rather than failing the whole batch or exporting a blank image.
- Views that fail to render/capture are skipped with a per-view warning; the batch
  continues and reports failures at the end rather than aborting on the first error.

## Current Implementation Analysis

**Already implemented (reuse):**
- `sanitizeFilename` — `src/lib/filenames.ts:2` — reuse verbatim for both the zip name
  and each per-view PNG name.
- `downloadBlob` — `src/lib/exportUtils.ts:16` — reuse verbatim to trigger the zip
  download.
- `LIGHT_STYLE` — `src/lib/exportUtils.ts:31` (currently module-private) — reuse the
  same color map; needs to become exported.
- `getNodeBounds` — `src/lib/fitViewport.ts:142` (currently module-private, returns
  `{ centerX, centerY, width, height }`) — reuse the same min/max-over-nodes bounds
  math instead of re-deriving it; needs to become exported and additionally return
  `minX`/`minY` (this plan's capture code needs the top-left corner, not just center).
- `getAllViews(workspace)` — `src/store/workspace-selectors.ts:13` — the "all views in
  the current workspace" list, already re-exported from `src/store/workspace.ts` and
  used the same way by the `view-${key}` navigation commands.
- `setActiveView(key)` — `src/store/slices/navigation-slice.ts:92` — the existing
  programmatic view-switch API; synchronous, no completion callback.
- `DialogShell` (`src/components/shared/DialogShell.tsx`) — the shared modal shell
  (`position="center"`) used by every other dialog in the app.
- Dynamic-import-on-use pattern for heavy libs, e.g. `await import('html-to-image')`
  in `exportCanvasAsPNG` (`src/lib/exportUtils.ts:64`) — follow the same pattern for
  the new `jszip` dependency so it stays out of the main bundle.
- `commandPaletteOpen`/`setCommandPaletteOpen` and `createViewDialogOpen`/
  `setCreateViewDialogOpen` in `src/store/slices/ui-slice.ts` — the pattern to mirror
  for a new `exportProposalDialogOpen` boolean (a store-level dialog flag that also
  closes the command palette).

**To be modified:**
- `src/lib/fitViewport.ts` — export `getNodeBounds`, add `minX`/`minY` to its return
  type.
- `src/lib/exportUtils.ts` — export `LIGHT_STYLE`.
- `src/store/slices/ui-slice.ts` + `src/store/workspace-types.ts` — add
  `exportProposalDialogOpen` / `setExportProposalDialogOpen`.
- `src/lib/commands.ts` — add an `export-proposal` command.
- `src/components/layout/FloatingTopPill.tsx` — lazy-load and render the new dialog,
  wire a handler that does the actual export/zip/download.
- `src/components/dialogs/ExportDialog.tsx` — add a "Proposal Package" row that opens
  the new dialog.
- `package.json` — add `jszip` dependency.

**To be created:**
- `src/lib/exportProposal.ts` — the per-view capture function and the batch
  orchestration function (view-switch loop, measurement wait, restore original view).
- `src/lib/zipUtils.ts` — thin `jszip` wrapper to bundle named blobs into one zip
  blob.
- `src/components/dialogs/ExportProposalDialog.tsx` — the view picker UI (checkboxes,
  select all/none, progress, per-view failure reporting).

## Technical Context

**Stack**: React 19.2, TypeScript ~5.9, Vite 8, Zustand 5 (with `zustand/middleware/
immer`), `@xyflow/react` 12.11.3, `html-to-image` 1.11.13, Vitest 4 + `jsdom` +
`@testing-library/react` 16, ESLint 9. Package manager: npm.

**Verbatim verification commands** (from `package.json` scripts):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit tests (whole suite): `npm test` — or a single file: `npx vitest run <path>`
- Full gate: `npm run check` (lint + typecheck + test + build)

**Conventions observed in this codebase:**
- Store is a single Zustand store composed of slices (`src/store/slices/*.ts`), each
  slice's `Pick<WorkspaceState, ...>` type plus a `StateCreator`. New boolean UI flags
  go in `ui-slice.ts`'s type union, initial-state object, and get a paired setter;
  the field must also be added to `WorkspaceState` in `src/store/workspace-types.ts`
  (this file was not read in full during research — grep it for the existing
  `createViewDialogOpen` / `setCreateViewDialogOpen` entries and add the new pair
  next to them in the same shape).
- Commands are declared as flat objects inside `getCommands()` in `src/lib/commands.ts`
  (`Command` interface at line 23: `{ id, label, category, icon: LucideIcon,
  shortcut?, keywords?, when?, execute }`), category `'export'` for export-related
  commands.
- Dialogs are plain custom React components (no Radix/Headless UI in this repo),
  built on `DialogShell` for the backdrop/focus-trap/Escape handling, and are
  lazy-loaded from `FloatingTopPill.tsx` via `lazy(() => import(...))`.
- Existing dialogs that trigger real work stay presentational and receive the actual
  export/copy logic as callback props from `FloatingTopPill` (see `ExportDialog`'s
  `onExport`/`onCopy` props, and its test `ExportDialog.test.tsx` which mocks those
  props directly) — follow the same shape for `ExportProposalDialog` so it can be
  unit-tested without mocking the store or React Flow.
- Tests are colocated as `<name>.test.ts(x)` next to the source file, using
  `describe`/`it` from `vitest`, `vi.mock` for module mocks (e.g. `vi.mock('html-to-
  image', () => ({ toBlob: vi.fn() }))` in `exportUtils.test.ts`), and `@testing-
  library/react`'s `render`/`screen`/`fireEvent`/`waitFor` for component tests.

**No offscreen/headless rendering exists in this codebase.** There is exactly one
mounted `ReactFlowProvider` + `Canvas` per open workspace (`src/App.tsx:77-98`), and
`FloatingTopPill` (where this feature's entry points live) renders inside that same
provider, so `useReactFlow()` inside `FloatingTopPill` returns the same instance
`Canvas` uses. Switching `activeViewKey` and reading back `reactFlow.getNodes()` is
therefore the only way to get real per-view geometry — no view can be rendered
without briefly becoming the active view.

**Measurement-wait algorithm** (no existing "layout settled" signal exists anywhere
in the store or `Canvas.tsx` — confirmed by search; this must be built new, mirroring
but not calling into `Canvas.tsx`'s private `fitContentNodes` polling loop at
`src/components/canvas/Canvas.tsx:470-518`). Because the new capture crops via a
`transform` override rather than via `fitView`, it does **not** need to wait for
Canvas's own fit/overlay-rebuild animations — only for real DOM measurement:

1. A view with zero elements has no content nodes to wait for; resolve immediately
   (`{ timedOut: false }`) without polling at all — the caller skips it with a
   warning per the Proposed Solution decision above.
2. **Do not** derive the expected content-node id set from `view.elements.map(e =>
   e.id)`. For deployment views, `view.elements` contains deployment-node ids, but
   the node builder (`src/components/canvas/deploymentBuilders.ts`) never renders a
   content node with that id — it renders a `__scope_boundary__<id>` overlay instead
   — so an id set sourced from `view.elements` never matches any rendered node for
   that view type, and readiness would never be reached (silently degrading to
   "wait the full timeout on every deployment view, then capture with the gate
   effectively disabled"). Instead, the expected set is derived entirely from React
   Flow's own rendered nodes, observed by polling.
3. Before polling starts, snapshot the current content-node ids (`reactFlow
   .getNodes()`, filtered via `isContentFitNode` — see `src/lib/fitViewport.ts:41`,
   which distinguishes real content nodes from `__scope_boundary__`/`group-` prefixed
   overlay nodes) as `staleIds` — this is the *previous* view's rendered content, not
   the target view's.
4. Poll on `requestAnimationFrame` (do not use a fixed `setTimeout` delay — Canvas's
   own internal polling loop, which this must run after, is itself frame-driven and
   of variable length). On each frame, read the current content-node ids again. If
   they differ from the ids observed on the previous frame, remember them and wait
   one more frame before trusting them (the set may still be settling as React
   commits the new view's nodes). Only once the id set is **stable across two
   consecutive frames AND exactly different from `staleIds`** (both directions —
   mirrors `Canvas.tsx`'s own `seen.size !== expected.size` + per-id equality check
   at `Canvas.tsx:496-502` — not merely "expected ⊆ actual") is that set trusted as
   the new view's real content-node set. Requiring exact non-superset equality
   against a snapshot of the *previous* view's nodes is what prevents the stale-node
   race: because `setActiveView` is synchronous but React's node commit is not, the
   very first `requestAnimationFrame` tick can otherwise still see the previous
   view's already-measured nodes and falsely report "ready" under the new view's
   filename.
5. Once that stable set is established, the view is "ready" when every node in it has
   both `measured?.width` and `measured?.height` set (mirrors the gate `Canvas.tsx`
   itself uses at lines 506-509 before it will fit/capture anything).
6. Bounded by two independent caps, either of which ends the wait with
   `{ timedOut: true }`: a frame-count cap (mirrors `Canvas.tsx`'s own
   `MAX_MEASURE_ATTEMPTS = 60`, i.e. ~1s at 60fps) and a wall-clock deadline
   (`Date.now()`-based, ~2000ms). The wall-clock cap exists because
   `requestAnimationFrame` is not serviced in a backgrounded/hidden tab — a
   purely frame-bounded poll would otherwise hang indefinitely if the user switches
   tabs mid-batch. On timeout, the caller proceeds with whatever is measured at that
   point and records a per-view warning (`ExportViewsForProposalResult.warnings`)
   rather than failing the whole batch or silently discarding the fact that the
   capture may be incomplete.

## Phases and Tasks

### Phase 1 — Export engine (bounds, capture, zip, store flag)

**Goal**: All non-UI building blocks exist, exported, and unit-tested in isolation,
so Phase 2 only has to wire them into UI.

**Verification**: `npm run typecheck && npm run lint && npx vitest run src/lib/fitViewport.test.ts src/lib/exportUtils.test.ts src/lib/exportProposal.test.ts src/lib/zipUtils.test.ts`

Parallel group A: Tasks 1.1, 1.2, 1.3, 1.4 — independent, disjoint files.

#### Task 1.1 — Export and extend `getNodeBounds`

Export the currently-private `getNodeBounds` from `src/lib/fitViewport.ts:142` and
extend its return type to also include `minX`/`minY` (top-left corner), alongside the
existing `centerX`/`centerY`/`width`/`height`. Keep the two existing internal call
sites (`fitNodesToViewport`) working unchanged — this is an additive signature
change, not a behavior change for existing callers.

**Files:**
- `src/lib/fitViewport.ts` (modify)
- `src/lib/fitViewport.test.ts` (modify — add a case asserting `minX`/`minY` are
  present and correct for a small node set)

**Definition of Done:**
- [ ] `getNodeBounds` is exported and returns `{ minX, minY, centerX, centerY, width,
      height }`
- [ ] `npx vitest run src/lib/fitViewport.test.ts` passes
- [ ] `npm run typecheck` passes

#### Task 1.2 — Proposal PNG capture and batch orchestration

Export the currently-private `LIGHT_STYLE` from `src/lib/exportUtils.ts:31`. Create
`src/lib/exportProposal.ts` with:
- A capture function with signature
  `captureViewAsProposalPNG(reactFlow: ReactFlowInstance): Promise<Blob | null>` that
  computes bounds from `reactFlow.getNodes()` (via the exported `getNodeBounds` from
  Task 1.1 — import it; do not duplicate the min/max math), targets
  `document.querySelector('.react-flow__viewport')`, and calls `html-to-image`'s
  `toBlob` (dynamic `import('html-to-image')`, matching `exportCanvasAsPNG`'s
  existing pattern) with `width`/`height` set to the bounds' width/height,
  `backgroundColor: '#ffffff'`, and a `style` override applying `LIGHT_STYLE` plus a
  `transform: translate(-minX, -minY)` that cancels pan/zoom and aligns the content
  bounding box to the captured origin. Returns `null` for an empty view (bounds
  unavailable) or if `.react-flow__viewport` is missing.
- A measurement-wait function implementing the algorithm from Technical Context
  above, e.g. `waitForViewMeasured(reactFlow: ReactFlowInstance, view: View): Promise<{ timedOut: boolean }>`.
- A batch orchestration function, e.g.
  `exportViewsForProposal(params: { reactFlow: ReactFlowInstance; workspace: Workspace; views: View[] }): Promise<{ files: { filename: string; blob: Blob }[]; skipped: { view: View; reason: string }[] }>`
  that: records the current `activeViewKey`; for each `view` in `params.views` (in
  order) calls `useWorkspaceStore.getState().setActiveView(view.key)`, awaits
  `waitForViewMeasured`, skips with a reason if the view has no elements, otherwise
  calls `captureViewAsProposalPNG` and either records a file named
  `` `${sanitizeFilename(workspace.name ?? 'workspace')}-${sanitizeFilename(view.title ?? view.key)}.png` ``
  (reusing `sanitizeFilename` from `src/lib/filenames.ts`) or records a skip if
  capture returned `null`; in a `finally`, restores the original `activeViewKey` via
  `setActiveView` (only if one was set).

**Files:**
- `src/lib/exportUtils.ts` (modify — export `LIGHT_STYLE`)
- `src/lib/exportProposal.ts` (create)
- `src/lib/exportProposal.test.ts` (create)

**Definition of Done:**
- [x] `exportViewsForProposal` restores the original active view even when a capture
      throws (assert in a test with a mocked `reactFlow`/store)
- [x] A view with an empty `elements` array is skipped with a reason, not passed to
      `captureViewAsProposalPNG`
- [x] `npx vitest run src/lib/exportProposal.test.ts src/lib/exportUtils.test.ts`
      passes
- [x] `npm run typecheck` passes

**Stop Rule**: If `.react-flow__viewport` cannot be reliably re-cropped via a
`transform` + explicit `width`/`height` override in `html-to-image` (verify with a
quick manual spike before committing to the approach), stop and report back rather
than falling back silently to capturing the full, unc-ropped `.react-flow__renderer`
— that would silently violate the feature's core "bounding-box, not viewport"
requirement.

#### Task 1.3 — Zip bundling utility

Add the `jszip` dependency. Create `src/lib/zipUtils.ts` exporting
`createZipBlob(files: { name: string; data: Blob }[]): Promise<Blob>`, dynamically
importing `jszip` (matching the existing dynamic-import-on-use convention), adding
each file via its sanitized name, and generating a `Blob` (`type: 'blob'`) output.

**Files:**
- `package.json` (modify — add `jszip` dependency)
- `src/lib/zipUtils.ts` (create)
- `src/lib/zipUtils.test.ts` (create)

**Definition of Done:**
- [x] `createZipBlob([])` returns an empty-but-valid zip `Blob` (no throw)
- [x] `createZipBlob` with 2+ files produces a `Blob` whose unzipped contents
      (round-tripped through `jszip` in the test) match the input names/bytes
- [x] `npx vitest run src/lib/zipUtils.test.ts` passes
- [x] `npm run typecheck` passes

#### Task 1.4 — Store flag for the proposal dialog

Add `exportProposalDialogOpen: boolean` and `setExportProposalDialogOpen: (open:
boolean) => void` to `src/store/slices/ui-slice.ts` (type union, initial state
`false`, and a setter mirroring `setCreateViewDialogOpen`'s shape — also closes
`commandPaletteOpen`) and to `WorkspaceState` in `src/store/workspace-types.ts`.

**Files:**
- `src/store/slices/ui-slice.ts` (modify)
- `src/store/workspace-types.ts` (modify)

**Definition of Done:**
- [x] `npm run typecheck` passes (new fields satisfy `WorkspaceState`)
- [x] `npm run lint` passes

### Phase 2 — UI: picker dialog and entry points

**Goal**: A user can open, use, and complete the proposal export end-to-end from
either entry point.

**Verification**: `npm run typecheck && npm run lint && npx vitest run src/components/dialogs/ExportProposalDialog.test.tsx src/lib/commands.test.ts src/components/dialogs/ExportDialog.test.tsx`

Sequential — Task 2.2 imports the component Task 2.1 creates.

#### Task 2.1 — `ExportProposalDialog` component

Create `src/components/dialogs/ExportProposalDialog.tsx`, built on `DialogShell`
(`position="center"`), presentational per the codebase's dialog convention (receives
data and the export action as props, does not read the store or call `useReactFlow`
itself — see `ExportDialog`'s `onExport`/`onCopy` prop pattern in Technical Context):

Props: `{ views: View[]; onExport: (selectedKeys: string[]) => Promise<{ exportedCount: number; skipped: { view: View; reason: string }[] }>; onClose: () => void }`.

UI: a checkbox list of `views` (label: `view.title ?? view.key`, grouped or badged by
`view.type` similar to `LEVEL_BADGE` usage elsewhere), a select-all/none toggle, a
disabled-when-nothing-selected "Export N views" button, a busy/progress state while
`onExport` is pending, and — after it resolves — a summary of any skipped views
(reason shown per view) before closing or awaiting user dismissal.

**Files:**
- `src/components/dialogs/ExportProposalDialog.tsx` (create)
- `src/components/dialogs/ExportProposalDialog.test.tsx` (create)

**Definition of Done:**
- [x] Renders one checkbox per view in `views`, all checked by default (or provide a
      "select all" default — implementer's call, document the choice in the
      component)
- [x] Export button is disabled with zero views selected, calls `onExport` with the
      selected view keys otherwise
- [x] Displays skipped-view reasons returned by `onExport` after it resolves
- [x] Closes on Escape (via `DialogShell`, matching `ExportDialog.test.tsx`'s
      "closes when Escape is pressed" pattern)
- [x] `npx vitest run src/components/dialogs/ExportProposalDialog.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 2.2 — Wire entry points

In `src/lib/commands.ts`, add an `export-proposal` command in the `'export'`
category (icon: reuse `Image` or add a suitable `lucide-react` icon already imported
elsewhere in the file) whose `execute` calls
`store().setExportProposalDialogOpen(true)`.

In `src/components/layout/FloatingTopPill.tsx`, lazy-load
`ExportProposalDialog` (mirroring the existing `ExportDialog`/`CommandPalette`
`lazy(() => import(...))` declarations), read `exportProposalDialogOpen` /
`setExportProposalDialogOpen` from the store, render the dialog when open passing
`getAllViews(workspace)` as `views`, and implement the `onExport` handler: call
`useReactFlow()`'s instance + `exportViewsForProposal` (Task 1.2) with the selected
views resolved from `getAllViews(workspace)`, then `createZipBlob` (Task 1.3) over
the returned files, then `downloadBlob` with name
`` `${sanitizeFilename(workspace.name ?? 'workspace')}-proposal.zip` ``, and return
`{ exportedCount, skipped }` to the dialog.

In `src/components/dialogs/ExportDialog.tsx`, add a fourth row ("Proposal Package")
with a single action button whose `fn` calls a new `onOpenProposal: () => void` prop
(FloatingTopPill wires this to close `ExportDialog` and call
`setExportProposalDialogOpen(true)`).

**Files:**
- `src/lib/commands.ts` (modify)
- `src/lib/commands.test.ts` (modify — assert the new command exists, category
  `'export'`, and its `execute` opens the dialog)
- `src/components/layout/FloatingTopPill.tsx` (modify)
- `src/components/dialogs/ExportDialog.tsx` (modify)
- `src/components/dialogs/ExportDialog.test.tsx` (modify — assert the new row calls
  `onOpenProposal`)

**Definition of Done:**
- [x] `export-proposal` command appears in `getCommands()`'s `'export'` category and
      its `execute` opens the dialog (test asserts this without needing a live store)
- [x] `ExportDialog`'s new row calls the new `onOpenProposal` prop
- [x] `npx vitest run src/lib/commands.test.ts src/components/dialogs/ExportDialog.test.tsx`
      passes
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes

## Security Considerations

- The PNG capture path reuses `html-to-image`, the same library already used for the
  existing single-view export — no new DOM-serialization/XSS surface beyond what
  `exportCanvasAsPNG` already exercises today (no `sanitizeExportTree`-style
  sanitization is needed for a raster `toBlob` capture, only for the SVG/
  `foreignObject` export path, which this feature does not touch).
- `jszip` is a new third-party dependency: pin it via the normal `npm install` (adds
  to `package.json`/`package-lock.json`), no dynamic/remote loading.
- Filenames (zip and per-file) are always passed through `sanitizeFilename` before
  use, consistent with every other download path in this codebase.

## Acceptance Criteria

- [ ] Opening "Export for proposal" (from the command palette and from the Export
      menu's "Proposal Package" row) shows every view in the current workspace with a
      checkbox.
- [ ] Selecting a subset and exporting downloads exactly one `.zip` file.
- [ ] Each PNG inside the zip has a solid white (`#ffffff`) background and the light
      color palette, regardless of the app's current theme.
- [ ] Each PNG is cropped to that view's content bounding box — no dead space beyond
      the diagram's nodes/edges, and nothing cropped off even at the original
      browser viewport's pan/zoom.
- [ ] Each file is named `<ProjectName>-<ViewName>.png`, sanitized.
- [ ] After the export completes (success or partial-skip), the app returns to the
      view the user had active before starting the export.
- [ ] The existing single-view PNG/SVG export commands and `ExportDialog` rows are
      unchanged.

## Improvements (Out of Scope)

- SVG variant of the proposal package.
- A way to reorder / rename views before export, or to pick a custom sort order in
  the resulting zip.
- Caching/reusing a previous proposal export's images if views haven't changed.
- Exporting `dynamic` or `deployment` view PNGs at higher fidelity than the current
  Canvas rendering supports today (this plan exports whatever the live Canvas
  renders for those view types — no dynamic/deployment-specific handling beyond
  what already exists).
