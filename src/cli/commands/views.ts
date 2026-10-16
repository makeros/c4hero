import type { ElementStyle, RelationshipStyle, View, ViewType, Workspace } from '@/types/model'
import { allViewsOf, buildInitialViewContent, findViewHelper } from '@/store/workspace-helpers'
import { boolFlag, flag, flagAll, type ParsedArgs } from '../args'
import { CliFailure } from '../errors'
import type { CliResult } from '../output'
import { resolveElement } from '../resolve'
import type { Session } from '../session'
import { VIEW_TYPE_WORDS, defaultViewKey, withRenamedViews } from '../viewKeys'
import { openForEdit } from './shared'
import { MUTATING_BOOLEANS, type CommandModule } from './types'

const DIRECTIONS = ['TB', 'BT', 'LR', 'RL']
const KEY_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/

function finish(command: string, session: Session, args: ParsedArgs, changed: CliResult['changed'], warnings: string[]): CliResult {
  const saved = session.save({ dryRun: boolFlag(args, 'dry-run') })
  return withRenamedViews(
    {
      ok: true,
      command,
      file: session.file,
      changed: saved.changed ? changed : {},
      ...(saved.diff !== undefined ? { data: { diff: saved.diff } } : {}),
      warnings,
    },
    saved.renamedViews,
  )
}

/** Replaces the workspace with an edited clone. For the few edits the store has
 *  no action for (view key and description, relationship styles). */
function patchWorkspace(session: Session, edit: (ws: Workspace) => void): void {
  const next = structuredClone(session.workspace())
  edit(next)
  session.actions().resetWorkspaceTo(next)
}

function requireView(ws: Workspace, key: string | undefined): View {
  if (!key) throw new CliFailure('USAGE', 'A view key is required')
  const view = findViewHelper(ws, key)
  if (!view) throw new CliFailure('NOT_FOUND', `No view '${key}'.`, allViewsOf(ws).map((v) => v.key).slice(0, 5))
  return view
}

function number(args: ParsedArgs, name: string): number | undefined {
  const raw = flag(args, name)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new CliFailure('USAGE', `--${name} must be a number`)
  return value
}

function defaultTitle(type: ViewType, scopeName: string | undefined): string {
  switch (type) {
    case 'systemLandscape': return 'System Landscape'
    case 'systemContext': return `${scopeName} — System Context`
    case 'container': return `${scopeName} — Containers`
    case 'component': return `${scopeName} — Components`
    case 'dynamic': return `${scopeName ?? 'Workspace'} — Dynamic`
    case 'deployment': return `${scopeName ?? 'Workspace'} — Deployment`
  }
}

function viewAdd(args: ParsedArgs, session: Session): CliResult['changed'] & { views: string[] } {
  const ws = session.workspace()
  const typeFlag = flag(args, 'type')
  const type = typeFlag === undefined ? undefined : VIEW_TYPE_WORDS[typeFlag]
  if (!type) throw new CliFailure('USAGE', `--type must be one of ${Object.keys(VIEW_TYPE_WORDS).join(', ')}`)

  const scopeRef = flag(args, 'scope')
  let scopeId: string | undefined
  let scopeName: string | undefined
  if (type !== 'systemLandscape' || scopeRef !== undefined) {
    if (scopeRef === undefined && (type === 'systemContext' || type === 'container' || type === 'component')) {
      throw new CliFailure('USAGE', `--scope is required for a ${typeFlag} view`)
    }
    if (scopeRef !== undefined) {
      const scope = resolveElement(ws, scopeRef)
      const wanted = type === 'component' ? 'container' : 'softwareSystem'
      if (type === 'systemLandscape' || scope.type !== wanted) {
        throw new CliFailure('VALIDATION', `A ${typeFlag} view cannot be scoped to ${scope.type} '${scope.id}'.`)
      }
      scopeId = scope.id
      scopeName = scope.name
    }
  }
  const environment = flag(args, 'environment')
  if (type === 'deployment' && !environment) throw new CliFailure('USAGE', 'A deployment view requires --environment')

  const requestedKey = flag(args, 'key')
  if (requestedKey !== undefined) {
    if (!KEY_PATTERN.test(requestedKey)) throw new CliFailure('VALIDATION', `Invalid view key '${requestedKey}'.`)
    if (findViewHelper(ws, requestedKey)) throw new CliFailure('VALIDATION', `A view with key '${requestedKey}' already exists.`)
  }
  const key = requestedKey ?? defaultViewKey(ws, type, scopeId)
  const title = flag(args, 'title') ?? defaultTitle(type, scopeName)
  const description = flag(args, 'description')

  const generated = session.actions().addView(type, scopeId, title, environment ? { environment } : undefined)
  patchWorkspace(session, (next) => {
    const view = findViewHelper(next, generated)!
    view.key = key
    if (description !== undefined) view.description = description
  })
  session.markExplicitViewKey(key)
  return { views: [key] }
}

function viewUpdate(args: ParsedArgs, session: Session, warnings: string[]): { views: string[] } {
  const key = args.positionals[1]
  const ws = session.workspace()
  const view = requireView(ws, key)
  const include = flagAll(args, 'include')
  const exclude = flagAll(args, 'exclude')
  const direction = flag(args, 'auto-layout')
  const title = flag(args, 'title')
  const description = flag(args, 'description')
  if (direction !== undefined && !DIRECTIONS.includes(direction)) {
    throw new CliFailure('USAGE', `--auto-layout must be one of ${DIRECTIONS.join(', ')}`)
  }
  if (include.length + exclude.length === 0 && !direction && title === undefined && description === undefined) {
    throw new CliFailure('USAGE', 'view update needs at least one of --include, --exclude, --auto-layout, --title, --description')
  }
  if (view.locked) warnings.push(`view '${key}' is layout-locked; layout changes were ignored`)

  const actions = session.actions()
  for (const ref of include) {
    const current = new Set(requireView(session.workspace(), key).elements.map((e) => e.id))
    const ids =
      ref === '*'
        ? buildInitialViewContent(ws.model, view.type, view.containerId ?? view.softwareSystemId).elements.map((e) => e.id)
        : [resolveElement(ws, ref).id]
    for (const id of ids) if (!current.has(id)) actions.toggleElementInView(key, id)
  }
  if (exclude.length > 0) {
    const ids = exclude.map((ref) => resolveElement(ws, ref).id)
    actions.removeElementsFromView(key, ids)
    const remaining = new Set(requireView(session.workspace(), key).elements.map((e) => e.id))
    for (const id of ids) if (remaining.has(id)) warnings.push(`'${id}' is the view's scope and cannot be excluded`)
  }
  if (direction) actions.setLayoutDirection(key, direction as 'TB' | 'BT' | 'LR' | 'RL')
  if (title !== undefined) actions.renameView(key, title)
  if (description !== undefined) {
    patchWorkspace(session, (next) => {
      findViewHelper(next, key)!.description = description || undefined
    })
  }
  return { views: [key] }
}

function viewRemove(args: ParsedArgs, session: Session): { views: string[] } {
  const key = args.positionals[1]
  requireView(session.workspace(), key)
  session.actions().deleteView(key)
  return { views: [key] }
}

const view: CommandModule = {
  name: 'view',
  summary: 'Add, update or remove a view',
  flags: {
    booleans: MUTATING_BOOLEANS,
    bySubcommand: {
      add: { values: ['type', 'scope', 'key', 'title', 'description', 'environment'] },
      update: { values: ['include', 'exclude', 'auto-layout', 'title', 'description'] },
      remove: {},
    },
  },
  usage: [
    'view add --type landscape|context|container|component|dynamic|deployment [--scope <ref>] [--key <key>] [--title <t>] [--description <d>] [--environment <env>]',
    'view update <key> [--include <ref|*>]... [--exclude <ref>]... [--auto-layout TB|BT|LR|RL] [--title <t>] [--description <d>]',
    'view remove <key>',
    '(all: [--file <dsl>] [--dry-run] [--force])',
  ].join('\n'),
  run(args, ctx) {
    const sub = args.positionals[0]
    if (sub !== 'add' && sub !== 'update' && sub !== 'remove') {
      throw new CliFailure('USAGE', 'view requires a subcommand: add, update or remove')
    }
    const session = openForEdit(args, ctx)
    const warnings: string[] = []
    const changed =
      sub === 'add' ? viewAdd(args, session) : sub === 'update' ? viewUpdate(args, session, warnings) : viewRemove(args, session)
    return finish('view', session, args, changed, warnings)
  },
}

function elementStyle(args: ParsedArgs, tag: string): ElementStyle {
  const style: ElementStyle = { tag }
  for (const name of ['background', 'color', 'shape', 'border', 'stroke', 'icon'] as const) {
    const value = flag(args, name)
    if (value !== undefined) style[name] = value
  }
  const fontSize = number(args, 'font-size')
  const opacity = number(args, 'opacity')
  const thickness = number(args, 'thickness')
  if (fontSize !== undefined) style.fontSize = fontSize
  if (opacity !== undefined) style.opacity = opacity
  if (thickness !== undefined) style.strokeWidth = thickness
  return style
}

function relationshipStyle(args: ParsedArgs, tag: string): RelationshipStyle {
  const style: RelationshipStyle = { tag }
  const color = flag(args, 'color')
  if (color !== undefined) style.color = color
  for (const [name, field] of [['thickness', 'thickness'], ['font-size', 'fontSize'], ['opacity', 'opacity']] as const) {
    const value = number(args, name)
    if (value !== undefined) style[field] = value
  }
  const dashed = flag(args, 'dashed')
  if (dashed !== undefined) {
    if (dashed !== 'true' && dashed !== 'false') throw new CliFailure('USAGE', '--dashed must be true or false')
    style.dashed = dashed === 'true'
  }
  return style
}

const style: CommandModule = {
  name: 'style',
  summary: 'Set the style of an element or relationship tag',
  flags: {
    booleans: MUTATING_BOOLEANS,
    bySubcommand: {
      element: { values: ['tag', 'background', 'color', 'shape', 'border', 'stroke', 'thickness', 'font-size', 'opacity', 'icon'] },
      relationship: { values: ['tag', 'color', 'thickness', 'dashed', 'font-size', 'opacity'] },
    },
  },
  usage: [
    'style element --tag <tag> [--background <c>] [--color <c>] [--shape <s>] [--border <b>] [--stroke <c>] [--thickness <n>] [--font-size <n>] [--opacity <n>] [--icon <url>]',
    'style relationship --tag <tag> [--color <c>] [--thickness <n>] [--dashed true|false] [--font-size <n>] [--opacity <n>]',
    '(all: [--file <dsl>] [--dry-run] [--force])',
  ].join('\n'),
  run(args, ctx) {
    const sub = args.positionals[0]
    if (sub !== 'element' && sub !== 'relationship') {
      throw new CliFailure('USAGE', 'style requires a subcommand: element or relationship')
    }
    const tag = flag(args, 'tag')
    if (!tag || tag === 'true') throw new CliFailure('USAGE', `style ${sub} requires --tag`)
    const session = openForEdit(args, ctx)
    if (sub === 'element') {
      const next = elementStyle(args, tag)
      if (Object.keys(next).length === 1) throw new CliFailure('USAGE', 'style element needs at least one style flag')
      session.actions().updateElementStyle(next)
    } else {
      const next = relationshipStyle(args, tag)
      if (Object.keys(next).length === 1) throw new CliFailure('USAGE', 'style relationship needs at least one style flag')
      patchWorkspace(session, (ws) => {
        const list = ws.views.configuration.styles.relationships
        const idx = list.findIndex((r) => r.tag === tag)
        if (idx >= 0) list[idx] = { ...list[idx], ...next }
        else list.push(next)
      })
    }
    return finish('style', session, args, { styles: [`${sub}:${tag}`] }, [])
  },
}

export const viewCommands: CommandModule[] = [view, style]
