# HTML document links — Verification

Plan: specifications/html-document-links/html-document-links.plan.md
App: c4hero (single Vite SPA, no backend)

## Environment

- Dev server: `http://localhost:3004` (pinned by `server.port` in
  `vite.config.ts`). Start it with
  `npm run dev -- --workspace verification-fixtures/html-docs`.
- Production preview: build with
  `npm run build -- --workspace verification-fixtures/html-docs`, then run
  `npx vite preview`. Use the port it prints (default 4173).
- Locked viewer: build with
  `npm run build:viewer -- --workspace verification-fixtures/html-docs/demo.dsl`,
  then serve it with a static server that sets no custom headers:
  `npx serve dist-viewer -s`. Use the port it prints.
- No database, auth or external services.

## Seeding

The fixture lives inside the repo, because the docs root is the nearest
`.git` ancestor. That makes every path below repo-root-relative.
Create `verification-fixtures/html-docs/`:

- `demo.dsl` has one software system, "Reports", with these properties:
  - `c4hero.documents.0.path` `verification-fixtures/html-docs/report.html`,
    `c4hero.documents.0.title` `Quarterly report`
  - `c4hero.documents.1.path` `verification-fixtures/html-docs/notes.md`,
    `c4hero.documents.1.title` `Notes`

  It also needs a `systemLandscape` view that includes `*`.
- `report.html` contains:
  - `<link rel="stylesheet" href="report.css">`
  - `<script src="app.js"></script>`
  - `<img src="img/logo.png" alt="logo">`
  - `<a href="notes.md#details">Notes</a>`
  - an `<h2 id="results">` heading
- `report.css` sets `body { background: rgb(255, 240, 200) }` and contains
  `.hero { background: url(img/bg.png) }`.
- `app.js` does three things:
  1. Appends `<p id="js-ran">JS ran</p>`.
  2. Appends `<p id="origin">` containing `window.origin`.
  3. Appends `<p id="storage">`, which is `blocked` if
     `try { localStorage.length }` throws and `open` otherwise.
- `img/logo.png` and `img/bg.png` are any small PNGs.
- `notes.md` contains:
  - `## Details`
  - `[Back to report](report.html#results)`
  - `[[report]]`
- `unreferenced.js` is a JS file that nothing links to.

Expected post-seed state: the dev server starts with the "Reports" system on
the canvas, and its inspector shows two document links.

Remove `verification-fixtures/` afterwards and confirm `git status` is
clean apart from the feature changes.

## Scenarios

### 0. [E2E] Committed suite

- Run `npm run test:e2e`. All specs are expected to pass. Re-run any flake in
  isolation and report it separately.

### 1. [BROWSER] Dev: an HTML doc renders with its own assets

- Open `http://localhost:3004` and select "Reports". In the inspector, click
  the open-link for "Quarterly report".
- Expected in the new tab (`/document-view?path=…report.html…`):
  - a slim c4hero top bar with "Quarterly report"
  - below it, the report on its cream background with the logo visible
  - the text "JS ran"
- Evidence: an examined screenshot.

### 2. [BROWSER] Isolation

- On the page from scenario 1, the frame shows `origin` = `null` and
  `storage` = `blocked`.
- From the parent page, run `document.querySelector('iframe').getAttribute('sandbox')`.
  The tokens must be exactly `allow-scripts allow-popups
  allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation`.
- Evidence: an examined screenshot and the evaluated attribute value.

### 3. [API] Dev serving rules

Use `curl -i` against `http://localhost:3004`:

| Request | Expected response |
| --- | --- |
| `/__docs/verification-fixtures/html-docs/report.html` | 200, `text/html`, a `Content-Security-Policy: sandbox …` header, body has a rewritten `/document-view?path=…notes.md` link with `target="_top"` |
| `/__docs/verification-fixtures/html-docs/app.js` | 200 |
| `/__docs/verification-fixtures/html-docs/unreferenced.js` | 404 |
| `/__docs/.env.example` | 400 |
| `/__docs/package.json` | 400 |
| `/__docs/verification-fixtures/html-docs/notes.md` | 200, `text/markdown` |

- Evidence: status line and the relevant headers for each request.

### 4. [BROWSER] Cross-links between kinds

1. In the frame, click "Notes". The tab should navigate to the markdown
   viewer for `notes.md`, scrolled to "Details".
2. Click "Back to report". The HTML frame should open at `#results`.
3. Return to the notes and click the `[[report]]` wikilink. It should open
   `report.html`.
- Evidence: an examined screenshot after each click.

### 5. [BROWSER] Dev live reload

- With the report open, change `report.css` to
  `background: rgb(200, 230, 255)` and save. Within about 2 seconds the frame
  should show the blue background without a manual reload.
- Revert the change afterwards.
- Evidence: before and after screenshots.

### 6. [BROWSER] Production build with an active service worker

- Build and preview as described in Environment. Confirm that
  `dist/__docs/verification-fixtures/html-docs/` contains `report.html`,
  `report.css`, `app.js` and `img/`, and does not contain `unreferenced.js`.
- Open the app once so the service worker installs, then reload. Open the
  report link.
- Expected: same result as scenarios 1 and 2. In particular, the frame must
  not show the c4hero app shell.
- Evidence: a directory listing and an examined screenshot.

### 7. [BROWSER] Locked viewer on a header-less static server

- Serve the viewer with `npx serve dist-viewer -s`, then open the report
  from the inspector.
- Expected: it renders, and the frame still shows `origin` = `null` and
  `storage` = `blocked`. This proves isolation without header support.
- Evidence: an examined screenshot.

### 8. [BROWSER] Missing HTML document

- Open `/document-view?path=verification-fixtures/html-docs/nope.html`. The
  "Document not found" screen should appear, not an empty frame.
- Evidence: an examined screenshot.

## Pass criteria

Every scenario passes with the evidence listed for it. Report each scenario
as pass or fail, followed by any blockers verbatim.

## Boundaries

- Never fix code.
- Never switch the pinned dev port.
- If a precondition is missing, stop and report instead of improvising.
- Clean up the fixtures and any servers you started.
