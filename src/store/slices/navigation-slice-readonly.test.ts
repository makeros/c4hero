import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import type { Workspace } from '@/types/model'

// navigation-slice is the one slice with a MIXED readOnly guard: only the
// create-on-zoom branch (zoomInto's no-existing-view path, confirmZoomCreate,
// openCreateViewFromZoom) is guarded. View navigation (setActiveView,
// drillInto, navigateBack, focusViewForElements, zoomInto-with-existing-
// child-view) must keep working unchanged regardless of readOnly.

function makeWorkspaceWithContainer(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [],
      softwareSystems: [
        {
          id: 'sys1', type: 'softwareSystem', name: 'Internet Banking', tags: ['Element', 'Software System'], properties: {},
          containers: [
            { id: 'c1', type: 'container', name: 'Web App', tags: ['Element', 'Container'], properties: {}, components: [] },
          ],
        },
        // An empty system — still zoomable; zoomInto should prompt to create an empty container view.
        { id: 'sys2', type: 'softwareSystem', name: 'Empty', tags: ['Element', 'Software System'], properties: {}, containers: [] },
      ],
      relationships: [],
      groups: [],
    },
    views: {
      systemLandscapeViews: [{
        type: 'systemLandscape', key: 'landscape', title: 'Landscape',
        elements: [{ id: 'sys1' }, { id: 'sys2' }],
        relationships: [], autoLayout: { direction: 'TB' },
      }],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  } as unknown as Workspace
}

describe('navigation-slice readOnly guard', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().setReadOnly(false)
    useWorkspaceStore.getState().loadWorkspace(makeWorkspaceWithContainer())
  })

  afterEach(() => {
    // readOnly is global store state — never leave it true for later tests.
    useWorkspaceStore.getState().setReadOnly(false)
  })

  describe('zoomInto', () => {
    it('on a childless element, with readOnly true, leaves pendingZoomConfirm null and does not navigate', () => {
      useWorkspaceStore.getState().setReadOnly(true)
      const before = useWorkspaceStore.getState().activeViewKey

      useWorkspaceStore.getState().zoomInto('sys2')

      const state = useWorkspaceStore.getState()
      expect(state.pendingZoomConfirm).toBeNull()
      expect(state.activeViewKey).toBe(before)
      expect(state.viewHistory).toEqual([])
    })

    it('on a childless element, with readOnly false, still sets pendingZoomConfirm (sanity check)', () => {
      useWorkspaceStore.getState().zoomInto('sys2')
      const state = useWorkspaceStore.getState()
      expect(state.pendingZoomConfirm).not.toBeNull()
      expect(state.pendingZoomConfirm?.elementId).toBe('sys2')
    })

    it('on an element with an existing child view, still navigates to it with readOnly true', () => {
      // Create the container view first, while not read-only.
      useWorkspaceStore.getState().addView('container', 'sys1', 'Containers')
      useWorkspaceStore.getState().setActiveView('landscape')
      expect(useWorkspaceStore.getState().activeViewKey).toBe('landscape')

      useWorkspaceStore.getState().setReadOnly(true)
      useWorkspaceStore.getState().zoomInto('sys1')

      const state = useWorkspaceStore.getState()
      expect(state.activeViewKey).not.toBe('landscape')
      expect(state.pendingZoomConfirm).toBeNull()
      expect(state.viewHistory).toContain('landscape')
    })
  })

  describe('confirmZoomCreate', () => {
    it('no-ops when readOnly is true', () => {
      useWorkspaceStore.getState().zoomInto('sys2')
      expect(useWorkspaceStore.getState().pendingZoomConfirm).not.toBeNull()
      const pendingBefore = useWorkspaceStore.getState().pendingZoomConfirm

      useWorkspaceStore.getState().setReadOnly(true)
      useWorkspaceStore.getState().confirmZoomCreate()

      const state = useWorkspaceStore.getState()
      expect(state.pendingZoomConfirm).toEqual(pendingBefore)
      expect(state.workspace!.views.containerViews).toHaveLength(0)
    })
  })

  describe('openCreateViewFromZoom', () => {
    it('no-ops when readOnly is true', () => {
      useWorkspaceStore.getState().zoomInto('sys2')
      expect(useWorkspaceStore.getState().pendingZoomConfirm).not.toBeNull()
      const pendingBefore = useWorkspaceStore.getState().pendingZoomConfirm

      useWorkspaceStore.getState().setReadOnly(true)
      useWorkspaceStore.getState().openCreateViewFromZoom()

      const state = useWorkspaceStore.getState()
      expect(state.pendingZoomConfirm).toEqual(pendingBefore)
      expect(state.createViewDialogOpen).toBe(false)
      expect(state.createViewDefaults).toBeNull()
    })
  })

  describe('unguarded navigation actions are unaffected by readOnly', () => {
    it('setActiveView still navigates when readOnly is true', () => {
      const key = useWorkspaceStore.getState().addView('systemLandscape', undefined, 'Second')
      useWorkspaceStore.getState().setReadOnly(true)

      useWorkspaceStore.getState().setActiveView(key)

      expect(useWorkspaceStore.getState().activeViewKey).toBe(key)
    })

    it('drillInto still navigates into an existing child view when readOnly is true', () => {
      useWorkspaceStore.getState().addView('container', 'sys1', 'Containers')
      useWorkspaceStore.getState().setActiveView('landscape')
      useWorkspaceStore.getState().setReadOnly(true)

      useWorkspaceStore.getState().drillInto('sys1')

      const state = useWorkspaceStore.getState()
      expect(state.activeViewKey).not.toBe('landscape')
      expect(state.viewHistory).toContain('landscape')
    })

    it('navigateBack still pops viewHistory when readOnly is true', () => {
      const key = useWorkspaceStore.getState().addView('container', 'sys1', 'Containers')
      useWorkspaceStore.getState().setActiveView('landscape')
      useWorkspaceStore.getState().drillInto('sys1')
      expect(useWorkspaceStore.getState().activeViewKey).toBe(key)
      expect(useWorkspaceStore.getState().viewHistory).toContain('landscape')

      useWorkspaceStore.getState().setReadOnly(true)
      useWorkspaceStore.getState().navigateBack()

      expect(useWorkspaceStore.getState().activeViewKey).toBe('landscape')
    })
  })
})
