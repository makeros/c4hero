import { walkDeploymentNodes } from '@/lib/deployment'
import { forEachElementHelper } from '@/store/workspace-helpers'
import type { Workspace } from '@/types/model'
import { boolFlag, flag, type ParsedArgs } from '../args'
import { discoverWorkspace } from '../discover'
import { CliFailure } from '../errors'
import { openSession, type Session } from '../session'
import type { CommandContext } from './types'

/** Opens the workspace a mutating command edits (`--file`, `--force`). */
export function openForEdit(args: ParsedArgs, ctx: CommandContext): Session {
  const file = discoverWorkspace({ file: flag(args, 'file'), cwd: ctx.cwd })
  return openSession(file, { force: boolFlag(args, 'force') })
}

/** Every identifier a new element must not collide with: model elements,
 *  relationships, deployment environments, nodes and their children share one namespace. */
export function takenIds(ws: Workspace): Set<string> {
  const taken = new Set(ws.model.relationships.map((r) => r.id))
  forEachElementHelper(ws, (el) => {
    taken.add(el.id)
  })
  for (const env of ws.model.deploymentEnvironments ?? []) {
    taken.add(env.id)
    walkDeploymentNodes(env, (n) => {
      taken.add(n.id)
      for (const x of [...n.infrastructureNodes, ...n.containerInstances, ...n.softwareSystemInstances]) taken.add(x.id)
    })
  }
  return taken
}

/** An explicit `--id` must be free; throws VALIDATION otherwise. `own` is the
 *  id the element holds right now, which does not count as taken. */
export function requireFreeId(ws: Workspace, id: string, own?: string): void {
  const taken = takenIds(ws)
  if (own !== undefined) taken.delete(own)
  if (taken.has(id)) throw new CliFailure('VALIDATION', `Identifier '${id}' is already in use.`)
}
