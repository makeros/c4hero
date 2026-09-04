import { useState } from 'react'
import { CheckSquare, Square, Loader2, AlertTriangle, Info } from 'lucide-react'
import type { View } from '@/types/model'
import { LEVEL_BADGE } from '@/components/layout/ViewSwitcher'
import { createLogger } from '@/lib/logger'
import DialogShell from '@/components/shared/DialogShell'

const log = createLogger('ExportProposalDialog')

interface ExportProposalResult {
  exportedCount: number
  skipped: { view: View; reason: string }[]
  warnings: { view: View; reason: string }[]
}

interface ExportProposalDialogProps {
  views: View[]
  onExport: (selectedKeys: string[]) => Promise<ExportProposalResult>
  onClose: () => void
}

export default function ExportProposalDialog({ views, onExport, onClose }: ExportProposalDialogProps) {
  // Default: every view pre-selected — exporting "everything" is the common
  // case (a full proposal package), so the picker starts as an opt-out list
  // rather than an opt-in one.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(views.map((v) => v.key)))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ExportProposalResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const allSelected = selected.size === views.length && views.length > 0

  // While an export is in flight, ignore close requests (Escape / backdrop /
  // the DialogShell close button) — Canvas is actively switching views and a
  // zip download may still fire; tearing down the dialog's state mid-batch
  // would leave the user watching a closed dialog with no feedback.
  function handleRequestClose() {
    if (busy) return
    onClose()
  }

  function toggleView(key: string) {
    if (busy) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    if (busy) return
    setSelected(allSelected ? new Set() : new Set(views.map((v) => v.key)))
  }

  async function handleExport() {
    if (busy || selected.size === 0) return
    setBusy(true)
    setResult(null)
    setError(null)
    try {
      const res = await onExport(Array.from(selected))
      setResult(res)
      // Nothing was skipped or flagged — the export fully succeeded, so close
      // the picker automatically instead of making the user dismiss a no-op
      // summary. Any skips/warnings stay on screen until the user dismisses.
      if (res.skipped.length === 0 && res.warnings.length === 0) onClose()
    } catch (err) {
      log.warn('Proposal export failed', err)
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      onClose={handleRequestClose}
      closeOnEscape={!busy}
      ariaLabel="Export for proposal"
      className="relative flex w-full max-w-md flex-col rounded-xl border p-5 shadow-2xl"
      style={{ background: 'var(--color-surface-1)', borderColor: 'var(--color-border)', maxHeight: '80vh' }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Export for proposal</h2>
        <button
          type="button"
          onClick={toggleAll}
          disabled={busy || views.length === 0}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider disabled:opacity-40"
          style={{ color: 'var(--color-accent)' }}
        >
          {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
          {allSelected ? 'Select None' : 'Select All'}
        </button>
      </div>

      <div className="-mx-1 flex-1 overflow-y-auto px-1" style={{ minHeight: 0 }}>
        {views.map((view) => {
          const checked = selected.has(view.key)
          const label = view.title ?? view.key
          return (
            <label
              key={view.key}
              htmlFor={`export-proposal-view-${view.key}`}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <input
                id={`export-proposal-view-${view.key}`}
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={() => toggleView(view.key)}
                aria-label={label}
              />
              <span
                aria-hidden="true"
                style={{
                  fontSize: 'var(--text-xxs)',
                  fontWeight: 800,
                  padding: '2px 5px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface-3)',
                  color: 'var(--color-text-muted)',
                  letterSpacing: '0.05em',
                  flexShrink: 0,
                }}
              >
                {LEVEL_BADGE[view.type] ?? view.type.slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate">{label}</span>
            </label>
          )
        })}
        {views.length === 0 && (
          <div className="px-2 py-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No views in this workspace.
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg px-3 py-2 text-[11px]"
          style={{ background: 'var(--color-tint-error)', color: 'var(--color-error-text)', border: '1px solid var(--color-border-error)' }}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={12} />
            Export failed: {error}
          </div>
        </div>
      )}

      {result && result.skipped.length > 0 && (
        <div
          role="alert"
          className="mt-3 rounded-lg px-3 py-2 text-[11px]"
          style={{ background: 'var(--color-tint-error)', color: 'var(--color-error-text)', border: '1px solid var(--color-border-error)' }}
        >
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={12} />
            {result.exportedCount} exported, {result.skipped.length} not exported
          </div>
          <ul className="list-disc pl-4">
            {result.skipped.map(({ view, reason }) => (
              <li key={view.key}>{(view.title ?? view.key)}: {reason}</li>
            ))}
          </ul>
        </div>
      )}

      {result && result.warnings.length > 0 && (
        <div
          role="status"
          className="mt-3 rounded-lg px-3 py-2 text-[11px]"
          style={{
            background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)',
            color: 'var(--color-warning)',
            border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)',
          }}
        >
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <Info size={12} />
            {result.warnings.length} exported but may be incomplete
          </div>
          <ul className="list-disc pl-4">
            {result.warnings.map(({ view, reason }) => (
              <li key={view.key}>{(view.title ?? view.key)}: {reason}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {result && (result.skipped.length > 0 || result.warnings.length > 0) ? (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg py-2 text-sm font-medium transition-colors"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-primary)' }}
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            onClick={handleExport}
            disabled={selected.size === 0 || busy}
            aria-busy={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--color-accent)', color: 'var(--color-bg-primary)' }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy ? 'Exporting…' : `Export ${selected.size} view${selected.size === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </DialogShell>
  )
}
