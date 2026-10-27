type InsertTextListener = (text: string) => void

const listeners = new Set<InsertTextListener>()

/** Lets the command palette reach the mounted terminal panel. */
export function insertText(text: string): void {
  for (const cb of [...listeners]) cb(text)
}

export function onInsertText(cb: InsertTextListener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
