---
description: Find markdown docs in the repo that describe c4hero model elements or relationships, propose links, and apply them after confirmation.
argument-hint: "[element-ref]"
allowed-tools: Bash(node *c4hero.mjs*), Read, Glob, Grep
---

Link existing markdown documentation to the c4hero model. Follow the `c4hero-modeling` skill for CLI usage.

The CLI is `node "${CLAUDE_PLUGIN_ROOT}/bin/c4hero.mjs"`; below it is written `c4hero`.

Scope: `$ARGUMENTS`. If it names an element, restrict to that element and its relationships. If empty, cover the whole model.

1. Read the model: `c4hero list --pretty`, then `c4hero show <ref>` for each in-scope element to see its technology and existing `documents`.
2. Find candidate docs with Glob and Grep: `docs/`, `doc/`, ADR folders (`adr/`, `docs/adr/`, `docs/decisions/`), per-service READMEs, and any `*.md` or `*.markdown` that mentions an element's name, identifier or technology. Skip hidden directories, `node_modules` and files already linked.
3. Read the top of each candidate and keep only docs that clearly describe the element or relationship. Drop weak keyword matches.
4. Present the proposal as a table: element or `src->dst`, doc path (repo-root-relative), proposed title, and why it matches. Ask the user which links to apply. Do not write anything before they answer.
5. For each approved link run `c4hero link-doc <ref|src->dst> --path <path> --title "<title>"`. Use `--match <description>` when parallel edges share `src->dst`. Use `--create` only when the user asked for a new scaffold doc.
6. Run `c4hero check` and report the linked pairs, any warnings, and any new `check` findings.
