import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toBlob } from 'html-to-image'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import type { View, Workspace } from '@/types/model'
import { captureViewAsProposalPNG, waitForViewMeasured, exportViewsForProposal } from './exportProposal'
import { useWorkspaceStore } from '@/store/workspace'
import { LIGHT_STYLE } from '@/lib/exportUtils'

vi.mock('html-to-image', () => ({
  toBlob: vi.fn(),
}))

vi.mock('@/store/workspace', () => ({
  useWorkspaceStore: { getState: vi.fn(), setState: vi.fn() },
}))

function makeNode(id: string, measured: { width?: number; height?: number } | undefined = { width: 100, height: 50 }): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
    measured,
  } as unknown as Node
}

function makeView(overrides: Partial<View> = {}): View {
  return {
    type: 'container',
    key: 'view-1',
    title: 'View One',
    elements: [{ id: 'el-1' }, { id: 'el-2' }],
    relationships: [],
    ...overrides,
  } as View
}

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    name: 'My Project',
    model: { people: [], softwareSystems: [], relationships: [], groups: [], deploymentEnvironments: [] },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      dynamicViews: [],
      deploymentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
    ...overrides,
  } as unknown as Workspace
}

/** Static double: every call to `getNodes()` returns the same fixed list.
 *  Fine for `captureViewAsProposalPNG` tests, which read `getNodes()` once
 *  and don't care about the measurement-wait staleness algorithm. */
function makeReactFlow(nodes: Node[]): ReactFlowInstance {
  return {
    getNodes: () => nodes,
  } as unknown as ReactFlowInstance
}

/** Sequenced double: returns `sequence[i]` on the i-th call to `getNodes()`,
 *  clamped to the last entry once exhausted. Used to simulate a view switch
 *  where the first read(s) still reflect the previous view's already-
 *  rendered (possibly already-measured) nodes before React commits the new
 *  view's nodes. */
function makeSequencedReactFlow(sequence: Node[][]): ReactFlowInstance {
  let call = 0
  return {
    getNodes: () => {
      const idx = Math.min(call, sequence.length - 1)
      call++
      return sequence[idx]
    },
  } as unknown as ReactFlowInstance
}

/** Convenience wrapper: previous view has no rendered nodes at all, target
 *  view's `nodes` appear from the second call onward. */
function makeSwitchingReactFlow(nodes: Node[]): ReactFlowInstance {
  return makeSequencedReactFlow([[], nodes])
}

/** Multi-view double for `exportViewsForProposal` batch tests: `getNodes()`
 *  reflects whichever view was rendered `lagCalls` `getNodes()` calls ago,
 *  simulating that `reactFlow`'s internal node state (owned by React Flow)
 *  lags the Zustand store's `activeViewKey` (owned by `setActiveView`,
 *  synchronous) by a few render/measurement passes. */
function makeMultiViewReactFlowStub(nodesByKey: Record<string, Node[]>, initialKey: string, lagCalls = 1) {
  let activeKey = initialKey
  let renderedKey = initialKey
  let callsSinceSwitch = 0

  return {
    setActive: (key: string) => {
      activeKey = key
      callsSinceSwitch = 0
    },
    getNodes: (): Node[] => {
      if (renderedKey !== activeKey) {
        callsSinceSwitch++
        if (callsSinceSwitch > lagCalls) {
          renderedKey = activeKey
        }
      }
      return nodesByKey[renderedKey] ?? []
    },
  }
}

describe('captureViewAsProposalPNG', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.mocked(toBlob).mockReset()
  })

  it('returns null when .react-flow__viewport is missing from the DOM', async () => {
    const reactFlow = makeReactFlow([makeNode('a')])
    const result = await captureViewAsProposalPNG(reactFlow)
    expect(result).toBeNull()
    expect(toBlob).not.toHaveBeenCalled()
  })

  it('returns null when there are no nodes to bound (empty view)', async () => {
    const viewport = document.createElement('div')
    viewport.className = 'react-flow__viewport'
    document.body.appendChild(viewport)

    const reactFlow = makeReactFlow([])
    const result = await captureViewAsProposalPNG(reactFlow)
    expect(result).toBeNull()
    expect(toBlob).not.toHaveBeenCalled()
  })

  it('captures the viewport cropped to the content bounding box with light/white styling', async () => {
    const viewport = document.createElement('div')
    viewport.className = 'react-flow__viewport'
    document.body.appendChild(viewport)

    const blob = new Blob(['png'])
    vi.mocked(toBlob).mockResolvedValue(blob)

    const nodes = [
      makeNode('a', { width: 100, height: 50 }),
      makeNode('b', { width: 100, height: 50 }),
    ]
    nodes[0].position = { x: 10, y: 20 }
    nodes[1].position = { x: 200, y: 100 }

    const reactFlow = makeReactFlow(nodes)
    const result = await captureViewAsProposalPNG(reactFlow)

    expect(result).toBe(blob)
    expect(toBlob).toHaveBeenCalledTimes(1)
    const [targetEl, options] = vi.mocked(toBlob).mock.calls[0]
    expect(targetEl).toBe(viewport)
    expect(options?.backgroundColor).toBe('#ffffff')
    expect(options?.width).toBe(290) // maxX(300) - minX(10)
    expect(options?.height).toBe(130) // maxY(150) - minY(20)
    expect(options?.style?.transform).toBe('translate(-10px, -20px)')
  })

  it('passes pixelRatio: 2 to toBlob, for parity with the single-view export', async () => {
    const viewport = document.createElement('div')
    viewport.className = 'react-flow__viewport'
    document.body.appendChild(viewport)
    vi.mocked(toBlob).mockResolvedValue(new Blob(['png']))

    const reactFlow = makeReactFlow([makeNode('a'), makeNode('b')])
    await captureViewAsProposalPNG(reactFlow)

    const [, options] = vi.mocked(toBlob).mock.calls[0]
    expect(options?.pixelRatio).toBe(2)
  })

  it('applies LIGHT_STYLE by mutating the live viewport element (not via html-to-image style option) and restores it afterward', async () => {
    const viewport = document.createElement('div')
    viewport.className = 'react-flow__viewport'
    viewport.style.setProperty('--color-bg-primary', '#000000') // pre-existing value to restore
    document.body.appendChild(viewport)

    const blob = new Blob(['png'])
    vi.mocked(toBlob).mockImplementation(async () => {
      // While html-to-image is capturing, the live element must already carry
      // the light palette so the real cascade resolves descendant var(...)
      // references before html-to-image clones+computes them.
      expect(viewport.style.getPropertyValue('--color-bg-primary')).toBe(LIGHT_STYLE['--color-bg-primary'])
      expect(viewport.style.getPropertyValue('--color-surface-1')).toBe(LIGHT_STYLE['--color-surface-1'])
      return blob
    })

    const reactFlow = makeReactFlow([makeNode('a'), makeNode('b')])
    const result = await captureViewAsProposalPNG(reactFlow)

    expect(result).toBe(blob)
    // Restored to the pre-existing value after capture completes.
    expect(viewport.style.getPropertyValue('--color-bg-primary')).toBe('#000000')
    // A property with no prior value is fully removed, not left as ''.
    expect(viewport.style.getPropertyValue('--color-surface-1')).toBe('')
    // LIGHT_STYLE custom properties are no longer passed through
    // html-to-image's `style` option — only the transform override belongs there.
    const [, options] = vi.mocked(toBlob).mock.calls[0]
    expect(options?.style).toEqual({ transform: expect.stringContaining('translate') })
  })

  it('restores the live viewport style even when toBlob throws', async () => {
    const viewport = document.createElement('div')
    viewport.className = 'react-flow__viewport'
    document.body.appendChild(viewport)
    vi.mocked(toBlob).mockRejectedValue(new Error('boom'))

    const reactFlow = makeReactFlow([makeNode('a'), makeNode('b')])

    await expect(captureViewAsProposalPNG(reactFlow)).rejects.toThrow('boom')
    expect(viewport.style.getPropertyValue('--color-bg-primary')).toBe('')
  })

  it('excludes unmeasured overlay nodes from bounds but includes measured ones (M4)', async () => {
    const viewport = document.createElement('div')
    viewport.className = 'react-flow__viewport'
    document.body.appendChild(viewport)
    vi.mocked(toBlob).mockResolvedValue(new Blob(['png']))

    const content = makeNode('a', { width: 100, height: 50 })
    content.position = { x: 0, y: 0 }
    const unmeasuredOverlay = makeNode('__scope_boundary__sys-1', {})
    unmeasuredOverlay.position = { x: -500, y: -500 } // would skew bounds if included
    const measuredGroupOverlay = makeNode('group-team', { width: 300, height: 200 })
    measuredGroupOverlay.position = { x: 400, y: 400 }

    const reactFlow = makeReactFlow([content, unmeasuredOverlay, measuredGroupOverlay])
    await captureViewAsProposalPNG(reactFlow)

    const [, options] = vi.mocked(toBlob).mock.calls[0]
    // Bounds span content (0,0)-(100,50) plus the MEASURED group overlay
    // (400,400)-(700,600); the unmeasured boundary at (-500,-500) is excluded.
    expect(options?.width).toBe(700)
    expect(options?.height).toBe(600)
  })
})

describe('waitForViewMeasured', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves immediately without timing out for a view with no elements', async () => {
    const reactFlow = makeReactFlow([])
    const result = await waitForViewMeasured(reactFlow, makeView({ elements: [] }))
    expect(result).toEqual({ timedOut: false })
  })

  it('resolves once the rendered node set changes away from the previous view and settles measured', async () => {
    const view = makeView({ elements: [{ id: 'el-1' }, { id: 'el-2' }] as View['elements'] })
    const reactFlow = makeSwitchingReactFlow([makeNode('el-1'), makeNode('el-2')])
    const result = await waitForViewMeasured(reactFlow, view)
    expect(result).toEqual({ timedOut: false })
  })

  it('does NOT resolve ready on the previous view\'s already-measured nodes (B1 stale-node race)', async () => {
    const view = makeView({ elements: [{ id: 'el-1' }, { id: 'el-2' }] as View['elements'] })
    const staleNodes = [makeNode('el-1'), makeNode('el-2'), makeNode('el-3')] // previous view, fully measured
    const newNodes = [makeNode('el-1'), makeNode('el-2')] // the new view's real, different node set
    // Calls: [0]=staleIds snapshot, [1]=still stale (not yet committed),
    // [2]=new view's nodes appear, [3]=stable repeat -> ready.
    const reactFlow = makeSequencedReactFlow([staleNodes, staleNodes, newNodes, newNodes])
    const result = await waitForViewMeasured(reactFlow, view)
    expect(result).toEqual({ timedOut: false })
  })

  it('times out after the measurement-attempt cap when nodes never measure', async () => {
    const view = makeView({ elements: [{ id: 'el-1' }] as View['elements'] })
    const reactFlow = makeSequencedReactFlow([[], [makeNode('el-1', {})]])
    const result = await waitForViewMeasured(reactFlow, view)
    expect(result).toEqual({ timedOut: true })
  })
})

describe('exportViewsForProposal', () => {
  let setActiveView: ReturnType<typeof vi.fn>
  let setState: ReturnType<typeof vi.fn>
  let activeViewKey: string | null
  let selectionState: {
    selectedElementIds: string[]
    selectedRelationshipId: string | null
    selectedGroupId: string | null
    activeTagFilter: string[]
    activeStatusFilter: string[]
    activeTechFilter: string[]
    activeTeamFilter: string[]
    lastClearedHighlightFilters: unknown
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    vi.mocked(toBlob).mockReset()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })

    activeViewKey = 'original-view'
    selectionState = {
      selectedElementIds: ['pre-existing-el'],
      selectedRelationshipId: 'pre-existing-rel',
      selectedGroupId: 'pre-existing-group',
      activeTagFilter: ['tag-1'],
      activeStatusFilter: [],
      activeTechFilter: [],
      activeTeamFilter: [],
      lastClearedHighlightFilters: null,
    }
    setActiveView = vi.fn((key: string) => {
      activeViewKey = key
    })
    setState = vi.fn()
    vi.mocked(useWorkspaceStore.getState).mockImplementation(
      () => ({ activeViewKey, setActiveView, ...selectionState }) as unknown as ReturnType<typeof useWorkspaceStore.getState>,
    )
    vi.mocked(useWorkspaceStore.setState).mockImplementation(setState as never)

    const viewport = document.createElement('div')
    viewport.className = 'react-flow__viewport'
    document.body.appendChild(viewport)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skips a view with an empty elements array without calling capture, and records a reason', async () => {
    const emptyView = makeView({ key: 'empty', title: 'Empty', elements: [] })
    const reactFlow = makeReactFlow([])
    const workspace = makeWorkspace()

    const result = await exportViewsForProposal({ reactFlow, workspace, views: [emptyView] })

    expect(toBlob).not.toHaveBeenCalled()
    expect(result.files).toEqual([])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].view).toBe(emptyView)
    expect(result.skipped[0].reason).toBeTruthy()
    expect(result.warnings).toEqual([])
  })

  it('restores the original active view even when a capture throws', async () => {
    const view = makeView({ key: 'view-a', title: 'View A' })
    vi.mocked(toBlob).mockRejectedValue(new Error('capture blew up'))

    const reactFlow = makeSwitchingReactFlow([makeNode('el-1'), makeNode('el-2')])
    const workspace = makeWorkspace()

    const result = await exportViewsForProposal({ reactFlow, workspace, views: [view] })

    expect(setActiveView).toHaveBeenCalledWith('view-a')
    expect(setActiveView).toHaveBeenLastCalledWith('original-view')
    expect(activeViewKey).toBe('original-view')
    expect(result.files).toEqual([])
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('capture blew up')
  })

  it('records a captured file named <ProjectName>-<ViewName>.png and restores the original view on success', async () => {
    const view = makeView({ key: 'view-a', title: 'View A' })
    const blob = new Blob(['png'])
    vi.mocked(toBlob).mockResolvedValue(blob)

    const reactFlow = makeSwitchingReactFlow([makeNode('el-1'), makeNode('el-2')])
    const workspace = makeWorkspace({ name: 'My Project' })

    const result = await exportViewsForProposal({ reactFlow, workspace, views: [view] })

    expect(result.skipped).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.files).toEqual([{ filename: 'My Project-View A.png', blob }])
    expect(activeViewKey).toBe('original-view')
  })

  it('does not attempt to restore the active view if none was set originally', async () => {
    activeViewKey = null
    const view = makeView({ key: 'view-a', elements: [] })
    const reactFlow = makeReactFlow([])
    const workspace = makeWorkspace()

    await exportViewsForProposal({ reactFlow, workspace, views: [view] })

    expect(setActiveView).not.toHaveBeenCalledWith(null)
  })

  it('is a no-op fast path when views is empty: no store reads/writes', async () => {
    const workspace = makeWorkspace()
    const reactFlow = makeReactFlow([])

    const result = await exportViewsForProposal({ reactFlow, workspace, views: [] })

    expect(result).toEqual({ files: [], skipped: [], warnings: [] })
    expect(setActiveView).not.toHaveBeenCalled()
    expect(setState).not.toHaveBeenCalled()
  })

  it('records a warning (but still produces a file) when the measurement wait times out (M1)', async () => {
    const view = makeView({ key: 'view-a', title: 'View A' })
    vi.mocked(toBlob).mockResolvedValue(new Blob(['png']))

    // Node id changes away from stale but never measures -> waitForViewMeasured times out.
    const reactFlow = makeSequencedReactFlow([[], [makeNode('el-1', {}), makeNode('el-2', {})]])
    const workspace = makeWorkspace()

    const result = await exportViewsForProposal({ reactFlow, workspace, views: [view] })

    expect(result.files).toHaveLength(1)
    expect(result.warnings).toEqual([
      { view, reason: expect.stringContaining('may be incomplete') },
    ])
  })

  it('restores selection and highlighter-filter state to the pre-batch snapshot, not the last view visited (m3)', async () => {
    const view = makeView({ key: 'view-a', title: 'View A' })
    vi.mocked(toBlob).mockResolvedValue(new Blob(['png']))
    const reactFlow = makeSwitchingReactFlow([makeNode('el-1'), makeNode('el-2')])
    const workspace = makeWorkspace()

    await exportViewsForProposal({ reactFlow, workspace, views: [view] })

    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedElementIds: ['pre-existing-el'],
        selectedRelationshipId: 'pre-existing-rel',
        selectedGroupId: 'pre-existing-group',
        activeTagFilter: ['tag-1'],
        lastClearedHighlightFilters: null,
      }),
    )
  })

  it('disambiguates duplicate generated filenames with a numeric suffix (m6)', async () => {
    const viewA = makeView({ key: 'view-a', title: 'Duplicate View' })
    const viewB = makeView({ key: 'view-b', title: 'Duplicate View' })
    vi.mocked(toBlob).mockResolvedValue(new Blob(['png']))

    const stub = makeMultiViewReactFlowStub(
      {
        'original-view': [],
        'view-a': [makeNode('x1'), makeNode('x2')],
        'view-b': [makeNode('y1'), makeNode('y2')],
      },
      'original-view',
    )
    setActiveView = vi.fn((key: string) => {
      activeViewKey = key
      stub.setActive(key)
    })
    vi.mocked(useWorkspaceStore.getState).mockImplementation(
      () => ({ activeViewKey, setActiveView, ...selectionState }) as unknown as ReturnType<typeof useWorkspaceStore.getState>,
    )
    const reactFlow = { getNodes: stub.getNodes } as unknown as ReactFlowInstance
    const workspace = makeWorkspace({ name: 'My Project' })

    const result = await exportViewsForProposal({ reactFlow, workspace, views: [viewA, viewB] })

    expect(result.skipped).toEqual([])
    expect(result.files.map((f) => f.filename)).toEqual([
      'My Project-Duplicate View.png',
      'My Project-Duplicate View (2).png',
    ])
  })

  it('calls setActiveView in order and produces correctly named files across a 3+ view batch, and a skip in the middle does not abort the remaining views (m1 b+c)', async () => {
    const viewA = makeView({ key: 'view-a', title: 'View A' })
    const emptyView = makeView({ key: 'view-empty', title: 'Empty View', elements: [] })
    const viewC = makeView({ key: 'view-c', title: 'View C' })
    vi.mocked(toBlob).mockResolvedValue(new Blob(['png']))

    const stub = makeMultiViewReactFlowStub(
      {
        'original-view': [],
        'view-a': [makeNode('a1'), makeNode('a2')],
        'view-empty': [],
        'view-c': [makeNode('c1'), makeNode('c2')],
      },
      'original-view',
    )
    setActiveView = vi.fn((key: string) => {
      activeViewKey = key
      stub.setActive(key)
    })
    vi.mocked(useWorkspaceStore.getState).mockImplementation(
      () => ({ activeViewKey, setActiveView, ...selectionState }) as unknown as ReturnType<typeof useWorkspaceStore.getState>,
    )
    const reactFlow = { getNodes: stub.getNodes } as unknown as ReactFlowInstance
    const workspace = makeWorkspace({ name: 'My Project' })

    const result = await exportViewsForProposal({ reactFlow, workspace, views: [viewA, emptyView, viewC] })

    expect(setActiveView.mock.calls.map((c) => c[0])).toEqual(['view-a', 'view-empty', 'view-c', 'original-view'])
    expect(result.skipped).toEqual([{ view: emptyView, reason: expect.any(String) }])
    expect(result.files).toEqual([
      { filename: 'My Project-View A.png', blob: expect.any(Blob) },
      { filename: 'My Project-View C.png', blob: expect.any(Blob) },
    ])
  })
})
