# Agent terminal — Verification

Plan: specifications/client-agent-terminal/client-agent-terminal.plan.md
App: c4hero web app on the Vite dev server, with the agent terminal enabled

## Environment

- Platform: macOS or Linux. The feature is not supported on Windows.
- Dev server: http://localhost:3004 (pinned). Stop any server already on 3004
  that was started *without* `--terminal`. Scenario 0 starts its own server
  through Playwright and needs the port free, so run it first, then start:
  `npm run dev -- --workspace <FIXTURE_DIR> --terminal`
- Browser: Chromium. Folder mode uses the File System Access API. When the
  welcome screen prompts for the `--workspace` folder, grant access to
  `<FIXTURE_DIR>`.
- No credentials needed.

## Seeding

Create a throwaway workspace inside its own git repo, outside this repository:

```sh
FIXTURE_DIR="$(mktemp -d)/agent-terminal-fixture"
mkdir -p "$FIXTURE_DIR" && cd "$FIXTURE_DIR" && git init -q
node <REPO>/plugins/c4hero/bin/c4hero.mjs init --template bigBank --file workspace.dsl
```

Expected after seeding: `$FIXTURE_DIR/workspace.dsl` exists, and
`node <REPO>/plugins/c4hero/bin/c4hero.mjs check --file workspace.dsl` reports
no errors. `<REPO>` is this worktree's absolute path. Record `FIXTURE_DIR` for
the steps below.

## Scenarios

### 0. [E2E] Committed suite (regression)

- With port 3004 free, run `npm run test:e2e` (it starts plain `npm run dev`,
  without the terminal).
- Expect: every spec passes. The terminal must not change existing behaviour.
- Evidence: the command's pass/fail summary.

### 1. [BROWSER] Shell round-trip

- Start `npm run dev -- --workspace "$FIXTURE_DIR" --terminal` and open
  http://localhost:3004. Open the `workspace.dsl` workspace so the canvas shows.
- Open the command palette (Cmd/Ctrl+K), run **Toggle Agent Terminal**.
- Expect: a panel docked on the left labelled "Agent terminal", status
  "connected". The tool rail, views panel, top pill and canvas sit to the right
  of the panel, with nothing overlapping it. Screenshot.
- In the terminal, type `pwd`, then `echo "$C4HERO_WORKSPACE"`, then
  `echo "$C4HERO_DEV_URL"`, pressing Enter after each.
- Expect: `pwd` prints the git root of `$FIXTURE_DIR` (which is `$FIXTURE_DIR`
  itself). `C4HERO_WORKSPACE` prints `$FIXTURE_DIR`. `C4HERO_DEV_URL` prints
  `http://localhost:3004`. Screenshot showing all three outputs.
- With the terminal focused, press Cmd/Ctrl+K, then Esc.
- Expect: the command palette does **not** open. The keys go to the shell.
  Screenshot.
- Drag the panel's right edge to widen it, then run `tput cols`.
- Expect: the column count is larger than before the drag. Screenshot.
- Click **Close terminal** in the panel header.
- Expect: the panel disappears and the chrome returns to its usual left
  positions. Screenshot.
- Evidence: the examined screenshots above, with what each one shows.

### 2. [BROWSER] Agent edit reloads the canvas

- Precondition: scenario 1's server is running with the workspace open on its
  landing view. Reopen the terminal from the palette.
- In the terminal, run:
  `node <REPO>/plugins/c4hero/bin/c4hero.mjs add person "Terminal Tester" --file workspace.dsl`
- Expect: the CLI reports success. Within about 2s the model contains "Terminal
  Tester". Confirm through search (Cmd/Ctrl+F after clicking the canvas, then
  type "Terminal Tester"), or confirm it appears on a view that shows people.
  The canvas was not manually reloaded. Screenshot of the search result or the
  canvas.
- Evidence: the terminal output and the examined screenshot.

### 3. [BROWSER] Reload persistence and send-selection

- In the open terminal, run
  `i=0; while true; do i=$((i+1)); echo "tick $i"; sleep 1; done`
  (bash/zsh) and let it reach at least "tick 5".
- Reload the page (Cmd/Ctrl+R) and wait for the canvas.
- Expect: the terminal panel is open again (remembered) at the same width. The
  earlier "tick" lines are replayed, and new ticks keep arriving with numbers
  that continue on, not restarting at 1. Screenshot.
- Click into the terminal and press Ctrl+C to stop the loop.
- Click an element on the canvas (e.g. a software system), then click **Insert
  selection** in the terminal header.
- Expect: the prompt shows
  `[c4hero file=workspace.dsl view=<activeViewKey> elements=<id>] `. It is
  **not** executed: no "command not found" appears and the cursor stays at the
  end of the inserted text. Screenshot.
- Open the palette and run **Send Selection to Agent Terminal**.
- Expect: the same text is appended again at the prompt and not executed.
  Screenshot.
- Evidence: the examined screenshots above.

## Pass criteria

- 0: the suite is green.
- 1: the panel is docked left with the chrome pushed right; cwd and env vars are
  correct; Cmd/Ctrl+K doesn't open the palette from the terminal; resize
  changes `tput cols`; Close restores the layout.
- 2: the CLI-added person appears without a manual reload.
- 3: after the reload, the same process is still running with output replayed;
  the open state and width are remembered; both insert paths type the selection
  text without executing it.

Report per scenario with pass/fail and the evidence. Quote any blockers
verbatim (e.g. `node-pty` spawn errors in the dev-server log).

## Boundaries

Never fix code. Never switch ports or start a server without `--terminal` for
scenarios 1–3. Never run destructive commands in the terminal beyond the ones
listed. If the dev server refuses to start, or the panel never reaches
"connected", stop and report the dev-server log and do not improvise a
workaround. Delete `$FIXTURE_DIR` when done.
