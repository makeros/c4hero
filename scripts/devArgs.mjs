// Argument parsing for scripts/dev.mjs, kept separate so it can be unit-tested
// (see src/lib/agentTerminal/devArgs.test.ts). Pure apart from the filesystem
// check on the workspace directory.

import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Splits `--workspace` and `--terminal` out of the argv meant for Vite.
 * Returns `{ viteArgs, workspacePath?, terminal, error? }`; on `error` the
 * caller prints it and exits 1.
 */
export function parseDevArgs(argv, env, platform) {
  const args = [...argv]
  let workspacePath
  let terminal = false

  const terminalIndex = args.indexOf('--terminal')
  if (terminalIndex !== -1) {
    terminal = true
    args.splice(terminalIndex, 1)
  }

  const flagIndex = args.findIndex((a) => a === '--workspace' || a.startsWith('--workspace='))
  if (flagIndex !== -1) {
    const flag = args[flagIndex]
    if (flag.includes('=')) {
      workspacePath = flag.slice(flag.indexOf('=') + 1)
      args.splice(flagIndex, 1)
    } else {
      workspacePath = args[flagIndex + 1]
      if (!workspacePath) {
        return fail(args, terminal, '--workspace requires a directory path, e.g. --workspace /path/to/docs')
      }
      args.splice(flagIndex, 2)
    }
  }

  if (workspacePath) {
    const resolved = path.resolve(workspacePath)
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      return fail(args, terminal, `--workspace path does not exist or is not a directory: ${resolved}`)
    }
    workspacePath = resolved

    // Launch the browser automatically so the dev-workspace auto-open/prompt
    // flow (see WelcomeScreen.tsx) actually runs without a manual visit.
    if (!args.some((a) => a === '--open' || a.startsWith('--open='))) {
      args.push('--open')
    }
  }

  if (terminal) {
    // The terminal gives the page a shell, so it must stay reachable from
    // localhost only.
    let error
    if (platform === 'win32') error = '--terminal is not supported on Windows yet'
    else if (!workspacePath) error = '--terminal requires --workspace <dir>'
    else if (env.VITE_HMR_TUNNEL || env.VITE_ALLOWED_HOSTS) {
      error = '--terminal is localhost-only; unset VITE_HMR_TUNNEL/VITE_ALLOWED_HOSTS'
    } else if (args.some((a) => a === '--host' || a.startsWith('--host='))) {
      error = '--terminal is localhost-only; remove --host'
    }
    if (error) return fail(args, terminal, error)
  }

  return { viteArgs: args, workspacePath, terminal }
}

function fail(viteArgs, terminal, error) {
  return { viteArgs, terminal, error }
}
