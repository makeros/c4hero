/// <reference types="vite/client" />
// Dev-only live reload for document links. The dev server's `document-links`
// plugin (vite.config.ts) watches the docs root and pushes this custom HMR
// event whenever a markdown file changes — those files are served raw by
// middleware, outside Vite's module graph, so HMR wouldn't notice otherwise.
// In builds `import.meta.hot` is undefined and subscribing is a no-op.

export const DOC_CHANGED_EVENT = 'c4hero:doc-changed'

export interface DocChange {
  /** Project-root-relative POSIX path, same shape as `/__docs/<path>`. */
  path: string
  kind: 'change' | 'add' | 'unlink'
}

/** Subscribes to document changes; returns the unsubscribe function. */
export function onDocChange(callback: (change: DocChange) => void): () => void {
  const hot = import.meta.hot
  if (!hot) return () => {}
  hot.on(DOC_CHANGED_EVENT, callback)
  return () => hot.off(DOC_CHANGED_EVENT, callback)
}
