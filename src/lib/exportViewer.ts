import type { ReactFlowInstance } from '@xyflow/react'
import type { View, Workspace } from '@/types/model'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'
import { exportCanvasAsPNG, exportCanvasAsSVG } from '@/lib/exportUtils'
import { waitForViewMeasured } from '@/lib/exportProposal'
import { fitContentNodesToViewport, isContentFitNode } from '@/lib/fitViewport'
import { allViewsOf, useWorkspaceStore } from '@/store/workspace'

// Entry points for the headless export viewer (`npm run build:plugin` builds
// the app with EXPORT_MODE on). The CLI injects the workspace as
// `window.__C4HERO_EXPORT_INPUT__`, polls `window.__c4heroExportReady`, then
// calls `window.__c4heroExport(...)` once per image. App.tsx imports this
// module only behind the EXPORT_MODE define, so normal builds never ship it.

export interface ExportInput {
  dsl: string
  sidecar?: string | null
  name?: string
}

export interface ExportRequest {
  view: string
  format: 'png' | 'svg'
  theme: 'light' | 'dark'
  /** Fraction of the canvas left empty around the diagram (default 0.05). */
  padding?: number
}

export type ExportResult = { ok: true; mime: string; base64: string } | { ok: false; error: string }

declare global {
  interface Window {
    __C4HERO_EXPORT_INPUT__?: unknown
    __c4heroExport?: (req: unknown) => Promise<ExportResult>
    __c4heroExportReady?: boolean
    __c4heroExportError?: string
  }
}

const INPUT_POLL_MS = 50
const INPUT_TIMEOUT_MS = 30_000
// Canvas.tsx animates its own fit for 300ms after a view change; our instant
// fit must land after it or the animation would overwrite it.
const FIT_SETTLE_MS = 400

export function parseExportInput(raw: unknown): { ok: true; workspace: Workspace } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Export input is missing' }
  const { dsl, sidecar, name } = raw as Record<string, unknown>
  if (typeof dsl !== 'string') return { ok: false, error: 'Export input needs a "dsl" string' }
  if (sidecar != null && typeof sidecar !== 'string') return { ok: false, error: 'Export input "sidecar" must be a string' }
  if (name != null && typeof name !== 'string') return { ok: false, error: 'Export input "name" must be a string' }
  const { workspace } = parseWorkspaceDocument({
    content: dsl,
    fallbackName: name ?? 'workspace',
    sidecarJson: sidecar ?? undefined,
  })
  return { ok: true, workspace }
}

/** Waits for `window.__C4HERO_EXPORT_INPUT__`, loads it read-only. On failure
 *  sets `window.__c4heroExportError` so the CLI can report it. */
export async function bootExportWorkspace(): Promise<void> {
  const deadline = Date.now() + INPUT_TIMEOUT_MS
  while (window.__C4HERO_EXPORT_INPUT__ === undefined) {
    if (Date.now() >= deadline) {
      window.__c4heroExportError = 'Timed out waiting for export input'
      return
    }
    await new Promise((resolve) => setTimeout(resolve, INPUT_POLL_MS))
  }
  const parsed = parseExportInput(window.__C4HERO_EXPORT_INPUT__)
  if (!parsed.ok) {
    window.__c4heroExportError = parsed.error
    return
  }
  useWorkspaceStore.getState().loadWorkspace(parsed.workspace)
  useWorkspaceStore.getState().setReadOnly(true)
}

export interface ExportContext {
  getWorkspace: () => Workspace | null
  getActiveViewKey: () => string | null
  setActiveView: (key: string) => void
  /** Resolves once the view's nodes are laid out and measured; `switched` is
   *  true when the view was just activated (so stale nodes may still be shown). */
  waitForView: (view: View, switched: boolean) => Promise<void>
  fit: (padding: number | undefined) => Promise<void>
  capturePng: (theme: 'light' | 'dark') => Promise<Blob | null>
  captureSvg: (theme: 'light' | 'dark') => string | null
}

function parseRequest(raw: unknown): ExportRequest | string {
  if (typeof raw !== 'object' || raw === null) return 'Export request is missing'
  const { view, format, theme, padding } = raw as Record<string, unknown>
  if (typeof view !== 'string' || view === '') return 'Export request needs a "view" key'
  if (format !== 'png' && format !== 'svg') return 'Export "format" must be "png" or "svg"'
  if (theme !== 'light' && theme !== 'dark') return 'Export "theme" must be "light" or "dark"'
  if (padding !== undefined && (typeof padding !== 'number' || !(padding >= 0))) {
    return 'Export "padding" must be a non-negative number'
  }
  return { view, format, theme, padding }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export async function handleExportRequest(raw: unknown, ctx: ExportContext): Promise<ExportResult> {
  try {
    const req = parseRequest(raw)
    if (typeof req === 'string') return { ok: false, error: req }

    const workspace = ctx.getWorkspace()
    if (!workspace) return { ok: false, error: 'No workspace loaded' }

    const views = allViewsOf(workspace)
    const view = views.find((v) => v.key === req.view)
    if (!view) {
      return { ok: false, error: `Unknown view "${req.view}". Available views: ${views.map((v) => v.key).join(', ') || '(none)'}` }
    }
    if (view.elements.length === 0) return { ok: false, error: `View "${view.key}" has no elements to export` }

    const switched = ctx.getActiveViewKey() !== view.key
    if (switched) ctx.setActiveView(view.key)
    await ctx.waitForView(view, switched)
    await ctx.fit(req.padding)

    if (req.format === 'png') {
      const blob = await ctx.capturePng(req.theme)
      if (!blob) return { ok: false, error: 'Failed to render PNG' }
      return { ok: true, mime: 'image/png', base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) }
    }
    const svg = ctx.captureSvg(req.theme)
    if (!svg) return { ok: false, error: 'Failed to render SVG' }
    return { ok: true, mime: 'image/svg+xml', base64: bytesToBase64(new TextEncoder().encode(svg)) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function waitUntilMeasured(rf: ReactFlowInstance): Promise<void> {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const nodes = rf.getNodes().filter(isContentFitNode)
    if (nodes.length > 0 && nodes.every((n) => n.measured?.width != null && n.measured?.height != null)) return
    await nextFrame()
  }
}

function createContext(rf: ReactFlowInstance): ExportContext {
  const store = useWorkspaceStore
  return {
    getWorkspace: () => store.getState().workspace,
    getActiveViewKey: () => store.getState().activeViewKey,
    setActiveView: (key) => store.getState().setActiveView(key),
    // After a switch the shared poll skips the previous view's stale nodes;
    // the already-active view only needs its nodes measured.
    waitForView: async (view, switched) => {
      if (switched) await waitForViewMeasured(rf, view)
      else await waitUntilMeasured(rf)
    },
    fit: async (padding) => {
      await sleep(FIT_SETTLE_MS)
      fitContentNodesToViewport(rf, { padding, duration: 0 })
      await nextFrame()
      await nextFrame()
    },
    capturePng: (theme) => exportCanvasAsPNG(theme),
    captureSvg: (theme) => exportCanvasAsSVG(theme),
  }
}

export function installExportApi(rf: ReactFlowInstance): void {
  const ctx = createContext(rf)
  window.__c4heroExport = (req) => handleExportRequest(req, ctx)
  window.__c4heroExportReady = true
}
