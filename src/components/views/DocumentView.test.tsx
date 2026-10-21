import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DocumentView from './DocumentView'
import { resetDocIndexCache } from '@/lib/docIndex'

// Real routing (the global setup mocks useNavigate/useLocation).
vi.mock('react-router-dom', async (importOriginal) => importOriginal())

// jsdom doesn't implement the layout APIs (getBBox, etc.) mermaid needs to
// actually render a diagram — these tests only need to verify DocumentView
// hands it the right nodes, not that mermaid itself draws correctly.
const { mermaidRun } = vi.hoisted(() => ({ mermaidRun: vi.fn().mockResolvedValue(undefined) }))
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), run: mermaidRun } }))

// Captures the live-reload subscriber so tests can play dev-server events.
const { docChangeListeners } = vi.hoisted(() => ({
  docChangeListeners: new Set<(change: { path: string; kind: 'change' | 'add' | 'unlink' }) => void>(),
}))
vi.mock('@/lib/docLiveReload', () => ({
  onDocChange: (cb: (change: { path: string; kind: 'change' | 'add' | 'unlink' }) => void) => {
    docChangeListeners.add(cb)
    return () => docChangeListeners.delete(cb)
  },
}))
function emitDocChange(path: string, kind: 'change' | 'add' | 'unlink' = 'change') {
  act(() => docChangeListeners.forEach((cb) => cb({ path, kind })))
}

function res(init: { ok: boolean; status: number; text: () => Promise<string> }): Response {
  return init as unknown as Response
}

function stubFetch(impl: () => unknown) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetDocIndexCache()
  mermaidRun.mockClear()
})

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

  describe('mermaid diagrams', () => {
    it('hands mermaid.run() the diagram node from a ```mermaid fence', async () => {
      stubFetch(() => res({ ok: true, status: 200, text: async () => '# Top\n\n```mermaid\ngraph TD\nA --> B\n```' }))

      render(
        <MemoryRouter initialEntries={['/document-view?path=docs/a.md&title=A']}>
          <DocumentView />
        </MemoryRouter>,
      )

      await screen.findByRole('heading', { name: 'Top' })
      await waitFor(() => expect(mermaidRun).toHaveBeenCalledTimes(1))
      const [{ nodes }] = mermaidRun.mock.calls[0]
      expect(nodes).toHaveLength(1)
      expect(nodes[0].className).toBe('mermaid')
      expect(nodes[0].textContent).toBe('graph TD\nA --> B')
    })

    it('does not call mermaid.run() when the document has no mermaid fence', async () => {
      stubFetch(() => res({ ok: true, status: 200, text: async () => '# Top\n\nSome text.' }))

      render(
        <MemoryRouter initialEntries={['/document-view?path=docs/a.md&title=A']}>
          <DocumentView />
        </MemoryRouter>,
      )

      await screen.findByRole('heading', { name: 'Top' })
      expect(mermaidRun).not.toHaveBeenCalled()
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

    it('resolves wikilinks against the fetched index and dims unresolved ones', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) =>
          url === '/__docs/__index.json'
            ? res({ ok: true, status: 200, text: async () => JSON.stringify({ files: ['docs/a.md', 'std/Cloud.md'] }) })
            : res({ ok: true, status: 200, text: async () => 'See [[Cloud]] and [[Nope]].' }),
        ),
      )
      render(
        <MemoryRouter initialEntries={['/document-view?path=docs/a.md&title=A']}>
          <DocumentView />
        </MemoryRouter>,
      )
      const cloud = await screen.findByRole('link', { name: 'Cloud' })
      expect(cloud.getAttribute('href')).toBe('/document-view?path=std%2FCloud.md&title=Cloud')
      const nope = screen.getByRole('link', { name: 'Nope' })
      expect(nope.className).toBe('doc-link-unresolved')
      expect(nope.getAttribute('title')).toBe('Not found: Nope')
      expect(vi.mocked(fetch).mock.calls.filter(([u]) => u === '/__docs/__index.json')).toHaveLength(1)
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

  describe('live reload', () => {
    function mountWithBody(body: { current: string }, files: string[] = ['docs/a.md']) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) =>
          url === '/__docs/__index.json'
            ? res({ ok: true, status: 200, text: async () => JSON.stringify({ files }) })
            : res({ ok: true, status: 200, text: async () => body.current }),
        ),
      )
      return render(
        <MemoryRouter initialEntries={['/document-view?path=docs/a.md&title=A']}>
          <DocumentView />
        </MemoryRouter>,
      )
    }
    const docFetches = () => vi.mocked(fetch).mock.calls.filter(([u]) => u === '/__docs/docs/a.md').length
    const indexFetches = () => vi.mocked(fetch).mock.calls.filter(([u]) => u === '/__docs/__index.json').length

    it('refetches the open document in place when it changes, keeping the scroll position', async () => {
      const body = { current: '# First' }
      const { container } = mountWithBody(body)
      await screen.findByRole('heading', { name: 'First' })
      const scroller = container.firstElementChild as HTMLElement
      const scrollTo = vi.fn()
      scroller.scrollTo = scrollTo

      body.current = '# Second'
      emitDocChange('docs/a.md')

      await screen.findByRole('heading', { name: 'Second' })
      expect(screen.queryByText('Loading…')).toBeNull()
      expect(scrollTo).not.toHaveBeenCalled()
      expect(indexFetches()).toBe(1)
    })

    it('ignores edits to other documents', async () => {
      mountWithBody({ current: '# First' })
      await screen.findByRole('heading', { name: 'First' })
      emitDocChange('docs/other.md')
      await new Promise((r) => setTimeout(r, 0))
      expect(docFetches()).toBe(1)
    })

    it('re-resolves wikilinks against a fresh index when a document is added', async () => {
      const files = ['docs/a.md']
      mountWithBody({ current: 'See [[Cloud]].' }, files)
      const before = await screen.findByRole('link', { name: 'Cloud' })
      expect(before.className).toBe('doc-link-unresolved')

      files.push('std/Cloud.md')
      emitDocChange('std/Cloud.md', 'add')

      await waitFor(() => expect(screen.getByRole('link', { name: 'Cloud' }).className).toBe(''))
      expect(indexFetches()).toBe(2)
    })
  })
})
