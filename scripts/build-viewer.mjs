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
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
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

const viteBin = path.join(
  import.meta.dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
)

const vite = spawn(viteBin, ['build', '--outDir', 'dist-viewer', ...args], {
  stdio: 'inherit',
  env,
})

process.on('SIGINT', () => vite.kill('SIGINT'))
process.on('SIGTERM', () => vite.kill('SIGTERM'))

vite.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
