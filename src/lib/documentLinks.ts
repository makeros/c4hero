import type { DocLink } from '@/types/model'

/** URL of the in-app document viewer for a linked document. Shared by the
 *  inspector's Documents tab and the canvas document indicator. */
export function documentViewUrl(doc: DocLink): string {
  return `/document-view?${new URLSearchParams({ path: doc.path, title: doc.title }).toString()}`
}

/** Open a linked document in a new tab (no opener access to the editor). */
export function openDocument(doc: DocLink): void {
  window.open(documentViewUrl(doc), '_blank', 'noopener,noreferrer')
}
