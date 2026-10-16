# Document links — Verification

Plan: specifications/document-links/document-links.plan.md
App: c4hero (single Vite SPA, no backend)

## Environment

- Dev server: `http://localhost:3004` (pinned — `vite.config.ts`'s
  `server.port: 3004`) — start: `npm run dev`
- Production preview: `vite preview` default port (`http://localhost:4173`) —
  start after building (see Seeding)
- Locked viewer preview: `npx vite preview --outDir dist-viewer` — its own
  reported port (not pinned in config; use whatever the command prints)
- No database, no auth, no external services involved — everything is local
  files served by Vite.

## Seeding

Create a fixture inside the project root (the dev middleware and the build
collector both resolve paths relative to the project root, so the fixture
cannot live outside it, e.g. not under `/tmp`):

1. Create `verification-fixtures/doc-links-demo/demo.dsl`:

   ```
   workspace "Doc Links Demo" {

       model {
           paymentsSystem = softwareSystem "Payments" "Handles payment processing" {
               properties {
                   "c4hero.documents.0.path"  "verification-fixtures/doc-links-demo/overview.md"
                   "c4hero.documents.0.title" "Payments overview"
               }
           }
       }

       views {
           systemLandscape {
               include *
           }
       }

   }
   ```

2. Create `verification-fixtures/doc-links-demo/overview.md`:

   ```markdown
   # Payments overview

   This is the **overview** document for the Payments system.

   - Point one
   - Point two

   [c4hero repo](https://github.com/)
   ```

Expected post-seed state: opening `demo.dsl` in the editor shows one software
system, "Payments," whose inspector Documents section has exactly one row
("Payments overview").

## Scenarios

### 0. [E2E] Committed suite

- Run `npm run test:e2e` — expect all specs green.

### 1. [BROWSER] Add, edit, and remove document links in the inspector

- Start the dev server, open `verification-fixtures/doc-links-demo/demo.dsl`.
- Select the "Payments" system. Expect: a Documents section showing one row
  ("Payments overview" / the seeded path).
- Add a second row with any path/title. Expect: it appears immediately.
- Select any relationship (create one first if the fixture has none) and
  repeat: add a row, confirm it appears.
- Remove a row from each. Expect: it disappears immediately.
- Evidence: an examined screenshot after each step (seeded row, row added,
  row removed) for both the element and the relationship panel.

### 2. [BROWSER] Clicking a document link renders styled markdown, in dev and in production

- **Dev**: with `demo.dsl` open and the seeded row visible, click its
  open-link control. Expect: a new tab at `/document-view?...` showing the
  "Payments overview" heading, bold text, bullet list, and link as rendered
  HTML — not raw markdown text, not a file download, not a 404.
- **Production**: run `npm run build -- --workspace
  verification-fixtures/doc-links-demo`, then `npm run preview`. Open the
  previewed app, load the same workspace (however the preview build exposes
  it — e.g. via its own open-folder flow pointed at the fixture directory,
  or by confirming `dist/__docs/verification-fixtures/doc-links-demo/overview.md`
  exists and is fetchable directly), click the same link. Expect: the same
  rendered result as in dev.
- Evidence: an examined screenshot of the rendered document in both dev and
  the production preview.

### 3. [BROWSER] Document links survive save → reopen

- With `demo.dsl` open, add a document link to the "Payments" system (a
  second entry is fine), save the workspace back to
  `verification-fixtures/doc-links-demo/demo.dsl`.
- Reopen that same file (close and reopen the app/workspace, or use the
  app's own reload-from-disk action).
- Expect: both document link rows (the seeded one and the one just added)
  are present, unchanged.
- Evidence: an examined screenshot of the Documents section before save and
  after reopen, showing the same rows.

### 4. [BROWSER] Locked viewer resolves its own workspace's document links

- Run `npm run build:viewer -- --workspace
  verification-fixtures/doc-links-demo/demo.dsl`.
- Serve it: `npx vite preview --outDir dist-viewer`.
- Open the served viewer, select "Payments," click the document link.
- Expect: the same rendered "Payments overview" document as in Scenario 2 —
  confirming `dist-viewer/__docs/verification-fixtures/doc-links-demo/overview.md`
  was collected and is being served.
- Evidence: an examined screenshot of the rendered document inside the
  locked viewer.

## Pass criteria

All five scenarios pass. Report per scenario with the evidence listed above;
state any blocker verbatim, including the exact command output or screenshot
that shows the failure.

## Boundaries

- Never fix code — report findings only.
- Never bypass or fake any flow — use the fixture and commands exactly as
  seeded/specified above.
- Server URLs are pinned (dev: 3004) or taken verbatim from the command that
  starts them (preview, locked-viewer preview) — never switch ports or start
  a different server than the one each scenario specifies.
- Stop and report on a missing precondition (e.g. the fixture files aren't
  present, or a referenced command/flag doesn't exist yet) instead of
  improvising a substitute.
