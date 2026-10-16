import { boolFlag, flag, type ParsedArgs } from '../args'
import { CliFailure } from '../errors'
import type { CliResult } from '../output'
import { resolveElement } from '../resolve'
import type { Session } from '../session'
import { deriveIdentifier, renameElementId } from '@/lib/renameIdentifier'
import { walkDeploymentNodes } from '@/lib/deployment'
import { useWorkspaceStore } from '@/store/workspace'
import type { DeploymentEnvironment, DeploymentNode, Workspace } from '@/types/model'
import { openForEdit, requireFreeId, takenIds } from './shared'
import { MUTATING_BOOLEANS, type CommandContext, type CommandModule } from './types'

function required(args: ParsedArgs, name: string): string {
  const value = flag(args, name)
  if (value === undefined || value === 'true') throw new CliFailure('USAGE', `--${name} is required`)
  return value
}

function environments(ws: Workspace): DeploymentEnvironment[] {
  return ws.model.deploymentEnvironments ?? []
}

function nodesOf(env: DeploymentEnvironment): DeploymentNode[] {
  const out: DeploymentNode[] = []
  walkDeploymentNodes(env, (n) => out.push(n))
  return out
}

function requireEnv(ws: Workspace, name: string): DeploymentEnvironment {
  const env = environments(ws).find((e) => e.name === name)
  if (!env) throw new CliFailure('NOT_FOUND', `No deployment environment '${name}'.`, environments(ws).map((e) => e.name))
  return env
}

/** Local deployment-node resolver (resolve.ts covers model elements only):
 *  by id, then by unique name, within `envName` when given, else across all
 *  environments. Returns the node with the environment that holds it. */
function resolveNode(ws: Workspace, ref: string, envName?: string): { env: DeploymentEnvironment; node: DeploymentNode } {
  const envs = envName === undefined ? environments(ws) : [requireEnv(ws, envName)]
  const all = envs.flatMap((env) => nodesOf(env).map((node) => ({ env, node })))
  const byId = all.find((x) => x.node.id === ref)
  if (byId) return byId
  const byName = all.filter((x) => x.node.name === ref)
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) {
    throw new CliFailure('AMBIGUOUS', `'${ref}' matches ${byName.length} deployment nodes by name. Use an identifier.`, byName.map((x) => x.node.id))
  }
  throw new CliFailure('NOT_FOUND', `No deployment node '${ref}'.`, all.map((x) => x.node.id).slice(0, 5))
}

/** Gives a freshly created element a readable identifier. The store holds
 *  frozen state, so the rename runs inside an immer draft. */
function assignIdentifier(session: Session, oldId: string, args: ParsedArgs, name: string): string {
  const explicit = flag(args, 'id')
  if (explicit !== undefined) requireFreeId(session.workspace(), explicit, oldId)
  const taken = takenIds(session.workspace())
  taken.delete(oldId)
  const newId = explicit ?? deriveIdentifier(name, taken)
  try {
    useWorkspaceStore.setState((s) => {
      renameElementId(s.workspace!, oldId, newId)
    })
  } catch (err) {
    throw new CliFailure('VALIDATION', (err as Error).message)
  }
  session.recordRename(oldId, newId)
  return newId
}

function finish(session: Session, args: ParsedArgs, command: string, elements: string[], data: Record<string, unknown>): CliResult {
  const save = session.save({ dryRun: boolFlag(args, 'dry-run') })
  return {
    ok: true,
    command,
    file: session.file,
    changed: save.changed && elements.length > 0 ? { elements } : {},
    data: { ...data, ...(save.diff !== undefined ? { diff: save.diff } : {}) },
    warnings: [],
  }
}

function envAdd(session: Session, args: ParsedArgs): CliResult {
  const name = args.positionals[2] ?? flag(args, 'name')
  if (!name) throw new CliFailure('USAGE', 'deploy env add needs an environment name')
  if (!session.actions().addDeploymentEnvironment(name)) throw new CliFailure('VALIDATION', `Could not add environment '${name}'.`)
  return finish(session, args, 'deploy', [], { environment: name.trim() })
}

function nodeAdd(session: Session, args: ParsedArgs): CliResult {
  const ws = session.workspace()
  const env = requireEnv(ws, required(args, 'env'))
  const name = required(args, 'name')
  const parentRef = flag(args, 'parent')
  const parent = parentRef === undefined ? undefined : resolveNode(ws, parentRef, env.name).node
  const instances = flag(args, 'instances')

  const rawId = session.actions().addDeploymentNode(env.name, parent?.id ?? null)
  if (!rawId) throw new CliFailure('VALIDATION', `Could not add node '${name}' to '${env.name}'.`)
  session.actions().updateDeploymentElement(env.name, rawId, { name, technology: flag(args, 'technology') })
  if (instances !== undefined) {
    useWorkspaceStore.setState((s) => {
      const draftEnv = environments(s.workspace!).find((e) => e.name === env.name)!
      nodesOf(draftEnv).find((n) => n.id === rawId)!.instances = instances
    })
  }
  const id = assignIdentifier(session, rawId, args, name)
  return finish(session, args, 'deploy', [id], { id, name, environment: env.name, ...(parent ? { parent: parent.id } : {}) })
}

function instanceAdd(session: Session, args: ParsedArgs): CliResult {
  const ws = session.workspace()
  const { env, node } = resolveNode(ws, required(args, 'node'), flag(args, 'env'))
  const target = resolveElement(ws, required(args, 'of'))
  let rawId: string
  if (target.type === 'container') rawId = session.actions().addContainerInstance(env.name, node.id, target.id)
  else if (target.type === 'softwareSystem') rawId = session.actions().addSoftwareSystemInstance(env.name, node.id, target.id)
  else throw new CliFailure('USAGE', `--of must be a container or software system, '${target.id}' is a ${target.type}.`)
  if (!rawId) throw new CliFailure('VALIDATION', `Could not add an instance of '${target.id}' to '${node.id}'.`)
  const id = assignIdentifier(session, rawId, args, `${target.name} instance`)
  return finish(session, args, 'deploy', [id], { id, of: target.id, node: node.id, environment: env.name })
}

function infraAdd(session: Session, args: ParsedArgs): CliResult {
  const ws = session.workspace()
  const { env, node } = resolveNode(ws, required(args, 'node'), flag(args, 'env'))
  const name = required(args, 'name')
  const rawId = session.actions().addInfrastructureNode(env.name, node.id)
  if (!rawId) throw new CliFailure('VALIDATION', `Could not add infrastructure node '${name}' to '${node.id}'.`)
  session.actions().updateDeploymentElement(env.name, rawId, { name, technology: flag(args, 'technology') })
  const id = assignIdentifier(session, rawId, args, name)
  return finish(session, args, 'deploy', [id], { id, name, node: node.id, environment: env.name })
}

/** Ids a delete of `id` removes: the element, plus a deployment node's whole subtree. */
function subtreeIds(ws: Workspace, ref: string, envName?: string): { ids: string[]; env: string } {
  const envs = envName === undefined ? environments(ws) : [requireEnv(ws, envName)]
  for (const env of envs) {
    for (const n of nodesOf(env)) {
      for (const x of [...n.infrastructureNodes, ...n.containerInstances, ...n.softwareSystemInstances]) {
        if (x.id === ref) return { ids: [x.id], env: env.name }
      }
    }
  }
  const { env, node } = resolveNode(ws, ref, envName)
  const ids: string[] = []
  const collect = (n: DeploymentNode) => {
    ids.push(n.id, ...n.infrastructureNodes.map((x) => x.id), ...n.containerInstances.map((x) => x.id), ...n.softwareSystemInstances.map((x) => x.id))
    n.children.forEach(collect)
  }
  collect(node)
  return { ids, env: env.name }
}

function removeElement(session: Session, args: ParsedArgs): CliResult {
  const ref = args.positionals[1]
  if (!ref) throw new CliFailure('USAGE', 'deploy remove needs a node, instance or infrastructure node ref')
  const { ids, env } = subtreeIds(session.workspace(), ref, flag(args, 'env'))
  session.actions().deleteElements([ids[0]])
  for (const id of ids) session.recordRemoved(id)
  return finish(session, args, 'deploy', ids, { removed: ids, environment: env })
}

const HANDLERS: Record<string, (session: Session, args: ParsedArgs) => CliResult> = {
  'env add': envAdd,
  'node add': nodeAdd,
  'instance add': instanceAdd,
  'infra add': infraAdd,
}

export const deploy: CommandModule = {
  name: 'deploy',
  summary: 'Author deployment environments, nodes, instances and infrastructure',
  flags: {
    booleans: MUTATING_BOOLEANS,
    bySubcommand: {
      env: { values: ['name'] },
      node: { values: ['env', 'name', 'parent', 'technology', 'instances', 'id'] },
      instance: { values: ['node', 'of', 'env', 'id'] },
      infra: { values: ['node', 'name', 'technology', 'env', 'id'] },
      remove: { values: ['env'] },
    },
  },
  usage:
    'deploy env add <name> | deploy node add --env <name> --name <text> [--parent <node>] [--technology <text>] [--instances <n>] [--id <ident>] | ' +
    'deploy instance add --node <ref> --of <containerOrSystemRef> [--env <name>] | ' +
    'deploy infra add --node <ref> --name <text> [--technology <text>] [--env <name>] | deploy remove <ref> [--env <name>]  ' +
    '[--file <dsl>] [--dry-run] [--force]',
  run(args: ParsedArgs, ctx: CommandContext): CliResult {
    const [first, second] = args.positionals
    const handler = first === 'remove' ? removeElement : HANDLERS[`${first} ${second}`]
    if (!handler) throw new CliFailure('USAGE', `deploy needs a subcommand: ${[...Object.keys(HANDLERS), 'remove'].join(', ')}`)
    return handler(openForEdit(args, ctx), args)
  },
}

export const deploymentCommands: CommandModule[] = [deploy]
