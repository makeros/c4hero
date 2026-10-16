// Shared allowlist for document-link paths (`documents[].path`): local
// markdown files inside the project root only. Dependency-free on purpose
// (node:path / node:fs only) so Vite config, the CLI and the app build share
// one implementation.
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const MARKDOWN_EXTENSIONS = ['.md', '.markdown']

export function hasMarkdownExtension(docPath: string): boolean {
  const lower = docPath.toLowerCase()
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** True when any segment starts with `.` — blocks dotfiles/dirs and `..`. */
export function hasHiddenSegment(docPath: string): boolean {
  return docPath.split(/[\\/]/).some((segment) => segment.startsWith('.'))
}

/** Textual allowlist: why `docPath` is not an acceptable document path, or
 *  null when it is. Does not touch the filesystem. */
export function docPathProblem(docPath: string): string | null {
  if (isAbsolute(docPath) || /^[a-zA-Z]:/.test(docPath)) return 'must be relative to the project root, not absolute'
  if (!hasMarkdownExtension(docPath)) return 'must end in .md or .markdown'
  if (hasHiddenSegment(docPath)) return "must not contain hidden or '..' segments"
  return null
}

/** True when `target` is `root` itself or lies inside it (textual, no symlinks). */
export function isInsideRoot(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || !(rel.startsWith('..') || isAbsolute(rel))
}

/** Like `isInsideRoot` but on symlink-resolved paths. `target` need not exist:
 *  its nearest existing ancestor is resolved instead. */
export function isInsideRootReal(root: string, target: string): boolean {
  let probe = resolve(target)
  while (!existsSync(probe)) {
    const parent = dirname(probe)
    if (parent === probe) return false
    probe = parent
  }
  try {
    return isInsideRoot(realpathSync(root), realpathSync(probe))
  } catch {
    return false
  }
}

/** Project root that document-link paths are relative to: the nearest ancestor
 *  of `workspacePath` (a workspace directory or a `.dsl` file) holding `.git`
 *  (a directory, or a file in a worktree), else the workspace directory itself.
 *  The CLI (`link-doc`) and every serving path (dev, build, viewer) share it. */
export function docsRootFor(workspacePath: string): string {
  const abs = resolve(workspacePath)
  let start = abs
  try {
    if (statSync(abs).isFile()) start = dirname(abs)
  } catch {
    // nonexistent: treat as a directory
  }
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir
    if (dirname(dir) === dir) return start
  }
}

/** Resolves a `/__docs/<encoded-path>` request remainder against `root`.
 *  `rejected` covers the textual guards (markdown extension, hidden/`..`
 *  segments, escaping the root). Throws URIError on malformed encoding. The
 *  caller must still check `isInsideRootReal` once the file exists. */
export function resolveDocRequest(
  encodedPath: string,
  root: string,
): { absolute: string; rejected: boolean } {
  const decoded = decodeURIComponent(encodedPath)
  const absolute = resolve(root, decoded)
  const rejected = !hasMarkdownExtension(decoded) || hasHiddenSegment(decoded) || !isInsideRoot(root, absolute)
  return { absolute, rejected }
}

/** Root-relative POSIX paths of every markdown file under `root` (names sorted per folder).
 *  Skips hidden segments and `node_modules`, never follows directory symlinks,
 *  and drops file symlinks whose target lies outside `root`. Stops at `limit`
 *  entries (`truncated: true`). */
export function listMarkdownFiles(
  root: string,
  { limit = 10_000 }: { limit?: number } = {},
): { files: string[]; truncated: boolean } {
  const files: string[] = []
  let truncated = false
  let realRoot: string
  try {
    realRoot = realpathSync(root)
  } catch {
    return { files, truncated }
  }

  const walk = (dir: string, prefix: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      if (truncated) return
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const abs = join(dir, entry.name)
      const rel = prefix + entry.name
      if (entry.isDirectory()) {
        walk(abs, rel + '/')
      } else if (hasMarkdownExtension(entry.name) && (entry.isFile() || entry.isSymbolicLink())) {
        try {
          if (!statSync(abs).isFile() || !isInsideRoot(realRoot, realpathSync(abs))) continue
        } catch {
          continue
        }
        if (files.length >= limit) {
          truncated = true
          return
        }
        files.push(rel)
      }
    }
  }
  walk(resolve(root), '')
  return { files, truncated }
}
