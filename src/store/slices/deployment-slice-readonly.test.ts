import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import type { Workspace } from '@/types/model'

function makeWorkspace(): Workspace {
  return {
    name: 'Test',
    model: {
      people: [],
      softwareSystems: [
        {
          id: 'sys',
          type: 'softwareSystem',
          name: 'Sys',
          tags: ['Element', 'Software System'],
          properties: {},
          containers: [
            { id: 'web', type: 'container', name: 'Web', tags: ['Element', 'Container'], properties: {}, components: [] },
          ],
        },
        {
          id: 'other',
          type: 'softwareSystem',
          name: 'Other',
          tags: ['Element', 'Software System'],
          properties: {},
          containers: [],
        },
      ],
      relationships: [],
      groups: [],
      deploymentEnvironments: [
        {
          id: 'env1',
          name: 'Live',
          deploymentNodes: [
            {
              id: 'server',
              type: 'deploymentNode',
              name: 'Server',
              tags: ['Element', 'Deployment Node'],
              properties: {},
              children: [],
              infrastructureNodes: [],
              containerInstances: [],
              softwareSystemInstances: [],
            },
          ],
        },
      ],
    },
    views: {
      systemLandscapeViews: [],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      dynamicViews: [],
      deploymentViews: [{ environment: 'Live', key: 'Dep', elements: [], relationships: [] }],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

describe('deployment-slice readOnly guard', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().loadWorkspace(makeWorkspace())
    useWorkspaceStore.getState().setReadOnly(true)
  })

  it('addDeploymentEnvironment is a no-op and returns false when readOnly, even for a new name', () => {
    const before = useWorkspaceStore.getState().workspace!
    const result = useWorkspaceStore.getState().addDeploymentEnvironment('Brand New Env')
    const after = useWorkspaceStore.getState().workspace!
    expect(result).toBe(false)
    expect(after.model.deploymentEnvironments).toEqual(before.model.deploymentEnvironments)
    expect(after.model.deploymentEnvironments).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('addDeploymentNode is a no-op and returns \'\' when readOnly', () => {
    const id = useWorkspaceStore.getState().addDeploymentNode('Live', null)
    expect(id).toBe('')
    expect(useWorkspaceStore.getState().workspace!.model.deploymentEnvironments[0].deploymentNodes).toHaveLength(1)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('addInfrastructureNode is a no-op and returns \'\' when readOnly', () => {
    const id = useWorkspaceStore.getState().addInfrastructureNode('Live', 'server')
    expect(id).toBe('')
    expect(useWorkspaceStore.getState().workspace!.model.deploymentEnvironments[0].deploymentNodes[0].infrastructureNodes).toHaveLength(0)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('addContainerInstance is a no-op and returns \'\' when readOnly', () => {
    const id = useWorkspaceStore.getState().addContainerInstance('Live', 'server', 'web')
    expect(id).toBe('')
    expect(useWorkspaceStore.getState().workspace!.model.deploymentEnvironments[0].deploymentNodes[0].containerInstances).toHaveLength(0)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('addSoftwareSystemInstance is a no-op and returns \'\' when readOnly', () => {
    const id = useWorkspaceStore.getState().addSoftwareSystemInstance('Live', 'server', 'other')
    expect(id).toBe('')
    expect(useWorkspaceStore.getState().workspace!.model.deploymentEnvironments[0].deploymentNodes[0].softwareSystemInstances).toHaveLength(0)
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('renameDeploymentElement is a no-op when readOnly', () => {
    useWorkspaceStore.getState().renameDeploymentElement('Live', 'server', 'Renamed Server')
    expect(useWorkspaceStore.getState().workspace!.model.deploymentEnvironments[0].deploymentNodes[0].name).toBe('Server')
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('updateDeploymentElement is a no-op when readOnly', () => {
    useWorkspaceStore.getState().updateDeploymentElement('Live', 'server', { technology: 'AWS EC2' })
    expect(useWorkspaceStore.getState().workspace!.model.deploymentEnvironments[0].deploymentNodes[0].technology).toBeUndefined()
    expect(useWorkspaceStore.getState().undoStack).toHaveLength(0)
  })

  it('all seven actions mutate normally when readOnly is false', () => {
    useWorkspaceStore.getState().setReadOnly(false)

    expect(useWorkspaceStore.getState().addDeploymentEnvironment('Staging')).toBe(true)
    expect(useWorkspaceStore.getState().workspace!.model.deploymentEnvironments).toHaveLength(2)

    const nodeId = useWorkspaceStore.getState().addDeploymentNode('Live', null)
    expect(nodeId).not.toBe('')

    const infraId = useWorkspaceStore.getState().addInfrastructureNode('Live', 'server')
    expect(infraId).not.toBe('')

    const containerInstId = useWorkspaceStore.getState().addContainerInstance('Live', 'server', 'web')
    expect(containerInstId).not.toBe('')

    const sysInstId = useWorkspaceStore.getState().addSoftwareSystemInstance('Live', 'server', 'other')
    expect(sysInstId).not.toBe('')

    useWorkspaceStore.getState().renameDeploymentElement('Live', 'server', 'Renamed Server')
    expect(useWorkspaceStore.getState().workspace!.model.deploymentEnvironments[0].deploymentNodes[0].name).toBe('Renamed Server')

    useWorkspaceStore.getState().updateDeploymentElement('Live', 'server', { technology: 'AWS EC2' })
    expect(useWorkspaceStore.getState().workspace!.model.deploymentEnvironments[0].deploymentNodes[0].technology).toBe('AWS EC2')
  })
})
