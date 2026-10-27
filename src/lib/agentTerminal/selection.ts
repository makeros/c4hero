export interface SelectionRef {
  filename?: string | null
  viewKey?: string | null
  elementIds?: readonly string[]
  relationshipId?: string | null
}

/** Reference the agent can resolve against the open workspace. Ends with a
 *  space and no newline: the text is typed at the prompt, never submitted. */
export function formatSelectionForAgent(ref: SelectionRef): string | null {
  const elementIds = ref.elementIds ?? []
  if (elementIds.length === 0 && !ref.relationshipId) return null
  const parts: string[] = []
  if (ref.filename) parts.push(`file=${ref.filename}`)
  if (ref.viewKey) parts.push(`view=${ref.viewKey}`)
  if (elementIds.length > 0) parts.push(`elements=${elementIds.join(',')}`)
  else parts.push(`relationship=${ref.relationshipId}`)
  return `[c4hero ${parts.join(' ')}] `
}
