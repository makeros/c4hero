// Explicit `.ts` extension (enabled by `allowImportingTsExtensions` in
// tsconfig.app.json): required so plain Node's ESM resolver — which has no
// extension-probing of its own — can load this module directly from
// `scripts/build-viewer.mjs` without a bundler.
import { sanitizeFilename } from './filenames.ts'

// ─── Sidecar filename ───────────────────────────────────────────────
// Extracted into its own dependency-free module (only a relative import of
// `sanitizeFilename`, no `@/*` aliases) so it can be imported both by
// `src/lib/sidecar.ts` (via Vite, for the app) and by `scripts/build-viewer.mjs`
// (via plain Node, which cannot resolve `@/*` path aliases). See
// `specifications/locked-readonly-viewer/locked-readonly-viewer.plan.md`,
// Task 2.3's amendment, for why this was split out.

export function sidecarName(dslName: string): string {
  const baseName = dslName.replace(/\.dsl$/i, '')
  const safeBaseName = sanitizeFilename(baseName)
  return `${safeBaseName === 'download' ? 'workspace' : safeBaseName}.c4hero.json`
}
