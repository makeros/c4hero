// Shared allowlist for document-link paths (`documents[].path`): local
// markdown files inside the project root only. Dependency-free on purpose
// (node:path / node:fs only) so Vite config, the CLI and the app build share
// one implementation.
import { existsSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

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
