/// <reference types="node" />
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Workspace } from '@/types/model'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { extractSidecar, serializeSidecar } from '@/lib/sidecar'
import { sidecarName } from '@/lib/sidecarName'
import { rekeySidecar } from '@/lib/renameIdentifier'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'
import { useWorkspaceStore, type WorkspaceState } from '@/store/workspace'
import { allViewsOf, forEachElementHelper } from '@/store/workspace-helpers'
import { unifiedDiff } from './diff'
import { CliFailure, LossyFileError, ParseFailedError } from './errors'
import { describeFinding, findLossyConstructs } from './lossyGuard'
import { defaultViewKey } from './viewKeys'

export interface SaveResult {
  changed: boolean
  dslPath: string
  sidecarPath: string | null
  /** Unified diff of every file the save would change; present on dry runs. */
  diff?: string
  /** Views created this session whose store-minted key was replaced by a
   *  readable one before serializing: { mintedKey: finalKey }. Empty when none. */
  renamedViews: Record<string, string>
}

/** A headless editing session over the real workspace store. Each CLI
 *  invocation opens one, mutates it through `actions()`, and saves once. */
export interface Session {
  file: string
  workspace(): Workspace
  actions(): WorkspaceState
  /** Record that element `oldId` is now `newId` (after `renameElementId`).
   *  `save` applies every recorded rename and removal to the sidecar through
   *  `rekeySidecar`, so layout follows renamed elements and deleted ones are
   *  pruned. Commands that rename or delete elements must call these. */
  recordRename(oldId: string, newId: string): void
  recordRemoved(id: string): void
  /** Keep `key` as is. Store actions that auto-create views (add container or
   *  component, move, apply's addView) mint random keys; `save` renames every
   *  view created during the session to the readable default (`<scope>-<type>`)
   *  unless its key was chosen by the user and marked here. */
  markExplicitViewKey(key: string): void
  save(opts: { dryRun: boolean }): SaveResult
}

/** Loads `file` the way the app opens a .dsl (parseWorkspaceDocument with the
 *  sibling sidecar, then `loadWorkspace`). Throws ParseFailedError on parse
 *  errors, and LossyFileError when a rewrite would drop content unless
 *  `force`. Read-only commands pass `force: true`, since they never write. */
export function openSession(file: string, opts: { force: boolean }): Session {
  const dslPath = path.resolve(file)
  if (!existsSync(dslPath)) throw new CliFailure('NOT_FOUND', `Workspace file not found: ${dslPath}`)
  const sidecarPath = path.join(path.dirname(dslPath), sidecarName(path.basename(dslPath)))

  const content = readFileSync(dslPath, 'utf8')
  const sidecarJson = existsSync(sidecarPath) ? readFileSync(sidecarPath, 'utf8') : undefined
  const { workspace, errors } = parseWorkspaceDocument({
    content,
    fallbackName: path.basename(dslPath, path.extname(dslPath)),
    sidecarJson,
  })
  if (errors.length > 0) {
    throw new ParseFailedError(
      `${dslPath} has ${errors.length} parse error(s)`,
      errors.map((e) => `line ${e.line}: ${e.message}`),
    )
  }
  if (!opts.force) {
    const findings = findLossyConstructs(content)
    if (findings.length > 0) throw new LossyFileError(findings.map(describeFinding))
  }

  useWorkspaceStore.getState().loadWorkspace(workspace)

  const renames = new Map<string, string>()
  const removed = new Set<string>()
  const settledViewKeys = new Set(allViewsOf(workspace).map((v) => v.key))

  /** Renames session-created views with a non-explicit key to readable ones.
   *  Nothing in the workspace refers to a view by key (the sidecar is built from
   *  the views at save time), so changing `view.key` is the whole rename. */
  function renameAutoViews(): Record<string, string> {
    const renamed: Record<string, string> = {}
    const pending = allViewsOf(useWorkspaceStore.getState().workspace!).filter((v) => !settledViewKeys.has(v.key))
    if (pending.length === 0) return renamed
    const next = structuredClone(useWorkspaceStore.getState().workspace!)
    for (const view of allViewsOf(next).filter((v) => !settledViewKeys.has(v.key))) {
      const key = defaultViewKey(next, view.type, view.type === 'component' ? view.containerId : view.softwareSystemId)
      renamed[view.key] = key
      view.key = key
      settledViewKeys.add(key)
    }
    useWorkspaceStore.getState().resetWorkspaceTo(next)
    return renamed
  }

  return {
    file: dslPath,
    workspace() {
      const ws = useWorkspaceStore.getState().workspace
      if (!ws) throw new Error('No workspace loaded')
      return ws
    },
    actions: () => useWorkspaceStore.getState(),
    recordRename(oldId, newId) {
      for (const [from, to] of renames) if (to === oldId) renames.set(from, newId)
      if (!renames.has(oldId)) renames.set(oldId, newId)
    },
    recordRemoved(id) {
      removed.add(id)
    },
    markExplicitViewKey(key) {
      settledViewKeys.add(key)
    },
    save({ dryRun }) {
      const renamedViews = renameAutoViews()
      const ws = this.workspace()
      const nextDsl = serializeDSL(ws)
      assertSerializedKeepsContent(ws, nextDsl)
      const extracted = extractSidecar(ws)
      const nextSidecar = extracted ? serializeSidecar(rekeySidecar(extracted, renames, removed)) : null

      const prevSidecar = sidecarJson ?? null
      const dslChanged = nextDsl !== content
      const sidecarChanged = nextSidecar !== prevSidecar
      const result: SaveResult = {
        changed: dslChanged || sidecarChanged,
        dslPath,
        sidecarPath: nextSidecar !== null || prevSidecar !== null ? sidecarPath : null,
        renamedViews,
      }
      if (dryRun) {
        result.diff =
          unifiedDiff(path.basename(dslPath), content, nextDsl) +
          unifiedDiff(path.basename(sidecarPath), prevSidecar ?? '', nextSidecar ?? '')
        return result
      }
      if (dslChanged) writeAtomic(dslPath, nextDsl)
      if (sidecarChanged) {
        if (nextSidecar === null) rmSync(sidecarPath, { force: true })
        else writeAtomic(sidecarPath, nextSidecar)
      }
      return result
    },
  }
}

function tally(ws: Workspace): { elements: number; relationships: number; views: number } {
  let elements = 0
  forEachElementHelper(ws, () => {
    elements++
  })
  return {
    elements,
    relationships: ws.model.relationships.length,
    // Auto-generated views are never serialized; a re-parse regenerates them only for view-less files.
    views: allViewsOf(ws).filter((v) => !v.autoView).length,
  }
}

/** Last line of defence against a serializer or parser blind spot (for example
 *  a DSL keyword used as an element id): re-parse what is about to be written
 *  and refuse when it fails to parse or lost elements, relationships or views. */
function assertSerializedKeepsContent(ws: Workspace, dsl: string): void {
  const reparsed = parseDSL(dsl)
  if (reparsed.errors.length > 0) {
    throw new CliFailure(
      'VALIDATION',
      'The rewritten file would not parse back; refusing to write it.',
      reparsed.errors.map((e) => `line ${e.line}: ${e.message}`),
    )
  }
  const want = tally(ws)
  const got = tally(reparsed.workspace)
  const lost = (['elements', 'relationships', 'views'] as const)
    .filter((k) => got[k] < want[k])
    .map((k) => `${k}: ${want[k]} in memory, ${got[k]} after re-parse`)
  if (lost.length > 0) {
    throw new CliFailure('VALIDATION', 'The rewritten file would lose content on re-parse; refusing to write it.', lost)
  }
}

/** Temp file in the destination directory, then rename: readers never see a
 *  half-written file, and rename is atomic on one filesystem. */
function writeAtomic(target: string, data: string): void {
  const tmp = `${target}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, data)
    renameSync(tmp, target)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}
