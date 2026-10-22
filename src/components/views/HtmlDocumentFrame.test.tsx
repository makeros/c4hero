import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HtmlDocumentFrame from './HtmlDocumentFrame'

// Captures the live-reload subscriber so tests can play dev-server events,
// same pattern as DocumentView.test.tsx.
const { docChangeListeners } = vi.hoisted(() => ({
  docChangeListeners: new Set<(change: { path: string; kind: 'change' | 'add' | 'unlink' }) => void>(),
}))
vi.mock('@/lib/docLiveReload', () => ({
  onDocChange: (cb: (change: { path: string; kind: 'change' | 'add' | 'unlink' }) => void) => {
    docChangeListeners.add(cb)
    return () => docChangeListeners.delete(cb)
  },
}))
function emitDocChange(path = 'docs/unrelated.css', kind: 'change' | 'add' | 'unlink' = 'change') {
  act(() => docChangeListeners.forEach((cb) => cb({ path, kind })))
}

function res(init: { ok: boolean; status: number }): Response {
  return init as unknown as Response
}

function stubFetch(impl: () => unknown) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => {
  vi.unstubAllGlobals()
  docChangeListeners.clear()
})

describe('HtmlDocumentFrame', () => {
  it('renders an iframe with exactly the D2 sandbox flags and no allow-same-origin', async () => {
    stubFetch(() => res({ ok: true, status: 200 }))
    render(<HtmlDocumentFrame path="docs/r.html" title="Report" hash="" />)
    const iframe = await screen.findByTitle('Report')
    expect(iframe.getAttribute('sandbox')).toBe(
      'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation',
    )
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')
  })

  it('points the iframe src at /__docs/<path> and carries the hash', async () => {
    stubFetch(() => res({ ok: true, status: 200 }))
    render(<HtmlDocumentFrame path="docs/r.html" title="Report" hash="#section" />)
    const iframe = await screen.findByTitle('Report')
    expect(iframe.getAttribute('src')).toBe('/__docs/docs/r.html#section')
  })

  it('falls back to the file name when no title is given', async () => {
    stubFetch(() => res({ ok: true, status: 200 }))
    render(<HtmlDocumentFrame path="docs/r.html" title={null} hash="" />)
    expect(await screen.findByTitle('r.html')).toBeTruthy()
  })

  it('shows the not-found screen on a 404', async () => {
    stubFetch(() => res({ ok: false, status: 404 }))
    render(<HtmlDocumentFrame path="docs/missing.html" title={null} hash="" />)
    await waitFor(() => expect(screen.getByText('Document not found')).toBeTruthy())
    expect(screen.getByText(/docs\/missing\.html/)).toBeTruthy()
  })

  it('shows an error screen on a network failure', async () => {
    stubFetch(() => Promise.reject(new Error('network down')))
    render(<HtmlDocumentFrame path="docs/r.html" title={null} hash="" />)
    await waitFor(() => expect(screen.getByText("Couldn't load document")).toBeTruthy())
  })

  it('remounts the iframe on any doc-change event, even for an unrelated path', async () => {
    stubFetch(() => res({ ok: true, status: 200 }))
    render(<HtmlDocumentFrame path="docs/r.html" title="Report" hash="" />)
    const before = await screen.findByTitle('Report')

    emitDocChange('docs/unrelated.css')

    await waitFor(() => expect(screen.getByTitle('Report')).not.toBe(before))
  })
})
