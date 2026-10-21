import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWorkspaceStore } from '@/store/workspace'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'
import { getCurrentDirHandle, readDSLFileIfChanged, writeDSLFile, writeSidecarFile } from '@/lib/folderIO'
import { isFreshFromDisk, useExternalFileReload } from './useExternalFileReload'
import { useAutoSave } from './useAutoSave'

vi.mock('@/lib/fileIO', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/fileIO')>()),
  saveToLocalStorage: vi.fn(),
  getCurrentFileHandle: vi.fn(() => null),
}))

vi.mock('@/lib/folderIO', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/folderIO')>()),
  getCurrentDirHandle: vi.fn(),
  readDSLFileIfChanged: vi.fn(),
  writeDSLFile: vi.fn(),
  writeSidecarFile: vi.fn(),
}))

const dsl = (systemName: string) => `workspace "T" {
  model {
    s = softwareSystem "${systemName}"
  }
  views {
    systemLandscape "land" {
      include *
    }
    systemContext s "ctx" {
      include *
    }
  }
}`

const systemName = () => useWorkspaceStore.getState().workspace?.model.softwareSystems[0]?.name

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(readDSLFileIfChanged).mockReset().mockResolvedValue(null)
  vi.mocked(getCurrentDirHandle).mockReset().mockReturnValue({ name: 'team' } as unknown as FileSystemDirectoryHandle)
  vi.mocked(writeDSLFile).mockReset().mockResolvedValue(true)
  vi.mocked(writeSidecarFile).mockReset().mockResolvedValue(true)

  const store = useWorkspaceStore.getState()
  store.loadWorkspace(parseWorkspaceDocument({ content: dsl('Before') }).workspace)
  store.setActiveWorkspaceFilename('t.dsl')
  store.setActiveView('ctx')
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  useWorkspaceStore.getState().closeWorkspace()
})

describe('useExternalFileReload', () => {
  it('polls the active file and reloads it on an external change, keeping the view', async () => {
    renderHook(() => useExternalFileReload())
    vi.mocked(readDSLFileIfChanged).mockResolvedValueOnce({ content: dsl('After') })

    await vi.advanceTimersByTimeAsync(1000)

    expect(readDSLFileIfChanged).toHaveBeenCalledWith('t.dsl')
    expect(systemName()).toBe('After')
    expect(useWorkspaceStore.getState().activeViewKey).toBe('ctx')
  })

  it('does not load a file with DSL errors', async () => {
    renderHook(() => useExternalFileReload())
    vi.mocked(readDSLFileIfChanged).mockResolvedValueOnce({ content: 'workspace {\n  model {\n    s = softwareSys' })

    await vi.advanceTimersByTimeAsync(1000)

    expect(systemName()).toBe('Before')
  })

  it('does not poll without an active folder-mode file', async () => {
    useWorkspaceStore.getState().setActiveWorkspaceFilename(null)
    renderHook(() => useExternalFileReload())
    await vi.advanceTimersByTimeAsync(3000)
    expect(readDSLFileIfChanged).not.toHaveBeenCalled()
  })

  it('stops polling on unmount', async () => {
    const { unmount } = renderHook(() => useExternalFileReload())
    unmount()
    await vi.advanceTimersByTimeAsync(3000)
    expect(readDSLFileIfChanged).not.toHaveBeenCalled()
  })

  it('keeps autosave from rewriting the reloaded file until the next canvas edit', async () => {
    renderHook(() => { useAutoSave(); useExternalFileReload() })
    await vi.advanceTimersByTimeAsync(2000)
    vi.mocked(writeDSLFile).mockClear()

    vi.mocked(readDSLFileIfChanged).mockResolvedValueOnce({ content: dsl('After') })
    await vi.advanceTimersByTimeAsync(3000)
    expect(isFreshFromDisk(useWorkspaceStore.getState().workspace!)).toBe(true)
    expect(writeDSLFile).not.toHaveBeenCalled()

    useWorkspaceStore.getState().updateWorkspaceMeta({ name: 'Edited' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(writeDSLFile).toHaveBeenCalledWith('t.dsl', expect.stringContaining('Edited'))
  })
})
