import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import { useAutoSave } from './useAutoSave'
import { saveToLocalStorage, getCurrentFileHandle, writeToCurrentHandle, writeSidecarToHandle } from '@/lib/fileIO'
import { getCurrentDirHandle, writeDSLFile, writeSidecarFile } from '@/lib/folderIO'
import type { Workspace } from '@/types/model'

vi.mock('@/lib/fileIO', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fileIO')>()),
  saveToLocalStorage: vi.fn(),
  getCurrentFileHandle: vi.fn(),
  writeToCurrentHandle: vi.fn(),
  writeSidecarToHandle: vi.fn(),
}))

vi.mock('@/lib/folderIO', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/folderIO')>()),
  getCurrentDirHandle: vi.fn(),
  writeDSLFile: vi.fn(),
  writeSidecarFile: vi.fn(),
}))

function makeWs(): Workspace {
  return {
    name: 'T',
    model: {
      people: [],
      softwareSystems: [
        { id: 'sys', type: 'softwareSystem', name: 'S', tags: [], properties: {}, containers: [] },
      ],
      relationships: [], groups: [],
    },
    views: {
      systemLandscapeViews: [{
        type: 'systemLandscape', key: 'land', elements: [{ id: 'sys' }], relationships: [],
      }],
      systemContextViews: [],
      containerViews: [],
      componentViews: [],
      configuration: { styles: { elements: [], relationships: [] } },
    },
  }
}

const teamHandle = { name: 'team' } as unknown as FileSystemDirectoryHandle

beforeEach(() => {
  vi.useFakeTimers()
  useWorkspaceStore.getState().closeWorkspace()
  useWorkspaceStore.getState().setReadOnly(false)
  vi.mocked(saveToLocalStorage).mockReset()
  vi.mocked(getCurrentFileHandle).mockReset().mockReturnValue(null)
  vi.mocked(writeToCurrentHandle).mockReset().mockResolvedValue(true)
  vi.mocked(writeSidecarToHandle).mockReset().mockResolvedValue(true)
  vi.mocked(getCurrentDirHandle).mockReset().mockReturnValue(null)
  vi.mocked(writeDSLFile).mockReset().mockResolvedValue(true)
  vi.mocked(writeSidecarFile).mockReset().mockResolvedValue(true)
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  useWorkspaceStore.getState().setReadOnly(false)
  useWorkspaceStore.getState().closeWorkspace()
})

describe('useAutoSave — readOnly', () => {
  it('schedules no localStorage or file writes when readOnly is true', async () => {
    useWorkspaceStore.getState().setReadOnly(true)
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    vi.mocked(getCurrentDirHandle).mockReturnValue(teamHandle)
    useWorkspaceStore.getState().setActiveWorkspaceFilename('my-ws.dsl')

    renderHook(() => useAutoSave())

    await vi.advanceTimersByTimeAsync(2000)

    expect(saveToLocalStorage).not.toHaveBeenCalled()
    expect(writeDSLFile).not.toHaveBeenCalled()
    expect(writeToCurrentHandle).not.toHaveBeenCalled()
  })

  it('does not schedule writes after a workspace change while readOnly is true', async () => {
    useWorkspaceStore.getState().setReadOnly(true)
    useWorkspaceStore.getState().loadWorkspace(makeWs())

    renderHook(() => useAutoSave())

    const updated = makeWs()
    updated.name = 'T2'
    useWorkspaceStore.setState({ workspace: updated })

    await vi.advanceTimersByTimeAsync(2000)

    expect(saveToLocalStorage).not.toHaveBeenCalled()
    expect(writeDSLFile).not.toHaveBeenCalled()
    expect(writeToCurrentHandle).not.toHaveBeenCalled()
  })

  it('still saves to localStorage and the open file handle when readOnly is false', async () => {
    useWorkspaceStore.getState().loadWorkspace(makeWs())
    vi.mocked(getCurrentFileHandle).mockReturnValue({} as unknown as FileSystemFileHandle)

    renderHook(() => useAutoSave())

    await vi.advanceTimersByTimeAsync(2000)

    expect(saveToLocalStorage).toHaveBeenCalledTimes(1)
    expect(writeToCurrentHandle).toHaveBeenCalledTimes(1)
  })
})
