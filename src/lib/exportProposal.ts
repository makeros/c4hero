import type { Node, ReactFlowInstance } from '@xyflow/react'
import type { View, Workspace } from '@/types/model'
import type { WorkspaceState } from '@/store/workspace-types'
import { getNodeBounds, isContentFitNode } from '@/lib/fitViewport'
import { LIGHT_STYLE } from '@/lib/exportUtils'
import { sanitizeFilename } from '@/lib/filenames'
import { useWorkspaceStore } from '@/store/workspace'

// Mirrors Canvas.tsx's own measurement-polling cap (MAX_MEASURE_ATTEMPTS = 60,
// ~1s at 60fps) — see src/components/canvas/Canvas.tsx:439.
const MAX_MEASURE_ATTEMPTS = 60

// Wall-clock safety net: `requestAnimationFrame` is not serviced in a
// backgrounded/hidden tab, so a purely frame-bounded poll can hang forever if
// the user switches tabs mid-batch. This bound is checked independently of
// MAX_MEASURE_ATTEMPTS so the wait always settles in real time.
const WALL_CLOCK_TIMEOUT_MS = 2000

/**
 * Nodes that should contribute to the content bounding box: real content
 * nodes, or overlay (group/scope-boundary) nodes only once they're actually
 * measured. Mirrors `fitContentNodesToViewport`'s filter in fitViewport.ts —
 * unmeasured overlays fall back to a stale/default 200x100 box that would
 * skew the crop, and overlay rectangles are rebuilt asynchronously by
 * Canvas's `rebuildOverlays` *after* content nodes measure, so an unmeasured
 * overlay here would also mean stale geometry in the rendered pixels.
 */
function getBoundsCandidateNodes(reactFlow: ReactFlowInstance): Node[] {
  const all = reactFlow.getNodes()
  const filtered = all.filter(
    (n) => isContentFitNode(n) || (n.measured?.width != null && n.measured?.height != null),
  )
  return filtered.length ? filtered : all
}

/**
 * Capture the currently-active view as a light/white PNG cropped to its
 * content bounding box. Targets `.react-flow__viewport` (the panned/zoomed
 * inner layer) with its transform overridden to translate the bounding box
 * to the origin, so the capture is correct regardless of the live pan/zoom —
 * no `fitView`/viewport-restore is needed before calling this, only
 * measurement (see `waitForViewMeasured`).
 *
 * The forced light palette (`LIGHT_STYLE`) is applied by mutating the LIVE
 * `.react-flow__viewport` element's inline style (not passed through
 * `html-to-image`'s `style` option) — assigning a CSS custom property via
 * that option creates a JS expando that `html-to-image`'s clone-and-compute
 * pipeline never sees, so descendants would keep their live (dark) resolved
 * colors. Mutating the live element lets the real cascade resolve descendant
 * `var(--color-*)` references before `html-to-image` clones+computes them;
 * the original values are restored in `finally`.
 */
export async function captureViewAsProposalPNG(reactFlow: ReactFlowInstance): Promise<Blob | null> {
  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!viewport) return null

  const bounds = getNodeBounds(getBoundsCandidateNodes(reactFlow))
  if (!bounds) return null

  const previousValues = new Map<string, string>()
  for (const [name, value] of Object.entries(LIGHT_STYLE)) {
    previousValues.set(name, viewport.style.getPropertyValue(name))
    viewport.style.setProperty(name, value)
  }

  try {
    const { toBlob } = await import('html-to-image')
    return await toBlob(viewport, {
      width: bounds.width,
      height: bounds.height,
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      style: {
        transform: `translate(${-bounds.minX}px, ${-bounds.minY}px)`,
      },
    })
  } finally {
    for (const [name, previous] of previousValues) {
      if (previous) viewport.style.setProperty(name, previous)
      else viewport.style.removeProperty(name)
    }
  }
}

function contentNodeIds(reactFlow: ReactFlowInstance): Set<string> {
  return new Set(reactFlow.getNodes().filter(isContentFitNode).map((n) => n.id))
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) {
    if (!b.has(id)) return false
  }
  return true
}

/**
 * Poll (via rAF) until React Flow's rendered content-node set has settled on
 * the new view's nodes and every one of them is measured (has both
 * `measured.width` and `measured.height`).
 *
 * `setActiveView` is synchronous but React's node commit is not, so the very
 * first rAF tick can still see the *previous* view's (already-measured)
 * nodes. To avoid falsely reporting "ready" on stale content (and to work
 * correctly for deployment views, whose `view.elements` ids never match any
 * rendered node id — see `deploymentBuilders.ts`, which renders
 * `__scope_boundary__<id>` overlays instead of content nodes for those ids),
 * the expected id set is NOT derived from `view.elements`. Instead:
 *
 * 1. Snapshot the content-node ids present *before* this view's nodes have
 *    had a chance to commit (`staleIds` — the previous view's nodes).
 * 2. On each frame, read the current content-node ids. If they differ from
 *    the last-seen set, remember them and wait one more frame (the set may
 *    still be settling as React commits the new view's nodes).
 * 3. Once the id set is stable across two consecutive frames AND differs
 *    from `staleIds` AND is non-empty, that's the new view's real
 *    content-node set — mirrors Canvas.tsx's `seen.size !== expected.size` +
 *    per-id exact-set-equality gate (Canvas.tsx:496-502), just derived from
 *    observed stability instead of a precomputed builder output.
 * 4. Ready once every id in that stable set is measured.
 *
 * Bounded both by MAX_MEASURE_ATTEMPTS frames and by a wall-clock deadline
 * (`WALL_CLOCK_TIMEOUT_MS`) — `requestAnimationFrame` isn't serviced in a
 * backgrounded tab, so the frame cap alone can't guarantee real-time
 * progress. Resolves `{ timedOut: true }` if either bound is hit, so callers
 * can proceed with whatever is measured and record a warning instead of
 * hanging the batch. A view with no elements has nothing to wait for and
 * resolves immediately.
 */
export function waitForViewMeasured(reactFlow: ReactFlowInstance, view: View): Promise<{ timedOut: boolean }> {
  if (view.elements.length === 0) return Promise.resolve({ timedOut: false })

  const staleIds = contentNodeIds(reactFlow)
  const deadline = Date.now() + WALL_CLOCK_TIMEOUT_MS

  return new Promise((resolve) => {
    let attempts = 0
    let lastSeenIds = staleIds

    const check = () => {
      const currentIds = contentNodeIds(reactFlow)

      if (!setsEqual(currentIds, lastSeenIds)) {
        // Node set just changed since the last frame (either away from the
        // previous view's stale nodes, or still settling) — remember it and
        // require one more matching frame before trusting it.
        lastSeenIds = currentIds
      } else if (currentIds.size > 0 && !setsEqual(currentIds, staleIds)) {
        // Stable across two consecutive frames AND different from the
        // previous view's node set: this is the new view's content-node set.
        const nodesById = new Map(reactFlow.getNodes().map((n) => [n.id, n]))
        const ready = [...currentIds].every((id) => {
          const node = nodesById.get(id)
          return node?.measured?.width != null && node?.measured?.height != null
        })
        if (ready) {
          resolve({ timedOut: false })
          return
        }
      }

      if (Date.now() >= deadline || attempts++ >= MAX_MEASURE_ATTEMPTS) {
        resolve({ timedOut: true })
        return
      }

      requestAnimationFrame(check)
    }

    requestAnimationFrame(check)
  })
}

export interface ExportViewsForProposalParams {
  reactFlow: ReactFlowInstance
  workspace: Workspace
  views: View[]
}

export interface ExportViewsForProposalResult {
  files: { filename: string; blob: Blob }[]
  skipped: { view: View; reason: string }[]
  warnings: { view: View; reason: string }[]
}

/** Snapshot of store state that `setActiveView` mutates as a side effect
 *  (selection + highlighter filters), restored after the batch completes. */
type SelectionSnapshot = Pick<
  WorkspaceState,
  | 'selectedElementIds'
  | 'selectedRelationshipId'
  | 'selectedGroupId'
  | 'activeTagFilter'
  | 'activeStatusFilter'
  | 'activeTechFilter'
  | 'activeTeamFilter'
  | 'lastClearedHighlightFilters'
>

function snapshotSelection(): SelectionSnapshot {
  const s = useWorkspaceStore.getState()
  return {
    selectedElementIds: s.selectedElementIds,
    selectedRelationshipId: s.selectedRelationshipId,
    selectedGroupId: s.selectedGroupId,
    activeTagFilter: s.activeTagFilter,
    activeStatusFilter: s.activeStatusFilter,
    activeTechFilter: s.activeTechFilter,
    activeTeamFilter: s.activeTeamFilter,
    lastClearedHighlightFilters: s.lastClearedHighlightFilters,
  }
}

/** Append a numeric disambiguator before the extension if `filename` was
 *  already produced earlier in this batch, so duplicate view titles never
 *  silently collapse to one zip entry. */
function dedupeFilename(filename: string, used: Map<string, number>): string {
  const seenCount = used.get(filename) ?? 0
  used.set(filename, seenCount + 1)
  if (seenCount === 0) return filename

  const dot = filename.lastIndexOf('.')
  const base = dot === -1 ? filename : filename.slice(0, dot)
  const ext = dot === -1 ? '' : filename.slice(dot)
  return `${base} (${seenCount + 1})${ext}`
}

/**
 * Drive the single mounted React Flow instance through each of `views` in
 * turn, capturing a light/white content-cropped PNG per view, and restore
 * the view (and the selection/highlighter state `setActiveView` clears as a
 * side effect) the user started on when done — even if a capture throws.
 * No-ops (no store reads/writes at all) when `views` is empty.
 */
export async function exportViewsForProposal(
  params: ExportViewsForProposalParams,
): Promise<ExportViewsForProposalResult> {
  const { reactFlow, workspace, views } = params

  const files: { filename: string; blob: Blob }[] = []
  const skipped: { view: View; reason: string }[] = []
  const warnings: { view: View; reason: string }[] = []

  if (views.length === 0) {
    return { files, skipped, warnings }
  }

  const originalViewKey = useWorkspaceStore.getState().activeViewKey
  const originalSelection = snapshotSelection()
  const usedFilenames = new Map<string, number>()

  try {
    for (const view of views) {
      useWorkspaceStore.getState().setActiveView(view.key)
      const { timedOut } = await waitForViewMeasured(reactFlow, view)

      if (view.elements.length === 0) {
        skipped.push({ view, reason: 'View has no elements to export' })
        continue
      }

      try {
        const blob = await captureViewAsProposalPNG(reactFlow)
        if (!blob) {
          skipped.push({ view, reason: 'Failed to capture view' })
          continue
        }
        const baseFilename = `${sanitizeFilename(workspace.name ?? 'workspace')}-${sanitizeFilename(view.title ?? view.key)}.png`
        const filename = dedupeFilename(baseFilename, usedFilenames)
        files.push({ filename, blob })
        if (timedOut) {
          warnings.push({
            view,
            reason: 'Export may be incomplete: view did not finish rendering before capture',
          })
        }
      } catch (error) {
        skipped.push({ view, reason: error instanceof Error ? error.message : 'Failed to capture view' })
      }
    }
  } finally {
    if (originalViewKey) {
      useWorkspaceStore.getState().setActiveView(originalViewKey)
    }
    useWorkspaceStore.setState(originalSelection)
  }

  return { files, skipped, warnings }
}
