---
name: c4hero-modeling
description: Creates and edits C4 architecture models in Structurizr DSL (.dsl) and c4hero sidecar (.c4hero.json) files through the c4hero CLI. Use when the user mentions c4hero, Structurizr, a workspace.dsl, a .c4hero.json, C4 diagrams, an architecture diagram or model, or asks to add, rename, relate, link docs to, validate or export architecture elements and views.
---

# c4hero modeling

c4hero keeps a C4 model in a Structurizr `.dsl` file (plus an optional
`<name>.c4hero.json` sidecar holding view layout). The bundled CLI reads and
writes both through the same code the c4hero app uses, so its output is
canonical DSL with readable identifiers. Prefer it to hand edits.

## Running the CLI

Every example below abbreviates this command as `c4hero`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/c4hero.mjs" <command> [args] [flags]
```

Claude Code substitutes `${CLAUDE_PLUGIN_ROOT}` in this file with the plugin's
absolute path before you read it. It is **not** an environment variable in
Bash, so write the resolved path into the command; do not rely on `$CLAUDE_PLUGIN_ROOT`
at run time. If the text above still shows a literal `${CLAUDE_PLUGIN_ROOT}`,
use `${CLAUDE_SKILL_DIR}/../../bin/c4hero.mjs` or the skill's base directory
plus `../../bin/c4hero.mjs`. Needs Node 22 or newer.

Every command prints one JSON object (`ok`, `command`, `file`, `changed`,
`data`, `warnings`, `error`). Add `--pretty` only for human reading. Exit codes:
0 ok, 1 usage or lookup error, 2 parse or validation error, 3 lossy file,
4 export environment, 5 internal error. `changed` is `{}` when nothing changed;
unknown flags are rejected. Full flags and shapes: [cli-reference.md](./references/cli-reference.md).

## Workflow: read, mutate, check, export

1. **Read.** `c4hero list`, `show <ref>`, `views`, `graph [<ref>]` before changing
   anything. Never assume ids; read them.
2. **Mutate.** One CLI command per change, or `apply --plan` for many (below).
   Preview any mutation with `--dry-run`: it prints a unified diff in
   `data.diff` and writes nothing.
3. **Check.** `c4hero check` after every batch of changes. Fix `errors`, then
   read `warnings` (missing descriptions or technology, orphans, missing doc
   files) and fix those that matter.
4. **Export** (only if asked). `c4hero export --view <key> --format png|svg`.

The CLI finds the workspace itself: `--file`, else `.c4hero/config.json`
(`{"workspace": "path/to/workspace.dsl"}`), else the single `.dsl` under the
git root. With several it fails `MULTIPLE_WORKSPACES` and lists them in
`error.candidates`; pass `--file`. No workspace yet: `c4hero init --template
blank|microservices|monolith|eventDriven|bigBank --file <path>`.

## Addressing

- **Elements** (`<ref>`): an identifier (`orderService`, or hierarchical
  `platform.apiGateway`), else a unique exact element name. An ambiguous name
  fails `AMBIGUOUS` with `candidates`; an unknown one fails `NOT_FOUND` with the
  closest matches.
- **Relationships** (`<relRef>`): address as `'src->dst'`, always quoted in the
  shell (an unquoted `>` is a redirect). Do **not** use `rel-N` ids: they are
  regenerated on every parse and can shift between CLI calls. When there are
  parallel edges between the same pair, the call fails `AMBIGUOUS` listing them;
  add `--match "<current description>"` to pick one.

```bash
c4hero update-rel 'orderService->billingService' --match "Reads from" --description "Queries invoices from"
c4hero unrelate 'orderService->billingService' --match "Sends invoices to"
```

## Identifiers and names

New elements get `--id <ident>` or an identifier derived from the name
(`"Order Service"` becomes `orderService`), never a random id. Keep names
unique: adding a name that already exists still succeeds but is created as
`Billing Service 2` with a warning (check `warnings`). Fix the clash with
`update <ref> --name` or `rename-id <ref> <newId>`; `rename-id` rewrites every
reference. `add` places the element in the views like the app does and warns
when a view is layout-locked (the element then has no position until the user
opens the view in c4hero).

## Many changes at once: `apply --plan`

Write a plan file and apply it in one atomic save. New elements get a temporary
`ref` that later operations reference; existing elements use their real id.

```json
{ "operations": [
  { "op": "addSoftwareSystem", "ref": "stripe", "name": "Stripe", "external": true },
  { "op": "addContainer", "ref": "billing", "parent": "platform", "name": "Billing Service",
    "description": "Issues invoices", "technology": "Go" },
  { "op": "addRelationship", "source": "billing", "destination": "stripe",
    "description": "Charges cards using", "technology": "HTTPS" },
  { "op": "updateElement", "id": "orderService", "owner": "Team Orders", "status": "Live" }
] }
```

Ops: `addPerson`, `addSoftwareSystem`, `addContainer`, `addComponent`,
`addRelationship`, `updateElement`, `updateRelationship` (by id), `deleteElement`,
`addView`. Fields per op are in the reference. Invalid operations are skipped
with a warning and exit 0, so read `data.rejected` and `data.skipped`.
`data.refs` maps each temporary ref to the real id. Use `--dry-run` first.

## When the CLI refuses: `LOSSY_FILE` (exit 3)

The CLI rewrites the whole file canonically, so it refuses (exit 3) when the
file has content it would drop: comments, `!include`, `!const`/`!var`, or
unmodelled constructs such as `branding` and `terminology`.
`error.candidates` lists each finding with its line. Read commands and `check`
never refuse (findings appear as `info`).

1. Explain to the user what would be lost, from `candidates`.
2. Ask the user which they prefer. Do not choose for them.
3. If they accept the loss, re-run with `--force` (use `--dry-run --force`
   first to show the diff).
4. Otherwise hand-edit the `.dsl` with Edit, following the `structurizr-dsl`
   skill. A hook runs `check --fast` after every `.dsl` edit and reports errors
   back; after a hand edit still run a full `c4hero check`.

## Docs, properties, sidecar

- Link documents to elements or relationships with `link-doc <ref|'src->dst'>
  --path docs/x.md --title "..." [--create]`. Paths are repo-relative, end in
  `.md`/`.markdown`/`.html`/`.htm`, no `..` or hidden segments. Linking an HTML
  file also bundles its relative assets (CSS, JS, images, fonts, media) next
  to it. A missing file only warns; `--create` scaffolds markdown only and
  never overwrites.
- Typed fields (`--status`, `--owner`, `--location`, `--line-style`,
  `--interaction-style`) are stored as properties in the DSL; see
  [c4hero-conventions.md](./references/c4hero-conventions.md).
- **Never edit `.c4hero.json` by hand.** It holds view layout (pinned
  positions, locks) and is written by the app and CLI. The CLI keeps it in sync
  on rename and remove.
- New elements get no position; c4hero lays them out when the view is opened.

## Export

`export --view <key> --format png|svg [--theme light|dark] [--out <path>]`
renders the real app in a local Chromium-based browser (Chrome, Edge, Brave,
Arc, Chromium, Vivaldi, Opera). `C4HERO_BROWSER=/path/to/binary` overrides
discovery. With none found it exits 4 with instructions. Safari or Firefox
alone are not enough. Without `--out` the file is `<viewKey>.<format>` next to
the `.dsl` file. Export never modifies the workspace.

## Known limitations

- Removing a deployment environment is not supported (`deploy remove` removes
  nodes, instances and infrastructure, not an environment). Hand-edit the DSL.
- `add container`, `add component`, `move` and `apply` `addView` can create a
  view automatically. It gets a readable key (`<scopeId>-container`,
  `<scopeId>-component`, `landscape`, ...), reported in `data.renamedViews`;
  use `views` to see all keys.
- The CLI never computes layout; only export renders one.

## Modeling quality

Apply [c4-modeling-rules.md](./references/c4-modeling-rules.md) whenever you add
or review elements: pick the right level, name things consistently, give every
relationship a verb phrase and a technology, and keep one view per scope. Load
it before creating more than a couple of elements.
