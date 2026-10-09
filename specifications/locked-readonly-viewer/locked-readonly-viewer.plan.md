# Locked read-only viewer build

## Task Details

Source: conversation with the user — "build the app with an explicit workspace so
that when we start the app we will be able to only view this one workspace without
the possibility to change anything. Only read-only view would be available." Design
decisions (use case, content source, enforcement level, allowed interactions, build
mechanism) were resolved with the user via clarifying questions before this plan was
drafted; they are recorded as fixed in the Goal and Proposed Solution below and are
not open for re-litigation during implementation.

## Goal

**Goal**: Produce a separate, deployable production build (`npm run build:viewer --
--workspace path/to/file.dsl`) that boots straight into one baked-in workspace on a
read-only canvas — no folder picker, no welcome/collection screens, no File System
Access dependency, and no reachable path (UI or store action) that can change the
workspace's content.

**Success Measure**: Running `npm run build:viewer -- --workspace <file>.dsl`
produces `dist-viewer/`; serving it with `vite preview --outDir dist-viewer` loads
directly to the canvas showing that workspace's actual content; every editing entry
point (add element, right-panel property editors, AI assistant, tag manager,
deployment/dynamic-step authoring, node dragging/reconnecting, undo/redo,
create/duplicate/delete view, rename/delete workspace) is either hidden or, if
somehow invoked, a no-op that leaves the workspace unchanged; navigating between
views, zooming in/out of the C4 hierarchy, presentation mode, search, and PNG/SVG/
proposal export all continue to work exactly as in the normal editor.

**Do NOT touch / do NOT add**:
- Do NOT change the normal `npm run dev` / `npm run build` behavior in any way when
  the new `LOCKED_WORKSPACE_PATH` env var is absent — the existing editor build must
  be byte-for-byte unaffected.
- Do NOT add a password, auth gate, or any server-side access control. This is a
  build-time content lock and a client-side UI/state lock, not a security boundary —
  see Security Considerations.
- Do NOT extend the existing dev-only `scripts/dev.mjs --workspace <folder>` flag;
  it auto-opens a folder for convenience during development and stays exactly as is.
- Do NOT build a second, visually distinct "viewer" UI. Reuse the existing app chrome
  (`FloatingTopPill`, `FloatingToolRail`, `FloatingBottomStrip`, `RightPanel`, etc.)
  with edit-capable controls hidden — not a new minimal shell.
- Do NOT attempt to support more than one baked workspace per build, and do not add
  any in-app way to switch away from it.

## Proposed Solution

Two independent mechanisms, wired together by one new piece of store state:

1. **Build-time baking.** A Vite plugin (`vite.config.ts`) exposes a virtual module,
   `virtual:locked-workspace`. At build time it reads `process.env
   .LOCKED_WORKSPACE_PATH` (and an optional `LOCKED_WORKSPACE_SIDECAR_PATH`); if
   unset, the module is `export default null` and every existing build/dev command is
   untouched. If set, it reads the file(s) from disk and emits a module exporting
   `{ dsl: string, sidecar: string | null, name: string }`, with the file contents
   passed through `JSON.stringify` into the generated source — never interpolated
   into a template literal — so arbitrary DSL/JSON content can never break out of the
   string literal it's embedded in. A dedicated CLI wrapper, `scripts/build-viewer
   .mjs` (modeled on the existing `scripts/dev.mjs`), parses `--workspace <file>.dsl`,
   validates it, locates its sidecar via the existing `sidecarName()` naming
   convention, sets those two env vars, and spawns `vite build --outDir dist-viewer`
   — a separate script and a separate output directory, so the normal `npm run build`
   can never accidentally embed a workspace.

2. **Store-level read-only guard.** A single new `readOnly: boolean` field on
   `WorkspaceState`, set exactly once (via a new `setReadOnly` action) when `App.tsx`
   detects a locked build at startup, with no UI path that ever flips it back. Every
   action in the store that mutates persisted workspace content gets a guard at the
   very top of its body — `if (get().readOnly) return <declared no-op value>` for
   actions with outer logic (id generation, `announce()`) before their `set(...)`
   call, or `if (s.readOnly) return` as the first line of the Immer producer when the
   whole action body is the producer — returning before `pushUndoSnapshot()` or any
   mutation of `s.workspace` runs. This is enforced per-action, not through a single
   store-wide chokepoint: navigation actions (`setActiveView`, `drillInto`,
   `focusViewForElements`) use the exact same `set((s) => {...})` producer shape as
   content mutations, so a generic "block every producer call when readOnly" rule
   would also break the view navigation this build is explicitly required to keep
   working. Each guarded action is listed by name in Phase 1's tasks.

UI stripping is a second, independent layer for UX (the store guard is what makes
"impossible to change anything" actually true even if a UI gap is missed): edit-
capable buttons, menu items, and form controls read `readOnly` directly from the
store (most already import `useWorkspaceStore`) and hide or disable themselves — no
prop-drilling needed. `src/components/layout/right-panel/fields.tsx`'s three input
components (`EditableField`, `TechnologyField`, `OwnerField`) are the single highest-
leverage point: every right-panel property editor in the app is built on them.

**Why not a middleware-level guard instead of per-action edits:** considered and
rejected — see the navigation-vs-mutation shape collision above. A per-command-
category filter for the command palette was also considered and rejected for the
same reason: `commands.ts` categorizes `new-view`, `duplicate-view`, and `auto-
arrange` under `'view'` (not `'edit'`), and `save` under `'export'`, even though all
four mutate or persist content — so filtering must be by an explicit command-id list,
not by category.

## Current Implementation Analysis

**Already implemented (reuse):**
- `src/lib/sidecar.ts` — `sidecarName()` for locating a workspace's `.c4hero.json`
  sidecar from its `.dsl` filename; `extractSidecar`/`serializeSidecar` already used
  by `useAutoSave.ts` for the same pairing.
- `src/lib/workspaceDocument.ts` — `parseWorkspaceDocument({ content, fallbackName,
  sidecarJson })`, the exact function `WelcomeScreen.handleOpenWorkspace`/
  `handleOpenFile` already use to turn DSL text + optional sidecar JSON into a
  `Workspace`. The locked-mode bootstrap reuses this verbatim.
- `scripts/dev.mjs` — the argv-parsing/validate/spawn/signal-forwarding pattern to
  model `scripts/build-viewer.mjs` on (parses `--workspace`/`--workspace=`, resolves
  and validates the path, mutates `env` before spawning the real Vite binary,
  forwards `SIGINT`/`SIGTERM`).
- `src/store/internals.ts` — `pushUndoSnapshot(s)`, already called at the top of
  every content-mutating action's producer, right after the existing `if (!s
  .workspace) return` guard. The new `readOnly` check sits immediately alongside
  that existing guard, same shape, same place.
- App.tsx's existing effect (`App.tsx:64-73`) that navigates to `/collection/:slug/
  :ws` whenever `workspace && !isCanvasRoute(pathname)` — this is the redirect-back
  safety net that keeps the locked viewer on its canvas route even if a stray
  navigation occurs, with zero new routing code, as long as `workspace` stays set and
  `closeWorkspace()` is never reachable from locked-mode UI.
- `src/lib/commands.ts`'s existing `Command.when?: () => boolean` field — the exact
  mechanism the command palette already uses to hide inapplicable commands; the
  readOnly filter is one more `when` predicate, not a new filtering system.
- Colocated test files already covering several of the UI files this plan touches:
  `fields.test.tsx`, `FloatingToolRail.test.tsx`, `FloatingBottomStrip.test.tsx`,
  `RightPanel.test.tsx`, `ViewSwitcher.test.tsx`, `Canvas.test.tsx`, `commands
  .test.ts` — extend these rather than creating parallel ones.

**To be modified:**
- `src/store/workspace-types.ts` — add `readOnly: boolean` + `setReadOnly: (v:
  boolean) => void` to `WorkspaceState`.
- `src/store/slices/lifecycle-slice.ts` — own the new `readOnly` field/setter; guard
  `updateWorkspaceMeta` and `closeWorkspace`.
- `src/store/slices/element-slice.ts`, `group-slice.ts`, `relationship-slice.ts`,
  `dynamic-step-slice.ts`, `deployment-slice.ts`, `view-slice.ts`, `tag-style-
  slice.ts`, `undo-slice.ts` — guard their content-mutating actions (full lists in
  Phase 1 tasks).
- `src/store/slices/navigation-slice.ts` — guard only the create-a-view-on-demand
  path (`zoomInto`'s no-existing-view branch, `confirmZoomCreate`,
  `openCreateViewFromZoom`); leave `setActiveView`/`drillInto`/`navigateBack`/
  `focusViewForElements` untouched.
- `vite.config.ts` — add the `virtual:locked-workspace` plugin.
- `package.json` — add `build:viewer` script; no new dependencies.
- `.gitignore` — add `dist-viewer`.
- `src/lib/sidecar.ts` — re-export `sidecarName` from the new `src/lib/sidecarName.ts`
  instead of defining it locally (see Task 2.3's amendment — needed so
  `scripts/build-viewer.mjs`, a plain Node script, can import it without pulling in
  `@/*`-aliased modules only Vite can resolve).
- `src/main.tsx` or `App.tsx` — startup bootstrap into locked mode (see Phase 3).
- `src/hooks/useAutoSave.ts` — short-circuit entirely when `readOnly`.
- `src/components/layout/right-panel/fields.tsx`, `FloatingToolRail.tsx`,
  `FloatingTopPill.tsx`, `RightPanel.tsx`, `right-panel/DeploymentElementProperties
  .tsx`, `right-panel/GroupProperties.tsx`, `MultiSelectBar.tsx`,
  `FloatingBottomStrip.tsx`, `highlighter/TagManagerDialog.tsx`,
  `src/components/canvas/Canvas.tsx`, `src/lib/commands.ts` — hide/disable edit-
  capable controls when `readOnly` (full breakdown in Phase 4 tasks).

**To be created:**
- `scripts/build-viewer.mjs`
- `src/lib/sidecarName.ts` (dependency-free extraction, see Task 2.3's amendment)
- `src/types/virtual-modules.d.ts` (ambient declaration for `virtual:locked-
  workspace` — this repo has no `vite-env.d.ts`; `tsconfig.app.json` only sets
  `"types": ["vite/client"]`)
- `src/lib/lockedWorkspace.ts`
- `src/store/workspace-readonly.test.ts` (Task 1.11's consolidated cross-slice test)
- Per-slice read-only test files — this repo has no per-slice test files today (all
  coverage lives in flat files like `workspace.test.ts`), so Tasks 1.2–1.10 each
  create a new, uniquely-named one instead of editing a shared file:
  `src/store/slices/{element,group,relationship,dynamic-step,deployment,view,
  tag-style,undo,navigation}-slice-readonly.test.ts`
- New colocated test files for UI files that don't yet have one: `FloatingTopPill
  .test.tsx`, `MultiSelectBar.test.tsx`, `highlighter/TagManagerDialog.test.tsx`,
  `right-panel/DeploymentElementProperties.test.tsx`, `right-panel/GroupProperties
  .test.tsx`.

## Technical Context

**Stack**: React 19.2, TypeScript ~5.9, Vite 8, Zustand 5 (`zustand/middleware/
immer`), `@xyflow/react` 12.11.3, react-router-dom 7, Vitest 4 + `jsdom` +
`@testing-library/react` 16, ESLint 9, Playwright (e2e, not required by this plan).
Package manager: npm. Node >=22.

**Verbatim verification commands** (from `package.json`):
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Unit tests (whole suite): `npm test` — single file: `npx vitest run <path>` —
  directory: `npx vitest run <dir>`
- Full gate: `npm run check` (lint + typecheck + test + build)

**Conventions observed in this codebase:**
- Store is one Zustand store composed of slices (`src/store/slices/*.ts`), each a
  `StateCreator<WorkspaceState, [['zustand/immer', never]], [], SomeSlice>` over a
  `Pick<WorkspaceState, ...>` type. A field/action used by more than its owning slice
  must also be declared on `WorkspaceState` in `src/store/workspace-types.ts`.
- Content-mutating actions share one shape: `actionName: (...) => { <optional id-gen
  / outer logic>; set((s) => { if (!s.workspace) return; pushUndoSnapshot(s); <mutate
  s.workspace>; }); <optional return> }` — confirmed identical across element-,
  group-, relationship-, dynamic-step-, deployment-, view-, and tag-style-slice.
  `pushUndoSnapshot(s)` (`src/store/internals.ts`) is a no-op if `!s.workspace`, so
  the existing `if (!s.workspace) return` and the new `if (s.readOnly) return` read
  naturally as one pair of early guards.
- Pure UI/navigation/selection/filter actions use plain `set({ ... })` or `set((s) =>
  { s.someFlag = ... })` with no `pushUndoSnapshot` call — this is the structural
  signal used throughout Phase 1 to decide what needs a guard.
- Tests are colocated as `<name>.test.ts(x)`, Vitest `describe`/`it`,
  `@testing-library/react`'s `render`/`screen`/`fireEvent`, `vi.mock` for module
  mocks.
- Dialogs/panels read boolean flags directly off `useWorkspaceStore` wherever they're
  rendered — no prop-drilling precedent in this codebase for cross-cutting flags like
  this one, so `readOnly` follows the same pattern as `presentationMode` or
  `multiSelectMode`.

**Env vars / build-time contract this plan introduces** (pin the names so every task
agrees on them):
- `LOCKED_WORKSPACE_PATH` — absolute path to the `.dsl` file, set by `scripts/build-
  viewer.mjs`, read only inside `vite.config.ts`'s plugin (never read by app code at
  runtime).
- `LOCKED_WORKSPACE_SIDECAR_PATH` — absolute path to the sidecar JSON, set only if
  `sidecarName(file)` exists on disk next to the `.dsl` file.
- `virtual:locked-workspace` module shape: `export default { dsl: string, sidecar:
  string | null, name: string } | null`.

## Phases and Tasks

### Phase 1 — Store-level read-only guard

**Goal**: `readOnly` exists on the store, and every action that can change persisted
workspace content is a guaranteed no-op when it's `true` — independent of any UI or
build work, verifiable by tests alone.

**Verification**: `npm run typecheck && npx vitest run src/store`

#### Task 1.1 — Add the `readOnly` field and guard workspace-lifecycle actions

Add `readOnly: boolean` (default `false`) and `setReadOnly: (v: boolean) => void` to
`WorkspaceState`. Implement the field and setter in `lifecycle-slice.ts`, next to the
existing `activeWorkspaceFilename`/`scopeViolations` state it already owns. Guard
`updateWorkspaceMeta` (returns `void`, so `if (s.readOnly) return` as the producer's
first line) and `closeWorkspace` (belt-and-suspenders — the UI's only path to it is
hidden in Phase 4, but guarding it here means no future UI addition can resurrect an
escape hatch). Leave `loadWorkspace`, `setActiveWorkspaceFilename`, and
`revalidateScope` untouched — `loadWorkspace` is how the locked workspace itself gets
loaded at startup and must work regardless of `readOnly`.

**Files:**
- `src/store/workspace-types.ts` (modify)
- `src/store/slices/lifecycle-slice.ts` (modify)
- `src/store/slices/lifecycle-slice.test.ts` (modify if it exists, else create —
  check first) — add cases: `setReadOnly(true)` then `updateWorkspaceMeta` is a
  no-op; `closeWorkspace` is a no-op.

**Definition of Done:**
- [x] `WorkspaceState` has `readOnly: boolean` and `setReadOnly`
- [x] `updateWorkspaceMeta` and `closeWorkspace` no-op when `readOnly` is true
- [x] `loadWorkspace` is unaffected by `readOnly`
- [x] `npx vitest run src/store/slices/lifecycle-slice.test.ts` (or wherever its
      test lives — grep for existing lifecycle tests first) passes
- [x] `npm run typecheck` passes

---

**Amendment (post Task 1.1):** this repo has no per-slice test files — all slice
behavior is tested from flat files (`src/store/workspace.test.ts`,
`deployment-authoring.test.ts`, `dynamic-steps.test.ts`), and several of those flat
files already cover actions across *multiple* slices (e.g. `addRelationship`/
`addView`/`addPerson` all appear in both `workspace.test.ts` and
`deployment-authoring.test.ts`). Editing any of those shared files from more than one
parallel task would mean concurrent writers to the same file. Each task below
therefore creates its own uniquely-named **new** test file
(`src/store/slices/<slice>-readonly.test.ts`) for its guard's cases instead of
touching the shared flat files — disjoint from every other task's files, and from
Task 1.11's separate consolidated cross-slice file.

Parallel group A (all depend on Task 1.1's `readOnly` field existing on
`WorkspaceState`; disjoint files — each task touches only its own slice `.ts` file;
independent of each other):

#### Task 1.2 — Guard element-slice

Guard `addPerson`, `addSoftwareSystem`, `addContainer`, `addComponent`,
`updateElement`, `updateElementLive`, `updateElementTechnology`, `deleteElement`,
`deleteElements`, `duplicateElements` in `src/store/slices/element-slice.ts`. The
four `add*` actions generate an id via `nanoid(8)` before calling `set(...)` — guard
at the very top of the outer function (`if (get().readOnly) return id` is wrong,
since no element was actually created; return `''` instead, matching the "no
workspace" early-return pattern these actions don't currently have but should mirror)
so no id generation or `announce()` call happens either. `duplicateElements` returns
`string[]` — no-op value is `[]`.

**Files:**
- `src/store/slices/element-slice.ts` (modify)
- `src/store/slices/element-slice-readonly.test.ts` (create — new file, do NOT edit
  `src/store/workspace.test.ts` or `deployment-authoring.test.ts`, which also
  exercise these actions and are shared with other parallel tasks)

**Definition of Done:**
- [x] All ten listed actions return their declared no-op value and leave `workspace`
      and `undoStack` unchanged when `readOnly` is true
- [x] `npx vitest run src/store/slices/element-slice-readonly.test.ts` passes
- [x] `npm run typecheck` passes

#### Task 1.3 — Guard group-slice

Guard `addGroup` (returns `string`, id generated before `set`), `updateGroup`,
`deleteGroup` in `src/store/slices/group-slice.ts`.

**Files:**
- `src/store/slices/group-slice.ts` (modify)
- `src/store/slices/group-slice-readonly.test.ts` (create — new file; do not edit
  `src/store/workspace.test.ts`, shared with other parallel tasks)

**Definition of Done:**
- [x] All three actions no-op when `readOnly` is true (verified in test)
- [x] `npx vitest run src/store/slices/group-slice-readonly.test.ts` passes
- [x] `npm run typecheck` passes

#### Task 1.4 — Guard relationship-slice

Guard `addRelationship` (returns `string`, id generated before `set`, also sets a
local `created` flag inside the producer — the readOnly check goes before any of
that), `updateRelationship`, `reconnectRelationship`, `deleteRelationship` in
`src/store/slices/relationship-slice.ts`.

**Files:**
- `src/store/slices/relationship-slice.ts` (modify)
- `src/store/slices/relationship-slice-readonly.test.ts` (create — new file; do not
  edit `src/store/workspace.test.ts` or `deployment-authoring.test.ts`, shared with
  other parallel tasks)

**Definition of Done:**
- [x] All four actions no-op when `readOnly` is true
- [x] `npx vitest run src/store/slices/relationship-slice-readonly.test.ts` passes
- [x] `npm run typecheck` passes

#### Task 1.5 — Guard dynamic-step-slice

Guard `addDynamicStep`, `updateDynamicStepDescription`, `moveDynamicStep`,
`deleteDynamicStep` in `src/store/slices/dynamic-step-slice.ts` (all four are plain
`set((s) => {...})` producers with no outer logic — `if (s.readOnly) return` as the
producer's first line).

**Files:**
- `src/store/slices/dynamic-step-slice.ts` (modify)
- `src/store/slices/dynamic-step-slice-readonly.test.ts` (create — new file; this
  slice's existing coverage lives in `src/store/dynamic-steps.test.ts`, which other
  tasks/future work may also touch — use a new file rather than that one)

**Definition of Done:**
- [x] All four actions no-op when `readOnly` is true
- [x] `npx vitest run src/store/slices/dynamic-step-slice-readonly.test.ts` passes
- [x] `npm run typecheck` passes

#### Task 1.6 — Guard deployment-slice

Guard `addDeploymentEnvironment` (returns `boolean`, no-op value `false`),
`addDeploymentNode`, `addInfrastructureNode`, `addContainerInstance`,
`addSoftwareSystemInstance` (all four return `string` ids generated before `set`,
no-op value `''`), `renameDeploymentElement`, `updateDeploymentElement` in
`src/store/slices/deployment-slice.ts`.

**Files:**
- `src/store/slices/deployment-slice.ts` (modify)
- `src/store/slices/deployment-slice-readonly.test.ts` (create — new file; do not
  edit `src/store/deployment-authoring.test.ts`, shared with other parallel tasks)

**Definition of Done:**
- [x] All seven actions no-op when `readOnly` is true, including
      `addDeploymentEnvironment` returning `false` rather than its existing
      "already exists" `true` no-op
- [x] `npx vitest run src/store/slices/deployment-slice-readonly.test.ts` passes
- [x] `npm run typecheck` passes

#### Task 1.7 — Guard view-slice (except `syncAutoLayoutPositions`)

Guard `addView` (returns `string`, id before `set`), `deleteView`, `renameView`,
`duplicateView` (returns `string`, id before `set`), `updateNodePosition`,
`updateNodePositions`, `toggleElementInView`, `removeElementsFromView`,
`setLayoutDirection`, `resetAndRelayout`, `setElementsLocked`, `unlockAllInView`,
`setViewLocked` in `src/store/slices/view-slice.ts`. Do **not** guard
`syncAutoLayoutPositions` — it does not call `pushUndoSnapshot`, is explicitly
documented as a non-undo internal derivation Canvas uses to canonicalize the initial
dagre layout, and must keep running in locked mode so the initial render is stable.

**Files:**
- `src/store/slices/view-slice.ts` (modify)
- `src/store/slices/view-slice-readonly.test.ts` (create — new file; do not edit
  `src/store/workspace.test.ts` or `deployment-authoring.test.ts`, shared with other
  parallel tasks)

**Definition of Done:**
- [x] All thirteen listed actions no-op when `readOnly` is true
- [x] `syncAutoLayoutPositions` is confirmed unguarded and still functions
      identically regardless of `readOnly` (test case asserting this)
- [x] `npx vitest run src/store/slices/view-slice-readonly.test.ts` passes
- [x] `npm run typecheck` passes

#### Task 1.8 — Guard tag-style-slice

Guard `updateElementStyle`, `removeElementStyle`, `renameTag`, `removeTagGlobal` in
`src/store/slices/tag-style-slice.ts`.

**Files:**
- `src/store/slices/tag-style-slice.ts` (modify)
- `src/store/slices/tag-style-slice-readonly.test.ts` (create — new file; do not
  edit `src/store/workspace.test.ts`, shared with other parallel tasks)

**Definition of Done:**
- [x] All four actions no-op when `readOnly` is true
- [x] `npx vitest run src/store/slices/tag-style-slice-readonly.test.ts` passes
- [x] `npm run typecheck` passes

#### Task 1.9 — Guard undo-slice

Guard `undo`, `redo`, `resetWorkspaceTo` in `src/store/slices/undo-slice.ts`. Leave
`setLastSavedUndoLength`, `canUndo`, `canRedo` untouched (pure reads/bookkeeping, no
content mutation).

**Files:**
- `src/store/slices/undo-slice.ts` (modify)
- `src/store/slices/undo-slice-readonly.test.ts` (create — new file; do not edit
  `src/store/workspace.test.ts`, shared with other parallel tasks)

**Definition of Done:**
- [x] `undo`, `redo`, `resetWorkspaceTo` no-op when `readOnly` is true
- [x] `canUndo`/`canRedo` still reflect the (frozen, since nothing can push) undo
      stack correctly
- [x] `npx vitest run src/store/slices/undo-slice-readonly.test.ts` passes
- [x] `npm run typecheck` passes

#### Task 1.10 — Guard the create-on-zoom path in navigation-slice

In `src/store/slices/navigation-slice.ts`, guard only the content-creating branch:
`zoomInto` must never set `pendingZoomConfirm` when `readOnly` is true (so zooming
into an element with no existing child view simply does nothing, rather than
prompting to create one), and `confirmZoomCreate` / `openCreateViewFromZoom` must
no-op. Leave `setActiveView`, `drillInto`, `navigateBack`, `focusViewForElements`,
`cancelZoomConfirm`, `setCreateViewDefaults` untouched — these are the view
navigation this build must keep working.

**Files:**
- `src/store/slices/navigation-slice.ts` (modify)
- `src/store/slices/navigation-slice-readonly.test.ts` (create — new file; do not
  edit `src/store/workspace.test.ts`, shared with other parallel tasks)

**Definition of Done:**
- [x] `zoomInto` on a childless element with `readOnly: true` leaves
      `pendingZoomConfirm` null and does not navigate anywhere
      new/unexpected
- [x] `zoomInto` on an element that already has a child view still navigates to it
      with `readOnly: true` (this is allowed exploration, not a mutation)
- [x] `confirmZoomCreate` / `openCreateViewFromZoom` no-op when `readOnly` is true
- [x] `setActiveView`/`drillInto`/`navigateBack` are unaffected by `readOnly` (test
      case asserting this explicitly, since this is the one slice with mixed
      guarded/unguarded actions)
- [x] `npx vitest run src/store/slices/navigation-slice-readonly.test.ts` passes
- [x] `npm run typecheck` passes

---

#### Task 1.11 — Cross-slice read-only regression test

After Parallel group A lands, add one consolidated test asserting the guard holds
across every guarded slice in combination — this is the test that actually proves
Phase 1's goal rather than each slice's own isolated cases.

**Files:**
- `src/store/workspace-readonly.test.ts` (create)

**Definition of Done:**
- [x] Loads a sample workspace via `loadWorkspace`, then `setReadOnly(true)`
- [x] Calls at least one representative mutating action from every guarded slice
      (element, group, relationship, dynamic-step, deployment, view, tag-style,
      undo, lifecycle, navigation's zoom-create path) and asserts after each call:
      `workspace` is referentially/structurally unchanged, and `undoStack.length`
      is unchanged
- [x] Separately asserts that with `readOnly: false` the same calls DO mutate
      `workspace` (so the test can't pass by the actions being broken outright)
- [x] `npx vitest run src/store/workspace-readonly.test.ts` passes
- [x] `npm run typecheck` passes

---

### Phase 2 — Build pipeline: bake a workspace into a standalone build

**Goal**: `npm run build:viewer -- --workspace <file>.dsl` produces a working
`dist-viewer/` build with that workspace's content embedded, while `npm run dev` and
`npm run build` remain completely unaffected. Independent of Phase 1 — no shared
files — so it may run in parallel with it.

**Verification**: `npm run typecheck` (confirms the virtual module's ambient
declaration resolves across the app), plus the manual build check below (no fixture
`.dsl` is committed in this repo — the check creates a throwaway one):
```
printf 'workspace "Sample" {\n  model {\n    u = person "User"\n  }\n}' > /tmp/sample.dsl
node scripts/build-viewer.mjs --workspace /tmp/sample.dsl
test -f dist-viewer/index.html
```

Parallel group B: Tasks 2.1, 2.2, 2.3 — independent, disjoint files.

#### Task 2.1 — `virtual:locked-workspace` Vite plugin

Add a plugin to `vite.config.ts` providing the virtual module `virtual:locked-
workspace` per the contract pinned in Technical Context. `resolveId` matches
`'virtual:locked-workspace'` (and its resolved `'\0virtual:locked-workspace'` id
convention); `load` reads `process.env.LOCKED_WORKSPACE_PATH` — if unset, generated
source is `export default null`; if set, read the file with `fs.readFileSync(path,
'utf8')`, do the same for `LOCKED_WORKSPACE_SIDECAR_PATH` if present, and generate
source that `JSON.stringify`s both strings into the `dsl`/`sidecar` fields of the
exported default object (never a template literal containing the raw content), plus
`name` derived from the basename of `LOCKED_WORKSPACE_PATH` with the `.dsl` extension
stripped.

**Files:**
- `vite.config.ts` (modify)

**Definition of Done:**
- [x] With `LOCKED_WORKSPACE_PATH` unset, `virtual:locked-workspace` resolves to
      `export default null` (verify via a quick `vite build` with the env var unset
      and confirming the normal build still succeeds — covered by this phase's
      manual check running once with the var unset too)
- [x] With the env var(s) set, the generated module's default export matches the
      pinned shape and the file content survives a round trip byte-for-byte
      (including any backticks/`${`/quotes in the source DSL)
- [x] `npm run typecheck` passes

**Stop Rule:** If Vite's plugin API in the pinned version (`vite 8`, check installed
version via `vite --version`) differs from the `resolveId`/`load` hook shape
described here, stop and report the actual API rather than guessing.

#### Task 2.2 — Ambient module declaration

Create `src/types/virtual-modules.d.ts` declaring the `virtual:locked-workspace`
module's shape (`{ dsl: string, sidecar: string | null, name: string } | null`
default export) so TypeScript resolves the import in Task 3.1's `lockedWorkspace.ts`
without error.

**Files:**
- `src/types/virtual-modules.d.ts` (create)

**Definition of Done:**
- [x] `npm run typecheck` passes with a throwaway `import locked from 'virtual:
      locked-workspace'` added temporarily anywhere under `src/` (remove the
      throwaway import before finishing — Task 3.1 adds the real one)

#### Task 2.3 — `build-viewer` CLI script

**Amendment (first attempt stopped here):** `sidecarName()` cannot be imported into a
plain `.mjs` Node script as originally planned — `src/lib/sidecar.ts` unconditionally
imports other modules via the `@/*` path alias, which only Vite/TypeScript's
bundler-mode resolution understands, not plain Node (confirmed empirically: Node
22.22.3 here already strips TypeScript syntax from a `.ts` file with no flag needed —
`node -e "import('./src/lib/sidecar.ts')"` got past parsing — but then fails
specifically on resolving the bare `@/store` specifier, which Node has no mechanism
for outside a bundler). Resolution: extract `sidecarName` into a new, dependency-free
module that uses only relative imports, so both `sidecar.ts` (for the app, via Vite)
and `build-viewer.mjs` (via plain Node, which already runs on Node 22+ and strips TS
syntax natively) can import it directly:

1. Create `src/lib/sidecarName.ts` — move the existing `sidecarName()` function body
   here verbatim from `src/lib/sidecar.ts`, importing only `sanitizeFilename` from
   `./filenames` (relative import — `src/lib/filenames.ts` already has zero other
   dependencies, confirmed during Task 2.3's first attempt).
2. In `src/lib/sidecar.ts`, replace the local `sidecarName` definition with
   `export { sidecarName } from './sidecarName'` (or an equivalent re-export) so
   every existing caller importing `sidecarName` from `@/lib/sidecar` keeps working
   unchanged — grep for its current call sites before changing anything, to confirm
   none import it in a way this re-export would break.
3. In `scripts/build-viewer.mjs`, import it via a relative path from the script's
   location, e.g. `import { sidecarName } from '../src/lib/sidecarName.ts'`. Verify
   empirically that plain `node scripts/build-viewer.mjs` (no extra flags) can
   actually resolve and execute this relative `.ts` import on the Node version this
   repo requires (`>=22`, confirmed installed: 22.22.3) before relying on it — if it
   cannot without a flag, add that flag to the `build:viewer` npm script (e.g. `node
   --experimental-strip-types scripts/build-viewer.mjs`) rather than silently
   failing or duplicating the function.

Then build `scripts/build-viewer.mjs` itself, modeled on `scripts/dev.mjs`'s
argv-parsing and spawn/signal-forwarding shape: parse `--workspace <path>` /
`--workspace=<path>`; validate the path exists, is a file (not a directory), and
ends in `.dsl`; resolve to an absolute path; use `sidecarName()` (now cleanly
importable per above) to compute the sidecar's expected filename next to the `.dsl`
file, and include it via `LOCKED_WORKSPACE_SIDECAR_PATH` if it exists on disk; set
`LOCKED_WORKSPACE_PATH`; spawn `vite build --outDir dist-viewer` with the mutated
`env`. Add a `"build:viewer": "node scripts/build-viewer.mjs"` script to
`package.json` (with the strip-types flag if step 3 found it necessary). Add
`dist-viewer` to `.gitignore`.

**Files:**
- `src/lib/sidecarName.ts` (create)
- `src/lib/sidecar.ts` (modify — re-export only, no behavior change)
- `scripts/build-viewer.mjs` (create)
- `package.json` (modify)
- `.gitignore` (modify)

**Definition of Done:**
- [x] `sidecarName` imported into `build-viewer.mjs` actually executes under plain
      `node` (or `node` plus whatever flag was added to the npm script) — not
      duplicated inline
- [x] Existing callers of `sidecarName` from `@/lib/sidecar` are unaffected (run
      whatever existing test currently covers `src/lib/sidecar.ts` — grep for it —
      and confirm it still passes unchanged)
- [x] Missing `--workspace`, a nonexistent path, a directory, or a non-`.dsl` file
      each exit non-zero with a clear message (mirror `dev.mjs`'s existing error
      style)
- [x] The manual build check in this phase's Verification line succeeds end to end
      through this script, including a case where a sidecar file exists next to the
      fixture `.dsl` and is correctly picked up
- [x] `npm run typecheck` passes

---

### Phase 3 — App bootstrap into locked mode

**Goal**: On startup, if the build was produced with `build:viewer`, the app loads
the baked workspace, marks the store read-only, and lands on the canvas with no
welcome/collection screen ever rendered. Depends on Phase 1 (`setReadOnly`) and
Phase 2 (`virtual:locked-workspace`, `LOCKED_WORKSPACE_*` contract).

**Verification**: `npm run typecheck && npx vitest run src/lib src/hooks/useAutoSave.test.ts` (confirm this test file's actual name/location first — grep `src/hooks` for existing autosave tests)

Parallel group C: Tasks 3.1, 3.3 — independent, disjoint files. Task 3.2 depends on
3.1's exported function and must run after it.

#### Task 3.1 — `lockedWorkspace.ts`

Create `src/lib/lockedWorkspace.ts` importing `virtual:locked-workspace`. If its
default export is non-null, parse it via the existing `parseWorkspaceDocument({
content: dsl, fallbackName: name, sidecarJson: sidecar ?? undefined })` (`src/lib/
workspaceDocument.ts`) — the same function `WelcomeScreen` already uses for every
other workspace-load path. Expose `getLockedWorkspace(): Workspace | null`, computed
once (module-level, not re-parsed on every call).

**Files:**
- `src/lib/lockedWorkspace.ts` (create)
- `src/lib/lockedWorkspace.test.ts` (create) — mock `virtual:locked-workspace` via
  `vi.mock` with both a null and a populated case; assert the populated case
  produces a `Workspace` with the expected `name` and parsed content, and that parse
  warnings (if the fixture DSL has any) don't throw.

**Definition of Done:**
- [x] `getLockedWorkspace()` returns `null` when the virtual module is `null`
- [x] `getLockedWorkspace()` returns a parsed `Workspace` when the virtual module is
      populated, including sidecar-applied fields when a sidecar is present
- [x] `npx vitest run src/lib/lockedWorkspace.test.ts` passes
- [x] `npm run typecheck` passes

#### Task 3.2 — App startup bootstrap + AI panel gate

In `App.tsx`, add a startup effect (run once, before/alongside the existing
restore-dir-handle effect) that calls `getLockedWorkspace()`; if it returns non-null,
call `loadWorkspace(ws)` then `setReadOnly(true)` — in that order, since
`loadWorkspace` likely resets store state that could clobber a `readOnly` set
beforehand (confirm the actual order requirement by reading `loadWorkspace`'s body
in `lifecycle-slice.ts` before writing this). Also gate the AI panel render (`App
.tsx` around the existing `{onCanvas && (aiPanelOpen || aiSettingsOpen) && ...}`
block) with `&& !readOnly` so it can never render in locked mode even if some other
gap left a trigger reachable.

**Files:**
- `src/App.tsx` (modify)
- `src/App.test.tsx` (create — this repo currently has no `App.test.tsx`; mock
  `getLockedWorkspace` via `vi.mock('@/lib/lockedWorkspace', ...)` for both the null
  and populated cases)

**Definition of Done:**
- [x] With `getLockedWorkspace()` mocked to return a workspace, `App` loads it and
      the store ends up with `readOnly: true`
- [x] With `getLockedWorkspace()` mocked to return `null`, `App`'s existing
      (unlocked) startup behavior is unchanged
- [x] AI panel never renders when `readOnly` is true even if `aiPanelOpen` is forced
      true in the test
- [x] `npx vitest run src/App.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 3.3 — `useAutoSave` short-circuit

In `src/hooks/useAutoSave.ts`, read `readOnly` from the store and return before
scheduling the debounce timer at all when it's true — no localStorage write, no idle-
time file write.

**Files:**
- `src/hooks/useAutoSave.ts` (modify)
- its existing test file (find via `ls src/hooks/*.test.ts`; create one if none
  exists) (modify or create)

**Definition of Done:**
- [x] With `readOnly: true` and a workspace loaded, no `saveToLocalStorage`/
      `writeDSLFile`/`writeToCurrentHandle` call occurs after a workspace change
      (mock these and assert not called)
- [x] With `readOnly: false`, existing autosave behavior is unchanged
- [x] `npx vitest run <useAutoSave test file>` passes
- [x] `npm run typecheck` passes

---

### Phase 4 — UI: hide or disable every editing entry point

**Goal**: With the store guard from Phase 1 already making mutation impossible, this
phase makes the locked viewer's UI honestly reflect that — no dead buttons, no
inputs that silently do nothing when typed into. Depends only on Phase 1 (`readOnly`
field); independent of Phase 2/3's build/bootstrap mechanics.

**Verification**: `npm run typecheck && npm run lint && npx vitest run src/components/layout src/lib/commands.test.ts`

Parallel group D: Tasks 4.1–4.8 — independent, disjoint files.

#### Task 4.1 — Read-only shared field primitives

In `src/components/layout/right-panel/fields.tsx`, have `EditableField`,
`TechnologyField`, and `OwnerField` read `readOnly` from `useWorkspaceStore`
internally and render a disabled/plain-text presentation (no `onCommit`/
`onLiveChange` firing) when true — every right-panel editor built on these three
components inherits read-only behavior with no call-site changes.

**Files:**
- `src/components/layout/right-panel/fields.tsx` (modify)
- `src/components/layout/right-panel/fields.test.tsx` (modify)

**Definition of Done:**
- [x] All three components render non-editable (disabled input or plain text, your
      call on which, but it must not accept keyboard input or fire callbacks) when
      the store has `readOnly: true`
- [x] Normal editable behavior is unchanged when `readOnly: false`
- [x] `npx vitest run src/components/layout/right-panel/fields.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 4.2 — FloatingToolRail: hide creation/authoring controls

In `src/components/layout/FloatingToolRail.tsx`, hide (not just disable) the
add-element trigger (the `Plus`-icon button that opens `AddElementPanel`), the AI
assistant (`Sparkles`) trigger, and the auto-arrange/lock-unlock controls when
`readOnly` is true. Keep zoom-to-fit, canvas settings, and the multi-select mode
toggle visible (multi-select itself only changes selection; its bulk actions are
gated separately in Task 4.5).

**Files:**
- `src/components/layout/FloatingToolRail.tsx` (modify)
- `src/components/layout/FloatingToolRail.test.tsx` (modify)

**Definition of Done:**
- [x] Add-element, AI assistant, and auto-arrange/lock controls are absent from the
      DOM (not merely `disabled`) when `readOnly: true`
- [x] Zoom-to-fit, canvas settings, and multi-select toggle remain present and
      functional when `readOnly: true`
- [x] `npx vitest run src/components/layout/FloatingToolRail.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 4.3 — FloatingTopPill + ViewSwitcher: hide workspace-management and creation entries

In `src/components/layout/FloatingTopPill.tsx`, when `readOnly` is true: hide the
logo/home click handler's `closeWorkspace()` + `navigate('/')` behavior (render the
logo as non-interactive, or at least strip the handler — there is nowhere to "go
home" to in locked mode, and leaving `workspace` set is what keeps the existing
auto-redirect-to-canvas effect in `App.tsx` effective); remove the "Workspaces…"
menu item (no folder, no other workspace to switch to); remove the "AI assistant…"
menu item; remove the Undo/Redo menu items (`showUndoRedo` block). Keep "Export…"
and "Command palette". Also check `src/components/layout/ViewSwitcher.tsx` (imported
here as `ViewSwitcher`/`ViewSwitcherPanel`) for its create-view entry point — if
`ViewSwitcherPanel` takes an `onShowCreateView` prop, pass it conditionally
(`readOnly ? undefined : () => setShowCreateView(true)`) only if the component
already treats an absent handler as "hide the row"; otherwise add a `readOnly` prop
to `ViewSwitcher.tsx` itself. View-switching between *existing* views must keep
working unchanged.

**Files:**
- `src/components/layout/FloatingTopPill.tsx` (modify)
- `src/components/layout/ViewSwitcher.tsx` (modify only if the `onShowCreateView`
  prop isn't already optional/hide-on-absent — check before editing)
- `src/components/layout/FloatingTopPill.test.tsx` (create — no existing test file
  for this component)
- `src/components/layout/ViewSwitcher.test.tsx` (modify, only if this file changes)

**Definition of Done:**
- [x] Home/logo click is a no-op (or absent) when `readOnly: true`; `workspace`
      stays loaded afterward
- [x] Hamburger menu shows no "Workspaces…", "AI assistant…", "Undo", or "Redo"
      items when `readOnly: true`; "Export…" and "Command palette" are still present
- [x] Switching between existing views via the view switcher still works when
      `readOnly: true`; the create-new-view entry point is absent
- [x] `npx vitest run src/components/layout/FloatingTopPill.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 4.4 — Right-panel editors beyond the shared field primitives

Survey `src/components/layout/RightPanel.tsx`, `right-panel/DeploymentElementProperties.tsx`, and `right-panel/GroupProperties.tsx` for editing controls that do
NOT go through `fields.tsx` (Task 4.1 already covers those) — e.g. add-relationship
buttons, delete/duplicate icons, tag add/remove controls, group membership add/
remove, deployment topology add buttons, status/visibility dropdowns. Hide or
disable each when `readOnly` is true, reading the flag directly from
`useWorkspaceStore` at each component (consistent with this codebase's no-prop-
drilling pattern for store-level flags).

**Files:**
- `src/components/layout/RightPanel.tsx` (modify)
- `src/components/layout/right-panel/DeploymentElementProperties.tsx` (modify)
- `src/components/layout/right-panel/GroupProperties.tsx` (modify)
- `src/components/layout/RightPanel.test.tsx` (modify)
- `src/components/layout/right-panel/DeploymentElementProperties.test.tsx` (create)
- `src/components/layout/right-panel/GroupProperties.test.tsx` (create)

**Definition of Done:**
- [x] Every identified mutating control across these three files is hidden/disabled
      when `readOnly: true`; selecting an element/relationship/group still shows its
      (now read-only) details
- [x] `npx vitest run src/components/layout/RightPanel.test.tsx
      src/components/layout/right-panel/DeploymentElementProperties.test.tsx
      src/components/layout/right-panel/GroupProperties.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 4.5 — MultiSelectBar: hide bulk mutation actions

In `src/components/layout/MultiSelectBar.tsx`, hide bulk edit/delete/duplicate/
group actions when `readOnly` is true. Multi-select mode itself (from Task 4.2) can
stay on; only its mutating actions are gated.

**Files:**
- `src/components/layout/MultiSelectBar.tsx` (modify)
- `src/components/layout/MultiSelectBar.test.tsx` (create)

**Definition of Done:**
- [x] No bulk mutation action is present in the DOM when `readOnly: true` with
      multiple elements selected
- [x] `npx vitest run src/components/layout/MultiSelectBar.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 4.6 — Canvas: disable drag/connect interactions

In `src/components/canvas/Canvas.tsx`, set `nodesDraggable={!readOnly}` and
`nodesConnectable={!readOnly}` on the `<ReactFlow>` element (`Canvas.tsx:1143`).
Leave `elementsSelectable` at its current default so clicking elements for
inspection still works.

**Files:**
- `src/components/canvas/Canvas.tsx` (modify)
- `src/components/canvas/Canvas.test.tsx` (modify)

**Definition of Done:**
- [x] `nodesDraggable`/`nodesConnectable` are both `false` when the store has
      `readOnly: true`, `true` otherwise
- [x] Node selection/click behavior is unchanged in both modes
- [x] `npx vitest run src/components/canvas/Canvas.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 4.7 — Tag manager and highlighter bar: filter yes, edit no

In `src/components/layout/FloatingBottomStrip.tsx` and `src/components/layout/
highlighter/TagManagerDialog.tsx`, hide tag create/rename/delete controls when
`readOnly` is true; keep tag/status/tech/team filter toggles (these only affect
local highlighting, not persisted content).

**Files:**
- `src/components/layout/FloatingBottomStrip.tsx` (modify)
- `src/components/layout/highlighter/TagManagerDialog.tsx` (modify)
- `src/components/layout/FloatingBottomStrip.test.tsx` (modify)
- `src/components/layout/highlighter/TagManagerDialog.test.tsx` (create)

**Definition of Done:**
- [x] Tag create/rename/delete controls are absent when `readOnly: true`
- [x] Filter toggles (tag/status/tech/team) remain fully functional when
      `readOnly: true`
- [x] `npx vitest run src/components/layout/FloatingBottomStrip.test.tsx
      src/components/layout/highlighter/TagManagerDialog.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 4.8 — Command palette: filter mutating commands by id

In `src/lib/commands.ts`, after building the `commands` array in `getCommands()`,
filter out a fixed, explicit set of command ids when `store().readOnly` is true —
not by `category`, since `new-view`, `duplicate-view`, `auto-arrange` (category
`'view'`) and `save` (category `'export'`) all mutate or persist despite their
category. The blocked id set: `add-person`, `add-system`, `add-container`,
`add-component`, `group-selected`, `undo`, `redo`, `duplicate-selected`,
`delete-selected`, `auto-arrange`, `new-view`, `duplicate-view`, `close-workspace`,
`save`, `ai-compose`, `ai-interview`, `ai-review`, `ai-adr`, `ai-settings`. Everything
else (navigation, zoom, search, presentation mode, minimap/snap toggles,
export-png/svg/dsl/proposal, command-palette itself) stays available. Implement as
either wrapping each blocked command's existing `when` (compose with `&& !store()
.readOnly`) or a single filter step over the returned array — whichever reads more
naturally given the function's current structure.

**Files:**
- `src/lib/commands.ts` (modify)
- `src/lib/commands.test.ts` (modify)

**Definition of Done:**
- [ ] Every id in the blocked list is absent from `getCommands(...)`'s result (or
      has `when()` return `false`) when `store().readOnly` is true
- [ ] Every command NOT in the blocked list is unaffected by `readOnly`
- [ ] `npx vitest run src/lib/commands.test.ts` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes

---

**Amendment (post Task 4.3 / 4.7): two additional dead-UI gaps found during
implementation, not covered by any task above.** Both are added as follow-up tasks
in the same phase, since they're exactly the "no dead buttons" standard the rest of
Phase 4 already applies — just surfaces the research didn't enumerate up front.

#### Task 4.9 — Hide the workspace-name switcher button (FloatingTopPill)

Task 4.3 hid the hamburger menu's "Workspaces…" item, but `FloatingTopPill.tsx` has
a second, separate entry point to the same `WorkspaceSwitcherPanel`: a workspace-name
button (around line 308) that toggles `wsPickerOpen` directly, independent of the
hamburger menu. In locked mode there is exactly one workspace and nothing to switch
to, rename, delete, or create — hide this button (or make it non-interactive) when
`readOnly` is true, the same way the logo/home button was already handled in Task
4.3. The workspace name can still be *displayed* as plain text; only the
switcher-opening interaction needs to go away.

**Files:**
- `src/components/layout/FloatingTopPill.tsx` (modify)
- `src/components/layout/FloatingTopPill.test.tsx` (modify — add a case)

**Definition of Done:**
- [x] The workspace-name button does not open `WorkspaceSwitcherPanel` when
      `readOnly: true` (hidden, or stripped of its click handler — your call on
      which reads better given the surrounding markup)
- [x] The workspace name itself is still visible as text
- [x] `npx vitest run src/components/layout/FloatingTopPill.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 4.10 — Gate the inline tag-style editor

Task 4.7 hid tag create/rename/delete but explicitly left the inline style editor
(background/text color pickers, shape/border selects, opacity slider, "Remove
style" button — shared via `src/components/layout/tagStyleControls.tsx`'s
`ColorPicker` and sibling controls) untouched in both `FloatingBottomStrip.tsx` and
`highlighter/TagManagerDialog.tsx`, since gating it wasn't in that task's explicit
scope. Its actions (`updateElementStyle`/`removeElementStyle`) are already no-ops at
the store level (Phase 1, Task 1.8) — this task closes the matching UI gap. Add a
`readOnly`-aware presentation to the shared style-editor controls in
`tagStyleControls.tsx` (read `readOnly` from `useWorkspaceStore` there, same
no-prop-drilling pattern used everywhere else in Phase 4) so both call sites inherit
it, rather than gating each call site separately.

**Files:**
- `src/components/layout/tagStyleControls.tsx` (modify)
- `src/components/layout/FloatingBottomStrip.tsx` (modify only if the style editor
  isn't already fully covered by gating `tagStyleControls.tsx` itself — check first)
- `src/components/layout/highlighter/TagManagerDialog.tsx` (modify only if needed,
  same check)
- test file(s) for whichever of the above actually change

**Definition of Done:**
- [x] The inline style editor (color pickers, shape/border, opacity, "Remove style")
      is hidden or disabled when `readOnly: true` in both `FloatingBottomStrip` and
      `TagManagerDialog`
- [x] Normal behavior unchanged when `readOnly: false`
- [x] Relevant test file(s) pass via `npx vitest run <path>`
- [x] `npm run typecheck` passes

---

### Phase 5 — Final verification

**Goal**: Establish ground-truth evidence that the whole feature works end to end —
the full test/lint/build suite genuinely passes, and the built viewer genuinely
behaves as a locked, read-only, single-workspace app in a running browser.

#### Task 5.1 — Code review

Delegate to `code-reviewer` with this plan's path
(`specifications/locked-readonly-viewer/locked-readonly-viewer.plan.md`) and the
full list of files changed across Phases 1–4. It runs `npm run lint`, `npm run
typecheck`, `npm test`, and `npm run build` (the full gate, `npm run check`) itself,
and separately confirms `npm run build:viewer -- --workspace <fixture>.dsl` succeeds.
State explicitly in the delegation that functional/browser verification runs in the
parallel Task 5.2, so this review excludes manual browser walkthroughs.

**Files:** none (read-only review)

**Definition of Done:**
- [ ] `npm run check` passes
- [ ] `npm run build:viewer -- --workspace <fixture>.dsl` succeeds and produces
      `dist-viewer/index.html`
- [ ] Findings report delivered (empty findings list is a valid, positive outcome)

#### Task 5.2 — Functional verification

Delegate to `feature-verifier` with the path to
`specifications/locked-readonly-viewer/locked-readonly-viewer.verification.md`
(drafted alongside this plan — see that file). Executes its scenarios against a
real `vite preview` server over the built `dist-viewer/`.

**Files:** none (exercises the running app only)

**Definition of Done:**
- [ ] Every scenario in the verification document passes with the required evidence
- [ ] Report delivered per scenario, blockers called out verbatim if any

---

### Phase 6 — Post-review fixes

**Goal**: Close the gaps Task 5.1's code review found — real UI/bootstrap paths that
Phase 4 never touched and can still reach editing or replace the baked workspace in
locked mode. No blockers were found; these are the review's Major and selected Minor
findings, routed back as scoped fixes per the orchestration workflow (fixes only,
no second full review or verification pass).

**Verification**: `npm run typecheck && npm run lint && npx vitest run src/hooks src/components/layout/FloatingViewsPanel.test.tsx src/components/canvas src/store/slices/ui-slice.test.ts`

Parallel group E: Tasks 6.1–6.7 — independent, disjoint files.

#### Task 6.1 — Guard mutating keyboard shortcuts (M1)

`src/hooks/useKeyboardShortcuts.ts` was never touched by Phase 4 and ignores
`readOnly` entirely. In `handleKeyDown`, return early (no-op) for the mutating
combos when the store's `readOnly` is true: `mod+o` (open file → `loadWorkspace`,
which would swap the baked workspace for an arbitrary local `.dsl`), `mod+s` (save),
`mod+z`/`mod+shift+z` (undo/redo), `mod+d` (duplicate), the Backspace/Delete and
`shift+Backspace`/`shift+Delete` variants (delete confirm — currently opens a dialog
whose confirm action then silently no-ops), `shift+G/P/S/C/O` (if these create
elements — confirm against the file), `a` (opens `AddElementPanel`), and
`mod+shift+l` (if it's a mutating shortcut — confirm against the file). Also fix
`src/components/layout/FloatingToolRail.tsx:391`, where `AddElementPanel` is
rendered unconditionally at the mobile breakpoint, outside the `!readOnly` block
Task 4.2 added for the desktop trigger — add `&& !readOnly` there too.

**Files:**
- `src/hooks/useKeyboardShortcuts.ts` (modify)
- `src/hooks/useKeyboardShortcuts.test.ts` (modify if it exists, else create)
- `src/components/layout/FloatingToolRail.tsx` (modify — the one-line fix at ~391)

**Definition of Done:**
- [x] Every listed shortcut is a no-op when `readOnly: true` (no dialog opens, no
      workspace mutation, no panel opens)
- [x] The mobile-breakpoint `AddElementPanel` render respects `readOnly`
- [x] Relevant test file(s) pass via `npx vitest run <path>`
- [x] `npm run typecheck` passes

#### Task 6.2 — Gate "New view" in FloatingViewsPanel (M2)

`src/components/layout/FloatingViewsPanel.tsx` has its own create-view entry point
(the `+` button, lines ~77-84, and the `CreateViewDialog` render at ~108-112),
reachable via the allowed "Toggle Views Panel" command — a second, ungated path to
the same dialog Task 4.3 already hid inside `ViewSwitcherPanel`. Hide the button and
skip rendering the dialog when `readOnly` is true.

**Files:**
- `src/components/layout/FloatingViewsPanel.tsx` (modify)
- `src/components/layout/FloatingViewsPanel.test.tsx` (modify)

**Definition of Done:**
- [x] The "New view" button and `CreateViewDialog` are absent when `readOnly: true`
- [x] Existing view-list/switch behavior in the panel is unaffected
- [x] `npx vitest run src/components/layout/FloatingViewsPanel.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 6.3 — Disable inline rename on the canvas (M3)

`src/components/canvas/nodes/InlineName.tsx:60` starts inline rename on
double-click regardless of `readOnly`; the commit no-ops (via the already-guarded
`updateElement`) and the name visibly reverts — a dead input. Worse, the handler
calls `stopPropagation()`, so double-clicking a name also stops it from drilling
into the element. When `readOnly` is true, skip `setEditing(true)` and let the
double-click event propagate so drill-in still works.

**Files:**
- `src/components/canvas/nodes/InlineName.tsx` (modify)
- its existing test file (modify, or add to `Canvas.test.tsx` if that's where this
  is covered — check first)

**Definition of Done:**
- [x] Double-clicking a node's name does not start inline editing when
      `readOnly: true`
- [x] Double-clicking still drills into the element when `readOnly: true`
- [x] Relevant test file passes via `npx vitest run <path>`
- [x] `npm run typecheck` passes

#### Task 6.4 — Skip crash-recovery/refresh-redirect when locked (M4)

`useRefreshRedirect` (`src/hooks/useRouteSync.ts`, ~lines 108-160) and the
crash-recovery effect in `App.tsx` (~lines 72-77) both load a workspace from
localStorage/IndexedDB asynchronously on routes the locked viewer's own redirect
effect also targets (`/collection/workspace/workspace[/view]`), without checking
whether a locked workspace is already active — on a same-origin reload (e.g. `vite
preview` reusing a port the editor also used), this can replace the baked workspace
with recovered/local content while `readOnly` stays `true`. Skip both recovery
paths entirely when `getLockedWorkspace() !== null` (reuse the function from
`src/lib/lockedWorkspace.ts`, Task 3.1).

**Files:**
- `src/App.tsx` (modify)
- `src/hooks/useRouteSync.ts` (modify)
- test file(s) covering these paths (modify/create as appropriate — check what
  exists first)

**Definition of Done:**
- [x] With `getLockedWorkspace()` returning non-null, neither recovery path calls
      `loadWorkspace` with recovered/local content
- [x] Normal (unlocked) crash-recovery/refresh-redirect behavior is unchanged
- [x] Relevant test file(s) pass via `npx vitest run <path>`
- [x] `npm run typecheck` passes

#### Task 6.5 — Guard `setBatchApplying`'s undo push (m1)

In `src/store/slices/ui-slice.ts`, `setBatchApplying(true)` calls
`pushUndoSnapshot` unconditionally (line ~108), growing `undoStack` even when
`readOnly` is true (reachable only through the already-hidden AI flows, so low
severity, but inconsistent with every other mutating path). Add
`if (on && get().readOnly) return` at the top.

**Files:**
- `src/store/slices/ui-slice.ts` (modify)
- `src/store/slices/ui-slice.test.ts` (modify if it exists, else create)

**Definition of Done:**
- [x] `setBatchApplying(true)` does not push an undo snapshot when `readOnly` is true
- [x] Normal behavior unchanged when `readOnly` is false
- [x] Relevant test file passes via `npx vitest run <path>`
- [x] `npm run typecheck` passes

#### Task 6.6 — Remove redundant readOnly gating (m2)

`FloatingBottomStrip.tsx` and `TagManagerDialog.tsx` (Task 4.10) added their own
`disabled={readOnly}` on controls that `tagStyleControls.tsx` already gates
internally — redundant double-gating and exactly the prop-drilling pattern the plan
asked to avoid. Remove the redundant `readOnly` prop-passing/`disabled` props from
the two call sites for controls `tagStyleControls.tsx` already covers (keep any
gating for controls that are NOT inside `tagStyleControls.tsx`, e.g. shape/border/
opacity/font-size selects that Task 4.10 confirmed live outside it — only remove
gating that's genuinely duplicated, not all of it; read Task 4.10's landed diff
first to tell the two apart).

**Files:**
- `src/components/layout/FloatingBottomStrip.tsx` (modify)
- `src/components/layout/highlighter/TagManagerDialog.tsx` (modify)
- their existing test files (modify only if a removed prop breaks a test's
  assumptions)

**Definition of Done:**
- [x] No control is gated by more than one place in the component tree
- [x] All of Task 4.10's and Task 4.7's existing read-only behavior still holds
      (nothing regresses to being editable)
- [x] `npx vitest run src/components/layout/FloatingBottomStrip.test.tsx src/components/layout/highlighter/TagManagerDialog.test.tsx` passes
- [x] `npm run typecheck` passes

#### Task 6.7 — Build-viewer edge cases (m3)

Two edge cases in the build pipeline: (1) `scripts/build-viewer.mjs` accepts a
case-insensitive `.DSL` extension, but `vite.config.ts`'s plugin derives `name` via
the case-sensitive `path.basename(p, '.dsl')`, so `X.DSL` becomes the name
`"X.DSL"` instead of `"X"` — make the extension-stripping case-insensitive in the
plugin. (2) `build-viewer.mjs` forwards any extra CLI arguments after `--outDir
dist-viewer` to `vite build`, so a user passing `-- --outDir dist` would overwrite
the editor's own `dist/` — reject a user-supplied `--outDir` (or any `--outDir`
occurrence) in the script's argv parsing with a clear error.

**Files:**
- `vite.config.ts` (modify — case-insensitive extension stripping)
- `scripts/build-viewer.mjs` (modify — reject `--outDir`)

**Definition of Done:**
- [x] A fixture named with a `.DSL` (uppercase) extension produces the correct
      lowercase-stripped `name` in the virtual module
- [x] Running `npm run build:viewer -- --workspace <fixture>.dsl --outDir dist`
      exits non-zero with a clear error, and does not touch `dist/`
- [x] `npm run typecheck` passes

---

**Amendment (post functional verification, Task 5.2): one more dead-UI gap found.**
The feature-verifier's Scenario 2 run found the view switcher's per-view "Delete
view" button shows a working confirm dialog that doesn't actually delete anything
(data integrity holds — `deleteView` is already store-guarded from Task 1.7 — but
the UI looks interactive). Checking the same file surfaced two siblings with the
identical problem, not just the one the verifier happened to click.

#### Task 6.8 — Gate per-view rename/duplicate/delete in ViewSwitcherPanel

`src/components/layout/ViewSwitcher.tsx` has three ungated per-view mutating
controls inside `ViewSwitcherPanel`'s view list, none hidden by Task 4.3's
`readOnly` prop (which only covered the panel's "New view" footer): an inline
rename (lines ~120, ~191, ~212 — `renameView`), a duplicate button (line ~224 —
`duplicateView`), and a delete button with a confirm dialog (line ~230 —
`confirmDelete(...) => deleteView`). All three are already no-ops at the store
level, but remain fully interactive-looking. Hide all three when `readOnly` is
true (the component already receives a `readOnly` prop from Task 4.3 — use it).
Switching to an existing view must remain completely unaffected.

**Files:**
- `src/components/layout/ViewSwitcher.tsx` (modify)
- `src/components/layout/ViewSwitcher.test.tsx` (modify)

**Definition of Done:**
- [x] Inline rename, duplicate, and delete controls are all absent from each view
      row when `readOnly: true`
- [x] Switching to an existing view still works when `readOnly: true`
- [x] `npx vitest run src/components/layout/ViewSwitcher.test.tsx` passes
- [x] `npm run typecheck` passes

## Acceptance Criteria

- [x] `npm run build:viewer -- --workspace <file>.dsl` produces `dist-viewer/` and
      does not alter the output of `npm run build` or `npm run dev`
- [x] Opening the built viewer loads directly to the canvas showing the baked
      workspace's actual elements/views — no welcome screen, no collection screen,
      no folder picker
- [x] No UI control exists to add, edit, delete, duplicate, or reposition an
      element, relationship, group, view, deployment node, or dynamic step
- [x] Even if a mutating store action is invoked directly (e.g. from the browser
      console), it no-ops and leaves the workspace unchanged
- [x] Navigating the C4 view hierarchy (drill in/out), presentation mode, search,
      and PNG/SVG/proposal export all work normally
- [x] The AI assistant, tag manager editing, and workspace switcher are entirely
      absent from the locked viewer's UI

## Security Considerations

- This is a client-side content lock, not an access-control boundary: anyone who can
  load the built page has the full workspace content in the page source/bundle and
  can inspect it via devtools regardless of the UI lock. Do not present this build
  as suitable for content that needs real confidentiality — it stops accidental
  edits and casual exploration of "edit mode," not a determined reader.
- Embedding arbitrary file content into generated JS source (Task 2.1) uses
  `JSON.stringify`, not template-literal interpolation, specifically to prevent a
  `.dsl`/sidecar file containing backticks or `${...}` from breaking out of its
  string literal into executable code in the generated module.

## Improvements (Out of Scope)

- Password/auth-gated viewer builds.
- Baking more than one workspace into a single locked build with an in-app switcher.
- A `vite dev` equivalent of the locked mode (this plan is production-build only;
  the existing `scripts/dev.mjs --workspace <folder>` dev convenience is untouched
  and serves a different purpose).
- Automated Playwright e2e coverage for the locked viewer (the existing
  `playwright.config.ts` has one hardcoded `webServer` for the normal editor build;
  adding a second target is real infra work left for a follow-up if this is used
  heavily enough to warrant it).
