// Renders markdown to sanitized HTML, client-side, with no server-side
// dependency — used by the `/document-view` route (and anywhere else that
// needs to show a document link's content) in both the real browser and this
// project's jsdom-based Vitest environment. `DOMPurify` sanitizes against the
// ambient `window`/`document` the jsdom test environment already provides to
// every test file (see `vite.config.ts`'s `test.environment: 'jsdom'`), so no
// extra `jsdom` import or window construction is needed here.
import DOMPurify from 'dompurify'
import { marked } from 'marked'

import { HEADING_ID_PREFIX, type DocLink, createSlugger, docBasename, resolveDocLink } from './docLinks'

type DocTarget = Extract<DocLink, { kind: 'doc' }>

// A path ending in .md/.markdown with an optional #fragment; no backticks,
// angle brackets or line breaks.
const CODE_DOC_PATH = /^[^`<>\r\n#]+\.(md|markdown)(#[^`<>\r\n]*)?$/i

function docViewHref(link: DocTarget, title: string): string {
  const query = new URLSearchParams({ path: link.path, title }).toString()
  return `/document-view?${query}${link.fragment ? `#${encodeURIComponent(link.fragment)}` : ''}`
}

// Heading ids are added AFTER sanitizing (DOMPurify's SANITIZE_DOM would strip
// ids clashing with DOM properties) and carry HEADING_ID_PREFIX for the same
// reason. Link rewriting happens only when `docPath` (the current document's
// project-root-relative path) is given.
export function renderMarkdownToSafeHtml(markdown: string, options?: { docPath: string }): string {
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
