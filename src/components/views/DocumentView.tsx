import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileWarning, FileX } from 'lucide-react'
import { renderMarkdownToSafeHtml } from '@/lib/markdown'

// Standalone page for a document link's target — opened in a new tab via
// `/document-view?path=<project-root-relative .md path>&title=<label>`
// (see RightPanel.tsx's/DocumentsTab's open-link button). Not wrapped in any
// canvas/collection chrome: it's a plain page, same as NotFound.

const DEFAULT_TITLE = 'Document — c4hero'

// `missing-path` isn't tracked in this state at all — it's a pure function
// of the `path` query param, so it's handled as an early render-time branch
// below rather than round-tripped through an effect's setState (the fetch
// effect only ever runs once `path` is known to exist).
type FetchState =
  | { status: 'loading' }
  | { status: 'loaded'; html: string }
  | { status: 'not-found'; path: string }
  | { status: 'error'; path: string }

export default function DocumentView() {
  const [searchParams] = useSearchParams()
  const path = searchParams.get('path')
  const title = searchParams.get('title')

  const [state, setState] = useState<FetchState>({ status: 'loading' })

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
      try {
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
        setState({ status: 'loaded', html: renderMarkdownToSafeHtml(markdown) })
      } catch {
        if (!cancelled) setState({ status: 'error', path: docPath })
      }
    }
    load()

    return () => {
      cancelled = true
    }
  }, [path])

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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)', padding: '48px 24px' }}>
      <div
        className="document-view-content"
        style={{
          maxWidth: 760,
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
        .document-view-content p { margin: 0.8em 0; }
        .document-view-content a { color: var(--color-accent); }
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
        .document-view-content blockquote {
          border-left: 3px solid var(--color-border);
          margin: 1em 0;
          padding: 0 1em;
          color: var(--color-text-secondary);
        }
        .document-view-content ul, .document-view-content ol { padding-left: 1.4em; }
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
