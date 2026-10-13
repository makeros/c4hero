import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DocumentView from './DocumentView'

function res(init: { ok: boolean; status: number; text: () => Promise<string> }): Response {
  return init as unknown as Response
}

function stubFetch(impl: () => unknown) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => vi.unstubAllGlobals())

describe('DocumentView', () => {
  it('fetches the document and renders its markdown as HTML', async () => {
    stubFetch(() => res({ ok: true, status: 200, text: async () => '# Hello\n\nSome body text.' }))

    render(
      <MemoryRouter initialEntries={['/document-view?path=docs/readme.md&title=Readme']}>
        <DocumentView />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Hello' })).toBeTruthy()
    })
    expect(screen.getByText('Some body text.')).toBeTruthy()
    // Not raw markdown syntax in the rendered output.
    expect(screen.queryByText('# Hello', { exact: false })).toBeNull()
    expect(document.title).toBe('Readme')
  })

  it('shows a not-found state on a 404 response', async () => {
    stubFetch(() => res({ ok: false, status: 404, text: async () => '' }))

    render(
      <MemoryRouter initialEntries={['/document-view?path=docs/missing.md']}>
        <DocumentView />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Document not found')).toBeTruthy()
    })
    expect(screen.getByText(/docs\/missing\.md/)).toBeTruthy()
  })

  it('shows a distinct state when no path query param is present', () => {
    render(
      <MemoryRouter initialEntries={['/document-view']}>
        <DocumentView />
      </MemoryRouter>,
    )

    expect(screen.getByText('No document specified')).toBeTruthy()
  })

  it('shows an error state on a network failure, without crashing', async () => {
    stubFetch(() => Promise.reject(new Error('network down')))

    render(
      <MemoryRouter initialEntries={['/document-view?path=docs/readme.md']}>
        <DocumentView />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText("Couldn't load document")).toBeTruthy()
    })
  })
})
