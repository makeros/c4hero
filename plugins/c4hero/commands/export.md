---
description: Export a c4hero view to a PNG or SVG file using a local Chromium-based browser.
argument-hint: "<view-key> [png|svg]"
allowed-tools: Bash(node *c4hero.mjs*), Read
---

Export a view. The CLI is `node "${CLAUDE_PLUGIN_ROOT}/bin/c4hero.mjs"`; below it is written `c4hero`.

Arguments: `$ARGUMENTS`, meaning a view key and an optional format (default `png`).

1. If the view key is missing, or does not exactly match one key, run `c4hero views --pretty`. List the keys and ask the user which one. Do not guess between several matches.
2. Run `c4hero export --view <key> --format <png|svg>`. Add `--theme dark` or `--out <path>` only if the user asked.
3. Report the output path from the result. Exit code 4 means no usable Chromium-based browser was found: relay the message, and mention that `C4HERO_BROWSER=/path/to/binary` selects one.
