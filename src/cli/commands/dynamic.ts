import { boolFlag, flag, type ParsedArgs } from '../args'
import { CliFailure } from '../errors'
import type { CliResult } from '../output'
import { resolveElement } from '../resolve'
import type { Session } from '../session'
import { eligibleStepElements } from '@/lib/dynamicSteps'
import { findViewHelper } from '@/store/workspace-helpers'
import type { View } from '@/types/model'
import { openForEdit } from './shared'
import { MUTATING_BOOLEANS, type CommandContext, type CommandModule } from './types'

function required(args: ParsedArgs, name: string): string {
  const value = flag(args, name)
  if (value === undefined || value === 'true') throw new CliFailure('USAGE', `--${name} is required`)
  return value
}

/** A 1-based step position, matching the `order` shown for the step. */
function stepNumber(args: ParsedArgs, name: string, count: number): number {
  const raw = required(args, name)
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > count) {
    throw new CliFailure('USAGE', `--${name} must be an integer between 1 and ${count} (got '${raw}')`)
  }
  return n
}

function dynamicView(session: Session, key: string): View {
  const view = findViewHelper(session.workspace(), key)
  if (!view) throw new CliFailure('NOT_FOUND', `No view '${key}'.`)
  if (view.type !== 'dynamic') throw new CliFailure('USAGE', `View '${key}' is a ${view.type} view, not a dynamic view.`)
  return view
}

function describeSteps(view: View) {
  return view.relationships.map((s, i) => ({
    index: i + 1,
    relationship: s.id,
    from: s.sourceId,
    to: s.destinationId,
    ...(s.response ? { response: true } : {}),
    ...(s.description ? { description: s.description } : {}),
  }))
}

function finish(session: Session, args: ParsedArgs, command: string, viewKey: string, warnings: string[]): CliResult {
  const save = session.save({ dryRun: boolFlag(args, 'dry-run') })
  return {
    ok: true,
    command,
    file: session.file,
    changed: save.changed ? { views: [viewKey] } : {},
    data: {
      steps: describeSteps(findViewHelper(session.workspace(), viewKey)!),
      ...(save.diff !== undefined ? { diff: save.diff } : {}),
    },
    warnings,
  }
}

function add(session: Session, args: ParsedArgs, viewKey: string): CliResult {
  const view = dynamicView(session, viewKey)
  const ws = session.workspace()
  const from = resolveElement(ws, required(args, 'from'))
  const to = resolveElement(ws, required(args, 'to'))
  if (from.id === to.id) throw new CliFailure('VALIDATION', 'A step needs two different elements.')
  const eligible = new Set(eligibleStepElements(ws, view).map((e) => e.id))
  for (const el of [from, to]) {
    if (!eligible.has(el.id)) {
      throw new CliFailure('USAGE', `'${el.id}' (${el.type}) cannot take part in steps of view '${viewKey}'.`, [...eligible])
    }
  }

  const forward = ws.model.relationships.some((r) => r.sourceId === from.id && r.destinationId === to.id)
  const reverse = ws.model.relationships.some((r) => r.sourceId === to.id && r.destinationId === from.id)
  const warnings: string[] = []
  if (boolFlag(args, 'response')) {
    if (forward) throw new CliFailure('USAGE', `--response needs no forward relationship ${from.id} -> ${to.id}; one exists, so the step would not be a response.`)
    if (!reverse) throw new CliFailure('USAGE', `--response needs an existing relationship ${to.id} -> ${from.id}.`)
  } else if (!forward && reverse) {
    warnings.push(`No relationship ${from.id} -> ${to.id}; the step is a response over ${to.id} -> ${from.id}. Pass --response to make this explicit.`)
  }

  const before = view.relationships.length
  session.actions().addDynamicStep(viewKey, from.id, to.id, flag(args, 'description'))
  if (findViewHelper(session.workspace(), viewKey)!.relationships.length === before) {
    throw new CliFailure('USAGE', `The step ${from.id} -> ${to.id} was not added to view '${viewKey}'.`)
  }
  return finish(session, args, 'step', viewKey, warnings)
}

function move(session: Session, args: ParsedArgs, viewKey: string): CliResult {
  const count = dynamicView(session, viewKey).relationships.length
  const index = stepNumber(args, 'index', count)
  const to = stepNumber(args, 'to', count)
  const direction = to < index ? 'up' : 'down'
  for (let i = index - 1; i !== to - 1; i += direction === 'up' ? -1 : 1) {
    session.actions().moveDynamicStep(viewKey, i, direction)
  }
  return finish(session, args, 'step', viewKey, [])
}

function remove(session: Session, args: ParsedArgs, viewKey: string): CliResult {
  const count = dynamicView(session, viewKey).relationships.length
  const index = stepNumber(args, 'index', count)
  session.actions().deleteDynamicStep(viewKey, index - 1)
  return finish(session, args, 'step', viewKey, [])
}

const SUBCOMMANDS: Record<string, (session: Session, args: ParsedArgs, viewKey: string) => CliResult> = { add, move, remove }

export const step: CommandModule = {
  name: 'step',
  summary: 'Add, move or remove steps of a dynamic view (indexes are 1-based)',
  flags: {
    booleans: MUTATING_BOOLEANS,
    bySubcommand: {
      add: { values: ['view', 'from', 'to', 'description'], booleans: ['response'] },
      move: { values: ['view', 'index', 'to'] },
      remove: { values: ['view', 'index'] },
    },
  },
  usage:
    'step add --view <key> --from <ref> --to <ref> [--description <text>] [--response] | ' +
    'step move --view <key> --index N --to M | step remove --view <key> --index N  [--file <dsl>] [--dry-run] [--force]',
  run(args: ParsedArgs, ctx: CommandContext): CliResult {
    const sub = args.positionals[0]
    const handler = sub === undefined ? undefined : SUBCOMMANDS[sub]
    if (!handler) throw new CliFailure('USAGE', `step needs a subcommand: ${Object.keys(SUBCOMMANDS).join(', ')}`)
    const viewKey = required(args, 'view')
    return handler(openForEdit(args, ctx), args, viewKey)
  },
}

export const dynamicCommands: CommandModule[] = [step]
