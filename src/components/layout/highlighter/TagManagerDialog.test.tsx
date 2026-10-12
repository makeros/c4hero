import { render, screen, fireEvent, act } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import type { Workspace } from '@/types/model'
import TagManagerDialog from './TagManagerDialog'

function makeWs(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [{ id: 'alice', type: 'person', name: 'Alice', tags: ['Element', 'Person', 'Team A'], properties: {} }],
      softwareSystems: [{ id: 'api', type: 'softwareSystem', name: 'API', tags: ['Element', 'Software System'], properties: {}, containers: [] }],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [
        { type: 'systemLandscape', key: 'overview', title: 'Overview', elements: [{ id: 'alice' }, { id: 'api' }], relationships: [] },
      ],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [{ tag: 'Person', background: '#123456' }], relationships: [] } },
    },
  }
}

function aliceTags() {
  return useWorkspaceStore.getState().workspace!.model.people[0].tags
}

function elementStyles() {
  return useWorkspaceStore.getState().workspace!.views.configuration.styles.elements
}

beforeEach(() => {
  useWorkspaceStore.getState().setReadOnly(false)
  useWorkspaceStore.getState().closeWorkspace()
})

describe('TagManagerDialog', () => {
  it('returns null when no workspace is loaded', () => {
    const { container } = render(<TagManagerDialog onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders built-in and custom tags, with custom tag names editable', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerDialog onClose={() => {}} />)
    expect(screen.getByText('Manage tags')).toBeTruthy()
    expect(screen.getByDisplayValue('Team A')).toBeTruthy()
  })

  it('adds a new tag via the footer Add button', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerDialog onClose={() => {}} />)
    const input = screen.getByPlaceholderText('New tag name…') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Deprecated' } })
    fireEvent.click(screen.getByText('Add').closest('button')!)
    expect(elementStyles().some((s) => s.tag === 'Deprecated')).toBe(true)
  })

  it('renames a custom tag on blur', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerDialog onClose={() => {}} />)
    const input = screen.getByDisplayValue('Team A')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Team B' } })
    fireEvent.blur(input)
    expect(aliceTags()).toContain('Team B')
    expect(aliceTags()).not.toContain('Team A')
  })

  it('removes a custom tag globally', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    render(<TagManagerDialog onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('Remove tag Team A'))
    expect(aliceTags()).not.toContain('Team A')
  })
})

describe('TagManagerDialog (readOnly)', () => {
  it('hides the header "New tag" button and footer add-tag controls', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    act(() => { useWorkspaceStore.setState({ readOnly: true }) })
    render(<TagManagerDialog onClose={() => {}} />)
    expect(screen.queryByText('New tag')).toBeNull()
    expect(screen.queryByPlaceholderText('New tag name…')).toBeNull()
    expect(screen.queryByText('Add')).toBeNull()
  })

  it('renders custom tag names as plain text instead of rename inputs', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    act(() => { useWorkspaceStore.setState({ readOnly: true }) })
    render(<TagManagerDialog onClose={() => {}} />)
    expect(screen.queryByDisplayValue('Team A')).toBeNull()
    expect(screen.getAllByText('Team A').length).toBeGreaterThan(0)
  })

  it('hides the remove-tag button', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    act(() => { useWorkspaceStore.setState({ readOnly: true }) })
    render(<TagManagerDialog onClose={() => {}} />)
    expect(screen.queryByLabelText('Remove tag Team A')).toBeNull()
  })

  it('still renders tags and allows closing the dialog', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    act(() => { useWorkspaceStore.setState({ readOnly: true }) })
    const onClose = vi.fn()
    render(<TagManagerDialog onClose={onClose} />)
    expect(screen.getAllByText('Person').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByLabelText('Close tag manager'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables the inline style editor controls (color pickers, shape, border, opacity)', () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    act(() => { useWorkspaceStore.setState({ readOnly: true }) })
    render(<TagManagerDialog onClose={() => {}} />)

    for (const input of screen.getAllByPlaceholderText('#hex or name')) {
      expect((input as HTMLInputElement).disabled).toBe(true)
    }
    for (const select of screen.getAllByRole('combobox')) {
      expect((select as HTMLSelectElement).disabled).toBe(true)
    }
    for (const slider of screen.getAllByRole('slider')) {
      expect((slider as HTMLInputElement).disabled).toBe(true)
    }

    // Mutating actions remain no-ops even if somehow triggered.
    fireEvent.change(screen.getAllByPlaceholderText('#hex or name')[0], { target: { value: '#ff0000' } })
    expect(elementStyles().find((s) => s.tag === 'Person')!.background).toBe('#123456')
  })
})
