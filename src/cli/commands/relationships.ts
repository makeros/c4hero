import type { Relationship } from '@/types/model'
import { isInteractionStyle, isLineStyle } from '@/types/model'
import { boolFlag, flag, flagAll, type ParsedArgs } from '../args'
import { CliFailure } from '../errors'
import type { CliResult } from '../output'
import { resolveElement, resolveRelationship } from '../resolve'
import type { Session } from '../session'
import { openForEdit } from './shared'
import { MUTATING_BOOLEANS, type CommandModule } from './types'

function csv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((t) => t.trim()).filter(Boolean)
}

function describe(rel: Relationship): string {
  return `${rel.sourceId}->${rel.destinationId}`
}

function finish(command: string, session: Session, args: ParsedArgs, rel: string, data?: unknown): CliResult {
  const saved = session.save({ dryRun: boolFlag(args, 'dry-run') })
  return {
    ok: true,
    command,
    file: session.file,
    changed: saved.changed ? { relationships: [rel] } : {},
    data: saved.diff !== undefined ? { ...(data as object | undefined), diff: saved.diff } : data,
    warnings: [],
  }
}

/** Fields shared by `relate` and `update-rel`; an empty value clears the field. */
function stylePatch(args: ParsedArgs): Parameters<ReturnType<Session['actions']>['updateRelationship']>[1] {
  const patch: Parameters<ReturnType<Session['actions']>['updateRelationship']>[1] = {}
  for (const key of ['description', 'technology'] as const) {
    const v = flag(args, key)
    if (v !== undefined) patch[key] = v === '' ? undefined : v
  }
  const interaction = flag(args, 'interaction-style')
  if (interaction !== undefined) {
    if (interaction !== '' && !isInteractionStyle(interaction)) throw new CliFailure('USAGE', '--interaction-style must be Synchronous or Asynchronous')
    patch.interactionStyle = interaction === '' ? undefined : (interaction as 'Synchronous' | 'Asynchronous')
  }
  const line = flag(args, 'line-style')
  if (line !== undefined) {
    if (line !== '' && !isLineStyle(line)) throw new CliFailure('USAGE', '--line-style must be Curved, Straight or Orthogonal')
    patch.lineStyle = line === '' ? undefined : (line as 'Curved' | 'Straight' | 'Orthogonal')
  }
  return patch
}

const relate: CommandModule = {
  name: 'relate',
  summary: 'Add a relationship between two elements',
  flags: { values: ['description', 'technology', 'interaction-style', 'line-style', 'tags'], booleans: MUTATING_BOOLEANS },
  usage:
    'relate <src> <dst> [--description] [--technology] [--interaction-style Synchronous|Asynchronous] [--line-style Curved|Straight|Orthogonal] [--tags a,b] [--file <dsl>] [--dry-run] [--force]',
  run(args, ctx) {
    const [srcRef, dstRef] = args.positionals
    if (!srcRef || !dstRef) throw new CliFailure('USAGE', 'relate requires <src> <dst>')
    const patch = stylePatch(args)
    const session = openForEdit(args, ctx)
    const src = resolveElement(session.workspace(), srcRef)
    const dst = resolveElement(session.workspace(), dstRef)
    if (src.id === dst.id) throw new CliFailure('VALIDATION', 'A relationship needs two different elements')

    const store = session.actions()
    const id = store.addRelationship(src.id, dst.id, patch.description, patch.technology)
    if (!id) throw new CliFailure('VALIDATION', `Could not relate '${src.id}' to '${dst.id}'`)
    const tags = csv(flag(args, 'tags'))
    const rel = session.workspace().model.relationships.find((r) => r.id === id)!
    store.updateRelationship(id, {
      interactionStyle: patch.interactionStyle,
      lineStyle: patch.lineStyle,
      ...(tags.length > 0 ? { tags: [...rel.tags, ...tags.filter((t) => !rel.tags.includes(t))] } : {}),
    })
    return finish('relate', session, args, describe(rel))
  },
}

const updateRel: CommandModule = {
  name: 'update-rel',
  summary: 'Update a relationship',
  flags: {
    values: ['match', 'description', 'technology', 'interaction-style', 'line-style', 'url', 'add-tag', 'remove-tag', 'property', 'remove-property'],
    booleans: MUTATING_BOOLEANS,
  },
  usage:
    'update-rel <relRef> [--match <current description>] [--description <new>] [--technology] [--interaction-style] [--line-style] [--url] [--add-tag t]... [--remove-tag t]... [--property k=v]... [--remove-property k]... [--file <dsl>] [--dry-run] [--force]',
  run(args, ctx) {
    const ref = args.positionals[0]
    if (!ref) throw new CliFailure('USAGE', 'update-rel requires <relRef>')
    const session = openForEdit(args, ctx)
    const rel = resolveRelationship(session.workspace(), ref, flag(args, 'match'))
    const patch = stylePatch(args)

    const url = flag(args, 'url')
    if (url !== undefined) patch.url = url === '' ? undefined : url
    const addTags = flagAll(args, 'add-tag')
    const removeTags = flagAll(args, 'remove-tag')
    if (addTags.length > 0 || removeTags.length > 0) {
      const next = rel.tags.filter((t) => !removeTags.includes(t))
      for (const t of addTags) if (!next.includes(t)) next.push(t)
      patch.tags = next
    }
    const setProps = flagAll(args, 'property')
    const dropProps = flagAll(args, 'remove-property')
    if (setProps.length > 0 || dropProps.length > 0) {
      const props = { ...rel.properties }
      for (const k of dropProps) delete props[k]
      for (const raw of setProps) {
        const eq = raw.indexOf('=')
        if (eq < 1) throw new CliFailure('USAGE', `--property expects key=value, got '${raw}'`)
        props[raw.slice(0, eq)] = raw.slice(eq + 1)
      }
      patch.properties = props
    }
    const label = describe(rel)
    session.actions().updateRelationship(rel.id, patch)
    return finish('update-rel', session, args, label)
  },
}

const unrelate: CommandModule = {
  name: 'unrelate',
  summary: 'Remove a relationship',
  flags: { values: ['match'], booleans: MUTATING_BOOLEANS },
  usage: 'unrelate <relRef> [--match <description>] [--file <dsl>] [--dry-run] [--force]',
  run(args, ctx) {
    const ref = args.positionals[0]
    if (!ref) throw new CliFailure('USAGE', 'unrelate requires <relRef>')
    const session = openForEdit(args, ctx)
    const rel = resolveRelationship(session.workspace(), ref, flag(args, 'match'))
    const label = describe(rel)
    session.actions().deleteRelationship(rel.id)
    session.recordRemoved(rel.id)
    return finish('unrelate', session, args, label)
  },
}

export const relationshipCommands: CommandModule[] = [relate, updateRel, unrelate]
