// Node-safe (no DOM) HTML reference extraction and rewriting for documents
// served under `/__docs/` (see `specifications/html-document-links`, D4/D7).
// `parse5` (already a transitive dependency via jsdom) gives spec-accurate
// parsing and per-attribute source locations, so a rewrite only splices the
// bytes that change — every other byte of the file is untouched.
import * as parse5 from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'

import { docBasename, resolveDocLink } from './docLinks'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

export interface HtmlReferences {
  /** Raw src/href/srcset-candidate values of subresource tags and CSS `url(...)`/`@import` (D4). */
  subresources: string[]
  /** Raw `<a href>` values ending in `.md`/`.markdown` (D7). */
  docHrefs: string[]
}

const MD_EXT = /\.(md|markdown)$/i

/** `rel` values (space-separated, as on `<link>`) that make `href` a subresource. */
const LINK_REL = /(^|\s)(stylesheet|icon|preload)(\s|$)/i

/** True when `raw` is worth following as a same-document-relative reference:
 *  not `data:`/`blob:`/any other `scheme:`, not a bare `#fragment`, and not
 *  protocol-relative (`//host/...`). */
function isLocalUrl(raw: string): boolean {
  const value = raw.trim()
  if (!value || value.startsWith('#') || value.startsWith('//')) return false
  return !/^[a-z][a-z0-9+.-]*:/i.test(value)
}

function isElement(node: Node): node is Element {
  return 'tagName' in node
}

function getAttr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name.toLowerCase() === name)?.value
}

/** `srcset`'s candidates are `url descriptor, url descriptor, ...`; only the
 *  URL matters here. A naive `split(',')` breaks a `data:` URL candidate,
 *  whose own content (e.g. `;base64,AA,BB`) can contain commas — so this
 *  follows the WHATWG "parse a srcset attribute" shape closely enough: a URL
 *  is a run of non-whitespace characters; if it ends in one or more commas,
 *  the candidate has no descriptor and those commas are stripped (not part
 *  of the URL); otherwise the descriptor runs up to the next comma that
 *  isn't inside parentheses. */
function splitSrcset(value: string): string[] {
  const urls: string[] = []
  const len = value.length
  const isWs = (c: string) => /\s/.test(c)
  let i = 0
  while (i < len) {
    while (i < len && (isWs(value[i]) || value[i] === ',')) i++
    if (i >= len) break
    const start = i
    while (i < len && !isWs(value[i])) i++
    let url = value.slice(start, i)
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '')
      if (url) urls.push(url)
      continue
    }
    if (url) urls.push(url)
    while (i < len && isWs(value[i])) i++
    let depth = 0
    while (i < len) {
      const c = value[i]
      if (c === '(') depth++
      else if (c === ')') depth = Math.max(0, depth - 1)
      else if (c === ',' && depth === 0) {
        i++
        break
      }
      i++
    }
  }
  return urls
}

function textContent(node: Node): string {
  if ('value' in node && node.nodeName === '#text') return node.value
  if ('childNodes' in node) return node.childNodes.map(textContent).join('')
  return ''
}

/** `url(...)` and `@import` targets from a stylesheet or a `style=""` value.
 *  Raw values, not yet filtered by scheme — callers run them through
 *  `isLocalUrl`. */
export function extractCssUrls(css: string): string[] {
  const urls: string[] = []
  const importRe = /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)|"([^"]*)"|'([^']*)')[^;]*;?/gi
  const rest = css.replace(importRe, (_match, u1, u2, u3, s1, s2) => {
    const url = (u1 ?? u2 ?? u3 ?? s1 ?? s2 ?? '').trim()
    if (url) urls.push(url)
    return ''
  })
  const urlRe = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi
  for (const match of rest.matchAll(urlRe)) {
    const url = (match[1] ?? match[2] ?? match[3] ?? '').trim()
    if (url) urls.push(url)
  }
  return urls
}

/** Extracts D4 subresource URLs and D7 markdown `<a href>`s from an HTML
 *  document. Values are raw, exactly as written — not resolved against any
 *  base path. Skips `data:`/`blob:`/scheme/fragment/protocol-relative URLs. */
export function extractHtmlReferences(html: string): HtmlReferences {
  const subresources: string[] = []
  const docHrefs: string[] = []
  const pushAsset = (value: string | undefined): void => {
    if (value !== undefined && isLocalUrl(value)) subresources.push(value.trim())
  }

  const document = parse5.parse(html, { sourceCodeLocationInfo: false })

  const walk = (node: Node): void => {
    if (isElement(node)) {
      const tag = node.tagName.toLowerCase()
      if (tag === 'img' || tag === 'source') {
        pushAsset(getAttr(node, 'src'))
        const srcset = getAttr(node, 'srcset')
        if (srcset) for (const url of splitSrcset(srcset)) pushAsset(url)
      } else if (tag === 'script') {
        pushAsset(getAttr(node, 'src'))
      } else if (tag === 'link') {
        if (LINK_REL.test(getAttr(node, 'rel') ?? '')) pushAsset(getAttr(node, 'href'))
      } else if (tag === 'video') {
        pushAsset(getAttr(node, 'src'))
        pushAsset(getAttr(node, 'poster'))
      } else if (tag === 'audio') {
        pushAsset(getAttr(node, 'src'))
      } else if (tag === 'a') {
        const href = getAttr(node, 'href')
        if (href !== undefined && isLocalUrl(href)) {
          const target = href.split('#')[0].split('?')[0].trim()
          if (MD_EXT.test(target)) docHrefs.push(href)
        }
      }

      const style = getAttr(node, 'style')
      if (style) for (const url of extractCssUrls(style)) pushAsset(url)
      if (tag === 'style') for (const url of extractCssUrls(textContent(node))) pushAsset(url)
    }

    if ('childNodes' in node) for (const child of node.childNodes) walk(child)
  }
  walk(document)

  return { subresources, docHrefs }
}

interface Edit {
  start: number
  end: number
  text: string
}

function escapeAttrValue(value: string): string {
  return value.replace(/"/g, '&quot;')
}

/** Same `/document-view?path=…&title=…#frag` shape as `markdown.ts`'s `docViewHref`. */
function docViewHref(path: string, title: string, fragment: string): string {
  const query = new URLSearchParams({ path, title }).toString()
  return `/document-view?${query}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`
}

/**
 * Rewrites `<a href>` values in `html` (the document at project-root-relative
 * `docPath`) that `resolveDocLink` classifies as a `.md`/`.markdown` doc (D7)
 * to the `/document-view` URL shape, with `target="_top"`. Every other byte
 * of `html` is untouched: edits are spliced in at parse5's source-location
 * offsets rather than re-serializing the tree.
 */
export function rewriteHtmlDocLinks(html: string, docPath: string): string {
  const document = parse5.parse(html, { sourceCodeLocationInfo: true })
  const edits: Edit[] = []

  const walk = (node: Node): void => {
    if (isElement(node) && node.tagName.toLowerCase() === 'a') {
      const href = getAttr(node, 'href')
      const loc = node.sourceCodeLocation
      const hrefLoc = loc?.attrs?.href
      if (href !== undefined && hrefLoc) {
        const link = resolveDocLink(docPath, href)
        if (link.kind === 'doc' && MD_EXT.test(link.path)) {
          const title = textContent(node).trim() || docBasename(link.path)
          const newHref = docViewHref(link.path, title, link.fragment)
          edits.push({ start: hrefLoc.startOffset, end: hrefLoc.endOffset, text: `href="${escapeAttrValue(newHref)}"` })

          const targetLoc = loc.attrs?.target
          if (targetLoc) {
            edits.push({ start: targetLoc.startOffset, end: targetLoc.endOffset, text: 'target="_top"' })
          } else if (loc.startTag) {
            const insertAt = loc.startTag.endOffset - 1
            edits.push({ start: insertAt, end: insertAt, text: ' target="_top"' })
          }
        }
      }
    }

    if ('childNodes' in node) for (const child of node.childNodes) walk(child)
  }
  walk(document)

  if (edits.length === 0) return html
  edits.sort((a, b) => a.start - b.start)
  let out = ''
  let cursor = 0
  for (const edit of edits) {
    out += html.slice(cursor, edit.start) + edit.text
    cursor = edit.end
  }
  return out + html.slice(cursor)
}
