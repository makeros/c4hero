# Documents sidebar — Verification

Plan: specifications/documents-sidebar/documents-sidebar.plan.md
App: c4hero web app (Vite dev server)

## Environment

- Dev server: http://localhost:3004 (pinned) — start: `npm run dev` (reuse if already running).
- No credentials needed.

## Seeding

Load this workspace in the browser console via `window.__testParseAndLoad(dsl)`
(the hook the E2E fixture uses; see `e2e/fixtures/workspace.ts`). It needs one
system with a context view and a container view; give `documents` (indexed
`c4hero.documents.N.path` / `.title` properties) to: a container in the
container view, the system (present in both views), one relation drawn in the
container view, and one container that is in no view. Expect four sidebar rows.

## Scenarios

### 0. [E2E] Committed suites

- Run `npm run test:e2e` — expect all specs green (including
  `e2e/panels/documents-sidebar.spec.ts`).

### 1. [BROWSER] Toggle and layout

- Press `D` on the canvas; then close with the header ×; then reopen via the top-pill "Documents" button.
- Expect: full-height panel docked right, canvas area narrower, top pill centered over the canvas, zoom HUD left of the panel; list scrolls independently when the window is short.
- Evidence: examined screenshots — closed, open, open with short window scrolled.

### 2. [BROWSER] Listing

- Expect four rows A–Z with type badges; the relation shown as "Source → Target" with its description; the system row has two view chips; the orphan container shows "Not in any view".
- Evidence: examined screenshot of the list.

### 3. [BROWSER] Document link

- Click a document link.
- Expect: a new tab at `/document-view?path=…&title=…` with the rendered markdown (or the viewer's not-found state if the file doesn't exist — the URL is what's being verified).
- Evidence: the new tab's URL plus a screenshot.

### 4. [BROWSER] Chip navigation — element and relation

- From the context view, click the container-view chip on the container row.
- Expect: URL view key changes, the container is centered and selected, the inspector is open and fully visible left of the sidebar. Browser Back returns to the context view.
- Repeat with the relation row's chip: the relation is selected and the inspector shows it.
- Evidence: examined screenshots before click, after click, after Back.

### 5. [BROWSER] Persistence and resize

- Drag the panel's left edge to widen it; reload.
- Expect: still open, same width.
- Evidence: screenshots before and after reload.

### 6. [BROWSER] Read-only

- Run `window.__testStore().setReadOnly(true)`, then repeat scenarios 1 and 4 briefly.
- Expect: the sidebar, links and chips all work.
- Evidence: examined screenshot.

## Pass criteria

All scenarios pass. Report per scenario with evidence; blockers verbatim.

## Boundaries

Never fix code. Never switch servers or ports. Stop and report a missing precondition instead of improvising.
