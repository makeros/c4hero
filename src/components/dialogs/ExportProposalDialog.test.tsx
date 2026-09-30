import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { View } from '@/types/model'
import ExportProposalDialog from './ExportProposalDialog'

function makeView(overrides: Partial<View> = {}): View {
  return {
    type: 'container',
    key: 'view-1',
    title: 'View One',
    elements: [],
    relationships: [],
    ...overrides,
  }
}

const defaultViews: View[] = [
  makeView({ key: 'view-1', title: 'View One' }),
  makeView({ key: 'view-2', title: 'View Two', type: 'component' }),
]

function renderDialog(overrides: Partial<ComponentProps<typeof ExportProposalDialog>> = {}) {
  const props: ComponentProps<typeof ExportProposalDialog> = {
    views: defaultViews,
    onExport: vi.fn().mockResolvedValue({ exportedCount: 2, skipped: [], warnings: [] }),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<ExportProposalDialog {...props} />)
  return props
}

describe('ExportProposalDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders one checkbox per view, all checked by default', () => {
    renderDialog()
    const viewOneCheckbox = screen.getByRole('checkbox', { name: 'View One' }) as HTMLInputElement
    const viewTwoCheckbox = screen.getByRole('checkbox', { name: 'View Two' }) as HTMLInputElement
    expect(viewOneCheckbox.checked).toBe(true)
    expect(viewTwoCheckbox.checked).toBe(true)
  })

  it('disables the export button with zero views selected', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('checkbox', { name: 'View One' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'View Two' }))

    const exportButton = screen.getByRole('button', { name: /Export/ })
    expect(exportButton.hasAttribute('disabled')).toBe(true)
  })

  it('calls onExport with the selected view keys', async () => {
    const onExport = vi.fn().mockResolvedValue({ exportedCount: 1, skipped: [], warnings: [] })
    renderDialog({ onExport })

    fireEvent.click(screen.getByRole('checkbox', { name: 'View Two' }))
    fireEvent.click(screen.getByRole('button', { name: /Export 1 view/ }))

    await waitFor(() => expect(onExport).toHaveBeenCalledWith(['view-1']))
  })

  it('displays skipped-view reasons after onExport resolves', async () => {
    const onExport = vi.fn().mockResolvedValue({
      exportedCount: 1,
      skipped: [{ view: defaultViews[1], reason: 'View has no elements to export' }],
      warnings: [],
    })
    const onClose = vi.fn()
    renderDialog({ onExport, onClose })

    fireEvent.click(screen.getByRole('button', { name: /Export 2 views/ }))

    await waitFor(() => expect(screen.queryByText(/View has no elements to export/)).not.toBeNull())
    // Skipped views mean the dialog stays open for the user to review the summary.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('displays warning-view reasons after onExport resolves, distinct from skipped', async () => {
    const onExport = vi.fn().mockResolvedValue({
      exportedCount: 2,
      skipped: [],
      warnings: [{ view: defaultViews[1], reason: 'Measurement timed out, capture may be incomplete' }],
    })
    const onClose = vi.fn()
    renderDialog({ onExport, onClose })

    fireEvent.click(screen.getByRole('button', { name: /Export 2 views/ }))

    await waitFor(() => expect(screen.queryByText(/Measurement timed out/)).not.toBeNull())
    expect(screen.queryByText(/exported but may be incomplete/)).not.toBeNull()
    // Warnings mean the dialog stays open for the user to review the summary,
    // same as skips — but this is not a "not exported" state.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes automatically when nothing was skipped or flagged', async () => {
    const onExport = vi.fn().mockResolvedValue({ exportedCount: 2, skipped: [], warnings: [] })
    const onClose = vi.fn()
    renderDialog({ onExport, onClose })

    fireEvent.click(screen.getByRole('button', { name: /Export 2 views/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('closes when Escape is pressed', () => {
    const props = renderDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape while an export is in progress', async () => {
    let resolveExport!: (value: { exportedCount: number; skipped: never[]; warnings: never[] }) => void
    const onExport = vi.fn().mockReturnValue(new Promise((resolve) => { resolveExport = resolve }))
    const onClose = vi.fn()
    renderDialog({ onExport, onClose })

    fireEvent.click(screen.getByRole('button', { name: /Export 2 views/ }))
    await waitFor(() => expect(onExport).toHaveBeenCalled())

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    resolveExport({ exportedCount: 2, skipped: [], warnings: [] })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('clears the busy state and shows a visible error when onExport rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onExport = vi.fn().mockRejectedValue(new Error('export failed'))
    renderDialog({ onExport })

    const exportButton = screen.getByRole('button', { name: /Export 2 views/ })
    fireEvent.click(exportButton)

    await waitFor(() => expect(exportButton.hasAttribute('disabled')).toBe(false))
    expect(console.warn).toHaveBeenCalled()
    expect(screen.queryByText(/Export failed: export failed/)).not.toBeNull()
  })
})
