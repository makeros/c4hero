import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import { parseDSL } from '@/lib/dsl'

const DSL = `workspace {
  model {
    user = person "User"
    sys = softwareSystem "Sys" {
      web = container "Web"
      api = container "Api"
    }
    other = softwareSystem "Other"
    user -> web "Uses"
    web -> api "Calls"
    api -> other "Notifies"
  }
  views {
    container sys "Containers" { include * }
    dynamic sys "Flow" {
      user -> web "Opens app"
      web -> api "Calls"
    }
  }
}`

function load() {
  const { workspace: ws, errors } = parseDSL(DSL)
  expect(errors).toHaveLength(0)
  useWorkspaceStore.getState().loadWorkspace(ws)
  return useWorkspaceStore.getState().workspace!
}

function view() {
  return useWorkspaceStore.getState().workspace!.views.dynamicViews[0]
}

function idOf(name: string): string {
  const ws = useWorkspaceStore.getState().workspace!
  const all = [
    ...ws.model.people,
    ...ws.model.softwareSystems,
    ...ws.model.softwareSystems.flatMap(s => s.containers),
  ]
  return all.find(el => el.name === name)!.id
}

describe('dynamic-step-slice readOnly guard', () => {
  beforeEach(() => {
    load()
    useWorkspaceStore.getState().setReadOnly(true)
  })

  it('addDynamicStep is a no-op when readOnly', () => {
    const before = JSON.stringify(useWorkspaceStore.getState().workspace)
    const relCount = useWorkspaceStore.getState().workspace!.model.relationships.length
    const stepCount = view().relationships.length
    useWorkspaceStore.getState().addDynamicStep('Flow', idOf('User'), idOf('Other'), 'New step')
    const state = useWorkspaceStore.getState()
    expect(JSON.stringify(state.workspace)).toBe(before)
    expect(state.workspace!.model.relationships).toHaveLength(relCount)
    expect(view().relationships).toHaveLength(stepCount)
    expect(state.undoStack).toHaveLength(0)
  })

  it('updateDynamicStepDescription is a no-op when readOnly', () => {
    const before = JSON.stringify(useWorkspaceStore.getState().workspace)
    useWorkspaceStore.getState().updateDynamicStepDescription('Flow', 0, 'Changed description')
    const state = useWorkspaceStore.getState()
    expect(JSON.stringify(state.workspace)).toBe(before)
    expect(view().relationships[0].description).not.toBe('Changed description')
    expect(state.undoStack).toHaveLength(0)
  })

  it('moveDynamicStep is a no-op when readOnly', () => {
    const before = JSON.stringify(useWorkspaceStore.getState().workspace)
    const firstId = view().relationships[0].id
    useWorkspaceStore.getState().moveDynamicStep('Flow', 0, 'down')
    const state = useWorkspaceStore.getState()
    expect(JSON.stringify(state.workspace)).toBe(before)
    expect(view().relationships[0].id).toBe(firstId)
    expect(state.undoStack).toHaveLength(0)
  })

  it('deleteDynamicStep is a no-op when readOnly', () => {
    const before = JSON.stringify(useWorkspaceStore.getState().workspace)
    const stepCount = view().relationships.length
    useWorkspaceStore.getState().deleteDynamicStep('Flow', 0)
    const state = useWorkspaceStore.getState()
    expect(JSON.stringify(state.workspace)).toBe(before)
    expect(view().relationships).toHaveLength(stepCount)
    expect(state.undoStack).toHaveLength(0)
  })
})
