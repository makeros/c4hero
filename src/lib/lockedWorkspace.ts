import type { Workspace } from '@/types/model'
import lockedWorkspaceModule from 'virtual:locked-workspace'
import { parseWorkspaceDocument } from '@/lib/workspaceDocument'
import { createLogger } from '@/lib/logger'

const log = createLogger('lockedWorkspace')

function parseLockedWorkspace(): Workspace | null {
  if (!lockedWorkspaceModule) return null

  const { dsl, sidecar, name } = lockedWorkspaceModule
  const { workspace, errors } = parseWorkspaceDocument({
    content: dsl,
    fallbackName: name,
    sidecarJson: sidecar ?? undefined,
  })
  if (errors.length > 0) log.warn('DSL parse warnings', errors)

  return workspace
}

const lockedWorkspace = parseLockedWorkspace()

export function getLockedWorkspace(): Workspace | null {
  return lockedWorkspace
}
