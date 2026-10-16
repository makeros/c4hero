# c4hero for Claude Code

Lets Claude Code model C4 architecture in Structurizr DSL through the `c4hero` CLI instead of hand-editing text, and checks every `.dsl` edit automatically.

## Install

```
/plugin marketplace add c4hero/c4hero
/plugin install c4hero@c4hero
```

From a local clone:

```
/plugin marketplace add ./path/to/c4hero
/plugin install c4hero@c4hero
```

No build step: the CLI bundle (`bin/c4hero.mjs`) and the export viewer (`viewer/`) are committed.

## Requirements

- Node.js 22 or newer.
- For `export` only: a Chromium-family browser (Chrome, Chromium, Edge, Brave). Set `C4HERO_BROWSER` to its executable path to override auto-detection.

## What is included

- Skills: `c4hero-modeling` (CLI workflow and C4 rules), `structurizr-dsl` (syntax reference for hand edits), `model-from-codebase` (derive a model from manifests and docs).
- Commands: `/c4hero:link-docs`, `/c4hero:review-model`, `/c4hero:sync-from-code`, `/c4hero:export`.
- Agent: `architecture-modeler` for multi-step modelling jobs.
- Hook: after Edit, Write or MultiEdit on a `.dsl` file, runs `c4hero check`. Parse and integrity errors are returned to Claude (exit 2) with the exact command to re-run, so it fixes them. Lines the parser tolerates but cannot model are only noted on stderr. Workspaces using `!include` are skipped (includes are not resolved). A CLI failure or timeout never blocks the edit.

## CLI quickstart

Inside Claude Code the skills, commands and agent run the bundle as `node "${CLAUDE_PLUGIN_ROOT}/bin/c4hero.mjs"`; Claude resolves the variable for you.

From a shell, call the bundle by its path. The installed plugin lives in the Claude Code plugin cache; `claude plugin list --json` prints it as `installPath` for the `c4hero@c4hero` entry:

```
C4HERO="$(claude plugin list --json | jq -r '.[] | select(.id == "c4hero@c4hero") | .installPath')/bin/c4hero.mjs"
node "$C4HERO" list --pretty
node "$C4HERO" check
```

Inside a clone of this repository, run the committed bundle directly (this path only exists there):

```
node plugins/c4hero/bin/c4hero.mjs init --help
node plugins/c4hero/bin/c4hero.mjs export --help
```

Every command prints JSON (`--pretty` for humans). `c4hero help` lists all commands and `c4hero help <command>` shows flags.

## Known limitations

- Files with comments, `!include`, `!docs`, `!adrs` or `!identifiers` are refused by mutating commands, because re-serialising would drop them. Pass `--force` to accept the loss, or edit by hand (see the `structurizr-dsl` skill).
- Relationships are addressed as `src->dst` (plus `--description` for parallel edges). Their ids are regenerated on every parse and are not stable.
- Deployment environments cannot be removed through the CLI.
- Large views can produce very large SVG exports.

## License

Apache-2.0
