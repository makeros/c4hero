import { useEffect, useState } from 'react'
import { FileX } from 'lucide-react'
import { docBasename } from '@/lib/docLinks'
import { onDocChange } from '@/lib/docLiveReload'
import { StatusScreen } from './StatusScreen'

// D2: no `allow-same-origin`, ever — combined with `allow-scripts` it would
// let the document lift its own sandbox. A unit test pins this exact set.
const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation'

// Mirrors DocumentView's FetchState shape, but this component only needs to
// know whether `path` exists before handing it to the iframe — the HTML
// itself is never fetched or parsed here, only served raw inside the frame.
type CheckState =
  | { status: 'checking' }
  | { status: 'ready' }
  | { status: 'not-found' }
  | { status: 'error' }

/** Hosts an HTML document link (D1): a slim title bar above a sandboxed
 *  `<iframe>` whose `src` is the raw `/__docs/<path>` response. `path` is a
 *  project-root-relative POSIX path already known to have an HTML extension
 *  (the caller, `DocumentView`, switches on `documentKind`). */
export default function HtmlDocumentFrame({ path, title, hash }: {
  path: string
  title: string | null
  hash: string
}) {
  const [state, setState] = useState<CheckState>({ status: 'checking' })

  // D9: any doc-change event (not just this document's own path) remounts
  // the frame — a linked CSS/JS/image change should reload it too, and
  // there's no cheap way to know from here which assets the page pulled in.
  const [revision, setRevision] = useState(0)
  useEffect(() => onDocChange(() => setRevision((r) => r + 1)), [])

  useEffect(() => {
    let cancelled = false

    async function check() {
      // Same `..` guard as DocumentView: a link that climbed above the
      // project root can't name a document.
      if (path.split('/').includes('..')) {
        setState({ status: 'not-found' })
        return
      }
      try {
        const res = await fetch(`/__docs/${encodeURI(path)}`)
        if (cancelled) return
        if (res.status === 404) {
          setState({ status: 'not-found' })
          return
        }
        if (!res.ok) {
          setState({ status: 'error' })
          return
        }
        setState({ status: 'ready' })
      } catch {
        if (!cancelled) setState({ status: 'error' })
      }
    }
    check()

    return () => {
      cancelled = true
    }
  }, [path, revision])

  if (state.status === 'not-found') {
    return (
      <StatusScreen
        icon={<FileX size={22} style={{ color: 'var(--color-error-text)' }} />}
        iconBackground="color-mix(in srgb, var(--color-error) 14%, transparent)"
        heading="Document not found"
        detail={`No document exists at "${path}".`}
      />
    )
  }

  if (state.status === 'error') {
    return (
      <StatusScreen
        icon={<FileX size={22} style={{ color: 'var(--color-error-text)' }} />}
        iconBackground="color-mix(in srgb, var(--color-error) 14%, transparent)"
        heading="Couldn't load document"
        detail={`Something went wrong fetching "${path}".`}
      />
    )
  }

  if (state.status === 'checking') return null

  const displayTitle = title?.trim() ? title : docBasename(path)

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          height: 36,
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 16px',
          background: 'var(--color-surface-1)',
          borderBottom: '1px solid var(--color-border)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <span
          style={{
            color: 'var(--color-text-primary)',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayTitle}
        </span>
        <span
          style={{
            color: 'var(--color-text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {path}
        </span>
      </div>
      <iframe
        key={revision}
        src={`/__docs/${encodeURI(path)}${hash}`}
        title={displayTitle}
        sandbox={SANDBOX}
        style={{ flex: '1 1 auto', border: 'none', background: '#fff' }}
      />
    </div>
  )
}
