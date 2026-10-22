// Pure helpers for links inside a rendered document (`/document-view`):
// GitHub-style heading slugs and resolving a markdown href against the
// document it appears in.

export type DocLink =
  | { kind: 'doc'; path: string; fragment: string }
  | { kind: 'anchor'; fragment: string }
  | { kind: 'external' }
  | { kind: 'other' }

/** Heading ids are prefixed so they can never clash with DOM properties
 *  (`document.location`, `form.action`, …) — the same trick GitHub uses. */
export const HEADING_ID_PREFIX = 'user-content-'

/** GitHub-style slug: lowercase, drop punctuation except `-` and `_`, spaces to `-`. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '')
    .replace(/ /g, '-')
}

/** Returns a slug function that dedupes repeats with `-1`, `-2`, … */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>()
  return (text) => {
    const base = slugify(text)
    let slug = base
    let n = seen.get(base) ?? 0
    while (n > 0 && seen.has(slug)) slug = `${base}-${n++}`
    seen.set(base, n === 0 ? 1 : n)
    seen.set(slug, 1)
    return slug
  }
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

const DOC_EXT = /\.(md|markdown|html|htm)$/i

/**
 * Classifies `href` found in the document at `currentPath` (project-root
 * relative, posix). Doc paths are normalised; one that escapes the root keeps
 * its leading `..` segments so the caller can show not-found.
 */
export function resolveDocLink(currentPath: string, href: string): DocLink {
  const raw = href.trim()
  if (!raw) return { kind: 'other' }

  if (raw.startsWith('#')) {
    const fragment = decode(raw.slice(1))
    return fragment ? { kind: 'anchor', fragment } : { kind: 'other' }
  }

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw)
  if (scheme) {
    return /^(https?|mailto)$/i.test(scheme[1]) ? { kind: 'external' } : { kind: 'other' }
  }
  if (raw.startsWith('//')) return { kind: 'other' }

  const hashAt = raw.indexOf('#')
  const beforeHash = hashAt === -1 ? raw : raw.slice(0, hashAt)
  const fragment = hashAt === -1 ? '' : (decode(raw.slice(hashAt + 1)) ?? '')
  const target = decode(beforeHash.split('?')[0])
  if (!target || !DOC_EXT.test(target)) return { kind: 'other' }

  const base = target.startsWith('/') ? [] : currentPath.split('/').slice(0, -1)
  const out: string[] = []
  let escaped = 0
  for (const seg of [...base, ...target.split('/')]) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop()
      else escaped++
      continue
    }
    out.push(seg)
  }
  return { kind: 'doc', path: [...Array<string>(escaped).fill('..'), ...out].join('/'), fragment }
}

export function docBasename(path: string): string {
  return path.split('/').pop() || path
}

export interface Wikilink {
  /** Page part, as written (may be empty for `[[#heading]]`). */
  target: string
  /** Heading part without the `#`; empty when absent. */
  heading: string
  alias: string
}

/** Splits the inside of `[[…]]`. The alias separator is `|` or `\|` (the
 *  escaped form used inside table cells). */
export function parseWikilink(inner: string): Wikilink {
  const pipe = /\\?\|/.exec(inner)
  const left = (pipe ? inner.slice(0, pipe.index) : inner).trim()
  const alias = pipe ? inner.slice(pipe.index + pipe[0].length).trim() : ''
  const hashAt = left.indexOf('#')
  return {
    target: (hashAt === -1 ? left : left.slice(0, hashAt)).trim(),
    heading: hashAt === -1 ? '' : left.slice(hashAt + 1).trim(),
    alias,
  }
}

export type WikilinkResolution =
  | { kind: 'doc'; path: string; fragment: string }
  | { kind: 'anchor'; fragment: string }
  | { kind: 'unresolved'; target: string; path: string }

function normalizeSegments(segments: string[]): string[] | null {
  const out: string[] = []
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length === 0) return null
      out.pop()
      continue
    }
    out.push(seg)
  }
  return out
}

/** Heading text to the fragment the heading id is built from (the last
 *  `#`-separated part, as in Obsidian's `[[Note#H1#H2]]`; block refs ignored). */
function headingFragment(heading: string): string {
  const last = heading.split('#').pop() ?? ''
  return last.startsWith('^') ? '' : slugify(last)
}

/** Not-found guess for `name` relative to `currentDir`: a `..` path makes the
 *  viewer show "Document not found". */
function guessWikilinkPath(currentDir: string[], name: string): string {
  const nameSegments = name.split(/[\\/]/)
  const relativePath = normalizeSegments([...(name.startsWith('/') ? [] : currentDir), ...nameSegments])?.join('/') ?? null
  const cleanName = name.replace(/^\/+/, '')
  return relativePath ?? (cleanName.startsWith('../') ? cleanName : `../${cleanName}`)
}

/** Looks up `name` in `index`: relative to `currentDir`, then root-relative,
 *  then a name match anywhere in `index` (case-insensitive, exact case first;
 *  ties: same folder as the current doc, fewest segments, alphabetical). */
function matchWikilinkName(index: string[], currentDir: string[], name: string): string | null {
  const nameSegments = name.split(/[\\/]/)
  const relativePath = normalizeSegments([...(name.startsWith('/') ? [] : currentDir), ...nameSegments])?.join('/') ?? null
  const rootPath = normalizeSegments(nameSegments)?.join('/') ?? null

  const known = new Set(index)
  for (const candidate of [relativePath, rootPath]) {
    if (candidate && known.has(candidate)) return candidate
  }

  const wanted = nameSegments.filter((s) => s && s !== '.' && s !== '..').join('/')
  const lowerWanted = wanted.toLowerCase()
  const folder = currentDir.join('/')
  const matches = index.filter((p) => {
    const lower = p.toLowerCase()
    return lower === lowerWanted || lower.endsWith(`/${lowerWanted}`)
  })
  const exact = (p: string) => (p === wanted || p.endsWith(`/${wanted}`) ? 0 : 1)
  const sameFolder = (p: string) => (p.split('/').slice(0, -1).join('/') === folder ? 0 : 1)
  matches.sort(
    (a, b) =>
      exact(a) - exact(b) ||
      sameFolder(a) - sameFolder(b) ||
      a.split('/').length - b.split('/').length ||
      a.localeCompare(b),
  )
  return matches.length > 0 ? matches[0] : null
}

/**
 * Resolves an Obsidian-style `[[target#heading]]` found in the document at
 * `currentPath`. An explicit `.md`/`.markdown`/`.html`/`.htm` target is used
 * as written. An extensionless target tries the `.md` candidates first and,
 * only when none match, the same lookup with `.html` (markdown wins when both
 * exist). When `index` is null (unavailable) the `.md` relative path is
 * returned as the guess.
 */
export function resolveWikilink(currentPath: string, rawTarget: string, index: string[] | null): WikilinkResolution {
  const { target, heading } = parseWikilink(rawTarget)
  const fragment = headingFragment(heading)
  if (!target) {
    return fragment ? { kind: 'anchor', fragment } : { kind: 'unresolved', target: rawTarget.trim(), path: '' }
  }

  const currentDir = currentPath.split('/').slice(0, -1)
  const names = DOC_EXT.test(target) ? [target] : [`${target}.md`, `${target}.html`]

  if (index === null) return { kind: 'doc', path: guessWikilinkPath(currentDir, names[0]), fragment }

  for (const name of names) {
    const match = matchWikilinkName(index, currentDir, name)
    if (match) return { kind: 'doc', path: match, fragment }
  }

  return { kind: 'unresolved', target: rawTarget.trim(), path: guessWikilinkPath(currentDir, names[0]) }
}

// ---- Text-based link extraction (Node-safe, no DOM) -----------------------

// Same shape as markdown.ts's inline-code mention rule.
export const CODE_DOC_PATH = /^[^`<>\r\n#]+\.(md|markdown)(#[^`<>\r\n]*)?$/i

export interface ExtractedLinks {
  /** hrefs of markdown links, reference definitions and `<y.md>` autolinks, and inline-code `.md` mentions. */
  hrefs: string[]
  /** Raw `[[…]]` / `![[…]]` contents. */
  wikilinks: string[]
}

/** Finds doc-link candidates in markdown source without rendering it. Fenced
 *  code blocks are skipped; inline code is skipped for links but is the source
 *  of `.md` mentions (mirrors markdown.ts). */
export function extractDocLinks(markdown: string): ExtractedLinks {
  const hrefs: string[] = []
  const wikilinks: string[] = []

  let fence: { char: string; length: number } | null = null
  const prose: string[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (open && open[1][0] === fence.char && open[1].length >= fence.length && /^\s*$/.test(line.slice(open[0].length))) fence = null
      continue
    }
    if (open) {
      fence = { char: open[1][0], length: open[1].length }
      continue
    }
    prose.push(line)
  }

  const text = prose
    .join('\n')
    .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_m, _ticks: string, code: string) => {
      const mention = code.trim()
      if (CODE_DOC_PATH.test(mention)) hrefs.push(mention)
      return ' '
    })

  for (const m of text.matchAll(/!?\[\[([^[\]\n]+?)\]\]/g)) wikilinks.push(m[1])
  const withoutWiki = text.replace(/!?\[\[([^[\]\n]+?)\]\]/g, ' ')
  for (const m of withoutWiki.matchAll(/\]\(\s*(?:<([^>\n]*)>|([^)\s]+))/g)) hrefs.push(m[1] ?? m[2])
  for (const m of withoutWiki.matchAll(/^ {0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]*)>|(\S+))/gm)) hrefs.push(m[1] ?? m[2])
  for (const m of withoutWiki.matchAll(/<([^<>\s]+\.(?:md|markdown|html|htm)(?:#[^<>\s]*)?)>/gi)) hrefs.push(m[1])
  return { hrefs, wikilinks }
}
