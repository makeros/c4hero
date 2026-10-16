---
name: structurizr-dsl
description: Structurizr DSL syntax reference for hand-editing .dsl workspace files. Use when the c4hero CLI refuses a file with LOSSY_FILE and the user does not want --force, when a change needs a construct the CLI does not model (comments, !include, !docs, perspectives, themes, branding), or when someone asks how to write workspace, model, views, styles or deployment in Structurizr DSL.
---

# Structurizr DSL for hand edits

The default way to change a c4hero workspace is the CLI (see the `c4hero-modeling`
skill). Edit the `.dsl` file by hand only in the cases below.

## When to hand-edit

| Situation | Action |
| --- | --- |
| CLI exits 3 with `LOSSY_FILE` | Show the user the listed findings. Ask whether to run again with `--force` (the listed constructs are lost) or to hand-edit. Never pass `--force` without that answer |
| Construct the CLI does not model (see the table in `dsl-syntax.md`) | Hand-edit |
| Reading or explaining existing DSL | Read only; no edit needed |

Otherwise use the CLI: it keeps ids, layout sidecar and document links consistent.

## Procedure

1. Read the whole `.dsl` file and its sidecar neighbour (`<name>.c4hero.json`, never edit it by hand).
2. Edit with the Edit tool, one small change at a time. Preserve comments and directives you
   were not asked to touch.
3. Validate: `check --file <path>` through the c4hero CLI as described in the
   `c4hero-modeling` skill. A plugin hook also runs `check --fast` after every `.dsl` edit
   and reports errors. Fix every error before finishing.
4. Report info findings (`lossy-*`) to the user as expected, not as failures.

## Rules that cause most errors

- Define an element before any relationship that references it (no forward references).
- Write relationships at `model` level: `a -> b "Label" "Technology"`. Do not use `this ->`
  or the `-> b` shorthand inside element blocks; c4hero rejects or drops them.
- Identifiers are unique across the file unless `!identifiers hierarchical` is on. Prefer flat
  identifiers (`ordersApi`); c4hero uses the identifier as the element id.
- Every `views` entry gets a key (`container shop "containers" { ... }`).
- A `container` view needs a software system; a `component` view needs a container.
- Quote any string with spaces. `#` starts a comment only outside quotes; colors such as
  `#ff0000` are fine in style blocks.

## References

| Reference | Load when |
| --- | --- |
| [dsl-syntax.md](./references/dsl-syntax.md) | You write or change any DSL, or you must decide whether the CLI can handle a file. Load before the first edit. It holds the syntax for every construct and the "What c4hero does not round-trip" table |

## c4hero conventions

Files may carry `c4hero.*` properties and document links stored as properties or tags.
Leave them intact. Their meaning is in the `c4hero-modeling` skill
(`references/c4hero-conventions.md`).
