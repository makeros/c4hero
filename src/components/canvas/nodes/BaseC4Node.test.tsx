import { render, screen, fireEvent } from '@testing-library/react'
import { ReactFlow, type NodeProps } from '@xyflow/react'
import { Box } from 'lucide-react'
import BaseC4Node from './BaseC4Node'
import type { C4NodeData } from './types'
import { useWorkspaceStore } from '@/store/workspace'
import type { SoftwareSystem, Container } from '@/types/model'

// ─── jsdom stubs required by React Flow (official testing recipe) ─────
class ResizeObserverStub {
  callback: globalThis.ResizeObserverCallback
  constructor(callback: globalThis.ResizeObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: target.getBoundingClientRect() } as globalThis.ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
  unobserve() {}
  disconnect() {}
}

class DOMMatrixReadOnlyStub {
  m22: number
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1]
    this.m22 = scale !== undefined ? +scale : 1
  }
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  // @ts-expect-error jsdom has no DOMMatrixReadOnly
  global.DOMMatrixReadOnly = DOMMatrixReadOnlyStub
  Object.defineProperties(global.HTMLElement.prototype, {
    offsetHeight: { get() { return parseFloat((this as HTMLElement).style.height) || 1 }, configurable: true },
    offsetWidth: { get() { return parseFloat((this as HTMLElement).style.width) || 1 }, configurable: true },
  })
  ;(global.SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox =
    () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect
})

beforeEach(() => {
  useWorkspaceStore.getState().closeWorkspace()
  // closeWorkspace does not reset highlight filters — clear them explicitly.
  useWorkspaceStore.setState({
    activeTagFilter: [],
    activeStatusFilter: [],
    activeTechFilter: [],
    activeTeamFilter: [],
    scopeViolations: [],
  })
})

// ─── Test harness ──────────────────────────────────────────────────────

function makeElement(overrides: Partial<SoftwareSystem & Container> = {}): C4NodeData['element'] {
  return {
    id: 'sys-1',
    type: 'softwareSystem',
    name: 'Payment API',
    description: 'Handles payments',
    tags: ['Element', 'Software System'],
    properties: {},
    containers: [],
    ...overrides,
  } as C4NodeData['element']
}

interface BaseOverrides {
  typeColor?: string
  chipLabel?: string
  tint?: string
  borderStyle?: string
  ariaPrefix?: string
  technology?: string
  isExternal?: boolean
}

function renderNode({
  data = {},
  element = {},
  selected = false,
  zoom = 1,
  props = {},
}: {
  data?: Partial<C4NodeData>
  element?: Partial<SoftwareSystem & Container>
  selected?: boolean
  zoom?: number
  props?: BaseOverrides
} = {}) {
  const el = makeElement(element)
  const nodeData: C4NodeData = { element: el, ...data }

  function TestNode(p: NodeProps) {
    return (
      <BaseC4Node
        data={p.data as unknown as C4NodeData}
        selected={p.selected}
        icon={Box}
        typeColor="#3b82f6"
        chipLabel="System"
        tint="#eef2ff"
        borderStyle="2px solid #64748b"
        ariaPrefix="Software System"
        {...props}
      />
    )
  }

  const utils = render(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlow
        nodes={[{
          id: el.id,
          type: 'c4',
          position: { x: 0, y: 0 },
          data: nodeData as unknown as Record<string, unknown>,
          selected,
        }]}
        nodeTypes={{ c4: TestNode }}
        defaultViewport={{ x: 0, y: 0, zoom }}
        minZoom={0.1}
      />
    </div>,
  )
  const node = utils.container.querySelector('.c4-node') as HTMLElement
  expect(node).not.toBeNull()
  return { ...utils, node, el }
}

describe('BaseC4Node', () => {
  it('renders name, description, chip, technology pills and aria metadata', () => {
    const { node } = renderNode({ props: { technology: 'React, TypeScript' } })

    expect(screen.getByText('Payment API')).toBeTruthy()
    expect(screen.getByText('Handles payments')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
    // technology splits on comma into one pill per entry
    expect(screen.getByText('React')).toBeTruthy()
    expect(screen.getByText('TypeScript')).toBeTruthy()

    expect(node.getAttribute('aria-label')).toBe(
      'Software System: Payment API (React, TypeScript) - Handles payments',
    )
    expect(node.getAttribute('aria-selected')).toBe('false')
    expect(node.className).not.toContain('selected')

    // Default (normal) zoom: name clamps to 2 lines, description to 3
    const name = node.querySelector('.c4-node-name') as HTMLElement
    expect(name.className).toContain('line-clamp-2')
    expect(screen.getByText('Handles payments').className).toContain('line-clamp-3')

    // No violations, no view count, no zoom button, no highlight label by default
    expect(node.querySelector('.c4-node-violation')).toBeNull()
    expect(node.querySelector('.c4-node-view-count')).toBeNull()
    expect(node.querySelector('.c4-node-action-btn')).toBeNull()
    expect(node.querySelector('.c4-highlight-label')).toBeNull()
  })

  it('marks the node selected from the React Flow selected prop', () => {
    const { node } = renderNode({ selected: true })
    expect(node.className).toContain('selected')
    expect(node.getAttribute('aria-selected')).toBe('true')
  })

  it('marks the node selected from the workspace store selection', () => {
    useWorkspaceStore.setState({ selectedElementIds: ['sys-1'] })
    const { node } = renderNode()
    expect(node.className).toContain('selected')
    expect(node.getAttribute('aria-selected')).toBe('true')
  })

  it('shows a violation badge with joined messages and a count for multiple violations', () => {
    useWorkspaceStore.setState({
      scopeViolations: [
        { type: 'error', message: 'First problem', elementId: 'sys-1' },
        { type: 'warning', message: 'Second problem', elementId: 'sys-1' },
        { type: 'warning', message: 'Unrelated', elementId: 'other' },
      ],
    })
    const { node } = renderNode()
    const badge = node.querySelector('.c4-node-violation') as HTMLElement
    expect(badge).not.toBeNull()
    expect(badge.getAttribute('aria-label')).toBe('First problem | Second problem')
    expect(badge.getAttribute('title')).toBe('First problem\nSecond problem')
    expect(badge.textContent).toContain('2')
  })

  it('renders the highlight reason label when highlighted and a filter matches', () => {
    useWorkspaceStore.setState({ activeTagFilter: ['Web'] })
    const { node } = renderNode({
      data: { highlighted: true },
      element: { tags: ['Element', 'Web'] },
    })
    const label = node.querySelector('.c4-highlight-label') as HTMLElement
    expect(label).not.toBeNull()
    expect(label.textContent).toBe('Web')
    expect(label.getAttribute('aria-label')).toBe('Match: Web')
  })

  it('shows the view count when the element appears in multiple views', () => {
    const { node } = renderNode({ data: { viewCount: 3 } })
    const count = node.querySelector('.c4-node-view-count') as HTMLElement
    expect(count).not.toBeNull()
    expect(count.textContent).toBe('3×')
    expect(count.getAttribute('title')).toBe('Appears in 3 views')
  })

  it('applies tag style overrides: opacity, font size, shape icon and glow color', () => {
    const { node } = renderNode({
      data: {
        style: {
          tag: 'db',
          shape: 'Cylinder',
          background: '#123456',
          color: '#abcdef',
          fontSize: 20,
          border: 'Dashed',
          strokeWidth: 3,
          opacity: 50,
        },
      },
    })
    // Structurizr opacity 0–100 → CSS 0–1
    expect(node.style.opacity).toBe('0.5')
    // Description font size derives from tag fontSize (20 * 0.78 → 16)
    expect(screen.getByText('Handles payments').style.fontSize).toBe('16px')
    // Name wrapper picks up the tag font size
    const nameWrap = (node.querySelector('.c4-node-name') as HTMLElement).parentElement as HTMLElement
    expect(nameWrap.style.fontSize).toBe('20px')
  })

  it('uses an explicit tag-style stroke for the border glow color', () => {
    const { node } = renderNode({ data: { style: { tag: 'x', stroke: '#ff0000' } } })
    expect(node.style.getPropertyValue('--node-glow')).toBe('#ff0000')
  })

  it('renders Person shape as a pill with a circular avatar icon', () => {
    const { node } = renderNode({ data: { style: { tag: 'Person', shape: 'Person' } } })
    expect(node.className).toContain('c4-node-person')
    expect(node.style.borderRadius).toBe('999px')
    expect(node.querySelector('span[aria-hidden="true"]')).not.toBeNull()
  })

  it('falls back to a dashed border line for external elements when borderStyle has no line token', () => {
    const { node } = renderNode({
      props: { isExternal: true, borderStyle: '2px', chipLabel: 'External' },
    })
    expect(node).not.toBeNull()
    expect(screen.getByText('External')).toBeTruthy()
  })

  it('hides description and technology and clamps name to one line in compact zoom', () => {
    const { node } = renderNode({ zoom: 0.3, props: { technology: 'React' } })
    expect(screen.queryByText('Handles payments')).toBeNull()
    expect(screen.queryByText('React')).toBeNull()
    const name = node.querySelector('.c4-node-name') as HTMLElement
    expect(name.className).toContain('line-clamp-1')
  })

  it('removes clamps entirely in full zoom', () => {
    const { node } = renderNode({ zoom: 1.5, props: { technology: 'React' } })
    const name = node.querySelector('.c4-node-name') as HTMLElement
    expect(name.className).not.toContain('line-clamp')
    expect(screen.getByText('Handles payments').className).not.toContain('line-clamp')
    expect(screen.getByText('React')).toBeTruthy()
  })
})

describe('BaseC4Node zoom button', () => {
  it('calls onDrillIn with the element id on click', () => {
    const onDrillIn = vi.fn()
    const { node } = renderNode({ data: { childCount: 2, onDrillIn } })
    const btn = node.querySelector('.c4-node-action-btn') as HTMLElement
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('aria-label')).toBe('Zoom into Payment API')
    fireEvent.click(btn)
    expect(onDrillIn).toHaveBeenCalledWith('sys-1')
  })

  function withContainerViews(count: number) {
    const views = Array.from({ length: count }, (_, i) => ({
      type: 'container' as const, key: `cv-${i}`, title: `Containers ${i}`,
      softwareSystemId: 'sys-1', elements: [], relationships: [],
    }))
    useWorkspaceStore.setState({
      activeViewKey: 'ctx',
      workspace: {
        name: 'Test',
        model: { people: [], softwareSystems: [], relationships: [], groups: [] },
        views: {
          systemLandscapeViews: [], systemContextViews: [], containerViews: views,
          componentViews: [], configuration: { styles: { elements: [], relationships: [] } },
        },
      },
    } as never)
  }

  it('drills straight in on click with a single child view, without a card', () => {
    withContainerViews(1)
    const onDrillIn = vi.fn()
    const { node } = renderNode({ data: { childCount: 2, onDrillIn } })
    const btn = node.querySelector('.c4-node-action-btn') as HTMLElement
    expect(btn.getAttribute('aria-haspopup')).toBeNull()
    fireEvent.mouseEnter(btn.parentElement as HTMLElement)
    fireEvent.click(btn)
    expect(onDrillIn).toHaveBeenCalledWith('sys-1')
    expect(screen.queryByText('New diagram')).toBeNull()
  })

  it('lists several child views on click instead of on hover', () => {
    withContainerViews(2)
    const onDrillIn = vi.fn()
    const { node } = renderNode({ data: { childCount: 2, onDrillIn } })
    const btn = node.querySelector('.c4-node-action-btn') as HTMLElement

    fireEvent.mouseEnter(btn.parentElement as HTMLElement)
    expect(screen.queryByText('New diagram')).toBeNull()

    fireEvent.click(btn)
    expect(onDrillIn).not.toHaveBeenCalled()
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Containers 0')).toBeTruthy()
    expect(screen.getByText('Containers 1')).toBeTruthy()
    // Portalled outside the node so viewport zoom doesn't scale it.
    expect(node.contains(screen.getByText('Containers 0'))).toBe(false)

    fireEvent.click(btn)
    expect(screen.queryByText('New diagram')).toBeNull()
  })

  it('closes the view list on an outside pointerdown or Escape', () => {
    withContainerViews(2)
    const { node } = renderNode({ data: { childCount: 2 } })
    const btn = node.querySelector('.c4-node-action-btn') as HTMLElement

    fireEvent.click(btn)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByText('New diagram')).toBeNull()

    fireEvent.click(btn)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('New diagram')).toBeNull()
  })

  describe('document indicator', () => {
    const one = [{ path: 'architecture/overview.md', title: 'Overview' }]
    const two = [...one, { path: 'adr/001.md', title: 'ADR 1' }]

    afterEach(() => { vi.restoreAllMocks() })

    it('is absent without documents', () => {
      renderNode()
      expect(screen.queryByLabelText(/document/i)).toBeNull()
    })

    it('renders for one document without a count, outside the fading actions', () => {
      const { node } = renderNode({ element: { documents: one }, data: { childCount: 1 } })
      const btn = screen.getByLabelText('1 document for Payment API')
      expect(btn.querySelector('.c4-doc-indicator-count')).toBeNull()
      expect(node.querySelector('.c4-node-actions')?.contains(btn)).toBe(false)
      expect(btn.getAttribute('title')).toBe('Overview')
    })

    it('shows a count for two or more documents', () => {
      renderNode({ element: { documents: two } })
      const btn = screen.getByLabelText('2 documents for Payment API')
      expect(btn.textContent).toBe('2')
    })

    it('opens the single document in a new tab without selecting the node', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      const selectElement = vi.fn()
      useWorkspaceStore.setState({ selectElement } as never)
      renderNode({ element: { documents: one } })
      fireEvent.click(screen.getByLabelText('1 document for Payment API'))
      expect(open).toHaveBeenCalledWith(
        '/document-view?path=architecture%2Foverview.md&title=Overview', '_blank', 'noopener,noreferrer',
      )
      expect(selectElement).not.toHaveBeenCalled()
    })

    it('opens a menu listing titles for several documents, links open in a new tab, Escape closes', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      renderNode({ element: { documents: two } })
      fireEvent.click(screen.getByLabelText('2 documents for Payment API'))
      expect(open).not.toHaveBeenCalled()
      const items = screen.getAllByRole('menuitem')
      expect(items.map((i) => i.querySelector('.c4-doc-menu-title')?.textContent)).toEqual(['Overview', 'ADR 1'])
      expect(items[1].getAttribute('href')).toBe('/document-view?path=adr%2F001.md&title=ADR+1')
      expect(items[1].getAttribute('target')).toBe('_blank')
      expect(items[1].getAttribute('rel')).toBe('noopener noreferrer')
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('stays usable in the read-only viewer', () => {
      useWorkspaceStore.setState({ readOnly: true })
      const open = vi.spyOn(window, 'open').mockReturnValue(null)
      renderNode({ element: { documents: one } })
      fireEvent.click(screen.getByLabelText('1 document for Payment API'))
      expect(open).toHaveBeenCalledTimes(1)
      useWorkspaceStore.setState({ readOnly: false })
    })
  })
})
