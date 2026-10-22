# C4 cheat sheet — Verification

Plan: specifications/cheat-sheet/cheat-sheet.plan.md
App: c4hero web app (Vite dev server)

## Environment

- Dev server: http://localhost:3004 (pinned). Start it with `npm run dev`, or reuse
  one that's already running.
- No credentials needed.

## Seeding

None. The scenarios load the sample workspace through the E2E fixture
(`workspace.loadSample()`), or through `window.__testLoadSample()` in the browser
console.

## Scenarios

### 0. [E2E] Committed suite

- Run `npm run test:e2e`. Expect every spec to pass, including
  `e2e/cheat-sheet/cheat-sheet.spec.ts`.
- Evidence: the command's pass/fail summary.

### 1. [BROWSER] Locked viewer / read-only

- Open http://localhost:3004, load the sample (`window.__testLoadSample()`), then
  switch to read-only with `window.__testStore().setReadOnly(true)`.
- Expect: the top pill still shows the "C4 cheat sheet" (BookOpenText) icon, next
  to Documents. Clicking it opens a new tab at `/cheat-sheet` and leaves the canvas
  tab unchanged. The new tab shows the cheat sheet (header, Elements, Views,
  Matrix, What is it?), not a canvas, and doesn't redirect.
- Evidence: an examined screenshot of the read-only top pill showing the icon, and
  an examined screenshot of the opened `/cheat-sheet` tab with its URL.

## Pass criteria

- Scenario 0: all E2E specs green.
- Scenario 1: the icon is visible in read-only mode, and the new tab shows the
  cheat sheet at `/cheat-sheet`.

Report pass/fail per scenario with evidence, then any blockers verbatim.

## Boundaries

Never fix code. Never switch servers or ports. If a precondition is missing, stop
and report it rather than improvising.
