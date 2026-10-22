import type { ReactNode } from 'react'

// Shared full-viewport status screen for a document view in a terminal
// state (not-found, error, no-path). Used by both DocumentView (markdown)
// and HtmlDocumentFrame (HTML), which otherwise have nothing else to import
// from each other — pulled out so neither imports the other just for this.
export function StatusScreen({ icon, iconBackground, heading, detail }: {
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
