// Renders markdown to sanitized HTML, client-side, with no server-side
// dependency — used by the `/document-view` route (and anywhere else that
// needs to show a document link's content) in both the real browser and this
// project's jsdom-based Vitest environment. `DOMPurify` sanitizes against the
// ambient `window`/`document` the jsdom test environment already provides to
// every test file (see `vite.config.ts`'s `test.environment: 'jsdom'`), so no
// extra `jsdom` import or window construction is needed here.
import DOMPurify from 'dompurify'
import { marked } from 'marked'

export function renderMarkdownToSafeHtml(markdown: string): string {
  const html = marked.parse(markdown, { async: false })
  return DOMPurify.sanitize(html)
}
