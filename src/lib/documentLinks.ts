import type { DocLink } from '@/types/model'

export type DocumentKind = 'markdown' | 'html'

const MARKDOWN_EXTENSIONS = ['.md', '.markdown']
const HTML_EXTENSIONS = ['.html', '.htm']

/** Client-safe mirror of `docPath.ts`'s `documentKind` (extension only, no
 *  filesystem access). `docPath.ts` imports `node:fs` and must never be
 *  imported from client code — this is the one place that duplicates its
 *  extension lists for `DocumentView`'s markdown/HTML switch. */
export function documentKind(path: string): DocumentKind | null {
  const lower = path.toLowerCase()
  if (MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'markdown'
  if (HTML_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'html'
  return null
}

/** URL of the in-app document viewer for a linked document. Shared by the
 *  inspector's Documents tab and the canvas document indicator. */
export function documentViewUrl(doc: DocLink): string {
  return `/document-view?${new URLSearchParams({ path: doc.path, title: doc.title }).toString()}`
}

/** Open a linked document in a new tab (no opener access to the editor). */
export function openDocument(doc: DocLink): void {
  window.open(documentViewUrl(doc), '_blank', 'noopener,noreferrer')
}
