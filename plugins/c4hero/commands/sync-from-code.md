---
description: Update the c4hero model from the current codebase by running the model-from-codebase workflow in update mode.
argument-hint: "[path-or-focus]"
allowed-tools: Bash(node *c4hero.mjs*), Read, Glob, Grep, Write
---

Bring the c4hero model in line with the code. Use the `model-from-codebase` skill in update mode: read the existing model first, then propose only additions, changes and removals, never a rebuild.

The CLI is `node "${CLAUDE_PLUGIN_ROOT}/bin/c4hero.mjs"`; below it is written `c4hero`.

Focus: `$ARGUMENTS`. If empty, cover the whole repository.

1. Run `c4hero list --pretty` to capture the current model. If no workspace exists, say so and ask whether to `c4hero init` one.
2. Follow `model-from-codebase` to discover services, data stores, queues and external APIs, and diff them against the model.
3. Present the proposed changes and wait for the user's confirmation before writing. Treat removals as destructive and confirm them separately.
4. Apply confirmed changes through `c4hero apply --plan <file.json>`, as the skill describes.
5. Run `c4hero check` and report changed ids and the result.

For a large repository (many services or deployables), suggest delegating this to the `architecture-modeler` agent so the discovery output stays out of this conversation.
