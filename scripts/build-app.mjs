#!/usr/bin/env node
// Wrapper around `tsc -b && vite build` that adds an *optional* `--workspace
// <dir>` flag. Mirrors scripts/dev.mjs's --workspace parsing (a directory,
// optional) rather than scripts/build-viewer.mjs's (a single .dsl file,
// required) — see specifications/document-links/document-links.plan.md's
// "Decision made while planning": Vercel's buildCommand and CI's build job
// both run bare `npm run build` today, so the flag must stay optional or it
// would break the existing deploy.
//
// When provided and valid, sets DOCUMENT_WORKSPACE_DIR so vite.config.ts's
// `document-links` plugin's `closeBundle` hook collects every `documents[]`
// link referenced by that directory's `.dsl` files and copies them into
// dist/__docs/. Omitting the flag (today's bare `npm run build`) leaves it
// unset, which is a no-op for that plugin — dist/ comes out unchanged.
//
// Usage: npm run build -- --workspace /path/to/docs/svd

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const flagIndex = args.findIndex((a) => a === '--workspace' || a.startsWith('--workspace='))
let workspacePath

if (flagIndex !== -1) {
  const flag = args[flagIndex]
  if (flag.includes('=')) {
    workspacePath = flag.slice(flag.indexOf('=') + 1)
    args.splice(flagIndex, 1)
  } else {
    workspacePath = args[flagIndex + 1]
    if (!workspacePath) {
      console.error('--workspace requires a directory path, e.g. --workspace /path/to/docs')
      process.exit(1)
    }
    args.splice(flagIndex, 2)
  }
}

const env = { ...process.env }

if (workspacePath) {
  const resolved = path.resolve(workspacePath)
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    console.error(`--workspace path does not exist or is not a directory: ${resolved}`)
    process.exit(1)
  }
  env.DOCUMENT_WORKSPACE_DIR = resolved
}

const binPath = (name) =>
  path.join(import.meta.dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name)

// Matches today's "tsc -b && vite build" — fail/exit before the vite build
// step if typechecking fails.
const tsc = spawnSync(binPath('tsc'), ['-b'], { stdio: 'inherit' })
if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1)
}

const vite = spawn(binPath('vite'), ['build', ...args], {
  stdio: 'inherit',
  env,
})

process.on('SIGINT', () => vite.kill('SIGINT'))
process.on('SIGTERM', () => vite.kill('SIGTERM'))

vite.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
