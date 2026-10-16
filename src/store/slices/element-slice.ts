import type { StateCreator } from 'zustand'
import type { WorkspaceState } from '../workspace-types'
import type { Person, SoftwareSystem, Container, Component, View, Workspace } from '@/types/model'
import { announce } from '@/lib/announce'
import { nanoid, pushUndoSnapshot } from '../internals'
import {
  applyElementPatch,
  addToCurrentView,
  cascadeDeleteElements,
  duplicateElementsInTree,
  uniqueElementName,
  findViewHelper,
  appendScopedView,
  invalidateElementIndex,
  findElementHelper,
  selectCreated,
  normalizeDynamicView,
} from '../workspace-helpers'
import { getFirstViewKey } from '../workspace-selectors'

/** Element CRUD: add/update/delete/duplicate for people, systems, containers,
 *  and components. Each add* action also auto-includes the new element in the
 *  relevant peer views (system landscape views for people/systems, container
 *  views scoped to the same system for containers, etc.). */
export type ElementSlice = Pick<WorkspaceState,
  | 'addPerson' | 'addSoftwareSystem' | 'addContainer' | 'addComponent'
  | 'updateElement' | 'updateElementLive' | 'updateElementTechnology'
  | 'deleteElement' | 'deleteElements' | 'duplicateElements' | 'moveElement'
>

/** Drop the ids from a view and prune relationship refs left without both endpoints. */
function removeFromView(ws: Workspace, view: View, ids: ReadonlySet<string>): void {
  view.elements = view.elements.filter(e => !ids.has(e.id))
  const present = new Set(view.elements.map(e => e.id))
  const relById = new Map(ws.model.relationships.map(r => [r.id, r]))
  view.relationships = view.relationships.filter((r) => {
    const rel = relById.get(r.id)
    return !rel || (present.has(rel.sourceId) && present.has(rel.destinationId))
  })
}

/** Add an element to a view plus the relationships it has to elements already shown. */
function addToScopedView(ws: Workspace, view: View, id: string): void {
  if (!view.elements.some(e => e.id === id)) view.elements.push({ id })
  const present = new Set(view.elements.map(e => e.id))
  for (const r of ws.model.relationships) {
    if (r.sourceId !== id && r.destinationId !== id) continue
    if (!present.has(r.sourceId) || !present.has(r.destinationId)) continue
    if (!view.relationships.some(vr => vr.id === r.id)) view.relationships.push({ id: r.id })
  }
}

/** The software system that owns a container or component (undefined for top-level elements). */
function owningSystemId(ws: Workspace, id: string): string | undefined {
  return ws.model.softwareSystems.find(sys =>
    sys.containers.some(c => c.id === id || c.components.some(comp => comp.id === id)),
  )?.id
}

/** Drop dynamic steps that stopped being valid for their view's scope because an endpoint
 *  left it: a system-scoped view only shows containers/components of that system, a
 *  container-scoped view only the components of that container. Steps that were already
 *  out of scope before the move are left alone. */
function dropInvalidDynamicSteps(
  ws: Workspace,
  movedId: string,
  moved: ReadonlySet<string>,
  oldSystemId: string | undefined,
  oldContainerId: string | undefined,
): void {
  const relById = new Map(ws.model.relationships.map(r => [r.id, r]))
  for (const v of ws.views.dynamicViews ?? []) {
    const scopeSystemId = v.softwareSystemId
    const scopeContainerId = v.containerId
    if (!scopeSystemId && !scopeContainerId) continue
    const leftScope = (endpoint: string | undefined): boolean => {
      if (!endpoint || !moved.has(endpoint)) return false
      if (scopeSystemId) return oldSystemId === scopeSystemId && owningSystemId(ws, endpoint) !== scopeSystemId
      return oldContainerId === scopeContainerId && endpoint === movedId
    }
    const kept = v.relationships.filter((step) => {
      const rel = relById.get(step.id)
      return !(leftScope(step.sourceId ?? rel?.sourceId) || leftScope(step.destinationId ?? rel?.destinationId))
    })
    if (kept.length === v.relationships.length) continue
    v.relationships = kept
    normalizeDynamicView(ws, v)
  }
}

export const createElementSlice: StateCreator<
  WorkspaceState,
  [['zustand/immer', never]],
  [],
  ElementSlice
> = (set, get) => ({
  addPerson: (name, position, location) => {
    if (get().readOnly) return ''
    const id = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const ws = s.workspace
      const person: Person = { id, type: 'person', name: uniqueElementName(name, ws), tags: ['Element', 'Person'], properties: {}, location: location ?? 'Internal' }
      ws.model.people.push(person)
      addToCurrentView(ws, s.activeViewKey, id, position, 'person')
      // Auto-add to all system landscape views (they display every person/system)
      for (const v of ws.views.systemLandscapeViews) {
        if (v.key !== s.activeViewKey && !v.elements.some(e => e.id === id)) {
          v.elements.push({ id })
        }
      }
      selectCreated(s, id)
    })
    announce('Person created')
    return id
  },

  addSoftwareSystem: (name, position, location) => {
    if (get().readOnly) return ''
    const id = nanoid(8)
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      const ws = s.workspace
      const system: SoftwareSystem = { id, type: 'softwareSystem', name: uniqueElementName(name, ws), tags: ['Element', 'Software System'], properties: {}, containers: [], location: location ?? 'Internal' }
      ws.model.softwareSystems.push(system)
      addToCurrentView(ws, s.activeViewKey, id, position, 'softwareSystem')
      for (const v of ws.views.systemLandscapeViews) {
        if (v.key !== s.activeViewKey && !v.elements.some(e => e.id === id)) {
          v.elements.push({ id })
        }
      }
      selectCreated(s, id)
    })
    get().revalidateScope()
    announce('System created')
    return id
  },

  addContainer: (systemId, name, position, extraTag) => {
    if (get().readOnly) return ''
    const id = nanoid(8)
    let added = false
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      const system = ws.model.softwareSystems.find(sys => sys.id === systemId)
      if (!system) return
      pushUndoSnapshot(s)
      const tags = extraTag ? ['Element', 'Container', extraTag] : ['Element', 'Container']
      const container: Container = { id, type: 'container', name: uniqueElementName(name, ws), tags, properties: {}, components: [] }
      system.containers.push(container)
      // A container belongs ONLY in its own system's container views — never in
      // the active view if that view is scoped to a different system (that would
      // render system B's container inside system A's view). Add it to every
      // container view scoped to THIS system (with the drop position on the
      // active one); if the system has no container view yet, create and switch
      // to one so the container isn't stranded invisibly. Matters for AI-applied
      // ops, which run regardless of the active view.
      let placed = false
      for (const v of ws.views.containerViews) {
        if (v.softwareSystemId !== systemId) continue
        if (!v.elements.some(e => e.id === id)) {
          v.elements.push(v.key === s.activeViewKey ? { id, x: position?.x, y: position?.y } : { id })
        }
        placed = true
      }
      if (!placed) {
        const vk = nanoid(8)
        appendScopedView(ws, 'container', systemId, `${system.name} — Containers`, vk)
        // During a batch AI apply, don't jump per-op — the panel navigates once
        // afterwards (focusViewForElements). For a single creation, switch to it.
        if (!s.batchApplying) s.activeViewKey = vk
      }
      selectCreated(s, id)
      added = true
    })
    if (added) {
      get().revalidateScope()
      announce('Container created')
    }
    return id
  },

  addComponent: (containerId, name, position) => {
    if (get().readOnly) return ''
    const id = nanoid(8)
    let added = false
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      for (const sys of ws.model.softwareSystems) {
        const container = sys.containers.find(c => c.id === containerId)
        if (!container) continue
        pushUndoSnapshot(s)
        const comp: Component = { id, type: 'component', name: uniqueElementName(name, ws), tags: ['Element', 'Component'], properties: {} }
        container.components.push(comp)
        // A component belongs ONLY in its own container's component views (not in
        // a different container's active view). Add to every component view
        // scoped to THIS container (position on the active one); if none exists,
        // create + switch to one so it isn't stranded invisibly (see addContainer).
        let placed = false
        for (const v of ws.views.componentViews) {
          if (v.containerId !== containerId) continue
          if (!v.elements.some(e => e.id === id)) {
            v.elements.push(v.key === s.activeViewKey ? { id, x: position?.x, y: position?.y } : { id })
          }
          placed = true
        }
        if (!placed) {
          const vk = nanoid(8)
          appendScopedView(ws, 'component', containerId, `${container.name} — Components`, vk)
          if (!s.batchApplying) s.activeViewKey = vk
        }
        selectCreated(s, id)
        added = true
        return
      }
    })
    if (added) announce('Component created')
    return id
  },

  updateElement: (id, patch) => set((s) => {
    if (s.readOnly || !s.workspace) return
    // applyElementPatch is no-op-safe; only push undo if something actually changed.
    if (!applyElementPatch(s.workspace, id, patch)) return
    pushUndoSnapshot(s)
  }),

  updateElementLive: (id, patch) => set((s) => {
    if (s.readOnly || !s.workspace) return
    // Mutate the draft directly — Immer detects no-op patches and skips
    // state replacement when applyElementPatch reports no change. No undo push.
    applyElementPatch(s.workspace, id, patch)
  }),

  updateElementTechnology: (id, technology) => set((s) => {
    if (s.readOnly || !s.workspace) return
    if (!applyElementPatch(s.workspace, id, { technology })) return
    pushUndoSnapshot(s)
  }),

  moveElement: (id, newParentId) => {
    if (get().readOnly) return false
    let moved = false
    set((s) => {
      if (!s.workspace) return
      const ws = s.workspace
      const systems = ws.model.softwareSystems
      let oldSystemId: string | undefined
      let oldContainerId: string | undefined
      let ids: string[] | undefined
      let place: (() => void) | undefined

      const fromSystem = systems.find(sys => sys.containers.some(c => c.id === id))
      if (fromSystem) {
        const target = systems.find(sys => sys.id === newParentId)
        if (!target || target === fromSystem) return
        const container = fromSystem.containers.find(c => c.id === id)!
        oldSystemId = fromSystem.id
        ids = [id, ...container.components.map(c => c.id)]
        place = () => {
          fromSystem.containers = fromSystem.containers.filter(c => c.id !== id)
          target.containers.push(container)
        }
      } else {
        const fromContainer = systems.flatMap(sys => sys.containers).find(c => c.components.some(comp => comp.id === id))
        if (!fromContainer) return
        const target = systems.flatMap(sys => sys.containers).find(c => c.id === newParentId)
        if (!target || target === fromContainer) return
        const component = fromContainer.components.find(c => c.id === id)!
        oldContainerId = fromContainer.id
        oldSystemId = owningSystemId(ws, id)
        ids = [id]
        place = () => {
          fromContainer.components = fromContainer.components.filter(c => c.id !== id)
          target.components.push(component)
        }
      }

      pushUndoSnapshot(s)
      place()
      invalidateElementIndex(ws)
      const movedIds = new Set(ids)

      // Leave the views scoped to the old parent (descendants included).
      for (const v of ws.views.containerViews) {
        if (oldContainerId === undefined && v.softwareSystemId === oldSystemId) removeFromView(ws, v, movedIds)
      }
      for (const v of ws.views.componentViews) {
        if (oldContainerId !== undefined && v.containerId === oldContainerId) removeFromView(ws, v, movedIds)
      }
      // Leave groups of the old parent. Only the moved element itself: groups of
      // its children belong to it and travel with it.
      for (const g of ws.model.groups) g.elementIds = g.elementIds.filter(eid => eid !== id)
      dropInvalidDynamicSteps(ws, id, movedIds, oldSystemId, oldContainerId)

      // Join the views scoped to the new parent the way addContainer/addComponent do
      // (without switching the active view).
      const element = oldContainerId === undefined ? 'container' : 'component'
      const views = element === 'container' ? ws.views.containerViews : ws.views.componentViews
      const scoped = views.filter(v => (element === 'container' ? v.softwareSystemId : v.containerId) === newParentId)
      for (const v of scoped) addToScopedView(ws, v, id)
      if (scoped.length === 0) {
        const parentName = findElementHelper(ws, newParentId)?.name ?? newParentId
        appendScopedView(ws, element, newParentId, element === 'container' ? `${parentName} — Containers` : `${parentName} — Components`, nanoid(8))
      }
      moved = true
    })
    if (moved) {
      get().revalidateScope()
      announce('Element moved')
    }
    return moved
  },

  deleteElement: (id) => {
    if (get().readOnly) return
    // Delegate to batch implementation
    get().deleteElements([id])
  },

  deleteElements: (ids) => {
    if (get().readOnly) return
    if (ids.length === 0) return
    set((s) => {
      if (!s.workspace) return
      pushUndoSnapshot(s)
      cascadeDeleteElements(s.workspace, ids)
      // If the active view was among the ones just removed, fall back to the first remaining view.
      // Also purge stale keys from viewHistory so navigateBack never jumps to a ghost view.
      const activeStillExists = s.activeViewKey ? !!findViewHelper(s.workspace, s.activeViewKey) : false
      s.activeViewKey = activeStillExists ? s.activeViewKey : getFirstViewKey(s.workspace)
      s.viewHistory = s.viewHistory.filter(k => !!findViewHelper(s.workspace!, k))
      s.selectedElementIds = []
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    })
    get().revalidateScope()
    announce(ids.length === 1 ? 'Element deleted' : `${ids.length} elements deleted`)
  },

  duplicateElements: (ids) => {
    if (get().readOnly) return []
    let createdIds: string[] = []
    set((s) => {
      if (!s.workspace || !s.activeViewKey) return
      createdIds = duplicateElementsInTree(s.workspace, ids, s.activeViewKey, () => nanoid(8))
      if (createdIds.length === 0) return
      pushUndoSnapshot(s)
      s.selectedElementIds = createdIds
      s.selectedRelationshipId = null
      s.selectedGroupId = null
    })
    if (createdIds.length > 0) {
      announce(createdIds.length === 1 ? 'Element duplicated' : `${createdIds.length} elements duplicated`)
      get().revalidateScope()
    }
    return createdIds
  },
})
