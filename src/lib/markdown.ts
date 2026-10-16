// Renders markdown to sanitized HTML, client-side, with no server-side
// dependency — used by the `/document-view` route (and anywhere else that
// needs to show a document link's content) in both the real browser and this
// project's jsdom-based Vitest environment. `DOMPurify` sanitizes against the
// ambient `window`/`document` the jsdom test environment already provides to
// every test file (see `vite.config.ts`'s `test.environment: 'jsdom'`), so no
// extra `jsdom` import or window construction is needed here.
import DOMPurify from 'dompurify'
import { marked } from 'marked'

import {
  CODE_DOC_PATH,
  HEADING_ID_PREFIX,
  type DocLink,
  createSlugger,
  docBasename,
  parseWikilink,
  resolveDocLink,
  resolveWikilink,
} from './docLinks'

type DocTarget = Extract<DocLink, { kind: 'doc' }>

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Obsidian-style `[[target#heading|alias]]` / `![[target]]` (embeds render as a
// plain link). Emits `<a data-wikilink="raw">`; `data-*` survives DOMPurify, and
// the href is only filled in by the DOMParser pass below.
marked.use({
  extensions: [
    {
      name: 'wikilink',
      level: 'inline',
      start: (src: string) => src.search(/!?\[\[/),
      tokenizer(src: string) {
        const match = /^!?\[\[([^[\]\n]+?)\]\]/.exec(src)
        if (!match) return undefined
        return { type: 'wikilink', raw: match[0], inner: match[1] }
      },
      renderer(token) {
        const inner = (token as unknown as { inner: string }).inner
        const { target, heading, alias } = parseWikilink(inner)
        const name = docBasename(target).replace(/\.(md|markdown)$/i, '')
        const text = alias || (target && heading ? `${name} > ${heading}` : name || heading)
        const raw = heading ? `${target}#${heading}` : target
        return `<a data-wikilink="${escapeHtml(raw)}">${escapeHtml(text)}</a>`
      },
    },
  ],
})

function docViewHref(link: DocTarget, title: string): string {
  const query = new URLSearchParams({ path: link.path, title }).toString()
  return `/document-view?${query}${link.fragment ? `#${encodeURIComponent(link.fragment)}` : ''}`
}

// Heading ids are added AFTER sanitizing (DOMPurify's SANITIZE_DOM would strip
// ids clashing with DOM properties) and carry HEADING_ID_PREFIX for the same
// reason. Link rewriting happens only when `docPath` (the current document's
// project-root-relative path) is given.
// `index` is the project's markdown file list (null when unavailable) used to
// resolve wikilinks by name.
export function renderMarkdownToSafeHtml(
  markdown: string,
  options?: { docPath: string; index?: string[] | null },
): string {
  const html = marked.parse(markdown, { async: false })
  const doc = new DOMParser().parseFromString(DOMPurify.sanitize(html), 'text/html')

  const slug = createSlugger()
  doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    const s = slug(h.textContent ?? '')
    if (s) h.id = HEADING_ID_PREFIX + s
  })

  if (options) {
    doc.querySelectorAll('a[href]').forEach((a) => {
      const link = resolveDocLink(options.docPath, a.getAttribute('href') ?? '')
      if (link.kind === 'external') {
        a.setAttribute('target', '_blank')
        a.setAttribute('rel', 'noopener noreferrer')
      } else if (link.kind === 'anchor') {
        a.setAttribute('href', `#${HEADING_ID_PREFIX}${encodeURIComponent(link.fragment)}`)
      } else if (link.kind === 'doc') {
        a.setAttribute('href', docViewHref(link, a.textContent?.trim() || docBasename(link.path)))
      }
    })

    doc.querySelectorAll('a[data-wikilink]').forEach((a) => {
      const raw = a.getAttribute('data-wikilink') ?? ''
      const text = a.textContent?.trim() ?? ''
      const link = resolveWikilink(options.docPath, raw, options.index ?? null)
      if (link.kind === 'anchor') {
        a.setAttribute('href', `#${HEADING_ID_PREFIX}${encodeURIComponent(link.fragment)}`)
      } else if (link.kind === 'doc') {
        a.setAttribute('href', docViewHref(link, text || docBasename(link.path)))
      } else {
        a.setAttribute('href', docViewHref({ kind: 'doc', path: link.path, fragment: '' }, text || link.target))
        a.classList.add('doc-link-unresolved')
        a.setAttribute('title', `Not found: ${link.target}`)
      }
    })

    // Inline-code mentions of markdown files (`docs/x.md`) become links too.
    doc.querySelectorAll('code').forEach((code) => {
      if (code.closest('pre, a')) return
      const text = code.textContent?.trim() ?? ''
      if (!CODE_DOC_PATH.test(text)) return
      const link = resolveDocLink(options.docPath, text)
      if (link.kind !== 'doc') return
      const a = doc.createElement('a')
      a.setAttribute('href', docViewHref(link, docBasename(link.path).replace(/\.(md|markdown)$/i, '')))
      a.className = 'doc-code-link'
      code.replaceWith(a)
      a.appendChild(code)
    })
  }
  return doc.body.innerHTML
}
