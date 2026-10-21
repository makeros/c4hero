import { useEffect } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import { getAllViews } from '@/store/workspace-selectors'
import { readDSLFileIfChanged } from '@/lib/folderIO'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'
import type { Workspace } from '@/types/model'
import { announce } from '@/lib/announce'
import { createLogger } from '@/lib/logger'

const log = createLogger('useExternalFileReload')

const POLL_MS = 1000

// Workspaces loaded verbatim from an externally edited file. Autosave skips
// them — writing straight back would only reformat the user's file into
// c4hero's serialization under their editor. Any canvas edit produces a new
// workspace object (immer), which saves as usual.
const freshFromDisk = new WeakSet<Workspace>()

export function isFreshFromDisk(workspace: Workspace): boolean {
  return freshFromDisk.has(workspace)
}

/** Reloads the open folder-mode workspace when its .dsl or sidecar changes on
 *  disk (an editor, the CLI, git checkout). The File System Access API has no
 *  change events, so this polls the file while the tab is visible. The file
 *  wins: canvas edits not yet autosaved (a ~1s window) are replaced. */
export function useExternalFileReload() {
  const filename = useWorkspaceStore((s) => s.activeWorkspaceFilename)

  useEffect(() => {
    if (!filename) return
    const watched = filename
    let stopped = false
    let checking = false

    async function check() {
      if (stopped || checking || document.visibilityState !== 'visible') return
      checking = true
      try {
        const file = await readDSLFileIfChanged(watched)
        if (!file || stopped) return
        const state = useWorkspaceStore.getState()
        if (state.activeWorkspaceFilename !== watched || !state.workspace) return

        const { workspace, errors } = parseWorkspaceDocument({
          content: file.content,
          fallbackName: watched.replace(/\.dsl$/, ''),
          sidecarJson: file.sidecarJson,
        })
        // A half-edited file parses to a partial model; loading it would let
        // the next canvas edit autosave the truncation. Wait for a clean save.
        if (errors.length > 0) {
          log.warn(`${watched} changed on disk but has DSL errors — not reloaded`, errors)
          return
        }

        const viewKey = state.activeViewKey
        state.loadWorkspace(workspace)
        const loaded = useWorkspaceStore.getState().workspace
        if (loaded) freshFromDisk.add(loaded)
        if (viewKey && getAllViews(workspace).some((v) => v.key === viewKey)) {
          useWorkspaceStore.getState().setActiveView(viewKey)
        }
        announce(`Reloaded ${watched} after it changed on disk`)
      } finally {
        checking = false
      }
    }

    const interval = setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      stopped = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', check)
    }
  }, [filename])
}
