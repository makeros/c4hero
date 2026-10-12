# Locked read-only viewer — Verification

Plan: specifications/locked-readonly-viewer/locked-readonly-viewer.plan.md
App: c4hero locked viewer build (`dist-viewer/`), served standalone — not the normal
editor dev server.

## Environment

- Build a fixture viewer first (not committed — create inline):
  ```
  mkdir -p /tmp/c4hero-verify
  cat > /tmp/c4hero-verify/sample.dsl <<'EOF'
  workspace "Verify Sample" "Locked viewer verification fixture" {
    model {
      user = person "User"
      system = softwareSystem "Sample System" {
        api = container "API"
      }
      user -> system "Uses"
    }
    views {
      systemContext system "SystemContext" {
        include *
        autoLayout
      }
      container system "Containers" {
        include *
        autoLayout
      }
    }
  }
  EOF
  npm run build:viewer -- --workspace /tmp/c4hero-verify/sample.dsl
  ```
- Serve it: `npx vite preview --outDir dist-viewer --port 4173` (pinned) —
  http://localhost:4173
- No login, no database, no credentials involved.

## Scenarios

### 1. [BROWSER] Boots straight to the canvas with the right content

- Visit http://localhost:4173/.
- Expect: lands directly on the canvas showing "Verify Sample"'s System Context view
  with the `User` and `Sample System` elements — no welcome screen, no "open folder"
  prompt, no collection list ever appears.
- Evidence: examined screenshot of the initial load.

### 2. Editing is actually blocked

- [BROWSER] Click the `Sample System` element. Expect: the right-panel inspector
  shows its name/description, but no field is editable (no text cursor, no commit on
  typing) and no delete/duplicate icon is present.
- [BROWSER] Attempt to drag `Sample System` to a new position. Expect: the node does
  not move (or snaps back), and reloading the page shows it in its original position
  (confirms the attempt wasn't silently persisted).
- [BROWSER] Inspect the toolbar and the hamburger menu (top pill). Expect: no
  add-element button, no AI assistant entry, no "Workspaces…" entry, no Undo/Redo.
- [BROWSER] Open the browser devtools console and manually invoke a mutating store
  action if the app exposes `window.__testStore` or similar test hooks in this
  build (check whether `import.meta.env.DEV` test hooks from `src/main.tsx` are
  present in a production build — they should NOT be, since `DEV` is false; if
  absent, note that as confirming evidence rather than failing the scenario on a
  missing hook).
- Evidence: screenshots of the disabled inspector, the unchanged node position after
  reload, and the toolbar/hamburger menu contents.

### 3. Allowed interactions still work

- [BROWSER] From the System Context view, drill into `Sample System` to reach the
  Containers view, then navigate back. Expect: both views render correctly with
  their real content.
- [BROWSER] Toggle presentation/fullscreen mode and exit it.
- [BROWSER] Open search, find an element by name, and confirm it's selectable.
- [BROWSER] Trigger a PNG export of the current view. Expect: a file download
  completes.
- Evidence: screenshots of each view reached, presentation mode active, search
  results, and confirmation of the export download.

## Pass criteria

All three scenarios pass with their required evidence. A clean run is stated
plainly; any blocker is reported verbatim with the exact step and observed behavior.

## Boundaries

Never fix code — report blockers instead. Never switch the preview port or rebuild
with different flags than specified above. If `npm run build:viewer` itself fails,
stop and report that as a blocker rather than attempting the browser scenarios
against a stale/partial `dist-viewer/`.
