/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { docsRootFor } from '@/lib/docPath'
import { CliFailure } from './errors'

const SKIPPED_DIRS = (name: string): boolean => name === 'node_modules' || name.startsWith('dist') || name.startsWith('.')

/** Git root above `cwd` (a `.git` directory or worktree file), else `cwd` itself. */
export function findRoot(cwd: string): string {
  return docsRootFor(cwd)
}

/** Git root above the workspace file, else the file's own directory. */
export function projectRootFor(file: string): string {
  return docsRootFor(path.dirname(file))
}

function scanDsl(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS(entry.name)) scanDsl(full, out)
    } else if (entry.isFile() && /\.dsl$/i.test(entry.name)) {
      out.push(full)
    }
  }
}

function configuredWorkspace(root: string): string | null {
  const configPath = path.join(root, '.c4hero', 'config.json')
  if (!existsSync(configPath)) return null
  let workspace: unknown
  try {
    workspace = (JSON.parse(readFileSync(configPath, 'utf8')) as { workspace?: unknown }).workspace
  } catch {
    throw new CliFailure('USAGE', `${configPath} is not valid JSON`)
  }
  if (workspace === undefined) return null
  if (typeof workspace !== 'string') throw new CliFailure('USAGE', `${configPath}: "workspace" must be a string path`)
  return path.resolve(root, workspace)
}

/** Resolves the `.dsl` a command operates on: `--file`, else the workspace
 *  pinned in `<root>/.c4hero/config.json`, else the only `.dsl` under the git
 *  root (or `cwd` outside a repository), skipping `node_modules`, `dist*` and
 *  dot-directories. Returns an absolute path. */
export function discoverWorkspace(opts: { file?: string; cwd: string }): string {
  const file = opts.file ?? configuredWorkspace(findRoot(opts.cwd))
  if (file !== null && file !== undefined) {
    const abs = path.resolve(opts.cwd, file)
    if (!existsSync(abs) || !statSync(abs).isFile()) throw new CliFailure('NOT_FOUND', `Workspace file not found: ${abs}`)
    return abs
  }

  const root = findRoot(opts.cwd)
  const matches: string[] = []
  scanDsl(root, matches)
  matches.sort()
  if (matches.length === 0) {
    throw new CliFailure('NOT_FOUND', `No .dsl file found under ${root}. Pass --file <path>.`)
  }
  if (matches.length > 1) {
    throw new CliFailure(
      'MULTIPLE_WORKSPACES',
      'Several .dsl files found. Pass --file <path> or pin one in .c4hero/config.json.',
      matches.map((m) => path.relative(root, m)),
    )
  }
  return matches[0]
}
