import type { ViewType, Workspace } from '@/types/model'
import { allViewsOf } from '@/store/workspace-helpers'
import type { CliResult } from './output'

/** The `--type` word for each view type; also the suffix of a default key. */
export const VIEW_TYPE_WORDS: Record<string, ViewType> = {
  landscape: 'systemLandscape',
  context: 'systemContext',
  container: 'container',
  component: 'component',
  dynamic: 'dynamic',
  deployment: 'deployment',
}

const WORD_BY_TYPE = Object.fromEntries(Object.entries(VIEW_TYPE_WORDS).map(([word, type]) => [type, word])) as Record<ViewType, string>

/** `base`, or `base-2`, `base-3`, ... when a view already holds the key. */
export function uniqueViewKey(ws: Workspace, base: string): string {
  const taken = new Set(allViewsOf(ws).map((v) => v.key))
  let key = base
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`
  return key
}

/** The readable default key for a view: `<scopeId>-<type word>` (or just the
 *  type word without a scope, e.g. `landscape`), made unique. */
export function defaultViewKey(ws: Workspace, type: ViewType, scopeId: string | undefined): string {
  const word = WORD_BY_TYPE[type]
  return uniqueViewKey(ws, scopeId ? `${scopeId}-${word}` : word)
}

/** Maps `changed.views` through the renames a save applied and reports them as
 *  `data.renamedViews` ({ storeMintedKey: finalKey }). No-op without renames. */
export function withRenamedViews(result: CliResult, renamed: Record<string, string>): CliResult {
  if (Object.keys(renamed).length === 0) return result
  const views = result.changed?.views?.map((k) => renamed[k] ?? k)
  return {
    ...result,
    ...(result.changed ? { changed: { ...result.changed, ...(views ? { views } : {}) } } : {}),
    data: { ...(result.data as object | undefined), renamedViews: renamed },
  }
}
