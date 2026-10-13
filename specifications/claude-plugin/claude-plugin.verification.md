# Claude Code plugin for c4hero — Verification

Plan: `specifications/claude-plugin/claude-plugin.plan.md`
Under verification: the bundled CLI (`plugins/c4hero/bin/c4hero.mjs`), the
plugin (`plugins/c4hero/`), and the c4hero dev server (for opening results).

## Environment

- Repo root: this repository on the branch under review.
- Build first: `npm ci && npm run build:plugin`.
- Dev server: **`http://localhost:3004`, already running (user-confirmed, pinned)**. Do not start, restart or replace it, and do not use another port. `npm run test:e2e` reuses it (`reuseExistingServer`).
- Claude Code CLI available as `claude`. Auth comes from the operator's existing
  login; never record tokens.
- Scratch area: a fresh directory under the session scratchpad, created per
  scenario. Never run against files inside this repo except fixtures that are
  copied out first.

## Seeding

- For each template, run
  `node plugins/c4hero/bin/c4hero.mjs init --template <t> --file <scratch>/<t>/workspace.dsl`
  for `blank`, `microservices`, `monolith`, `eventDriven` and `bigBank`.
  Expect `ok:true` and a `workspace.dsl` in each directory.
- Create `<scratch>/microservices/docs/shipping.md` with any heading.

## Scenarios

### 0. [E2E] Committed suites

- Run `npm run test:e2e`. Expect all specs to be green. This is the app
  regression guard for the `App.tsx` and `vite.config.ts` changes.

### 1. [CLI] Command groups end to end (on the microservices copy)

Run each command through `node plugins/c4hero/bin/c4hero.mjs … --file <scratch>/microservices/workspace.dsl`:

1. `list`, then `show` on one container. Expect JSON with the container's relationships and views.
2. `add container --parent <a system> --name "Shipping Service" --technology Go`. Expect identifier `shippingService` in the DSL text.
3. `relate <gateway> shippingService --description "Routes shipments" --technology HTTPS --interaction-style Asynchronous`.
4. `link-doc shippingService --path docs/shipping.md --title "Shipping overview"`, then
   `link-doc shippingService --path docs/missing.md --title X`. Expect a warning
   about the missing file and the link still written.
5. `link-doc shippingService --path ../etc/passwd --title X`. Expect a rejection and no file change.
6. `update shippingService --status Planned --owner "Team Shipping" --add-tag Critical`.
7. `rename-id shippingService shipping`. Expect no `shippingService` left in the DSL or sidecar.
8. `view add --type component --scope shipping`, then `view update <key> --auto-layout LR`.
9. `step add` on a new dynamic view (`view add --type dynamic --scope <system>`) with two steps, then `step move`.
10. `deploy env add Production`, `deploy node add --env Production --name AWS`,
    `deploy instance add --node AWS --of shipping`.
11. `remove <some other container>`. Expect the cascade to be reported and the
    sidecar entries for it to be gone.
12. `check`. Expect no parse or integrity errors.
13. Add a `// comment` line to the file by hand, then run any mutating command.
    Expect exit 3 `LOSSY_FILE` naming the line. Rerun with `--force`. Expect success.

Evidence: each command's JSON output (trimmed), and `grep` results proving
steps 2, 4, 6 and 7 in the DSL text (`c4hero.documents.0.path`,
`c4hero.status`, the identifiers).

### 2. [BROWSER] Result opens correctly in c4hero

- Load the Scenario 1 workspace into the pinned dev server at `http://localhost:3004`, with its `workspace.dsl` and any `workspace.c4hero.json` contents read from the scratch dir. The server was not started with `--workspace`, so use the approach from `e2e/journeys/collection-workspace-canvas.spec.ts`: stub `window.showDirectoryPicker` with an in-memory file system via an init script, open the folder, and pick the workspace. Any equivalent in-browser injection the app supports is also fine. Do not edit repo files.
- Open the container view. Expect `Shipping Service`, with the relationship description set in Scenario 1 visible on its edge.
- Select it. Expect the inspector to show status Planned, owner Team Shipping, tag Critical, and two document rows. Clicking a document opens `/document-view`. The dev server resolves doc paths against **its own** project root (the c4hero repo), so a scratch-dir doc is expected to show not-found there. Record that as informational, not a failure.
- Open the dynamic and deployment views created in Scenario 1.
- Evidence: examined screenshots of the container view, the inspector, the dynamic view and the deployment view.

### 3. [CLI] Every template survives a no-op load and save

- For each seeded template, run `update <any element> --description "x"`, then
  `update <same> --description "<original>"`.
- Expect `git diff --no-index` between the original and final `.dsl` to be
  empty, or whitespace-identical to `serializeDSL` output as the plan defines.
- Evidence: the diff output per template.

### 4. [AGENT] Hook feedback reaches the agent

- In `<scratch>/hooktest/`: `git init`, copy in the microservices workspace,
  then run `claude plugin marketplace add <repo-root>` and
  `claude plugin install c4hero@c4hero` (project scope).
- Run `claude -p "Using the Edit tool only (not the c4hero CLI), add a relationship from the customer to a container named DoesNotExist in workspace.dsl, then make sure the file is valid." --output-format stream-json --verbose`.
- Expect the transcript to show a PostToolUse hook error after the edit
  (unknown identifier / parse error), followed by a corrective action, with
  `c4hero check` passing at the end.
- Evidence: the transcript excerpt with the hook message, and the final `check` output.

### 5. [AGENT] Real agent session, the Success Measure

- In `<scratch>/agenttest/` (git init, microservices workspace copied in,
  `docs/shipping.md` present), install the plugin as in Scenario 4.
- Run `claude -p "Add a Shipping Service container to the platform, relate the API gateway to it, link docs/shipping.md to it, and export the container view as PNG." --output-format stream-json --verbose`.
- Expect:
  - Bash tool calls invoking `c4hero.mjs` for add, relate, link-doc and export,
    and no hand `Edit` of the `.dsl`.
  - `c4hero check` passes on the result.
  - A non-empty PNG exists at the reported path. Open it and examine it: the
    container view shows Shipping Service.
- Evidence: the list of tool calls from the transcript, the `check` output, and
  the examined PNG.

## Pass criteria

| # | Pass when |
| --- | --- |
| 0 | E2E suite is green |
| 1 | Every step's JSON is `ok:true` (or the expected error code), with the DSL assertions found |
| 2 | Every screenshot shows the expected element, inspector values (including two document rows) and views |
| 3 | No unexpected diff for any template |
| 4 | Hook error visible in the transcript, the agent corrects it, and the final `check` is clean |
| 5 | The agent used the CLI for all four actions, the result is valid, and the PNG shows the view |

Report per scenario, pass or fail, with its evidence, then blockers verbatim.

## Boundaries

Never fix code. Never edit files inside this repository. Work only on scratch
copies. Never start, restart or switch the dev server; it is pinned at `http://localhost:3004`. If a precondition is missing (no
`claude` CLI, no Chromium-family browser for Scenario 5's export), stop and
report it instead of improvising.
