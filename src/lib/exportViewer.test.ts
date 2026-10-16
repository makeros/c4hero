import { describe, it, expect, vi } from 'vitest'
import { createMicroservicesTemplate } from '@/lib/templates'
import { serializeDSL } from '@/lib/dsl'
import { parseExportInput, handleExportRequest, type ExportContext } from './exportViewer'

const workspace = createMicroservicesTemplate()
const firstView = workspace.views.containerViews[0] ?? workspace.views.systemContextViews[0]

function makeCtx(overrides: Partial<ExportContext> = {}): ExportContext {
  return {
    getWorkspace: () => workspace,
    getActiveViewKey: () => null,
    setActiveView: vi.fn(),
    waitForView: vi.fn(async () => {}),
    fit: vi.fn(async () => {}),
    capturePng: vi.fn(async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })),
    captureSvg: vi.fn(() => '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    ...overrides,
  }
}

describe('parseExportInput', () => {
  it('parses dsl into a workspace and falls back to the given name', () => {
    const dsl = 'workspace {\n  model {\n    u = person "User"\n  }\n}\n'
    const result = parseExportInput({ dsl, sidecar: null, name: 'demo' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.workspace.name).toBe('demo')
  })

  it('accepts real serialized DSL', () => {
    const result = parseExportInput({ dsl: serializeDSL(workspace), name: 'ms' })
    expect(result.ok && result.workspace.views.containerViews.length).toBe(workspace.views.containerViews.length)
  })

  it.each([
    [undefined, 'Export input is missing'],
    [{ sidecar: null }, 'Export input needs a "dsl" string'],
    [{ dsl: 'x', sidecar: 5 }, 'Export input "sidecar" must be a string'],
    [{ dsl: 'x', name: 5 }, 'Export input "name" must be a string'],
  ])('rejects invalid input %#', (raw, error) => {
    expect(parseExportInput(raw)).toEqual({ ok: false, error })
  })
})

describe('handleExportRequest', () => {
  it('returns an error naming the available views for an unknown view', async () => {
    const result = await handleExportRequest({ view: 'nope', format: 'png', theme: 'light' }, makeCtx())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Unknown view "nope"')
      expect(result.error).toContain(firstView.key)
    }
  })

  it.each([
    [null, 'Export request is missing'],
    [{ format: 'png', theme: 'light' }, 'Export request needs a "view" key'],
    [{ view: 'a', format: 'gif', theme: 'light' }, 'Export "format" must be "png" or "svg"'],
    [{ view: 'a', format: 'png', theme: 'current' }, 'Export "theme" must be "light" or "dark"'],
    [{ view: 'a', format: 'png', theme: 'dark', padding: -1 }, 'Export "padding" must be a non-negative number'],
  ])('rejects an invalid request %#', async (raw, error) => {
    expect(await handleExportRequest(raw, makeCtx())).toEqual({ ok: false, error })
  })

  it('errors when no workspace is loaded', async () => {
    const result = await handleExportRequest(
      { view: firstView.key, format: 'png', theme: 'light' },
      makeCtx({ getWorkspace: () => null }),
    )
    expect(result).toEqual({ ok: false, error: 'No workspace loaded' })
  })

  it('switches view, waits, fits and returns base64 PNG', async () => {
    const ctx = makeCtx()
    const result = await handleExportRequest({ view: firstView.key, format: 'png', theme: 'dark', padding: 0.2 }, ctx)
    expect(ctx.setActiveView).toHaveBeenCalledWith(firstView.key)
    expect(ctx.waitForView).toHaveBeenCalledWith(expect.objectContaining({ key: firstView.key }), true)
    expect(ctx.fit).toHaveBeenCalledWith(0.2)
    expect(result).toEqual({ ok: true, mime: 'image/png', base64: btoa('\x89PNG') })
  })

  it('does not switch when the view is already active and exports SVG as base64', async () => {
    const ctx = makeCtx({ getActiveViewKey: () => firstView.key })
    const result = await handleExportRequest({ view: firstView.key, format: 'svg', theme: 'light' }, ctx)
    expect(ctx.setActiveView).not.toHaveBeenCalled()
    expect(ctx.waitForView).toHaveBeenCalledWith(expect.anything(), false)
    expect(result.ok && result.mime).toBe('image/svg+xml')
    if (result.ok) expect(atob(result.base64)).toContain('<svg')
  })

  it('reports a render failure and thrown errors as ok:false', async () => {
    const req = { view: firstView.key, format: 'png', theme: 'light' }
    expect(await handleExportRequest(req, makeCtx({ capturePng: async () => null }))).toEqual({
      ok: false,
      error: 'Failed to render PNG',
    })
    expect(await handleExportRequest(req, makeCtx({ fit: async () => { throw new Error('boom') } }))).toEqual({
      ok: false,
      error: 'boom',
    })
  })
})
