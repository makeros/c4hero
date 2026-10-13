import { render, screen, fireEvent } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { DocLink } from '@/types/model'
import DocumentsTab from './DocumentsTab'

vi.mock('lucide-react', () => ({
  ExternalLink: () => null,
  Plus: () => null,
}))

beforeEach(() => {
  useWorkspaceStore.setState({ readOnly: false })
})

describe('DocumentsTab', () => {
  it('renders an empty state with just the add control when there are no documents', () => {
    render(<DocumentsTab documents={[]} onUpdate={() => {}} />)

    expect(screen.queryByText(/·/)).toBeNull()
    expect(screen.getByLabelText('Document path')).toBeTruthy()
    expect(screen.getByLabelText('Document title')).toBeTruthy()
    expect(screen.getByLabelText('Add document')).toBeTruthy()
  })

  it('calls onUpdate with the appended entry when a row is added', () => {
    const onUpdate = vi.fn()
    render(<DocumentsTab documents={[]} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('Document path'), { target: { value: 'architecture/overview.md' } })
    fireEvent.change(screen.getByLabelText('Document title'), { target: { value: 'Overview' } })
    fireEvent.click(screen.getByLabelText('Add document'))

    expect(onUpdate).toHaveBeenCalledWith([{ path: 'architecture/overview.md', title: 'Overview' }])
  })

  it('calls onUpdate with the entry excluded when a row is removed', () => {
    const onUpdate = vi.fn()
    const documents: DocLink[] = [
      { path: 'architecture/overview.md', title: 'Overview' },
      { path: 'architecture/adr-003.md', title: 'ADR: event sourcing' },
    ]
    render(<DocumentsTab documents={documents} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByLabelText('Remove document Overview'))

    expect(onUpdate).toHaveBeenCalledWith([{ path: 'architecture/adr-003.md', title: 'ADR: event sourcing' }])
  })

  it('hides add/remove controls but keeps the open-link for an existing row when readOnly', () => {
    useWorkspaceStore.setState({ readOnly: true })
    const documents: DocLink[] = [{ path: 'architecture/overview.md', title: 'Overview' }]
    render(<DocumentsTab documents={documents} onUpdate={() => {}} />)

    expect(screen.queryByLabelText('Document path')).toBeNull()
    expect(screen.queryByLabelText('Document title')).toBeNull()
    expect(screen.queryByLabelText('Add document')).toBeNull()
    expect(screen.queryByLabelText('Remove document Overview')).toBeNull()

    const link = screen.getByLabelText('Open document in new tab') as HTMLAnchorElement
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('/document-view?path=architecture%2Foverview.md&title=Overview')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
