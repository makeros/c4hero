import { deploymentCommands } from './deployment'
import { docsCommands } from './docs'
import { dynamicCommands } from './dynamic'
import { elementCommands } from './elements'
import { exportCommands } from './export'
import { readCommands } from './read'
import { relationshipCommands } from './relationships'
import type { CommandModule } from './types'
import { viewCommands } from './views'
import { workspaceCommands } from './workspace'

/** Every command, in help order. New command modules register here. */
export const COMMANDS: CommandModule[] = [
  ...workspaceCommands,
  ...readCommands,
  ...elementCommands,
  ...relationshipCommands,
  ...docsCommands,
  ...viewCommands,
  ...dynamicCommands,
  ...deploymentCommands,
  ...exportCommands,
]
