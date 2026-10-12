#!/usr/bin/env node
// Wrapper around `vite` that adds a `--workspace <path>` flag. Vite's own CLI
// rejects unknown options, so this parses it out, validates the directory,
// and passes it through as VITE_DEV_WORKSPACE_NAME/_PATH env vars that the
// app reads on startup to auto-restore (or prompt the user to select) that
// folder — see the dev-workspace effect in WelcomeScreen.tsx.
//
// Usage: npm run dev -- --workspace /path/to/docs/svd

import { spawn } from 'node:child_process'
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
  env.VITE_DEV_WORKSPACE_PATH = resolved
  env.VITE_DEV_WORKSPACE_NAME = path.basename(resolved)

  // Launch the browser automatically so the dev-workspace auto-open/prompt
  // flow (see WelcomeScreen.tsx) actually runs without a manual visit.
  if (!args.some((a) => a === '--open' || a.startsWith('--open='))) {
    args.push('--open')
  }
}

const viteBin = path.join(
  import.meta.dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
)

const vite = spawn(viteBin, args, {
  stdio: 'inherit',
  env,
})

process.on('SIGINT', () => vite.kill('SIGINT'))
process.on('SIGTERM', () => vite.kill('SIGTERM'))

vite.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
