import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DocumentView from './DocumentView'

// Real routing (the global setup mocks useNavigate/useLocation).
vi.mock('react-router-dom', async (importOriginal) => importOriginal())

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

  describe('links', () => {
    const MD = '# Top\n\n[sib](other.md#sec) [ext](https://x.io) [anc](#top)'
    function LocationProbe() {
      const l = useLocation()
      return <div data-testid="loc">{l.pathname + l.search + l.hash}</div>
    }
    function mount(md = MD) {
      stubFetch(() => res({ ok: true, status: 200, text: async () => md }))
      return render(
        <MemoryRouter initialEntries={['/document-view?path=docs/a.md&title=A']}>
          <DocumentView />
          <LocationProbe />
        </MemoryRouter>,
      )
    }

    it('uses a scroll container that fills #root', async () => {
      const { container } = mount()
      await screen.findByRole('heading', { name: 'Top' })
      const outer = container.firstElementChild as HTMLElement
      expect(outer.style.height).toBe('100%')
      expect(outer.style.overflowY).toBe('auto')
    })

    it('rewrites relative .md links and marks external ones target=_blank', async () => {
      mount()
      const sib = await screen.findByRole('link', { name: 'sib' })
      expect(sib.getAttribute('href')).toBe('/document-view?path=docs%2Fother.md&title=sib#sec')
      const ext = screen.getByRole('link', { name: 'ext' })
      expect(ext.getAttribute('target')).toBe('_blank')
      expect(ext.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('navigates in the same tab on plain click and refetches the new path', async () => {
      mount()
      fireEvent.click(await screen.findByRole('link', { name: 'sib' }))
      await waitFor(() =>
        expect(screen.getByTestId('loc').textContent).toBe('/document-view?path=docs%2Fother.md&title=sib#sec'),
      )
      await waitFor(() =>
        expect(fetch).toHaveBeenLastCalledWith('/__docs/docs/other.md'),
      )
    })

    it('navigates in the same tab when an inline-code .md mention is clicked', async () => {
      mount('# Top\n\nSee `other.md` here.')
      fireEvent.click(await screen.findByText('other.md'))
      await waitFor(() =>
        expect(screen.getByTestId('loc').textContent).toBe('/document-view?path=docs%2Fother.md&title=other'),
      )
      await waitFor(() => expect(fetch).toHaveBeenLastCalledWith('/__docs/docs/other.md'))
    })

    it('keeps the document in the URL when an in-page anchor is clicked', async () => {
      mount()
      fireEvent.click(await screen.findByRole('link', { name: 'anc' }))
      await waitFor(() =>
        expect(screen.getByTestId('loc').textContent).toBe('/document-view?path=docs/a.md&title=A#user-content-top'),
      )
    })

    it('leaves modified clicks to the browser', async () => {
      mount()
      fireEvent.click(await screen.findByRole('link', { name: 'sib' }), { ctrlKey: true })
      expect(screen.getByTestId('loc').textContent).toBe('/document-view?path=docs/a.md&title=A')
    })

    it('shows not-found for a link escaping the project root', async () => {
      stubFetch(() => res({ ok: true, status: 200, text: async () => '[up](../../x.md)' }))
      render(
        <MemoryRouter initialEntries={['/document-view?path=a.md']}>
          <DocumentView />
        </MemoryRouter>,
      )
      fireEvent.click(await screen.findByRole('link', { name: 'up' }))
      await screen.findByText('Document not found')
    })
  })
})
