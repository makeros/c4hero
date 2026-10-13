// Shared route-shape predicates. Keeping the path patterns in one place stops the
// same regex being copy-pasted across App.tsx and the keyboard-shortcut handlers.

/** True when `pathname` is a canvas route — `/collection/:slug/:workspace` (with
 *  or without a trailing `/:view`). Used to gate canvas-only UI (the AI panel,
 *  the load-time redirect) to screens that actually show a diagram. */
export function isCanvasRoute(pathname: string): boolean {
  return /\/collection\/[^/]+\/[^/]+/.test(pathname)
}

/** True when `pathname` is a standalone route that renders without canvas
 *  chrome and must never be redirected away from on workspace load — e.g.
 *  `/document-view`, opened in its own tab from a document link. */
export function isStandaloneRoute(pathname: string): boolean {
  return pathname === '/document-view'
}
