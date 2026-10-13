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

const DOC_EXT = /\.(md|markdown)$/i

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
