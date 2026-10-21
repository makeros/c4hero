import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { FileWarning, FileX } from 'lucide-react'
import mermaid from 'mermaid'
import { renderMarkdownToSafeHtml } from '@/lib/markdown'
import { HEADING_ID_PREFIX } from '@/lib/docLinks'
import { fetchDocIndex, resetDocIndexCache } from '@/lib/docIndex'
import { onDocChange } from '@/lib/docLiveReload'
import { createLogger } from '@/lib/logger'

const log = createLogger('DocumentView')

// c4hero's UI chrome is permanently dark (see index.css's `@theme`), so
// mermaid's built-in dark theme is the only one that needs configuring.
mermaid.initialize({ startOnLoad: false, theme: 'dark' })

// Standalone page for a document link's target — opened in a new tab via
// `/document-view?path=<project-root-relative .md path>&title=<label>`
// (see RightPanel.tsx's/DocumentsTab's open-link button). Not wrapped in any
// canvas/collection chrome: it's a plain page, same as NotFound.

const DEFAULT_TITLE = 'Document — c4hero'

// `missing-path` isn't tracked in this state at all — it's a pure function
// of the `path` query param, so it's handled as an early render-time branch
// below rather than round-tripped through an effect's setState (the fetch
// effect only ever runs once `path` is known to exist).
// Every settled state carries the `path` it was fetched for; a state whose
// path differs from the current one is treated as `loading` (see below), so
// in-page navigation to another document resets to the loading screen
// without a setState inside an effect.
type FetchState =
  | { status: 'loading' }
  | { status: 'loaded'; html: string; path: string }
  | { status: 'not-found'; path: string }
  | { status: 'error'; path: string }

function scrollToFragment(root: HTMLElement | null, fragment: string, smooth: boolean): boolean {
  if (!root || !fragment) return false
  let id = fragment
  try { id = decodeURIComponent(fragment) } catch { /* keep raw */ }
  const el = root.querySelector<HTMLElement>(
    `[id="${CSS.escape(HEADING_ID_PREFIX + id)}"], [id="${CSS.escape(id)}"]`,
  )
  if (!el) return false
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView?.({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' })
  return true
}

export default function DocumentView() {
  const [searchParams] = useSearchParams()
  const path = searchParams.get('path')
  const title = searchParams.get('title')

  const navigate = useNavigate()
  const { pathname, search, hash } = useLocation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const [fetched, setState] = useState<FetchState>({ status: 'loading' })
  const state: FetchState =
    fetched.status !== 'loading' && fetched.path !== path ? { status: 'loading' } : fetched
  const loadedHtml = state.status === 'loaded' ? state.html : null

  // Bumped by dev-server live reload to refetch the current document in
  // place: the settled state keeps its path, so no loading screen flashes.
  const [revision, setRevision] = useState(0)
  useEffect(() => onDocChange(({ path: changed, kind }) => {
    // Adds and removals change wikilink resolution, so they re-render the
    // open document too, against a fresh index.
    if (kind !== 'change') resetDocIndexCache()
    if (kind !== 'change' || changed === path) setRevision((r) => r + 1)
  }), [path])

  // After a document renders: jump to its `#fragment` heading, else to the top.
  // `hash` is read here but intentionally not a dependency — in-page anchor
  // clicks scroll themselves (smoothly); this only runs once per document, so
  // a live reload keeps the reader's scroll position.
  const scrolledPathRef = useRef<string | null>(null)
  useEffect(() => {
    if (loadedHtml === null || scrolledPathRef.current === path) return
    scrolledPathRef.current = path
    if (!scrollToFragment(contentRef.current, hash.slice(1), false)) scrollRef.current?.scrollTo?.(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedHtml])

  // `renderMarkdownToSafeHtml` leaves mermaid fences as `<pre class="mermaid">`
  // holding raw diagram source — rendering that to SVG needs a live DOM (mermaid
  // measures text), so it happens here rather than in the string-based renderer.
  useEffect(() => {
    if (loadedHtml === null) return
    const nodes = contentRef.current?.querySelectorAll<HTMLElement>('pre.mermaid')
    if (!nodes || nodes.length === 0) return
    mermaid.run({ nodes: Array.from(nodes) }).catch((err) => {
      log.error('diagram render failed', { err })
    })
  }, [loadedHtml])

  useEffect(() => {
    document.title = title?.trim() ? title : DEFAULT_TITLE
  }, [title])

  useEffect(() => {
    if (!path) return
    const docPath = path

    let cancelled = false

    // `docPath` is already a valid project-root-relative path (produced by
    // the DSL's `documents[].path`) — `encodeURI` escapes only what's
    // necessary for a valid URL (spaces, etc.) without double-encoding
    // segments that are already fine, and leaves `/` alone so the dev
    // middleware's single `decodeURIComponent` pass (vite.config.ts)
    // round-trips it unchanged.
    async function load() {
      // A link that climbed above the project root (`..` survives
      // normalisation) can't name a document.
      if (docPath.split('/').includes('..')) {
        setState({ status: 'not-found', path: docPath })
        return
      }
      try {
        const index = await fetchDocIndex()
        if (cancelled) return
        const res = await fetch(`/__docs/${encodeURI(docPath)}`)
        if (cancelled) return
        if (res.status === 404) {
          setState({ status: 'not-found', path: docPath })
          return
        }
        if (!res.ok) {
          setState({ status: 'error', path: docPath })
          return
        }
        const markdown = await res.text()
        if (cancelled) return
        setState({ status: 'loaded', path: docPath, html: renderMarkdownToSafeHtml(markdown, { docPath, index }) })
      } catch {
        if (!cancelled) setState({ status: 'error', path: docPath })
      }
    }
    load()

    return () => {
      cancelled = true
    }
  }, [path, revision])

  if (!path) {
    return (
      <StatusScreen
        icon={<FileWarning size={22} style={{ color: 'var(--color-accent)' }} />}
        iconBackground="var(--color-accent-subtle)"
        heading="No document specified"
        detail="This link is missing a document to open."
      />
    )
  }

  if (state.status === 'not-found') {
    return (
      <StatusScreen
        icon={<FileX size={22} style={{ color: 'var(--color-error-text)' }} />}
        iconBackground="color-mix(in srgb, var(--color-error) 14%, transparent)"
        heading="Document not found"
        detail={`No document exists at "${state.path}".`}
      />
    )
  }

  if (state.status === 'error') {
    return (
      <StatusScreen
        icon={<FileX size={22} style={{ color: 'var(--color-error-text)' }} />}
        iconBackground="color-mix(in srgb, var(--color-error) 14%, transparent)"
        heading="Couldn't load document"
        detail={`Something went wrong fetching "${state.path}".`}
      />
    )
  }

  if (state.status === 'loading') {
    return (
      <div
        style={{
          position: 'fixed', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-bg-primary)',
        }}
      >
        <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>
      </div>
    )
  }

  // Delegated handler for links in the rendered document. hrefs are real URLs
  // (rewritten in markdown.ts), so modified/middle clicks fall through to the
  // browser (new tab); only a plain left-click is intercepted.
  function handleClick(e: MouseEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element).closest('a')
    const href = a?.getAttribute('href')
    if (!a || !href || a.target === '_blank') return
    if (href.startsWith('#')) {
      e.preventDefault()
      if (scrollToFragment(contentRef.current, href.slice(1), true)) navigate({ pathname, search, hash: href }, { replace: true })
    } else if (href.startsWith('/document-view?')) {
      e.preventDefault()
      navigate(href)
    }
  }

  return (
    <div
      ref={scrollRef}
      style={{ height: '100%', overflowY: 'auto', background: 'var(--color-bg-primary)', padding: '48px 24px', boxSizing: 'border-box' }}
    >
      <div
        ref={contentRef}
        onClick={handleClick}
        className="document-view-content"
        style={{
          maxWidth: 1220,
          margin: '0 auto',
          background: 'var(--color-surface-1)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '40px 48px',
          color: 'var(--color-text-primary)',
          lineHeight: 1.6,
        }}
        dangerouslySetInnerHTML={{ __html: state.html }}
      />
      <style>{`
        .document-view-content h1, .document-view-content h2, .document-view-content h3,
        .document-view-content h4, .document-view-content h5, .document-view-content h6 {
          color: var(--color-text-primary);
          font-weight: 600;
          line-height: 1.3;
          margin: 1.6em 0 0.6em;
        }
        .document-view-content h1:first-child, .document-view-content h2:first-child { margin-top: 0; }
        .document-view-content h1 { font-size: 1.75em; }
        .document-view-content h2 { font-size: 1.4em; }
        .document-view-content h3 { font-size: 1.2em; }
        .document-view-content h4 { font-size: 1.05em; }
        .document-view-content h5, .document-view-content h6 { font-size: 1em; }
        .document-view-content p { margin: 0.8em 0; }
        .document-view-content a { color: var(--color-accent); }
        .document-view-content a code { color: var(--color-accent); }
        .document-view-content a.doc-link-unresolved {
          color: var(--color-text-muted);
          text-decoration: underline dashed;
        }
        .document-view-content a.doc-code-link { text-decoration: none; }
        .document-view-content a.doc-code-link:hover code { text-decoration: underline; }
        .document-view-content code {
          background: var(--color-surface-3);
          border-radius: var(--radius-sm);
          padding: 1px 5px;
          font-size: 0.9em;
        }
        .document-view-content pre {
          background: var(--color-surface-3);
          border-radius: var(--radius-md);
          padding: 14px 16px;
          overflow-x: auto;
        }
        .document-view-content pre code { background: none; padding: 0; }
        .document-view-content pre.mermaid {
          display: flex;
          justify-content: center;
          background: var(--color-surface-2);
        }
        .document-view-content pre.mermaid svg { max-width: 100%; }
        .document-view-content blockquote {
          border-left: 3px solid var(--color-border);
          margin: 1em 0;
          padding: 0 1em;
          color: var(--color-text-secondary);
        }
        .document-view-content ul, .document-view-content ol { padding-left: 1.4em; }
        .document-view-content ul { list-style: disc; }
        .document-view-content ol { list-style: decimal; }
        .document-view-content ul ul { list-style: circle; }
        .document-view-content li { margin: 0.25em 0; }
        .document-view-content hr { border: none; border-top: 1px solid var(--color-border); margin: 2em 0; }
        .document-view-content table { border-collapse: collapse; width: 100%; }
        .document-view-content th, .document-view-content td {
          border: 1px solid var(--color-border);
          padding: 6px 10px;
        }
      `}</style>
    </div>
  )
}

function StatusScreen({ icon, iconBackground, heading, detail }: {
  icon: ReactNode
  iconBackground: string
  heading: string
  detail: string
}) {
  return (
    <div
      role="alert"
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg-primary)',
        flexDirection: 'column', gap: 16,
        padding: 24, textAlign: 'center',
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: iconBackground,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
          {heading}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 420, lineHeight: 1.5 }}>
          {detail}
        </div>
      </div>
    </div>
  )
}
