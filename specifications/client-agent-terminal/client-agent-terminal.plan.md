# Agent terminal (dev server only)

## Goal

**Goal**: Add a terminal panel inside the c4hero app, docked on the left of the
canvas. It runs your real login shell on your machine, so you can run your CLI
agent (e.g. `claude`) against the open workspace. The feature exists only on the
dev server started with `npm run dev -- --workspace <dir> --terminal`.

**Success Measure**:
1. `npm run dev -- --workspace <dir> --terminal` → the command palette offers
   "Toggle Agent Terminal". Opening it shows an interactive `$SHELL -l` whose cwd
   is the git root of `<dir>`. `claude` and other full-screen TUI programs work
   (colours, resize, Ctrl+C, Esc).
2. An agent that edits the open `.dsl` (e.g. via the `c4hero` CLI) changes the
   canvas within about 1s through the existing `useExternalFileReload` poll.
3. Reloading the page reattaches to the same running shell and replays its
   recent output.
4. Plain `npm run dev`, `npm run build`, `npm run build:viewer` and
   `npm run build:plugin` expose no terminal endpoint, no palette command and no
   terminal client code.

**Do NOT touch / do NOT add**:
- No change to the BYOK AI assistant (`src/components/ai/`, `src/lib/ai/`). The
  two features are independent.
- No change to `useExternalFileReload` or `folderIO.ts`. The file still wins on
  an edit race.
- No keyboard shortcut and no tool-rail or top-pill button. The command palette
  is the only entry point.
- No Windows support. On `win32`, `--terminal` prints "not supported yet" and
  exits.
- No multiple terminals or tabs, no tmux. One shared PTY per dev server.
- No live-state endpoint for the agent. Context goes in as env vars at spawn and
  through "Send selection".
- No env filtering. The shell inherits the dev server's `process.env` in full.
- No E2E spec for the terminal and no build-exclusion test (out of scope by
  decision, see Improvements).
- No change to `vercel.json`, the PWA config, or the CSP meta in `index.html`.
  Dev already allows `ws:` in `connect-src`.

## Proposed Solution

### Architecture

```
Browser (dev only)                         Vite dev server (Node)
┌────────────────────────────┐   ws://localhost:3004/__agent-terminal?token=…
│ AgentTerminalPanel (lazy)  │◀────────────────────────────────────┐
│  xterm.js + fit addon      │ JSON frames (protocol below)        │
│  left dock, --agent-       │                                     ▼
│  terminal-w CSS var        │          agent-terminal plugin (configureServer)
└────────────────────────────┘           ├─ checkUpgrade() guards → 403 on fail
  palette: Toggle Agent Terminal          ├─ TerminalSession (one, shared)
           Send Selection to Terminal     │    ├─ node-pty: $SHELL -l, cwd=git root
                                          │    └─ scrollback ring buffer (256 KiB)
                                          └─ killed on server close / process exit
```

### Enablement chain

1. **`scripts/dev.mjs`** parses `--terminal`. It refuses to start (exit 1 with a
   clear message) when `process.platform === 'win32'`, when `--workspace` is
   missing, when `VITE_HMR_TUNNEL` or `VITE_ALLOWED_HOSTS` is set, or when
   `--host` is among the Vite args. Otherwise it sets
   `C4HERO_AGENT_TERMINAL=1` for the Vite child process.
2. **The `agent-terminal` Vite plugin** is a no-op unless
   `C4HERO_AGENT_TERMINAL === '1'` *and* it runs under `configureServer` (it has
   no build hooks). When enabled, it:
   - generates a token once per server start (`crypto.randomBytes(32)`, hex);
   - injects `<meta name="c4hero-agent-terminal" content="<token>">` via
     `transformIndexHtml` only when `ctx.server` is set. A cross-origin page
     cannot read this HTML, so it cannot learn the token;
   - dynamically imports `node-pty` and `ws` only at this point, so plain
     `npm run dev` and every build never load the native module;
   - handles `server.httpServer`'s `upgrade` event for path `/__agent-terminal`
     only. It leaves every other upgrade (Vite HMR) alone.
3. **Client availability** is
   `import.meta.env.DEV && !!document.querySelector('meta[name="c4hero-agent-terminal"]')`.
   The panel is a `React.lazy` import behind an `import.meta.env.DEV` constant
   check, so production builds dead-code-eliminate the chunk (xterm included).

### Access guards (pure, unit-tested)

`checkUpgrade` rejects a WebSocket upgrade unless **all** of these hold:
- `remoteAddress` is loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`);
- `Host` is `localhost:<port>`, `127.0.0.1:<port>` or `[::1]:<port>`;
- `Origin` is present and is `http://` plus one of those hosts;
- the `token` query parameter equals the server token (constant-time compare);
- the path is exactly `/__agent-terminal`.

A rejection writes `HTTP/1.1 403 Forbidden` and destroys the socket. The pure
module must not import Node built-ins. The plugin passes in plain strings.

### Session

- One `TerminalSession` per dev server. The PTY spawns lazily on the first
  attach. Command: `process.env.SHELL` (fallback `/bin/zsh`, then `/bin/bash`)
  with `['-l']`, `name: 'xterm-256color'`, cwd = `docsRootFor(workspaceDir)`
  (git root of `--workspace`, from `src/lib/docPath.ts`).
- Env: `{ ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor',
  C4HERO_WORKSPACE: <absolute --workspace dir>, C4HERO_DEV_URL:
  'http://localhost:<port>' }`.
- Every attached socket gets `replay` (the scrollback buffer) on attach, then
  live `output`. The buffer keeps the last 256 KiB of output.
- Input from any socket goes to the PTY. The last `resize` wins.
- When the PTY exits, every client gets `exit` and the buffer is kept. A
  `restart` message respawns the PTY with the same settings.
- A `kill` message, `server.httpServer` `close`, or process `exit`/`SIGINT`/
  `SIGTERM` kills the PTY.
- Closing the panel or reloading the page only closes the socket. The PTY keeps
  running.

### Wire protocol (contract)

```ts
// src/lib/agentTerminal/protocol.ts
export type ClientMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'restart' }
  | { type: 'kill' }

export type ServerMessage =
  | { type: 'replay'; data: string }         // sent once per attach, may be ''
  | { type: 'output'; data: string }
  | { type: 'exit'; exitCode: number; signal?: number }
  | { type: 'error'; message: string }

export const AGENT_TERMINAL_PATH = '/__agent-terminal'
export const AGENT_TERMINAL_META = 'c4hero-agent-terminal'
export function parseClientMessage(raw: string): ClientMessage | null   // validates shape, clamps cols/rows to 1..1000
export function encodeServerMessage(msg: ServerMessage): string
```

```ts
// src/lib/agentTerminal/guards.ts
export interface UpgradeRequestInfo {
  remoteAddress: string | undefined
  host: string | undefined
  origin: string | undefined
  url: string | undefined      // raw req.url incl. query
  port: number
  token: string
}
export type UpgradeCheck = { ok: true } | { ok: false; reason: string }
export function checkUpgrade(req: UpgradeRequestInfo): UpgradeCheck
export function tokensEqual(a: string, b: string): boolean  // constant-time
```

```ts
// src/lib/agentTerminal/session.ts — no Node imports; the PTY is injected
export interface PtyLike {
  onData(cb: (data: string) => void): void
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): void
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}
export interface TerminalClient { send(msg: ServerMessage): void }
export class TerminalSession {
  constructor(spawn: () => PtyLike, opts?: { scrollbackBytes?: number })
  attach(client: TerminalClient): void
  detach(client: TerminalClient): void
  handle(client: TerminalClient, msg: ClientMessage): void
  dispose(): void
}
```

### Client UI

- **Settings** (`src/store/settings.ts`): `agentTerminalOpen: boolean`
  (default false) and `agentTerminalWidth: number` (default 560, min 360,
  max 1200), persisted like `documentsSidebarOpen`/`documentsSidebarWidth`.
- **Panel** `src/components/agent-terminal/AgentTerminalPanel.tsx`, mounted in
  `App.tsx`'s canvas chrome (not in `__EXPORT_MODE__`, not in presentation
  mode). It is docked flush left, full height, and resizable from its right
  edge by pointer and arrow keys, following the `DocumentsSidebar` pattern.
  While open and docked it sets `--agent-terminal-w` on `<html>`. On the mobile
  breakpoint it overlays full width and does not set the variable.
- **Header**: title "Agent terminal", connection status (connecting /
  connected / exited / disconnected), "Insert selection", "Restart" (shown when
  exited), "Kill shell" (asks for confirmation through the existing
  `confirmDelete`-style dialog, or `window.confirm` if no fitting dialog
  exists), and Close (closes the panel only).
- **Body**: an xterm.js `Terminal` with `FitAddon`, refitted on panel resize and
  window resize, and sending `resize` after each fit. Theme colours come from
  the app's CSS tokens.
- **Key isolation**: the panel root registers a native `keydown`/`keyup`
  listener that calls `e.stopPropagation()`. Window and document listeners
  (`useKeyboardShortcuts` incl. `mod+k`/`mod+f`, `Canvas.tsx` Space-pan, the
  dialogs) never see keys typed into the terminal. Focus leaves by clicking the
  canvas or the header Close button.
- **Socket client** `src/lib/agentTerminal/client.ts`: connects to
  `ws://${location.host}/__agent-terminal?token=…` and reconnects with backoff
  (0.5s → 5s cap) while the panel is mounted. On `replay` it calls
  `terminal.reset()` and then writes the data.
- **Layout shift**: everything left-anchored or centred on the canvas reads
  `--agent-terminal-w` (default `0px`). That covers the `<main>` canvas
  (`left`), `FloatingToolRail` (`left: calc(14px + var)`), `FloatingViewsPanel`
  (`left: calc(70px + var)`), `FloatingTopPill` (its `left: 0` wrapper and the
  centred pill), `FloatingBottomStrip` (centred), and `MultiSelectBar` (centre
  maths). Centre formulas become
  `calc(var(--agent-terminal-w, 0px) + (100% - var(--agent-terminal-w, 0px) - var(--docs-sidebar-w, 0px)) / 2)`.
- **Palette commands** (`src/lib/commands.ts`, category `view`):
  - `toggle-agent-terminal` "Toggle Agent Terminal", `when: isAgentTerminalAvailable`;
  - `send-selection-to-terminal` "Send Selection to Agent Terminal",
    `when`: available, panel open, and an element or relationship is
    selected. It does what the header "Insert selection" button does.
- **Send selection** inserts text and **does not** press Enter. Format (pure,
  unit-tested `formatSelectionForAgent`):
  `[c4hero file=<activeWorkspaceFilename> view=<activeViewKey> elements=<id>,<id>] `
  or `… relationship=<id>] `. Keys whose values are absent are omitted. The
  text goes to the PTY as one `input` message. The panel and the palette
  command share one tiny event bus (`agentTerminalBus.ts`) so the palette can
  reach the mounted panel.

## Current Implementation Analysis

- **Reuse**
  - `scripts/dev.mjs`: flag parsing and env handoff (the `--workspace` pattern).
  - `vite.config.ts`: the `document-links` plugin's `configureServer` pattern,
    and the `tighten-csp-in-prod` plugin's `transformIndexHtml` `ctx.server`
    check.
  - `src/lib/docPath.ts` `docsRootFor()`: git root of the workspace folder (the
    same root the docs use).
  - `src/components/layout/DocumentsSidebar.tsx`: docked panel, CSS-var
    lifecycle, pointer/keyboard resize, viewport clamp, mobile overlay.
  - `src/store/settings.ts`: persisted open/width settings and their read guards.
  - `src/lib/commands.ts`: `Command` shape and the `toggle-documents-sidebar`
    entry.
  - `src/hooks/useExternalFileReload.ts`: already reloads agent edits. Unchanged.
  - `src/hooks/useBreakpoint.ts`: mobile detection.
- **To modify**: `scripts/dev.mjs`, `vite.config.ts`, `tsconfig.node.json`,
  `package.json`, `package-lock.json`, `src/store/settings.ts`,
  `src/lib/commands.ts`, `src/App.tsx`, `src/components/layout/FloatingToolRail.tsx`,
  `FloatingViewsPanel.tsx`, `FloatingTopPill.tsx`, `FloatingBottomStrip.tsx`,
  `MultiSelectBar.tsx`, `README.md`, `docs/FEATURES.md`, `CHANGELOG.md`.
- **To create**: `src/lib/agentTerminal/{protocol,guards,session,selection,availability,client,agentTerminalBus}.ts`
  plus tests, `dev-server/agentTerminalPlugin.ts`,
  `src/components/agent-terminal/AgentTerminalPanel.tsx` plus test,
  `scripts/devArgs.mjs` plus test (see Task 1.3).

## Technical Context

- **Stack:** Node ≥ 22, npm ≥ 10. React ^19.2, TypeScript strict, Vite ^8.2,
  zustand + immer, Tailwind v4 plus inline styles with CSS variables,
  lucide-react ^1.34. Vitest (jsdom, globals, `src/test-setup.ts`),
  `@testing-library/react`. Dark-only UI.
- **New devDependencies** (verify the latest versions with `npm view` at install
  time, pin as caret): `node-pty` ^1.1.0, `ws` ^8.22.0, `@types/ws`,
  `@xterm/xterm` ^6.0.0, `@xterm/addon-fit` ^0.11.0. Check with
  `npm view @xterm/addon-fit peerDependencies` that the addon fits xterm 6.
  Everything is a devDependency, as decided: the panel is never in a production
  bundle.
- **TS projects:** `tsconfig.app.json` covers `src/` (DOM libs, **no Node
  types**). `src/lib/agentTerminal/*` must therefore stay free of Node imports.
  `tsconfig.node.json` covers `vite.config.ts` and `vite.cli.config.ts`. Add
  `dev-server/**/*.ts` to its `include`. The Node glue (node-pty, ws, crypto,
  http upgrade) lives only in `dev-server/agentTerminalPlugin.ts`.
  `vite.config.ts` already imports `./src/lib/*.ts` with explicit `.ts`
  extensions, so do the same.
- **Conventions:** path alias `@/` → `src/` (app code only; `vite.config.ts` and
  `dev-server/` use relative `.ts` imports). Loggers via
  `createLogger('<name>')` from `@/lib/logger`. Comments explain *why*; match
  the density of `vite.config.ts`/`DocumentsSidebar.tsx`. Chrome elements carry
  `data-canvas-chrome="…"` (fit-viewport measures them by DOM rect). Settings
  reads go through the guarded `read*` helpers in `settings.ts`.
- **Vitest scope:** `include: ['src/**/*.test.{ts,tsx}']`. Pure terminal logic
  is tested under `src/lib/agentTerminal/`. `scripts/devArgs.mjs` is tested from
  `src/lib/agentTerminal/devArgs.test.ts` (relative import). Tests that need Node
  APIs use `// @vitest-environment node` on line 1.
- **Commands (verbatim):**
  - single unit test file(s): `npx vitest run <path> [<path>…]`
  - lint scoped: `npx eslint <paths>`
  - typecheck: `npm run typecheck`
  - full unit: `npm test` · lint: `npm run lint` · build: `npm run build`
  - viewer/plugin builds: `npm run build:viewer -- <args>` (see
    `scripts/build-viewer.mjs` for its args) · `npm run build:plugin`
  - full E2E: `npm run test:e2e`
  - dev server: `npm run dev` (port 3004, `strictPort`); with the terminal:
    `npm run dev -- --workspace <dir> --terminal`

## Security Considerations

- This is the repo's first endpoint that **executes code**. The four guards
  (loopback socket, localhost `Host`, localhost `Origin`, per-start token) are
  mandatory. Any failing guard means 403 with no PTY touched. The `Origin`
  check plus the token stop cross-site WebSocket hijacking from other tabs.
  The `Host` check stops DNS rebinding.
- The token lives only in the dev-served `index.html` meta and in memory. Never
  log it. Don't put it in `localStorage`, and don't send it to Sentry or
  analytics (the observability init must not capture the WS URL, so check
  `src/lib/observability/`).
- `dev.mjs` refuses the tunnel and LAN configurations (`VITE_HMR_TUNNEL`,
  `VITE_ALLOWED_HOSTS`, `--host`) up front. The socket-level loopback check is
  the backstop if a user edits `vite.config.ts` or passes `--host` some other
  way.
- `parseClientMessage` rejects anything that isn't one of the four shapes, and
  bounds `cols`/`rows`. Input is otherwise passed through. The user owns the
  shell.
- The shell inherits the full dev-server env (user decision). `VITE_*`, `npm_*`
  and `NODE_ENV=development` will be visible to the agent.

## Phases and Tasks

### Phase 1: Server side

**Goal:** the dev server can host one guarded, persistent PTY session, enabled
only by `--terminal`.

Parallel group A: Tasks 1.1 and 1.3. They are independent and their files are
disjoint. Task 1.2 imports 1.1's `protocol.ts`, so it runs after 1.1. Task 1.4
consumes 1.1 and 1.2 and runs last.

- [x] **Task 1.1: Protocol and guards (pure).** Create
  `src/lib/agentTerminal/protocol.ts` and `src/lib/agentTerminal/guards.ts`
  exactly per the contracts in Proposed Solution. Tests: `parseClientMessage`
  accepts the 4 shapes and rejects malformed JSON, unknown types, non-string
  `data`, and non-integer/zero/huge `cols`/`rows` (clamped or rejected, but
  documented). `checkUpgrade` passes for each allowed loopback/host combination
  with the right token and fails with a distinct `reason` for: non-loopback
  remote, `evil.com` host, wrong port, missing origin, foreign origin
  (`http://evil.com`, `http://localhost:3005`), missing/short/wrong token, and
  wrong path. `tokensEqual` handles unequal lengths.
  - **Files:** `src/lib/agentTerminal/protocol.ts` (create), `src/lib/agentTerminal/protocol.test.ts` (create), `src/lib/agentTerminal/guards.ts` (create), `src/lib/agentTerminal/guards.test.ts` (create)
  - **Definition of Done:**
    - [x] `npx vitest run src/lib/agentTerminal/protocol.test.ts src/lib/agentTerminal/guards.test.ts` passes
    - [x] `npx eslint src/lib/agentTerminal/protocol.ts src/lib/agentTerminal/protocol.test.ts src/lib/agentTerminal/guards.ts src/lib/agentTerminal/guards.test.ts` clean
    - [x] neither source file imports a `node:` module (grep)

- [x] **Task 1.2: TerminalSession (pure, injected PTY).** Create
  `src/lib/agentTerminal/session.ts` per the contract, importing the message
  types from `./protocol` (Task 1.1). Tests with a fake `PtyLike`: lazy spawn on first attach;
  a second attach does not respawn; attach sends `replay` with prior output;
  the ring buffer trims to `scrollbackBytes` (test with a small value); input
  and resize reach the PTY; exit is broadcast to all clients and the buffer is
  kept; `restart` after exit respawns; `kill` kills; detach of the last client
  does **not** kill; `dispose` kills and ignores later messages.
  - **Files:** `src/lib/agentTerminal/session.ts` (create), `src/lib/agentTerminal/session.test.ts` (create), `src/lib/agentTerminal/protocol.ts` (reuse, created in Task 1.1)
  - **Definition of Done:**
    - [x] `npx vitest run src/lib/agentTerminal/session.test.ts` passes
    - [x] `npx eslint src/lib/agentTerminal/session.ts src/lib/agentTerminal/session.test.ts` clean

- [x] **Task 1.3: `--terminal` flag in `dev.mjs`.** Extract argument parsing from
  `scripts/dev.mjs` into `scripts/devArgs.mjs`, which exports
  `parseDevArgs(argv, env, platform)` and returns
  `{ viteArgs, workspacePath?, terminal: boolean, error?: string }`. Keep the
  existing `--workspace`/`--workspace=` behaviour identical. Add `--terminal`
  with these errors: `win32` → "--terminal is not supported on Windows yet";
  no `--workspace` → "--terminal requires --workspace <dir>"; `VITE_HMR_TUNNEL`
  or `VITE_ALLOWED_HOSTS` set → "--terminal is localhost-only; unset
  VITE_HMR_TUNNEL/VITE_ALLOWED_HOSTS"; `--host` or `--host=…` in the Vite args →
  "--terminal is localhost-only; remove --host". `dev.mjs` prints the error and
  exits 1, and on success sets `C4HERO_AGENT_TERMINAL=1` in the child env. Test
  from `src/lib/agentTerminal/devArgs.test.ts`
  (`// @vitest-environment node`) with every branch, using a real temp dir for
  `--workspace`. Update the header comment of `dev.mjs`.
  - **Files:** `scripts/devArgs.mjs` (create), `scripts/dev.mjs` (modify), `src/lib/agentTerminal/devArgs.test.ts` (create)
  - **Definition of Done:**
    - [x] `npx vitest run src/lib/agentTerminal/devArgs.test.ts` passes
    - [x] `npx eslint scripts/devArgs.mjs scripts/dev.mjs src/lib/agentTerminal/devArgs.test.ts` clean
  - **Deviation:** `devArgs.test.ts` runs under the default jsdom environment
    without the `@vitest-environment node` pragma, because
    `src/test-setup.ts` touches `window.matchMedia` unconditionally and fails
    under `node`. The test only uses `node:fs`/`os`/`path`, which work in jsdom.
  - **Clues:** directory validation (exists, is a directory) currently happens
    in `dev.mjs`. Move it into `parseDevArgs` so it is tested.

- [x] **Task 1.4: Vite plugin, dependencies and wiring.** Add the
  devDependencies (Technical Context) with `npm install -D`, which updates
  `package.json` and `package-lock.json`. Create
  `dev-server/agentTerminalPlugin.ts` exporting `agentTerminalPlugin(): Plugin`
  as described in Proposed Solution → Enablement chain and Session: env gate,
  token, `transformIndexHtml` meta (dev only), lazy `import('node-pty')` and
  `import('ws')`, `WebSocketServer({ noServer: true })`, `upgrade` handler that
  ignores other paths, runs `checkUpgrade` with the server's resolved port, and
  on failure writes 403 and destroys the socket. It also wires one
  `TerminalSession` whose spawn uses `docsRootFor(process.env.VITE_DEV_WORKSPACE_PATH)`
  and the spec'd env, decodes messages with `parseClientMessage` (closing the
  socket with code 1008 on a malformed one), and runs cleanup on
  `httpServer.close` and process signals. On a `node-pty` load failure, log one
  clear error ("agent terminal disabled: node-pty failed to load: …"), refuse
  upgrades, and skip the meta tag. Register it in `vite.config.ts` next to
  `document-links`, excluded when `exportBuild`. Add `"dev-server"` to
  `tsconfig.node.json` `include`.
  - **Files:** `dev-server/agentTerminalPlugin.ts` (create), `vite.config.ts` (modify), `tsconfig.node.json` (modify), `package.json` (modify), `package-lock.json` (modify), `src/lib/agentTerminal/guards.ts` (reuse, Task 1.1), `src/lib/agentTerminal/protocol.ts` (reuse, Task 1.1), `src/lib/agentTerminal/session.ts` (reuse, Task 1.2), `src/lib/docPath.ts` (reuse)
  - **Definition of Done:**
    - [x] `npm run typecheck` passes
    - [x] `npx eslint dev-server/agentTerminalPlugin.ts vite.config.ts` clean
    - [x] `npm run build` succeeds, and `grep -r "c4hero-agent-terminal" dist/` finds nothing
  - **Stop Rule:** if `node-pty` fails to install or to spawn on this machine
    (e.g. `posix_spawnp failed` from a non-executable `spawn-helper` in the
    prebuild), stop and report the exact error. Don't switch PTY libraries or
    add postinstall hacks.
  - **Deviation (user decision, 2026-10-23):** the Stop Rule fired. `node-pty`
    1.1.0 (latest stable) ships `prebuilds/darwin-*/spawn-helper` as
    `-rw-r--r--`, so every spawn fails with `posix_spawnp failed`. The user
    chose a runtime fix: before the first spawn, the plugin resolves
    `node-pty`'s `spawn-helper` for the current platform/arch and, if it lacks
    the execute bit, `chmod`s it to add `+x` and logs one line. No
    `postinstall`, no build/CI effect, and a no-op once a fixed prebuild ships.
    If the chmod fails, treat it as a node-pty load failure (log, refuse
    upgrades, skip the meta).
  - **Clues:** Vite's HMR upgrade listener filters on the `vite-hmr`
    subprotocol, so a second `upgrade` listener that returns early for other
    paths coexists with it. Use `server.config.server.port`/the bound address
    for the port. The token must never be logged.

**Verification:** `npx vitest run src/lib/agentTerminal/` and `npm run typecheck`

### Phase 2: Client panel

**Goal:** the panel, settings, layout shift and palette commands exist and
attach to the session.

Parallel group B: Tasks 2.1 and 2.2. They are independent and their files are
disjoint. Task 2.3 consumes both. Task 2.4 runs in parallel with 2.3 (disjoint
files; it consumes only 2.1's settings).

- [x] **Task 2.1: Settings, availability, selection formatter, bus.** Add
  `agentTerminalOpen` and `agentTerminalWidth` (+ exported
  `AGENT_TERMINAL_MIN_WIDTH = 360`, `AGENT_TERMINAL_MAX_WIDTH = 1200`,
  `AGENT_TERMINAL_DEFAULT_WIDTH = 560`) to `src/store/settings.ts`, with guarded
  reads mirroring the documents-sidebar ones. Create
  `src/lib/agentTerminal/availability.ts`
  (`isAgentTerminalAvailable(): boolean` and `agentTerminalToken(): string | null`,
  reading the meta and gated on `import.meta.env.DEV`),
  `src/lib/agentTerminal/selection.ts` (`formatSelectionForAgent({ filename,
  viewKey, elementIds, relationshipId }): string | null`, null when nothing is
  selected) and `src/lib/agentTerminal/agentTerminalBus.ts` (a tiny typed
  emitter: `insertText(text)`, `onInsertText(cb) → unsubscribe`). Tests: the
  settings defaults and clamping of out-of-range persisted width; availability
  with and without the meta; formatter output for elements, a relationship,
  missing view and missing filename, and the trailing space with no newline.
  - **Files:** `src/store/settings.ts` (modify), `src/store/settings.test.ts` (modify), `src/lib/agentTerminal/availability.ts` (create), `src/lib/agentTerminal/availability.test.ts` (create), `src/lib/agentTerminal/selection.ts` (create), `src/lib/agentTerminal/selection.test.ts` (create), `src/lib/agentTerminal/agentTerminalBus.ts` (create)
  - **Definition of Done:**
    - [x] `npx vitest run src/store/settings.test.ts src/lib/agentTerminal/availability.test.ts src/lib/agentTerminal/selection.test.ts` passes
    - [x] `npx eslint src/store/settings.ts src/lib/agentTerminal/availability.ts src/lib/agentTerminal/selection.ts src/lib/agentTerminal/agentTerminalBus.ts` clean

- [x] **Task 2.2: Socket client.** Create `src/lib/agentTerminal/client.ts`:
  `connectAgentTerminal({ token, onMessage, onStatus }) → { send(msg:
  ClientMessage), close() }`. It builds the URL from `location.host` and the
  `AGENT_TERMINAL_PATH`, reconnects with backoff 500ms doubling to a 5s cap
  (reset on open), stops on `close()`, and reports status `connecting` /
  `connected` / `disconnected`. Unit test with a fake `WebSocket` (stub
  `globalThis.WebSocket`): URL and token encoding, the backoff sequence (fake
  timers), no reconnect after `close()`, messages parsed and forwarded, and
  `send` while disconnected dropped (not queued).
  - **Files:** `src/lib/agentTerminal/client.ts` (create), `src/lib/agentTerminal/client.test.ts` (create), `src/lib/agentTerminal/protocol.ts` (reuse, Task 1.1)
  - **Definition of Done:**
    - [x] `npx vitest run src/lib/agentTerminal/client.test.ts` passes
    - [x] `npx eslint src/lib/agentTerminal/client.ts src/lib/agentTerminal/client.test.ts` clean

- [x] **Task 2.3: AgentTerminalPanel and mounting.** Create
  `src/components/agent-terminal/AgentTerminalPanel.tsx` (default export) per
  Proposed Solution → Client UI: docked left, resize handle on the right edge
  (pointer and ArrowLeft/ArrowRight, `role="separator"`,
  `aria-orientation="vertical"`, `aria-valuenow`), `--agent-terminal-w`
  lifecycle, mobile overlay, header with status and buttons
  (`aria-label`s "Insert selection", "Restart shell", "Kill shell", "Close
  terminal"), xterm `Terminal` and `FitAddon` (import
  `@xterm/xterm/css/xterm.css`), `ResizeObserver`-driven fit plus `resize`
  message, replay handling (`reset()` then write), `onInsertText` from the bus,
  and native `keydown`/`keyup` `stopPropagation` on the root. It is rendered as
  `<aside aria-label="Agent terminal" data-canvas-chrome="agent-terminal">`. In
  `App.tsx`, lazy-import it **inside** an `import.meta.env.DEV` branch and render
  `{import.meta.env.DEV && agentTerminalOpen && isAgentTerminalAvailable() &&
  !presentationMode && <Suspense fallback={null}><AgentTerminalPanel/></Suspense>}`
  in the canvas chrome (not in `__EXPORT_MODE__`). Set `<main>`'s
  `left: 'var(--agent-terminal-w, 0px)'`. Test (`AgentTerminalPanel.test.tsx`)
  with `@xterm/xterm` and `client.ts` mocked: the CSS var is set while open on
  desktop and removed on unmount; it is not set on mobile; a `keydown`
  dispatched inside the panel does not reach a `window` listener; "Insert
  selection" sends one `input` message with the formatted text and no `\r`;
  Close updates `agentTerminalOpen` to false; and on replay `reset` is called
  before write.
  - **Files:** `src/components/agent-terminal/AgentTerminalPanel.tsx` (create), `src/components/agent-terminal/AgentTerminalPanel.test.tsx` (create), `src/App.tsx` (modify), `src/components/layout/DocumentsSidebar.tsx` (reuse), `src/lib/agentTerminal/*` (reuse, Tasks 1.1, 2.1, 2.2)
  - **Definition of Done:**
    - [x] `npx vitest run src/components/agent-terminal/AgentTerminalPanel.test.tsx src/App.test.tsx` passes
    - [x] `npx eslint src/components/agent-terminal/AgentTerminalPanel.tsx src/components/agent-terminal/AgentTerminalPanel.test.tsx src/App.tsx` clean
    - [x] `npm run typecheck` passes
  - **Clues:** `DocumentsSidebar.tsx:60-140` has the drag, clamp and CSS-var code
    to mirror (left-anchored, so the drag delta sign flips). xterm needs a
    non-zero-size container before `open()`. Fit after mount in a rAF.

- [x] **Task 2.4: Chrome layout shift and palette commands.** Make the chrome
  respect `--agent-terminal-w` per Proposed Solution → Layout shift, in
  `FloatingToolRail.tsx`, `FloatingViewsPanel.tsx`, `FloatingTopPill.tsx`,
  `FloatingBottomStrip.tsx` and `MultiSelectBar.tsx` (its JS centre maths reads
  both vars). Add `toggle-agent-terminal` and `send-selection-to-terminal` to
  `src/lib/commands.ts` (icons `SquareTerminal` and `TextCursorInput`, keywords
  `terminal, shell, agent, claude, cli` / `selection, send, agent, terminal`),
  with the `when` rules from Proposed Solution. The send command calls
  `formatSelectionForAgent` and `insertText`. Extend `src/lib/commands.test.ts`:
  both commands are hidden when unavailable, toggle flips the setting, and send
  is hidden with no selection or with the panel closed and emits on the bus
  otherwise. Extend `MultiSelectBar` and `FloatingTopPill` tests only where they
  already assert positioning maths.
  - **Files:** `src/components/layout/FloatingToolRail.tsx` (modify), `src/components/layout/FloatingViewsPanel.tsx` (modify), `src/components/layout/FloatingTopPill.tsx` (modify), `src/components/layout/FloatingBottomStrip.tsx` (modify), `src/components/layout/MultiSelectBar.tsx` (modify), `src/components/layout/MultiSelectBar.test.tsx` (modify), `src/lib/commands.ts` (modify), `src/lib/commands.test.ts` (modify), `src/lib/agentTerminal/selection.ts` (reuse, Task 2.1), `src/lib/agentTerminal/availability.ts` (reuse, Task 2.1), `src/lib/agentTerminal/agentTerminalBus.ts` (reuse, Task 2.1)
  - **Definition of Done:**
    - [x] `npx vitest run src/lib/commands.test.ts src/components/layout/MultiSelectBar.test.tsx src/components/layout/FloatingTopPill.test.tsx src/components/layout/FloatingToolRail.test.tsx src/components/layout/FloatingViewsPanel.test.tsx src/components/layout/FloatingBottomStrip.test.tsx` passes
    - [x] `npx eslint` on the 8 modified files is clean
    - [x] with the variable unset, every modified style resolves to today's value (the `, 0px` fallback is present in each `var()`; grep)

**Verification:** `npx vitest run src/lib/agentTerminal/ src/components/agent-terminal/ src/lib/commands.test.ts` and `npm run build`

### Phase 3: Docs

- [x] **Task 3.1: Docs.** `README.md`: in the dev section after `--workspace`,
  add a short "Agent terminal (dev only)" paragraph with the command, the
  requirements (macOS/Linux, `--workspace`, localhost only), the palette entry,
  and a one-line security note. `docs/FEATURES.md`: an "Agent terminal (dev
  server only)" bullet under "## File workflows". `CHANGELOG.md`: an
  `### Added` entry under `## [Unreleased]`.
  - **Files:** `README.md` (modify), `docs/FEATURES.md` (modify), `CHANGELOG.md` (modify)
  - **Definition of Done:**
    - [x] `README.md` contains `--terminal`
    - [x] `docs/FEATURES.md` contains "Agent terminal" under "## File workflows"
    - [x] `CHANGELOG.md` has an `### Added` entry mentioning the agent terminal under `## [Unreleased]`

### Phase 4: Final verification

Parallel pair: Tasks 4.1 and 4.2.

- [x] **Task 4.1: Code review** (`code-reviewer`): the plan path plus every
  changed file. It runs `npm run lint`, `npm run typecheck`, `npm test` and
  `npm run build`. Functional and E2E verification run in the parallel
  verifier. Focus areas: the four guards are enforced before any PTY access;
  the token is never logged or persisted; `node-pty`/`ws` are imported only
  behind the env gate; and the panel chunk is absent from `dist/`.
  - **Outcome:** security focus areas passed. Fixed as scoped follow-ups:
    a client attaching after the PTY exited now gets `exit` after `replay`,
    and `restart` re-broadcasts `replay`; a throwing `spawn()` sends an
    `error` message instead of crashing Vite; the two palette commands are
    behind `import.meta.env.DEV`; the scrollback trim drops the partial first
    line; the spawn-helper chmod resolves `node-pty` via
    `createRequire(import.meta.url)`. Open: on Linux (CI, Vercel), `node-pty`
    1.1.0 has no prebuild and compiles from source at install time.
    `DeploymentElementProperties.test.tsx` fails on the base branch too
    (lucide mock lacks `Plus`), unrelated to this change.
- [x] **Task 4.2: Functional verification** (`feature-verifier`): executes
  `specifications/client-agent-terminal/client-agent-terminal.verification.md`.
  - **Outcome:** scenario 0 passed (189 passed, 1 skipped). Scenarios 1–3
    passed in a Playwright Chromium with `showDirectoryPicker` replaced by a
    disk-backed test shim, because the native macOS picker can't be automated.
    Defect found and fixed: `BottomHighlighterBar` (the TAG/STATUS/TECH/TEAM
    strip) and `CanvasHints` were centred on the viewport and overlapped the
    panel. They now use the same centre formula as the other chrome. These two
    files were missing from Task 2.4's list.

## Acceptance Criteria

- [ ] `npm run dev -- --workspace <dir> --terminal` starts. The palette shows "Toggle Agent Terminal" and opens a left-docked terminal running the login shell in the git root of `<dir>`.
- [ ] `echo $C4HERO_WORKSPACE` prints `<dir>`. `claude` (or `vim`/`htop`) renders and resizes correctly.
- [ ] Opening the panel pushes the tool rail, views panel, top pill, bottom strip and canvas to the right. Closing it restores them.
- [ ] Keys typed in the terminal (incl. Cmd/Ctrl+K, Cmd/Ctrl+F, Backspace, Delete, Space, Esc) never trigger app shortcuts.
- [ ] A `c4hero` CLI edit to the open `.dsl` from the terminal shows on the canvas without a manual reload.
- [ ] A page reload reattaches to the same running shell and replays recent output. Panel open state and width are remembered.
- [ ] "Insert selection" / "Send Selection to Agent Terminal" types the selection reference at the prompt without submitting it.
- [ ] `--terminal` refuses to start on Windows, without `--workspace`, with tunnel/allowed-host env vars, or with `--host`.
- [ ] WebSocket upgrades with a bad token, a foreign Origin, a non-localhost Host, or a non-loopback peer get 403 (unit-tested).
- [ ] Plain `npm run dev` and every production build show no palette command and serve no terminal endpoint.

## Improvements (Out of Scope)

- Automated build-exclusion check (grep `dist/` and `plugins/c4hero/viewer/` for
  the terminal meta name and xterm). Declined for v1. Task 1.4's DoD has a
  one-off grep only.
- An E2E spec driving a real PTY, plus access-refusal checks against a live
  server.
- Making `node-pty` an `optionalDependency` if contributors or Vercel hit
  native-build failures on `npm install`.
- Filtering `VITE_*`/`npm_*` vars out of the shell env.
- Multiple terminals or tabs, tmux-backed sessions that survive a dev-server
  restart, and Windows (ConPTY).
- A live dev-server endpoint exposing the current selection and view to the
  agent. A "flush autosave before agent writes" guard against edit races.
- A keyboard shortcut and tool-rail button for the terminal.
