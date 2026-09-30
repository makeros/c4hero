import DialogShell from '@/components/shared/DialogShell'
import { ICON_REGISTRY, type IconMatchKind } from '@/lib/icons/registry'

const KIND_LABELS: Record<IconMatchKind, string> = {
  'container-tag': 'Container tag',
  'structurizr-shape': 'Structurizr shape',
  'element-type': 'Element type',
  'fixed-use': 'Fixed use',
}

export default function IconListDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogShell
      onClose={onClose}
      ariaLabel="Available icons"
      style={{
        width: 480,
        maxWidth: 'calc(100vw - 32px)',
        // DialogShell ships no default background — without these the modal
        // body sits transparent over the dimmed canvas backdrop.
        background: 'var(--color-bg-panel)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.2)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Available Icons
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs-plus)', color: 'var(--color-text-muted)' }}>
          Every icon the canvas can resolve, and the tag, shape, or type name(s) that trigger it.
        </p>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: '60vh', padding: '4px 12px' }}>
        {ICON_REGISTRY.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '10px 4px',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <entry.icon
              size={18}
              aria-hidden="true"
              style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-text-secondary)' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {entry.label}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {(Object.entries(entry.matches) as [IconMatchKind, string[]][]).flatMap(([kind, names]) =>
                  names.map((name) => (
                    <span
                      key={`${kind}-${name}`}
                      className="c4-type-chip"
                      title={KIND_LABELS[kind]}
                      style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}
                    >
                      {name}
                    </span>
                  )),
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </DialogShell>
  )
}
