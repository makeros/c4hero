#!/usr/bin/env node
// Wrapper around `vite` that adds `--workspace <path>` and `--terminal` flags.
// Vite's own CLI rejects unknown options, so scripts/devArgs.mjs parses them
// out and validates the directory; the path is passed through as
// VITE_DEV_WORKSPACE_NAME/_PATH env vars that the app reads on startup to
// auto-restore (or prompt the user to select) that folder — see the
// dev-workspace effect in WelcomeScreen.tsx. `--terminal` (requires
// --workspace, localhost only, not on Windows) sets C4HERO_AGENT_TERMINAL=1,
// which enables the in-app agent terminal Vite plugin.
//
// Usage: npm run dev -- --workspace /path/to/docs/svd [--terminal]

import { spawn } from 'node:child_process'
import path from 'node:path'
import { parseDevArgs } from './devArgs.mjs'

const { viteArgs, workspacePath, terminal, error } = parseDevArgs(
  process.argv.slice(2),
  process.env,
  process.platform
)
if (error) {
  console.error(error)
  process.exit(1)
}

const env = { ...process.env }

if (workspacePath) {
  env.VITE_DEV_WORKSPACE_PATH = workspacePath
  env.VITE_DEV_WORKSPACE_NAME = path.basename(workspacePath)
}

// Read by the agent-terminal Vite plugin; without it the plugin is a no-op.
if (terminal) env.C4HERO_AGENT_TERMINAL = '1'

const viteBin = path.join(
  import.meta.dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
)

const vite = spawn(viteBin, viteArgs, {
  stdio: 'inherit',
  env,
})

process.on('SIGINT', () => vite.kill('SIGINT'))
process.on('SIGTERM', () => vite.kill('SIGTERM'))

vite.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
