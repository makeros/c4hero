# Claude Code plugin for c4hero

## Task Details

Source: design interview ("grilling") with the maintainer, 2026-10-13. Every
decision below was made there; flagged items are planner calls made after the
interview and should be confirmed on read.

## Goal

**Goal**: Ship a Claude Code plugin, distributed from this repository as a
marketplace, that lets an agent working in *any* repo that keeps Structurizr
DSL files create, edit, query, validate, document-link and export a c4hero
model through a bundled CLI built from c4hero's own parser, serializer and
store. The DSL it writes is byte-identical to what saving in the app produces.

**Success Measure**: In a scratch repo, after `/plugin marketplace add
<path-to-this-repo>` and `/plugin install c4hero@c4hero`, an agent asked
"add an Order Service container to the platform, relate the API gateway to it,
link docs/orders.md to it, and export the container view as PNG" does all four
through `c4hero` CLI calls. The resulting `.dsl` opens in c4hero with the new
container, relationship and document link intact. The PNG matches what the app's
own PNG export draws for that view. A deliberately broken hand edit to the
`.dsl` is reported back to the agent by the PostToolUse hook on the same turn.

**Do NOT touch / do NOT add**:
- Do not change DSL semantics or the serializer's output format. The CLI writes
  exactly what `serializeDSL` writes. If the CLI needs a change in `src/lib/dsl`,
  that change is a bug fix with its own round-trip test, not a format change.
- Do not reimplement model mutations in the CLI. Mutations go through the
  existing Zustand store actions (headless) and `applyEditPlan`. The only new
  mutation helpers are those the store genuinely lacks: identifier rename and
  sidecar re-keying (see Proposed Solution).
- Do not add an npm publish step or make `package.json` non-private.
- Do not add Playwright, Puppeteer or any browser-automation dependency to the
  plugin. Export drives an already-installed browser over the Chrome DevTools
  Protocol (CDP) using only Node built-ins.
- Do not compute layout in the CLI (no dagre runs). New elements get no
  position, and c4hero places them when the view opens. Export is the one
  exception, because it renders the real app, which lays out as usual.
- Do not add AI-provider calls to the plugin. The agent is the AI.
- Do not touch `src/lib/exportProposal.ts`.

## Proposed Solution

### Shape of the deliverable

```
.claude-plugin/marketplace.json          # repo-root marketplace, lists ./plugins/c4hero
plugins/c4hero/
  .claude-plugin/plugin.json
  bin/c4hero.mjs                          # GENERATED, committed: single-file CLI bundle, Node ≥22, zero deps
  viewer/                                 # GENERATED, committed: static export-viewer build
  hooks/hooks.json
  hooks/validate-dsl.mjs                  # PostToolUse: Edit|Write|MultiEdit on *.dsl → `c4hero check --fast`
  skills/c4hero-modeling/SKILL.md (+ references/)
  skills/structurizr-dsl/SKILL.md (+ references/)
  skills/model-from-codebase/SKILL.md
  commands/{link-docs,review-model,sync-from-code,export}.md
  agents/architecture-modeler.md
src/cli/                                  # CLI source: TypeScript, covered by tsc/eslint/vitest
vite.cli.config.ts                        # bundles src/cli/main.ts → plugins/c4hero/bin/c4hero.mjs
scripts/build-plugin.mjs                  # builds CLI bundle + export viewer into plugins/c4hero/
```

The bundles are committed so `/plugin install` works with no install step. CI
rebuilds them and fails on any diff, so a stale bundle cannot merge.

### CLI architecture: a headless session over the real store

```
.dsl + .c4hero.json ──parseWorkspaceDocument──▶ Workspace
        ──useWorkspaceStore.getState().loadWorkspace──▶ store (vanilla, no React)
        ──store actions / applyEditPlan / cli-only helpers──▶ mutated Workspace
        ──serializeDSL + extractSidecar──▶ .dsl + .c4hero.json (written atomically)
```

```ts
// src/cli/session.ts
export interface Session {
  file: string                 // absolute .dsl path
  workspace(): Workspace       // current store snapshot
  actions(): WorkspaceState    // store actions (addContainer, addRelationship, …)
  save(opts: { dryRun: boolean }): SaveResult
}
export interface SaveResult {
  changed: boolean
  dslPath: string
  sidecarPath: string | null
  diff?: string                // unified diff, present on --dry-run
}
export function openSession(file: string, opts: { force: boolean }): Session   // throws LossyFileError / ParseFailedError
```

Each command opens a session, applies its mutation, and saves. Every command
prints one JSON object to stdout:

```ts
interface CliResult {
  ok: boolean
  command: string
  file?: string
  changed?: { elements?: string[]; relationships?: string[]; views?: string[] }
  data?: unknown               // read commands: list/show/views/graph/check
  warnings: string[]           // e.g. "view 'Containers' is layout-locked; new element has no position"
  error?: { code: string; message: string; candidates?: string[] }
}
```

`--pretty` gives human output. Exit codes: 0 ok, 1 usage/lookup error,
2 validation/parse error, 3 lossy-file refusal, 4 export environment error
(no usable browser).

### Readable identifiers (planner decision, flagged)

c4hero uses the element `id` as the DSL identifier, and store actions mint
`nanoid(8)` ids. That is fine in the GUI but leaves an agent-authored `.dsl`
full of `xK3a9fQ2`. The CLI therefore takes `--id <ident>`, or derives a unique
camelCase identifier from the name (`"Order Service"` → `orderService`). After
the store creates the element, the CLI calls a new pure helper:

```ts
// src/lib/renameIdentifier.ts
export function renameElementId(ws: Workspace, oldId: string, newId: string): void   // rewrites element, relationships, views, groups, dynamic steps, deployment instances
export function rekeySidecar(sidecar: SidecarData, renames: Map<string, string>, removed: Set<string>): SidecarData
```

The same helper backs `c4hero rename-id`, and `rekeySidecar` keeps layout
attached across renames and prunes deleted ids. It lives in `src/lib/`, not
`src/cli/`, because it is a model operation the app could adopt later.

### Addressing

`<ref>` resolves first as an identifier (including hierarchical
`platform.apiGateway`), then as a unique exact element name. An ambiguous name
fails with `error.code = "AMBIGUOUS"` and lists `candidates`. Relationships are
addressed by id, or by `<srcRef>-><dstRef>` with an optional `--description`
to disambiguate parallel edges.

### Lossy-file guard

The lexer drops comments and the serializer rewrites the whole file, so a
canonical rewrite can lose information. Before any write, `openSession`
refuses with exit 3 (`LOSSY_FILE`) when the source contains comments,
`!include`, `!const`/`!var`, or any construct the parser reports as skipped or
unknown (for example `branding`, `terminology`, and `skipUnknownDirective` hits
in `parser.ts`). The error lists each finding with its line. `--force` overrides it.
The `structurizr-dsl` skill teaches the agent the fallback, which is a careful
hand `Edit` validated by the hook. Read commands never refuse.

Which constructs belong on the list is settled by tests, not by this plan: each
candidate either round-trips (proven by a test) or triggers the guard (proven
by a test).

### Command surface (v1)

| Group | Commands |
| --- | --- |
| Workspace | `init --template blank\|microservices\|monolith\|eventDriven\|bigBank [--name]`, `check [--fast]`, `apply --plan <file.json>` (an existing `EditPlan`, validated by `src/lib/ai/schema.ts`) |
| Read | `list [--type person\|softwareSystem\|container\|component] [--parent <ref>]`, `show <ref>`, `views`, `graph [<ref>]` |
| Elements | `add person\|system\|container\|component --name … [--parent] [--id] [--description] [--technology] [--tags] [--external]`, `update <ref> [--name] [--description] [--technology] [--url] [--add-tag] [--remove-tag] [--property k=v] [--remove-property k] [--status] [--owner] [--location]`, `remove <ref>` (cascade, same as app), `move <ref> --to <parentRef>`, `rename-id <ref> <newId>` |
| Relationships | `relate <src> <dst> [--description] [--technology] [--interaction-style] [--line-style] [--tags]`, `update-rel <relRef> …`, `unrelate <relRef>` |
| Docs | `link-doc <ref\|relRef> --path <repo-relative.md> --title … [--create]`, `unlink-doc <ref\|relRef> --path …` |
| Views | `view add --type … [--scope] [--key] [--title] [--description]`, `view update <key> [--include] [--exclude] [--auto-layout TB\|BT\|LR\|RL] [--title] [--description]`, `view remove <key>`, `style element --tag … [--background] [--color] [--shape] [--border]…`, `style relationship --tag … […]` |
| Dynamic | `step add --view <key> --from <ref> --to <ref> [--description] [--response]`, `step move --view <key> --index N --to M`, `step remove --view <key> --index N` |
| Deployment | `deploy env add <name>`, `deploy node add --env … --name … [--parent] [--technology] [--instances]`, `deploy instance add --node <ref> --of <containerOrSystemRef>`, `deploy infra add --node <ref> --name … [--technology]`, `deploy remove <ref>` |
| Export | `export --view <key> --format png\|svg [--theme light\|dark] [--out <path>] [--padding <fraction, default 0.05>]` |

Every mutating command accepts `--file <dsl>`, `--dry-run` and `--force`.
Without `--file`, the CLI uses the single `.dsl` under the git root, skipping
`node_modules`, `dist*` and dot-dirs. With several candidates it fails with
`MULTIPLE_WORKSPACES` and lists them. An optional `.c4hero/config.json`
(`{ "workspace": "docs/architecture/workspace.dsl" }`) pins a default.

Adding to a view: `add …` places the element in views exactly as the app's
"Add Element" does (`addToCurrentView` semantics per scoped view). It warns
when a target view or node is layout-locked in the sidecar.

### `link-doc` and `--create`

The path must be project-root-relative, end in `.md` or `.markdown`, and contain
no `..`, absolute or hidden segment. This is the same allowlist the
document-links feature enforces; reuse its validator rather than writing a new
one. A missing file produces a warning. `--create` scaffolds it with the element's
name as an H1, its description, technology, and a "Relationships" list
generated from the model. It never overwrites an existing file.

### `check`

`check` reports parse errors, `checkModelIntegrity`, `validateScope`, the
deterministic model-health gaps (missing description, technology or relationship
label, using the same rules as the app's model-health readout), orphan elements,
document-link paths missing on disk, and lossy-guard findings (informational).
`--fast` runs parse plus integrity only. *(Changed during execution: the hook runs the full `check`, which measured ~35 ms on Big Bank, so it can surface unmodelled lines as non-blocking notes; only parse/integrity errors block.)* (budget: under
300 ms on the Big Bank sample).

### Export: real app, user's own browser, zero deps

1. **Export viewer.** This is a variant of the locked viewer built with no baked
   workspace (`virtual:locked-workspace` resolves to `null`) and an
   `EXPORT_MODE` define. It reads `{ dsl, sidecar, name }` from
   `window.__C4HERO_EXPORT_INPUT__`, renders read-only, and exposes:

   ```ts
   window.__c4heroExport(req: { view: string; format: 'png' | 'svg'; theme: 'light' | 'dark'; padding?: number })
     : Promise<{ ok: true; mime: string; base64: string } | { ok: false; error: string }>
   ```

   It reuses `exportCanvasAsPNG` / `exportCanvasAsSVG` and the
   `waitForViewMeasured` readiness logic, extracted from `exportProposal.ts` into
   a shared module **without** changing `exportProposal.ts` behaviour. If that
   extraction would require editing `exportProposal.ts`, copy-import the
   function instead and flag it. The build output goes to `plugins/c4hero/viewer/`.
2. **Serving.** The CLI serves `viewer/` from an ephemeral `node:http` server
   on `127.0.0.1:<random>`. It does not use `file://`, because module scripts
   are blocked there.
3. **Browser discovery.** The CLI resolves the OS default browser: macOS
   LaunchServices `https` handler, Linux `xdg-settings get default-web-browser`,
   Windows `HKCU\…\UrlAssociations\https\UserChoice`. If the default is
   Chromium-family (Chrome, Edge, Brave, Arc, Chromium, Vivaldi, Opera), it
   uses it. Otherwise it falls back to the first installed Chromium-family
   browser from a known-paths list, and the result's `warnings` says so. The
   `C4HERO_BROWSER=/path/to/binary` environment variable overrides discovery.
   With no usable browser it exits 4 with an actionable message. **Constraint
   to confirm:** headless capture needs Chromium. Safari and Firefox can't be
   driven without extra tooling, so a Safari- or Firefox-default user still
   needs some Chromium browser installed.
4. **Driving.** The CLI launches the browser with `--headless=new
   --remote-debugging-pipe --user-data-dir=<tmp> --no-first-run`. The temporary
   profile means it never touches or conflicts with the user's running browser
   profile. It speaks CDP over fds 3/4 (`Page.addScriptToEvaluateOnNewDocument`
   to inject input, `Page.navigate`, `Runtime.evaluate` with `awaitPromise`),
   writes the decoded bytes, then kills the process and removes the temp
   profile. A hard timeout (60 s) applies. (Changed during execution: planned 30 s, implemented as 60 s in `HARD_TIMEOUT_MS`, `src/cli/commands/export.ts`.)

```ts
// src/cli/export/browser.ts
export interface BrowserCandidate { name: string; path: string; source: 'env' | 'default' | 'fallback' }
export function resolveBrowser(platform: NodeJS.Platform, probe: SystemProbe): BrowserCandidate | null   // pure; SystemProbe injected for tests
// src/cli/export/cdp.ts
export class CdpPipe { send<T>(method: string, params?: object): Promise<T>; close(): void }
```

### Validation hook

`hooks/hooks.json` registers a `PostToolUse` hook, matcher
`Edit|Write|MultiEdit`, running `node "${CLAUDE_PLUGIN_ROOT}/hooks/validate-dsl.mjs"`.
The script reads the hook JSON from stdin, ignores anything that is not a `.dsl`
file, and runs `node c4hero.mjs check --fast --file <path>` as a child process (`execFileSync`, no shell). *Changed during execution: the bundle's entry runs the CLI on import, so in-process import isn't possible; a spawn costs ~100 ms.* On errors it exits 2 with a concise list on stderr, which Claude Code
feeds back to the agent. Otherwise it exits 0 silently.

### Skills, commands, agent

- **`c4hero-modeling`** (core, auto-triggers on `.dsl`, `.c4hero.json`, "C4",
  "architecture diagram", "Structurizr"): when to use the CLI rather than hand
  edits, C4 modelling rules (which level an element belongs to, naming,
  verb-phrase relationship labels, technology on containers and relationships,
  external vs internal), the c4hero conventions (`c4hero.*` properties, sidecar,
  document links), and the workflow "read → mutate → check → (export)".
  References: `cli-reference.md` (every command, flag and exit code),
  `c4hero-conventions.md`, `c4-modeling-rules.md`.
- **`structurizr-dsl`**: a syntax reference for hand edits when the CLI refuses
  (lossy guard) or for constructs the CLI doesn't model. It covers workspace,
  model, views, styles, deployment, dynamic, properties, `!docs`/`!adrs`,
  `!identifiers hierarchical`, and which constructs c4hero does not round-trip.
- **`model-from-codebase`**: discovers services, data stores, queues and
  external APIs from manifests (package.json, go.mod, pom.xml, docker-compose,
  k8s/helm, terraform, OpenAPI specs) and existing docs. It proposes the element
  list to the user first, then builds or updates the model through
  `c4hero apply --plan`, linking existing markdown docs, and finishes with
  `check`.
- **Commands**: `/c4hero:link-docs [ref]` (find relevant `.md` files and link
  them), `/c4hero:review-model [view]` (`check` plus a C4-rules review with
  proposed fixes), `/c4hero:sync-from-code` (runs `model-from-codebase` in
  update mode), `/c4hero:export <view> [png|svg]`.
- **Agent `architecture-modeler`**: runs multi-step modelling jobs (sync from
  code, bulk doc linking, building a view set) in its own context with the
  `c4hero-modeling` skill preloaded. It returns a summary of changed ids plus
  the `check` result.

## Current Implementation Analysis

**Already implemented (reuse):**
- `src/lib/dsl/index.ts` — `parseDSL`, `serializeDSL`, the only DSL entry points.
- `src/lib/workspaceDocument.ts` — `parseWorkspaceDocument({ content, fallbackName, sidecarJson })`,
  the DSL plus sidecar load path the locked viewer already uses.
- `src/lib/sidecar.ts` — `extractSidecar` / `applySidecar`, and
  `src/lib/sidecarName.ts` — the `<name>.c4hero.json` naming.
- `src/store/workspace.ts` and `src/store/slices/*` — every model mutation
  (elements, relationships, views, groups, styles, dynamic steps, deployment),
  with cascade delete (`cascadeDeleteElements`, `workspace-helpers.ts:600`) and
  readOnly guards. The store files reference no `window`, `document` or
  `localStorage`.
- `src/lib/ai/operations.ts` — `applyEditPlan(plan, ws, actions)`, with
  dependency ordering and ref→id mapping. `src/lib/ai/schema.ts` validates
  `EditPlan` JSON, and `src/components/ai/aiHelpers.ts` shows how `EditActions`
  is wired to the store.
- `src/lib/modelIntegrity.ts` (`checkModelIntegrity`), `src/lib/scopeValidation.ts`
  (`validateScope`), `src/lib/ai/sweep.ts` (deterministic model-health gaps).
- `src/lib/templates.ts` — the five starter workspaces for `init`.
- `src/lib/documentCollection.ts` and the document-links path guard
  (see `specifications/document-links/document-links.plan.md`).
- `src/lib/exportUtils.ts` — `exportCanvasAsPNG`, `exportCanvasAsSVG`.
  `src/lib/exportProposal.ts` — `waitForViewMeasured` (readiness).
- `scripts/build-viewer.mjs` and the `virtual:locked-workspace` plugin in
  `vite.config.ts` — the locked-viewer build the export viewer derives from.

**To be modified:**
- `vite.config.ts` — an `EXPORT_MODE` define and the export-viewer entry wiring.
- `src/App.tsx` (or the locked-viewer bootstrap) — in export mode, load the
  workspace from `window.__C4HERO_EXPORT_INPUT__` and register `__c4heroExport`.
- `package.json` — a `build:plugin` script.
- `.github/workflows/ci.yml` — a plugin-bundle freshness job.
- `eslint.config.js` — ignore `plugins/c4hero/bin` and `plugins/c4hero/viewer`.
- `README.md` — a short "Use with Claude Code" section.

**To be created:** everything under `src/cli/`, `src/lib/renameIdentifier.ts`,
`vite.cli.config.ts`, `scripts/build-plugin.mjs`, `.claude-plugin/marketplace.json`,
and everything under `plugins/c4hero/`.

## Technical Context

**Stack**: TypeScript ~5.9.3 (strict, `tsc -b`), Vite ^8.2.2, Vitest ^4.1.5
(jsdom by default; `test.include: ['src/**/*.test.{ts,tsx}']`), Zustand ^5.0.15
+ immer, React ^19.2.8, `@xyflow/react` ^12.11.3. Node ≥22 (local v22.22.3),
npm. Path alias `@/` → `src/`.

**Conventions**:
- `@/` imports only resolve under Vite. Plain Node ESM can't load `src/lib/**`
  (see document-links plan, "Correction made during implementation"). The CLI
  is therefore **bundled by Vite** (`vite build --config vite.cli.config.ts`,
  SSR/lib mode, `target: node22`, single ESM file, all deps inlined,
  `#!/usr/bin/env node` banner). Tests import TS sources directly through Vitest.
- CLI tests run in Vitest's default jsdom environment (`node:fs` etc. still work there). Do **not** use `// @vitest-environment node`: `src/test-setup.ts` touches `window` unconditionally and crashes under node. Files using Node APIs start with `/// <reference types="node" />` (tsconfig.app.json only has `vite/client` types).
- CLI errors are thrown as `CliFailure(code, message, candidates?)` from `src/cli/errors.ts`; codes and exit mapping live in `src/cli/output.ts`. Boolean flags must be registered in `args.ts`'s boolean set.
- Sessions: `openSession` / `Session.recordRename` / `recordRemoved` / `save` in `src/cli/session.ts`; read-only commands open with `force: true`.
- `no-console` is `warn` repo-wide. The CLI writes through one `output.ts`
  module (`process.stdout.write`) and does not use `console.*`.
- The serializer uses element `id` as the DSL identifier
  (`serializer.ts:306-320`), and sidecar keys are element ids and view keys
  (`sidecar.ts`).
- Store actions are called via `useWorkspaceStore.getState()`. Each CLI
  invocation is a single process with a single workspace, so the singleton is
  acceptable. Reset it between tests with `loadWorkspace`.
- Generated artifacts (`plugins/c4hero/bin`, `plugins/c4hero/viewer`) are never
  hand-edited. Only `npm run build:plugin` writes them.
- Plugin layout follows the Claude Code plugin spec: `.claude-plugin/plugin.json`
  manifest; `skills/<name>/SKILL.md`; `commands/*.md`; `agents/*.md`;
  `hooks/hooks.json` using `${CLAUDE_PLUGIN_ROOT}`. Skill descriptions are
  "what + when to use" in the third person.

**Commands** (verbatim):
- Unit (one file): `npx vitest run <path>`
- Unit (all): `npm test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Build app: `npm run build`
- Build plugin (new): `npm run build:plugin`
- Run CLI from bundle: `node plugins/c4hero/bin/c4hero.mjs <command> …`
- E2E: `npm run test:e2e`
- Everything: `npm run check`
- Plugin manifest validation: `claude plugin validate plugins/c4hero`

## Phases and Tasks

### Phase 1 — Headless core and bundle

**Goal**: A runnable `c4hero.mjs` that opens, guards, reads and saves a
workspace through the real store, with readable identifiers.

Parallel group 0: Tasks 1.1 and 1.2 — independent, disjoint files. Tasks 1.3
and 1.4 follow in order.

- [x] **Task 1.1 — Bundle pipeline and CLI skeleton**
  **Files:** `vite.cli.config.ts` (create), `scripts/build-plugin.mjs` (create),
  `src/cli/main.ts` (create), `src/cli/args.ts` (create),
  `src/cli/output.ts` (create), `src/cli/args.test.ts` (create),
  `package.json` (modify — `build:plugin` script), `eslint.config.js` (modify),
  `plugins/c4hero/bin/c4hero.mjs` (create — generated)
  Description: Bundle `src/cli/main.ts` into one dependency-free ESM file. Add
  an argv parser (subcommands, `--flag value`, `--flag=value`, repeated flags,
  `--pretty`), the `CliResult` printer, and the exit-code mapping. Include a
  `version` command that proves the bundle runs.
  **Definition of Done:**
  - [x] `npm run build:plugin` produces `plugins/c4hero/bin/c4hero.mjs`.
    `node plugins/c4hero/bin/c4hero.mjs version` prints `{"ok":true,…}` and exits 0.
  - [x] Two consecutive `npm run build:plugin` runs produce a byte-identical bundle.
  - [x] `npx vitest run src/cli/args.test.ts` passes.
  - [x] `npm run typecheck` and `npm run lint` pass.
  **Stop Rule:** If importing `@/store/workspace` into the Node bundle pulls in
  React, DOM or browser-only modules that fail at load, stop and report the
  import chain. Do not stub it out silently.

- [x] **Task 1.2 — Identifier rename and sidecar re-key helpers**
  **Files:** `src/lib/renameIdentifier.ts` (create),
  `src/lib/renameIdentifier.test.ts` (create)
  Description: Implement `renameElementId`, `rekeySidecar`, and
  `deriveIdentifier(name, taken)` (camelCase, ASCII-folded, unique,
  digit-safe), per Proposed Solution.
  **Definition of Done:**
  - [x] A rename updates every reference: element, relationships
    (source/destination), every view's element and relationship entries, groups,
    dynamic steps, deployment instances, and implied-relationship ids if any.
    The test asserts `serializeDSL` output contains no occurrence of the old id.
  - [x] `rekeySidecar` moves view positions and locks to the new id and prunes
    removed ids.
  - [x] `npx vitest run src/lib/renameIdentifier.test.ts` passes.

- [x] **Task 1.3 — Session: load, lossy guard, save, workspace discovery**
  **Files:** `src/cli/session.ts` (create), `src/cli/lossyGuard.ts` (create),
  `src/cli/discover.ts` (create), `src/cli/session.test.ts` (create),
  `src/cli/lossyGuard.test.ts` (create), `src/cli/discover.test.ts` (create);
  reuse `src/lib/workspaceDocument.ts`, `src/lib/sidecar.ts`,
  `src/lib/sidecarName.ts`, `src/lib/renameIdentifier.ts` (created in Task 1.2)
  Description: Implement `openSession` / `save` as in Proposed Solution, with
  atomic writes (temp file + rename) and `--dry-run` diffs. Add the lossy guard,
  where each candidate construct is settled by a test, and workspace discovery
  (`--file`, then `.c4hero/config.json`, then a single-`.dsl` scan).
  **Definition of Done:**
  - [x] Loading and saving an unmodified Big Bank template writes bytes identical
    to `serializeDSL` of the same workspace, and the sidecar round-trips.
  - [x] For each of comments (`//`, `#`, `/* */`), `!include`, `!const`, `!var`,
    `branding`, and `terminology`, a test proves the guard refuses (exit 3) or,
    for constructs that round-trip, that they survive.
  - [x] Discovery tests cover: explicit `--file`, config file, a single match,
    multiple matches (`MULTIPLE_WORKSPACES` with candidates), and no match.
  - [x] `npx vitest run src/cli/session.test.ts src/cli/lossyGuard.test.ts src/cli/discover.test.ts` passes.

- [x] **Task 1.4 — Reference resolution and read commands**
  **Files:** `src/cli/resolve.ts` (create), `src/cli/commands/read.ts` (create),
  `src/cli/resolve.test.ts` (create), `src/cli/commands/read.test.ts` (create),
  `src/cli/main.ts` (modify — created in Task 1.1)
  Description: Resolve `<ref>` (identifier, hierarchical identifier, unique
  name) and `<relRef>` (id or `src->dst`). Implement `list`, `show`, `views`
  and `graph`.
  **Definition of Done:**
  - [x] Ambiguous names return `AMBIGUOUS` with `candidates`. Unknown refs return
    `NOT_FOUND` with up to 5 closest matches.
  - [x] `show` includes tags, properties, `documents`, status, owner, location,
    parent, incoming and outgoing relationships, and the views containing it.
  - [x] `npx vitest run src/cli/resolve.test.ts src/cli/commands/read.test.ts` passes.

**Phase 1 Verification:** `npm run build:plugin`, then
`node plugins/c4hero/bin/c4hero.mjs list --file src/lib/dsl/__fixtures__/<any>.dsl`
returns `ok:true` with elements. `npm run typecheck` passes.

### Phase 2 — Mutating commands

**Goal**: The full v1 command surface writes correct DSL through the store.

Parallel group A: Tasks 2.1–2.5. Each owns its own command module and test
file, and none edits `main.ts`. Commands self-register through
`src/cli/commands/index.ts`, which Task 2.6 creates afterwards.

- [x] **Task 2.1 — Elements and relationships** *(`move` split out to Task 2.7)*
  **Files:** `src/cli/commands/elements.ts` (create),
  `src/cli/commands/relationships.ts` (create),
  `src/cli/commands/elements.test.ts` (create),
  `src/cli/commands/relationships.test.ts` (create)
  Description: Implement `add`, `update`, `remove`, `move`, `rename-id`,
  `relate`, `update-rel` and `unrelate` via store actions and `renameElementId`.
  `update --status/--owner/--location`, `relate --interaction-style/--line-style`
  set the typed fields so the existing `c4hero.*` hoists serialize them.
  **Definition of Done:**
  - [x] A new element gets `--id` or a derived readable identifier, never a
    nanoid, in the written DSL.
  - [x] `add` places the element into scoped views exactly as the app's add
    action does, and warns on locked views.
  - [x] `remove` cascades like the app and its sidecar entries are pruned.
  - [x] Each written file re-parses with zero errors. Tests assert the
    `c4hero.status`, `c4hero.lineStyle` and `c4hero.interactionStyle` keys in
    the DSL text.
  - [x] `npx vitest run src/cli/commands/elements.test.ts src/cli/commands/relationships.test.ts` passes.
  **Stop Rule:** If the store has no `move` action for containers or components,
  stop and report rather than mutating the model directly.

- [x] **Task 2.2 — Document links**
  **Files:** `src/cli/commands/docs.ts` (create), `src/cli/commands/docs.test.ts` (create)
  `src/lib/docPath.ts` (create), `src/lib/docPath.test.ts` (create), `src/lib/documentCollection.ts` (modify — import the shared validator instead of its private copy). *Scope widened during execution: the document-links path checks were module-private in `documentCollection.ts` and `vite.config.ts`; extracting one shared, dependency-free validator avoids a third copy. `vite.config.ts` keeps its copy for now — Task 3.1 (which already modifies `vite.config.ts`) switches it to import `src/lib/docPath.ts` via a relative path.*
  Description: Implement `link-doc` and `unlink-doc` for elements and
  relationships, reusing the document-links path validator, plus the
  `--create` scaffold.
  **Definition of Done:**
  - [x] The written DSL contains consecutive `c4hero.documents.N.path` /
    `.title` keys, and removing the middle link re-indexes without gaps.
  - [x] `..`, absolute, hidden-segment and non-`.md` paths are rejected.
    `--create` never overwrites an existing file.
  - [x] `npx vitest run src/cli/commands/docs.test.ts` passes.

- [x] **Task 2.3 — Views and styles**
  **Files:** `src/cli/commands/views.ts` (create), `src/cli/commands/views.test.ts` (create)
  **Definition of Done:**
  - [x] `view add` for each of landscape, context, container and component
    auto-populates like the app. `view update` include/exclude/auto-layout
    round-trips. `view remove` prunes the sidecar.
  - [x] `style element` and `style relationship` write `styles { … }` that re-parses identically.
  - [x] `npx vitest run src/cli/commands/views.test.ts` passes.

- [x] **Task 2.4 — Dynamic steps and deployment**
  **Files:** `src/cli/commands/dynamic.ts` (create),
  `src/cli/commands/deployment.ts` (create),
  `src/cli/commands/dynamic.test.ts` (create),
  `src/cli/commands/deployment.test.ts` (create)
  Description: Use the `dynamic-step-slice` and `deployment-slice` actions.
  **Definition of Done:**
  - [x] Step add, move and remove renumbers like the app. Response steps require
    an existing relationship.
  - [x] Environment, node (nested), instance and infra add/remove round-trip.
    Removing a node cascades its subtree.
  - [x] `npx vitest run src/cli/commands/dynamic.test.ts src/cli/commands/deployment.test.ts` passes.

- [x] **Task 2.5 — `init`, `check`, `apply`**
  **Files:** `src/cli/commands/workspace.ts` (create),
  `src/cli/commands/workspace.test.ts` (create)
  Description: `init` writes a template and refuses to overwrite. `check` and
  `check --fast` work as in Proposed Solution. `apply --plan` validates via
  `src/lib/ai/schema.ts` and applies through `applyEditPlan`, with readable ids
  for created refs.
  **Definition of Done:**
  - [x] `check` on a fixture with a known gap set reports exactly those gaps.
    `--fast` completes in under 300 ms on Big Bank, asserted in the test.
  - [x] `apply` reports per-op applied/skipped results using `summarizeSkips`.
  - [x] `npx vitest run src/cli/commands/workspace.test.ts` passes.

- [x] **Task 2.7 — `moveElement` store action and `move` command** *(added during execution: Task 2.1's Stop Rule fired — the store had no move action; the maintainer chose to add one rather than defer `move`)*
  **Files:** `src/store/slices/element-slice.ts` (modify), `src/store/workspace-types.ts` (modify), `src/store/move-element.test.ts` (create), `src/store/slices/element-slice-readonly.test.ts` (modify), `src/cli/commands/elements.ts` (modify — created in Task 2.1), `src/cli/commands/elements.test.ts` (modify — created in Task 2.1)
  Description: Add `moveElement(id: string, newParentId: string): boolean` to the store. It moves a container to another software system, or a component to another container. It keeps the element's id, relationships and documents. It removes the element from views scoped to the old parent (container views of the old system, component views of the old container) and from groups belonging to the old parent. It adds the element to views scoped to the new parent the way the add actions do. It drops dynamic steps that would become invalid and reports them. It pushes one undo snapshot and is a no-op under `readOnly`. It refuses with `false` on a type mismatch, the same parent, or a missing id. Expose it as the CLI `move <ref> --to <parentRef>`.
  **Definition of Done:**
  - [x] `npx vitest run src/store/move-element.test.ts src/store/slices/element-slice-readonly.test.ts` passes. It covers container→system, component→container, a type mismatch, the same parent, readOnly, view membership before and after, a relationship preserved, and a single undo entry.
  - [x] `npx vitest run src/cli/commands/elements.test.ts` passes, with `move` cases that include a serialize→reparse round trip.
  - [x] `npm run typecheck` passes.

Parallel group A2: Tasks 2.6 and 2.7 — disjoint files. 2.6's registry picks up `move` automatically through `elementCommands`.

- [x] **Task 2.6 — Register commands and help** (after group A)
  **Files:** `src/cli/commands/index.ts` (create), `src/cli/main.ts` (modify),
  `src/cli/help.ts` (create), `src/cli/main.test.ts` (create),
  `plugins/c4hero/bin/c4hero.mjs` (modify — regenerated)
  `src/cli/resolve.ts`, `src/cli/commands/relationships.ts`, `src/cli/commands/docs.ts` and their tests (modify — the `--match` fix)
  *Added during execution:* every command taking a `<relRef>` (`update-rel`, `unrelate`, `link-doc`, `unlink-doc`) uses `--match <description>` to choose among parallel `src->dst` edges. `--description` always means the new value. Before this fix, `update-rel a->b --description X` used X as a selector, so an arrow-addressed edge could never get a new description.
  **Definition of Done:**
  - [x] `c4hero help` and `c4hero <cmd> --help` list every command and flag
    from Proposed Solution's table.
  - [x] `npx vitest run src/cli/main.test.ts` passes, with one end-to-end
    in-process test per command group.
  - [x] `--match` works in all four relRef commands, and `update-rel a->b --description New` sets the description (tests in relationships/docs test files).
  - [x] `npm run build:plugin` is rerun and the bundle committed.

**Phase 2 Verification:** Using the bundle against a temp copy of the
microservices template, run `add container`, `relate`, `link-doc`, `view add`
and `check`. Each prints `ok:true`, and the final `check` reports no parse or
integrity errors. `npm run typecheck` passes.

### Phase 3 — Export

**Goal**: `c4hero export` renders a view through the real app in the user's
own Chromium-family browser.

Parallel group B: Tasks 3.1 and 3.2. Disjoint files; the integration is in Task 3.3.

- [x] **Task 3.1 — Export viewer build**
  **Files:** `vite.config.ts` (modify), `src/lib/exportViewer.ts` (create),
  `src/lib/exportViewer.test.ts` (create), `src/App.tsx` (modify),
  `scripts/build-plugin.mjs` (modify — created in Task 1.1),
  `plugins/c4hero/viewer/**` (create — generated)
  Description: Add an `EXPORT_MODE` build that reads
  `window.__C4HERO_EXPORT_INPUT__`, renders read-only, and registers
  `window.__c4heroExport`, as specified in Proposed Solution.
  **Definition of Done:**
  - [x] A normal `npm run build` contains no export-mode code (asserted by
    grepping `dist/` for `__c4heroExport` returning nothing).
  - [x] `npx vitest run src/lib/exportViewer.test.ts` passes: input parsing,
    unknown view, and the error shapes.
  - [x] `src/lib/exportProposal.ts` is unchanged (`git diff --quiet -- src/lib/exportProposal.ts`).

- [x] **Task 3.2 — Browser discovery and CDP pipe**
  **Files:** `src/cli/export/browser.ts` (create),
  `src/cli/export/cdp.ts` (create), `src/cli/export/browser.test.ts` (create),
  `src/cli/export/cdp.test.ts` (create)
  **Definition of Done:**
  - [x] `resolveBrowser` tests cover each platform: `C4HERO_BROWSER` override, a
    Chromium default, a Safari/Firefox default falling back to an installed
    Chromium (with a warning), and nothing installed (null).
  - [x] The CDP pipe test runs against a fake child process with paired streams:
    NUL-delimited framing, id correlation, error responses, and timeout.
  - [x] `npx vitest run src/cli/export/browser.test.ts src/cli/export/cdp.test.ts` passes.

- [x] **Task 3.3 — `export` command**
  **Files:** `src/cli/export/server.ts` (create), `src/cli/commands/export.ts` (create),
  `src/cli/commands/export.test.ts` (create),
  `src/cli/commands/index.ts` (modify — created in Task 2.6),
  `plugins/c4hero/bin/c4hero.mjs` (modify — regenerated)
  **Definition of Done:**
  - [x] Unit tests (browser mocked) cover the default output path
    (`<dsl-dir>/<view-key>.<fmt>`), the unknown view (exit 1), no browser
    (exit 4), and cleanup of the temp profile and server on success and on failure.
  - [x] Running `node plugins/c4hero/bin/c4hero.mjs export --file <bigBank.dsl> --view <key> --format png`
    locally produces a non-empty PNG (verified in the verification doc, not CI).
  - [x] `npx vitest run src/cli/commands/export.test.ts` passes.

**Phase 3 Verification:** `npm run build:plugin && npm run typecheck`. A manual
export of one view in PNG and SVG produces non-empty files.

### Phase 4 — Plugin content

**Goal**: Agents discover and use the CLI correctly without being told.

Parallel group C: Tasks 4.1–4.4. They are content-only, with disjoint files.
They depend on the help text from Task 2.6 for flag accuracy.

- [x] **Task 4.1 — Manifests and hook**
  **Files:** `.claude-plugin/marketplace.json` (create),
  `plugins/c4hero/.claude-plugin/plugin.json` (create),
  `plugins/c4hero/hooks/hooks.json` (create),
  `plugins/c4hero/hooks/validate-dsl.mjs` (create),
  `plugins/c4hero/README.md` (create)
  **Definition of Done:**
  - [x] `claude plugin validate plugins/c4hero` passes.
  - [x] Piping a sample PostToolUse JSON for a broken `.dsl` into
    `node plugins/c4hero/hooks/validate-dsl.mjs` exits 2 with the parse error on
    stderr. A non-`.dsl` path exits 0 with no output.

- [x] **Task 4.2 — `c4hero-modeling` skill**
  **Files:** `plugins/c4hero/skills/c4hero-modeling/SKILL.md` (create),
  `plugins/c4hero/skills/c4hero-modeling/references/cli-reference.md` (create),
  `plugins/c4hero/skills/c4hero-modeling/references/c4hero-conventions.md` (create),
  `plugins/c4hero/skills/c4hero-modeling/references/c4-modeling-rules.md` (create)
  **Definition of Done:**
  - [x] `SKILL.md` is under 200 lines. It instructs the agent to invoke the CLI
    as `node "${CLAUDE_PLUGIN_ROOT}/bin/c4hero.mjs"` and to prefer the CLI over
    hand edits, and it documents the lossy-guard fallback.
  - [x] `SKILL.md` tells the agent to address relationships as `src->dst` (plus `--description` for parallel edges), not by id: relationship ids are regenerated as `rel-N` on every parse and can shift between CLI calls. Deployment-environment removal is not supported (no store action) and is listed as a known limitation.
  - [x] `cli-reference.md` lists every command and flag that `c4hero help`
    prints. The check is a mechanical diff of command names.

- [x] **Task 4.3 — `structurizr-dsl` and `model-from-codebase` skills**
  **Files:** `plugins/c4hero/skills/structurizr-dsl/SKILL.md` (create),
  `plugins/c4hero/skills/structurizr-dsl/references/dsl-syntax.md` (create),
  `plugins/c4hero/skills/model-from-codebase/SKILL.md` (create)
  **Definition of Done:**
  - [x] Every DSL example in `dsl-syntax.md` is extracted and parses with zero
    errors via `c4hero check`. A script or test does this. Constructs c4hero
    doesn't round-trip are listed explicitly.
  - [x] `model-from-codebase` requires user confirmation of the proposed element
    list before writing, and writes via `apply --plan`.

- [x] **Task 4.4 — Commands and agent**
  **Files:** `plugins/c4hero/commands/link-docs.md`, `review-model.md`,
  `sync-from-code.md`, `export.md` (create),
  `plugins/c4hero/agents/architecture-modeler.md` (create)
  **Definition of Done:**
  - [x] Each command has frontmatter `description` and `argument-hint`. The agent
    has `description`, a tools list including Bash, Read, Glob and Grep, and
    `skills: [c4hero-modeling]`.
  - [x] `claude plugin validate plugins/c4hero` still passes.

**Phase 4 Verification:** `claude plugin validate plugins/c4hero`.

### Phase 5 — CI and docs

- [x] **Task 5.1 — Bundle freshness in CI, README section**
  **Files:** `.github/workflows/ci.yml` (modify), `README.md` (modify)
  **Definition of Done:**
  - [x] A new CI job runs `npm ci && npm run build:plugin && git diff --exit-code plugins/c4hero/bin plugins/c4hero/viewer`.
  - [x] `README.md` has a "Use with Claude Code" section with the marketplace
    add and install commands.

### Phase 6 — Final verification

Parallel group D: Tasks 6.1 and 6.2.

- [x] **Task 6.1 — Code review**: delegate to `code-reviewer` with this plan
  and the full changed-file list. It runs `npm run check` and `npm run build:plugin`
  plus a freshness diff. E2E and functional checks run in Task 6.2.
- [x] **Task 6.2 — Functional verification**: delegate to `feature-verifier`
  with `specifications/claude-plugin/claude-plugin.verification.md`.

## Security Considerations

- **Path traversal**: `link-doc`/`--create`, `--out` and `init` write only inside
  the git root (or cwd when there is no git root), with symlinks resolved. This
  reuses the document-links guard.
- **Export server**: binds `127.0.0.1` only, on a random port, serves only
  `viewer/`, and lives for the duration of one export.
- **Browser**: launched with a fresh temporary `--user-data-dir`, so it never
  sees the user's cookies or profile. It uses a pipe, not a TCP debugging port,
  so no other local process can attach. The temp directory is removed in
  `finally`.
- **Hook**: reads only the `file_path` from the hook payload and never executes
  content from the `.dsl`.
- **No network**: the CLI makes no outbound requests.

## Acceptance Criteria

- [x] The plugin installs from this repo's marketplace with no build step on the user's side.
- [x] Every command in the v1 table works through the bundle and emits JSON.
- [x] CLI-written DSL equals `serializeDSL` output, uses readable identifiers,
  and keeps the sidecar consistent through renames and deletes.
- [x] Files with comments or other lossy constructs are refused unless `--force` is passed.
- [x] A broken hand edit to a `.dsl` is reported to the agent by the hook.
- [x] `export` produces PNG and SVG matching the app's rendering, using the
  user's Chromium-family browser with no extra installs.
- [x] CI fails when the committed bundle is stale. *(Job in place; a Linux `node:22` container build was verified byte-identical to the macOS bundle. Not yet observed on GitHub Actions.)*

## Improvements (Out of Scope)

- Surgical (format-preserving) edits that keep comments, which needs source spans in the lexer/parser.
- `!include` resolution and multi-file workspaces.
- Text exports (Mermaid, PlantUML).
- Firefox/WebKit export via WebDriver BiDi.
- An MCP server wrapper over the same command layer.
- The app adopting `renameElementId` for an "edit identifier" inspector field.
- Optional CLI auto-layout so agent-created views open pre-arranged.
- SVG export is ~12.7 MB for Big Bank's container view because the app's SVG export inlines every computed style (`exportCanvasAsSVG`). Slimming it is an app-level change.
- **Pre-existing parser gaps found during Task 4.3:** `this -> x` inside an element block is a parse error (`Unresolved reference: 'this'`) although Structurizr allows it; the `-> x` shorthand inside an element block parses but the relationship is silently dropped. Both affect the app's own load/save. The CLI's lossy guard refuses such files; the parser needs its own fix.
- **Pre-existing:** the parser silently drops relationship identifiers (`r1 = a -> b "Uses"`). The CLI's guard refuses such files; the app loses them on save.
- PNG export captures a fixed viewport, so large diagrams render small; a size/scale option would need app support.
- **Pre-existing app bug found during Task 1.3 review:** c4hero's parser accepts `!docs`, `!adrs` and `!identifiers` but the serializer silently drops them, so saving in the app loses them — contradicting `docs/FEATURES.md`. The CLI's lossy guard refuses such files; the app needs its own fix.
