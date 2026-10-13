# c4hero CLI reference

Invoke as `node "${CLAUDE_PLUGIN_ROOT}/bin/c4hero.mjs" <command> ...` (abbreviated `c4hero` here). Source of truth: `c4hero help` and `c4hero help <command>`.

## Contents

- Output and errors
- Global behaviour
- Workspace commands: init, check, apply
- Read commands: list, show, views, graph
- Element commands: add, update, remove, rename-id, move
- Relationship commands: relate, update-rel, unrelate
- Document commands: link-doc, unlink-doc
- View commands: view, style, step
- Deployment: deploy
- Export: export
- Utility: version, help

## Output and errors

One JSON object on stdout: `{ ok, command, file?, changed?, data?, warnings[], error? }`.

- `changed`: `{ elements?: string[], relationships?: string[], views?: string[], styles?: string[] }`. Every mutating command returns it, and it lists only what the save actually changed: `{}` when the file and sidecar came out identical (re-running the same command, a no-op update). On `--dry-run` it shows what would change. Relationships appear as `src->dst` (or a `rel-N` id when linked by id); `styles` entries are `element:<tag>` or `relationship:<tag>`.
- `warnings`: strings (name clash, layout-locked view, missing doc file, rejected plan operations).
- `error`: `{ code, message, candidates? }`.
- `--pretty` prints human-readable text instead of JSON. Never parse `--pretty`.

| Exit | Codes | Meaning |
| --- | --- | --- |
| 0 | | ok |
| 1 | `USAGE`, `UNKNOWN_COMMAND`, `NOT_FOUND`, `AMBIGUOUS`, `MULTIPLE_WORKSPACES` | bad arguments or lookup; `candidates` lists alternatives (closest matches, ambiguous matches or the `.dsl` files found) |
| 2 | `PARSE_FAILED`, `VALIDATION` | DSL has parse errors (`candidates` = `line N: ...`), or the operation is invalid (e.g. moving a container into a container, an invalid or already used `--id`) |
| 3 | `LOSSY_FILE` | rewrite would drop comments, `!include`, `!const`/`!var`, `branding`, `terminology` and similar; `candidates` = findings with lines. `--force` overrides |
| 4 | `EXPORT_ENV` | no usable Chromium-based browser |
| 5 | `INTERNAL` | unexpected failure (a bug or an unhandled filesystem error); still one JSON object, never a stack trace. `C4HERO_DEBUG=1` prints the stack to stderr |

## Global behaviour

- Global flags: `--pretty`, `--file <dsl>`, `--help`.
- Workspace discovery: `--file`, else `.c4hero/config.json` `{"workspace": "..."}`, else the single `.dsl` under the git root (skips `node_modules`, `dist*`, dot-dirs). Several found: `MULTIPLE_WORKSPACES`.
- Unknown flags are rejected with `USAGE`: the message names them and `candidates` lists every flag the command accepts (`c4hero help <command>` lists them too). A typo such as `--descripton` never silently does nothing.
- Boolean flags (`--dry-run`, `--force`, `--external`, `--create`, `--fast`, `--overwrite`, `--response`) are on when present and off for `--flag=false`.
- Every mutating command takes `--dry-run` (no write; unified diff in `data.diff`) and `--force` (accept `LOSSY_FILE`). Writes are atomic (temp file plus rename); the sidecar is written next to the `.dsl` as `<name>.c4hero.json` only when it has data.
- Read commands (`list`, `show`, `views`, `graph`, `check`) never fail with `LOSSY_FILE`. A file with parse errors makes `list`/`show`/etc. exit 2 `PARSE_FAILED`; `check` reports the errors instead.
- Relationship refs: `'src->dst'` (quote it) or a `rel-N` id (unstable, avoid). Parallel edges: `--match "<description>"`.
- Repeated flags (`--add-tag a --add-tag b`) are allowed where shown with `...`.

## Workspace

### init
`c4hero init --template blank|microservices|monolith|eventDriven|bigBank [--name <name>] [--file <dsl>] [--overwrite]`
Creates a workspace from a template. Data: `{ template, name, sidecar }`. Refuses to replace an existing file without `--overwrite`, and a `--file` outside the project root (git root of the cwd, else the cwd) with `USAGE`.

### check
`c4hero check [--fast] [--file <dsl>]`
Data: `{ errors[], warnings[], info[], health: { filled, total, pct, gaps } | null }`. Each entry has `kind`, `message`, optional `id`/`line`. Kinds seen: `parse`, `missing-description`, `missing-technology`, `missing-relationship-label`, `orphan`, `missing-document`, `lossy-*` (info). `ok` is false when `errors` is non-empty: exit 2 `PARSE_FAILED` when they are parse errors, exit 2 `VALIDATION` for integrity or scope errors. `--fast` runs parse plus integrity only (what the post-edit hook runs).

### apply
`c4hero apply --plan <file.json> [--file <dsl>] [--dry-run] [--force]`
Applies an EditPlan `{ "operations": [...] }` atomically. Data: `{ applied, skipped, ops[], rejected[{index,reason}], refs{}, saved, renamedViews?, diff? }`. `saved` is `false` on `--dry-run`. Invalid operations are skipped with a warning and exit 0. Operations (new elements use a temporary `ref`; later ops refer to it):

| op | fields |
| --- | --- |
| `addPerson` | `ref`, `name`, `description?` |
| `addSoftwareSystem` | `ref`, `name`, `description?`, `external?` |
| `addContainer` | `ref`, `parent`, `name`, `description?`, `technology?` |
| `addComponent` | `ref`, `parent`, `name`, `description?`, `technology?` |
| `addRelationship` | `source`, `destination`, `description?`, `technology?` |
| `updateElement` | `id`, `name?`, `description?`, `technology?`, `location?` (`Internal`\|`External`, person/system only), `tags?` (added, never replaced), `status?`, `owner?` |
| `updateRelationship` | `id` (a `rel-N` id valid for this run), `description?`, `technology?` |
| `deleteElement` | `id` |
| `addView` | `viewType` (`systemLandscape`\|`systemContext`\|`container`\|`component`\|`dynamic`\|`deployment`), `scope?`, `title?` |

`parent`, `source`, `destination`, `scope` take a real id or an earlier `ref`.

## Read

- `c4hero list [--type person|softwareSystem|container|component] [--parent <ref>]`: `data.elements[]` of `{ id, type, name, parent?, description, technology?, tags }`.
- `c4hero show <ref>`: `{ id, type, name, description, technology, tags, properties, url, documents[{path,title}], status, owner, location, parent, children[], incoming[], outgoing[], views[] }`; relationships are `{ id, source, destination, description, technology }`.
- `c4hero views`: `data.views[]` of `{ key, type, title, scope, elements, relationships, autoLayout, locked }`.
- `c4hero graph [<ref>]`: `{ nodes[{id,type,name,parent}], edges[{id,source,destination,description,technology}] }`; with `<ref>` only that element's neighbourhood.

## Elements

### add
`c4hero add person|system|softwareSystem|container|component (<name> or --name <name>) [--parent <ref>] [--id <ident>] [--description <text>] [--technology <text>] [--tags a,b] [--external] [--file <dsl>] [--dry-run] [--force]`
The name is either the single positional after the type (`add container "Shipping Service" --parent platform`) or `--name`; giving both with different values is `USAGE`. `--parent` is required for container (a system) and component (a container). Data `{ id, name }`; `changed.elements` has the id. A duplicate name is created as `Name 2` with a warning. Adds the element to views the way the app's Add Element does; warns for layout-locked views. Adding a container or component also creates a container or component view for its parent if none exists, keyed `<parentId>-container` or `<parentId>-component` (reported in `data.renamedViews`).

### update
`c4hero update <ref> [--name] [--description] [--technology] [--url] [--add-tag t]... [--remove-tag t]... [--property k=v]... [--remove-property k]... [--status Live|Planned|Deprecated|Removed] [--owner] [--location Internal|External]`
`--location` only for person and system (`USAGE` otherwise). Bad `--status` is `USAGE`.

### remove
`c4hero remove <ref>`: removes the element, its children, its relationships, view entries and sidecar entries. Data `{ removedRelationships }`.

### rename-id
`c4hero rename-id <ref> <newId>`: changes the identifier in the element, relationships, views, groups, dynamic steps, deployment instances and sidecar.

### move
`c4hero move <ref> --to <parentRef>`: a container moves to another software system, a component to another container; anything else is exit 2 `VALIDATION`.

## Relationships

### relate
`c4hero relate <src> <dst> [--description] [--technology] [--interaction-style Synchronous|Asynchronous] [--line-style Curved|Straight|Orthogonal] [--tags a,b]`
Parallel relationships between the same pair are allowed.

### update-rel
`c4hero update-rel <relRef> [--match <current description>] [--description <new>] [--technology] [--interaction-style] [--line-style] [--url] [--add-tag t]... [--remove-tag t]... [--property k=v]... [--remove-property k]`
`--match` selects among parallel edges; without it a parallel pair is `AMBIGUOUS` with candidates `rel-N (description)`.

### unrelate
`c4hero unrelate <relRef> [--match <description>]`

## Documents

### link-doc
`c4hero link-doc <ref|relRef> --path <repo-relative.md> [--title <text>] [--create] [--match <description>]`
Path rules: relative to the project root, `.md` or `.markdown`, no `..`, absolute or hidden segments (`USAGE` otherwise). Relinking the same path updates the entry (`data.updatedExisting`) and keeps its title unless `--title` is given. A missing file warns. `--create` writes a stub (H1 name, description, technology, relationships list) and never overwrites; `data.created` tells if it did. Result `data`: `{ target, documents[], updatedExisting, created }`.

### unlink-doc
`c4hero unlink-doc <ref|relRef> --path <repo-relative.md> [--match <description>]`

## Views and styles

### view
```
c4hero view add --type landscape|context|container|component|dynamic|deployment [--scope <ref>] [--key <key>] [--title <t>] [--description <d>] [--environment <env>]
c4hero view update <key> [--include <ref|*>]... [--exclude <ref>]... [--auto-layout TB|BT|LR|RL] [--title <t>] [--description <d>]
c4hero view remove <key>
```
`--scope` is the system (context, container, dynamic) or container (component). `--environment` is for deployment views. `changed.views` lists the key. Without `--key` it is `<scopeId>-<type>` (`landscape` without a scope), made unique with `-2`, `-3`; a `--key` you give is kept as is.

Views that other commands create automatically (`add container`/`component`, `move`, `apply` `addView`) get the same readable default instead of a random key. `changed.views` shows the final keys and `data.renamedViews` maps the store's temporary key to the final one (`{}` is omitted when nothing was renamed).

### style
```
c4hero style element --tag <tag> [--background <c>] [--color <c>] [--shape <s>] [--border <b>] [--stroke <c>] [--thickness <n>] [--font-size <n>] [--opacity <n>] [--icon <url>]
c4hero style relationship --tag <tag> [--color <c>] [--thickness <n>] [--dashed true|false] [--font-size <n>] [--opacity <n>]
```

### step
```
c4hero step add --view <key> --from <ref> --to <ref> [--description <text>] [--response]
c4hero step move --view <key> --index N --to M
c4hero step remove --view <key> --index N
```
Dynamic views only; indexes are 1-based. A step reuses a relationship from `--from` to `--to`, or creates one when none exists (it then gets `--description` as its label; without `--description` it has no label and `check` flags it). `--response` marks a return step: it is a `USAGE` error if a forward relationship `--from` to `--to` already exists, so give it the reverse of an existing forward relationship.

## Deployment

```
c4hero deploy env add <name>
c4hero deploy node add --env <name> --name <text> [--parent <node>] [--technology <text>] [--instances <n>] [--id <ident>]
c4hero deploy instance add --node <ref> --of <containerOrSystemRef> [--env <name>]
c4hero deploy infra add --node <ref> --name <text> [--technology <text>] [--env <name>]
c4hero deploy remove <ref> [--env <name>]
```
`deploy remove` takes a node, instance or infrastructure id and removes it with everything under it. Removing an environment is not supported.

## Export

`c4hero export --view <key> --format png|svg [--theme light|dark] [--out <path>] [--padding <fraction, default 0.05>]`
Renders the view in a headless local Chromium-based browser (the OS default if Chromium-family, else the first installed one; `C4HERO_BROWSER` overrides). Does not modify the workspace and has no `--dry-run`. Data: `{ view, format, out, bytes, browser: { name, source } }`; default `out` is `<viewKey>.<format>` next to the `.dsl` file. `--out` must end in `.png` or `.svg` matching `--format`, stay inside the project root and contain no hidden (`.`-prefixed) or `..` segments (`USAGE` otherwise). Unknown view: `NOT_FOUND` listing view keys. No browser: exit 4.

## Utility

- `c4hero version`: prints the CLI version.
- `c4hero help [<command>]`: lists commands or prints usage for one. `c4hero <command> --help` is equivalent.
