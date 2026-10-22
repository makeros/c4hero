// Shared allowlist for document-link paths (`documents[].path`): local
// markdown files inside the project root only. Dependency-free on purpose
// (node:path / node:fs only) so Vite config, the CLI and the app build share
// one implementation.
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const MARKDOWN_EXTENSIONS = ['.md', '.markdown']
const HTML_EXTENSIONS = ['.html', '.htm']
const DOCUMENT_EXTENSIONS = [...MARKDOWN_EXTENSIONS, ...HTML_EXTENSIONS]

// Relative-asset allowlist for HTML documents (D4): styles, scripts and the
// media types they commonly reference. Never `.json`, `.map`, `.wasm` or
// `.ts` — those are source/data, not renderable subresources.
const ASSET_EXTENSIONS = [
  '.css',
  '.js',
  '.mjs',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.mp4',
  '.webm',
  '.mp3',
  '.ogg',
]

const CONTENT_TYPES: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
}

export type DocumentKind = 'markdown' | 'html'

export function hasMarkdownExtension(docPath: string): boolean {
  const lower = docPath.toLowerCase()
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** True for a markdown or HTML document path (`.md` `.markdown` `.html` `.htm`). */
export function hasDocumentExtension(docPath: string): boolean {
  const lower = docPath.toLowerCase()
  return DOCUMENT_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** The document kind by extension, or null when `docPath` is neither markdown nor HTML. */
export function documentKind(docPath: string): DocumentKind | null {
  if (hasMarkdownExtension(docPath)) return 'markdown'
  const lower = docPath.toLowerCase()
  return HTML_EXTENSIONS.some((ext) => lower.endsWith(ext)) ? 'html' : null
}

/** True when `docPath` has one of the allowlisted HTML-subresource extensions (D4). */
export function hasAssetExtension(docPath: string): boolean {
  const lower = docPath.toLowerCase()
  return ASSET_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** Response `Content-Type` for a document or allowlisted asset path, by extension.
 *  Falls back to `application/octet-stream` for anything unrecognised. */
export function contentTypeFor(docPath: string): string {
  const lower = docPath.toLowerCase()
  for (const [ext, type] of Object.entries(CONTENT_TYPES)) {
    if (lower.endsWith(ext)) return type
  }
  return 'application/octet-stream'
}

/** True when any segment starts with `.` — blocks dotfiles/dirs and `..`. */
export function hasHiddenSegment(docPath: string): boolean {
  return docPath.split(/[\\/]/).some((segment) => segment.startsWith('.'))
}

/** Textual allowlist: why `docPath` is not an acceptable document path, or
 *  null when it is. Does not touch the filesystem. */
export function docPathProblem(docPath: string): string | null {
  if (isAbsolute(docPath) || /^[a-zA-Z]:/.test(docPath)) return 'must be relative to the project root, not absolute'
  if (!hasDocumentExtension(docPath)) return 'must end in .md, .markdown, .html or .htm'
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

/** Root-relative POSIX path of `file` when it's a document or allowlisted asset
 *  under `root` (no hidden segment or `node_modules`), else null — so the dev
 *  watcher can announce both document and asset changes. Textual only;
 *  `file` may already be deleted. */
export function docRelativePath(root: string, file: string): string | null {
  const rel = relative(resolve(root), resolve(file))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  const posix = rel.split(sep).join('/')
  if ((!hasDocumentExtension(posix) && !hasAssetExtension(posix)) || hasHiddenSegment(posix) || posix.split('/').includes('node_modules')) return null
  return posix
}

/** Root-relative POSIX paths of every file under `root` matching `matches` (names
 *  sorted per folder). Skips hidden segments and `node_modules`, never follows
 *  directory symlinks, and drops file symlinks whose target lies outside `root`.
 *  Stops at `limit` entries (`truncated: true`). */
function listFilesByExtension(
  root: string,
  matches: (name: string) => boolean,
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
      } else if (matches(entry.name) && (entry.isFile() || entry.isSymbolicLink())) {
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

export function listMarkdownFiles(root: string, opts?: { limit?: number }): { files: string[]; truncated: boolean } {
  return listFilesByExtension(root, hasMarkdownExtension, opts)
}

/** Root-relative POSIX paths of every markdown and HTML file under `root`
 *  (D8's index). Same walk rules as `listMarkdownFiles`. */
export function listDocumentFiles(root: string, opts?: { limit?: number }): { files: string[]; truncated: boolean } {
  return listFilesByExtension(root, hasDocumentExtension, opts)
}
