#!/usr/bin/env node
// Builds a standalone, locked, read-only viewer build for a single workspace.
// Parses `--workspace <file>.dsl`, validates it, locates its sidecar (if any)
// via the same `sidecarName()` convention the app uses, sets the
// LOCKED_WORKSPACE_PATH / LOCKED_WORKSPACE_SIDECAR_PATH env vars that
// vite.config.ts's `virtual:locked-workspace` plugin reads, and spawns
// `vite build --outDir dist-viewer`.
//
// Modeled on scripts/dev.mjs's argv-parsing and spawn/signal-forwarding shape.
//
// Usage: npm run build:viewer -- --workspace /path/to/workspace.dsl

import { spawn } from 'node:child_process'
import { existsSync, statSync, mkdirSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { sidecarName } from '../src/lib/sidecarName.ts'

const args = process.argv.slice(2)
const flagIndex = args.findIndex((a) => a === '--workspace' || a.startsWith('--workspace='))
let workspacePath

if (flagIndex === -1) {
  console.error('--workspace is required, e.g. --workspace /path/to/workspace.dsl')
  process.exit(1)
}

const flag = args[flagIndex]
if (flag.includes('=')) {
  workspacePath = flag.slice(flag.indexOf('=') + 1)
  args.splice(flagIndex, 1)
} else {
  workspacePath = args[flagIndex + 1]
  if (!workspacePath) {
    console.error('--workspace requires a file path, e.g. --workspace /path/to/workspace.dsl')
    process.exit(1)
  }
  args.splice(flagIndex, 2)
}

const resolved = path.resolve(workspacePath)

if (!existsSync(resolved)) {
  console.error(`--workspace path does not exist: ${resolved}`)
  process.exit(1)
}
if (!statSync(resolved).isFile()) {
  console.error(`--workspace path is not a file: ${resolved}`)
  process.exit(1)
}
if (!resolved.toLowerCase().endsWith('.dsl')) {
  console.error(`--workspace path must be a .dsl file: ${resolved}`)
  process.exit(1)
}

if (args.some((a) => a === '--outDir' || a.startsWith('--outDir='))) {
  console.error(
    '--outDir cannot be overridden: the locked viewer always builds to dist-viewer/ to avoid overwriting the editor\'s own dist/ output.'
  )
  process.exit(1)
}

const env = { ...process.env }
env.LOCKED_WORKSPACE_PATH = resolved

const sidecarPath = path.join(path.dirname(resolved), sidecarName(path.basename(resolved)))
if (existsSync(sidecarPath) && statSync(sidecarPath).isFile()) {
  env.LOCKED_WORKSPACE_SIDECAR_PATH = sidecarPath
}

const projectRoot = path.join(import.meta.dirname, '..')

const viteBin = path.join(
  projectRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
)

// Collects this workspace's `documents[].path` references (via the shared
// src/lib/documentCollection.ts, the same module Task 3.2 uses for the main
// build) and copies each one into dist-viewer/__docs/<path>. Loaded through a
// middleware-mode Vite dev server (ssrLoadModule) rather than a plain Node
// `import`, because documentCollection.ts's own dependency chain
// (src/lib/dsl/index.ts, @/store/workspace-helpers, @/*) uses bundler-style
// extensionless/directory imports and the `@/*` tsconfig alias — neither of
// which plain Node's ESM resolver understands. Vite's own config (read
// as-is from vite.config.ts, unmodified) already knows how to resolve both,
// so this reuses that instead of reimplementing module resolution here.
//
// Must run *after* the `vite build` spawn below reports success, not before:
// `vite build --outDir dist-viewer` empties dist-viewer/ at the start of the
// build (Vite's default `emptyOutDir` behavior for an outDir inside the
// project root), which would wipe anything copied in ahead of it.
async function copyReferencedDocuments(workspacePath, root) {
  const server = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
  })

  let plan
  try {
    const { planDocumentCopies } = await server.ssrLoadModule('/src/lib/documentCollection.ts')
    plan = planDocumentCopies([workspacePath], root)
  } finally {
    await server.close()
  }

  for (const missingPath of plan.missing) {
    console.warn(`[build:viewer] referenced document not found, skipping: ${missingPath}`)
  }

  const outDir = path.join(root, 'dist-viewer')
  for (const { from, to } of plan.copies) {
    const dest = path.join(outDir, to)
    mkdirSync(path.dirname(dest), { recursive: true })
    copyFileSync(from, dest)
  }
}

const vite = spawn(viteBin, ['build', '--outDir', 'dist-viewer', ...args], {
  stdio: 'inherit',
  env,
})

process.on('SIGINT', () => vite.kill('SIGINT'))
process.on('SIGTERM', () => vite.kill('SIGTERM'))

vite.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  if (code !== 0) {
    process.exit(code ?? 0)
    return
  }
  copyReferencedDocuments(resolved, projectRoot)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[build:viewer] failed to collect referenced documents:', err)
      process.exit(1)
    })
})
