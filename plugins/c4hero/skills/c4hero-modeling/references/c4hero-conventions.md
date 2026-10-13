# c4hero conventions

How c4hero stores what Structurizr DSL has no keyword for. Use the CLI flag when one exists; these keys matter when reading a `.dsl` or hand-editing it (see the `structurizr-dsl` skill).

## Identifiers

The element identifier in the DSL is the element's id (`orderService = container "Order Service" ...`). The CLI derives it from the name (camelCase, unique) or takes `--id`. `rename-id` rewrites it everywhere. Relationship ids (`rel-N`) are not stored: they are regenerated on each parse, so address relationships as `'src->dst'`.

## `properties { }` keys

c4hero hoists these reserved keys from an element or relationship `properties` block onto typed fields, and writes them back on save. Other keys stay as free-form properties (`update --property k=v`).

| Key | On | Values | CLI |
| --- | --- | --- | --- |
| `c4hero.status` | element | `Live`, `Planned`, `Deprecated`, `Removed`; anything else stays an ordinary property | `update --status` |
| `owner` (bare, no prefix) | element | free text, team or person | `update --owner` |
| `c4hero.location` | person, software system | `Internal`, `External`. Externality is also carried by the `External` tag | `add --external`, `update --location` |
| `c4hero.lineStyle` | relationship | `Curved`, `Straight`, `Orthogonal` | `relate`/`update-rel --line-style` |
| `c4hero.interactionStyle` | relationship | `Synchronous`, `Asynchronous` | `--interaction-style` |
| `c4hero.documents.<n>.path` | element, relationship | repo-relative `.md`/`.markdown` path | `link-doc` |
| `c4hero.documents.<n>.title` | element, relationship | link title | `link-doc --title` |

Example:

```
orderService = container "Order Service" "Handles orders." "Java" {
    properties {
        "owner" "Team Orders"
        "c4hero.status" "Planned"
        "c4hero.documents.0.path" "docs/order.md"
        "c4hero.documents.0.title" "Order Service"
    }
}
```

Document links are indexed from 0 with no gaps, and each needs both `.path` and `.title`. An incomplete or gapped entry is not treated as a link and stays an ordinary property. Do not hand-write them when `link-doc` can.

## Document links

- A link points to a local markdown file inside the project: relative path, ends in `.md` or `.markdown`, no `..`, absolute or dot-prefixed segment. The CLI rejects anything else.
- A relationship can carry links too (`link-doc 'orderService->postgres' --path ...`).
- A missing file is only a warning in `link-doc` and `check` (`missing-document`).
- `link-doc --create` scaffolds the file from the model and never overwrites. Replace the scaffold with real prose afterwards; the generated "Relationships" list is derived from the model and goes stale.
- Put docs in a stable folder (for example `docs/architecture/`) and one file per element; reuse one file for several elements only when they truly share the topic.

## Sidecar `<name>.c4hero.json`

Sits next to the `.dsl`, named after it. Holds only what the DSL cannot: per-view layout lock, and pinned or locked element positions (`{ "version": 1, "views": { "<viewKey>": { "locked": true, "elements": { "<id>": { "pinned": true, "x": 0, "y": 0 } } } } }`). It is absent when there is nothing to store. Older sidecars may carry `status`, `owner` and `lineStyle` entries; they are read for migration and no longer written.

- Never edit it by hand and never write one for a new model.
- Keys are element ids and view keys; the CLI re-keys on `rename-id` and prunes on `remove`.
- New elements get no position; c4hero lays them out when the view is opened. A layout-locked view keeps the new element unplaced, and the CLI warns.

## Views

View keys are free text; the CLI generates a readable one if `--key` is omitted (`<scopeId>-<type>`, or `landscape`; views created automatically by `add container`, `add component`, `move` or `apply` get the same kind of key). Add with `view add`, change contents with `view update --include/--exclude`. `autoLayout` direction is `TB`, `BT`, `LR` or `RL`.
