---
description: Review the c4hero model against C4 modelling rules, rank the findings, and propose CLI fixes to apply on approval.
argument-hint: "[view-key]"
allowed-tools: Bash(node *c4hero.mjs*), Read, Glob, Grep
---

Review the c4hero model. Apply the C4 rules in the `c4hero-modeling` skill (its `references/c4-modeling-rules.md`).

The CLI is `node "${CLAUDE_PLUGIN_ROOT}/bin/c4hero.mjs"`; below it is written `c4hero`.

Scope: `$ARGUMENTS`. If it names a view key, review that view's elements and relationships. If empty, review the whole model. Run `c4hero views` to resolve a key.

1. Run `c4hero check` and keep its parse, integrity, scope, model-health, orphan and document-link findings.
2. Read the model with `c4hero list`, `c4hero graph` and `c4hero show <ref>` as needed.
3. Review against the C4 rules: element at the right level, clear names, verb-phrase relationship labels, technology on containers and relationships, external vs internal, no orphans, views of a sensible size.
4. Present findings ranked by severity (errors from `check` first, then rule violations, then polish). Each finding gives the element or relationship, the problem, and the exact `c4hero` command that would fix it.
5. Apply nothing until the user approves. Apply only the approved fixes, then run `c4hero check` and report the result.
