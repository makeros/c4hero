import type { Location, ModelElement, Workspace } from '@/types/model'
import { isElementStatus } from '@/types/model'
import { deriveIdentifier, renameElementId } from '@/lib/renameIdentifier'
import { allViewsOf, forEachElementHelper } from '@/store/workspace-helpers'
import { useWorkspaceStore } from '@/store/workspace'
import { boolFlag, flag, flagAll, type ParsedArgs } from '../args'
import { CliFailure } from '../errors'
import type { CliResult } from '../output'
import { parentMap, resolveElement } from '../resolve'
import type { Session } from '../session'
import { withRenamedViews } from '../viewKeys'
import { openForEdit, requireFreeId, takenIds } from './shared'
import { MUTATING_BOOLEANS, type CommandModule } from './types'

const ADD_TYPES = ['person', 'system', 'container', 'component'] as const
const LOCATIONS: Location[] = ['Internal', 'External', 'Unspecified']

function csv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((t) => t.trim()).filter(Boolean)
}

function finish(
  command: string,
  session: Session,
  args: ParsedArgs,
  changed: CliResult['changed'],
  warnings: string[],
  data?: unknown,
): CliResult {
  const saved = session.save({ dryRun: boolFlag(args, 'dry-run') })
  return withRenamedViews(
    {
      ok: true,
      command,
      file: session.file,
      changed: saved.changed ? changed : {},
      data: saved.diff !== undefined ? { ...(data as object | undefined), diff: saved.diff } : data,
      warnings,
    },
    saved.renamedViews,
  )
}

function descendantIds(el: ModelElement): string[] {
  if (el.type === 'softwareSystem') return el.containers.flatMap((c) => [c.id, ...descendantIds(c)])
  if (el.type === 'container') return el.components.map((c) => c.id)
  return []
}

function parseProperty(raw: string): [string, string] {
  const eq = raw.indexOf('=')
  if (eq < 1) throw new CliFailure('USAGE', `--property expects key=value, got '${raw}'`)
  return [raw.slice(0, eq), raw.slice(eq + 1)]
}

/** The store state is frozen by immer, so renames go through setState's draft. */
function rename(oldId: string, newId: string): void {
  try {
    useWorkspaceStore.setState((s) => {
      renameElementId(s.workspace!, oldId, newId)
    })
  } catch (err) {
    throw new CliFailure('VALIDATION', (err as Error).message)
  }
}

function setProperties(id: string, edit: (props: Record<string, string>) => void): void {
  // The store has no element-properties action, so edit the draft through the store's own setState.
  useWorkspaceStore.setState((s) => {
    if (!s.workspace) return
    forEachElementHelper(s.workspace, (el) => {
      if (el.id !== id) return false
      edit(el.properties)
      return true
    })
  })
}

const add: CommandModule = {
  name: 'add',
  summary: 'Add a person, system, container or component',
  flags: { values: ['name', 'parent', 'id', 'description', 'technology', 'tags'], booleans: ['external', ...MUTATING_BOOLEANS] },
  usage:
    'add person|system|softwareSystem|container|component (<name> or --name <name>) [--parent <ref>] [--id <ident>] [--description <text>] [--technology <text>] [--tags a,b] [--external] [--file <dsl>] [--dry-run] [--force]',
  run(args, ctx) {
    const rawType = args.positionals[0]
    const type = rawType === 'softwareSystem' ? 'system' : rawType
    if (!(ADD_TYPES as readonly string[]).includes(type)) {
      throw new CliFailure('USAGE', `add expects one of ${ADD_TYPES.join(', ')}, softwareSystem`)
    }
    const flagName = flag(args, 'name')
    const positionalName = args.positionals[1]
    if (args.positionals.length > 2) throw new CliFailure('USAGE', 'add takes one name; quote names with spaces')
    if (flagName !== undefined && positionalName !== undefined && flagName !== positionalName) {
      throw new CliFailure('USAGE', `add got two different names: '${positionalName}' and --name '${flagName}'`)
    }
    const name = flagName ?? positionalName
    if (!name || name === 'true') throw new CliFailure('USAGE', 'add requires a name: add <type> <name> or --name')
    const external = boolFlag(args, 'external')
    if (external && type !== 'person' && type !== 'system') {
      throw new CliFailure('USAGE', '--external applies to person and system only')
    }
    const technology = flag(args, 'technology')
    if (technology !== undefined && type !== 'container' && type !== 'component') {
      throw new CliFailure('USAGE', '--technology applies to container and component only')
    }

    const session = openForEdit(args, ctx)
    const store = session.actions()
    const ws = session.workspace()
    const parentRef = flag(args, 'parent')
    const parent = parentRef === undefined ? undefined : resolveElement(ws, parentRef)
    const location: Location = external ? 'External' : 'Internal'

    let newId: string
    if (type === 'person' || type === 'system') {
      if (parent) throw new CliFailure('USAGE', `${type} has no parent`)
      newId = type === 'person' ? store.addPerson(name, undefined, location) : store.addSoftwareSystem(name, undefined, location)
    } else if (type === 'container') {
      if (parent?.type !== 'softwareSystem') throw new CliFailure('USAGE', 'add container requires --parent <software system>')
      newId = store.addContainer(parent.id, name)
    } else {
      if (parent?.type !== 'container') throw new CliFailure('USAGE', 'add component requires --parent <container>')
      newId = store.addComponent(parent.id, name)
    }
    if (!newId) throw new CliFailure('VALIDATION', `Could not add ${type} '${name}'`)

    const explicitId = flag(args, 'id')
    if (explicitId !== undefined) requireFreeId(session.workspace(), explicitId, newId)
    const wanted = explicitId ?? deriveIdentifier(name, takenIds(session.workspace()))
    rename(newId, wanted)
    session.recordRename(newId, wanted)

    const tags = csv(flag(args, 'tags'))
    const created = resolveElement(session.workspace(), wanted)
    store.updateElement(wanted, {
      description: flag(args, 'description'),
      ...(tags.length > 0 ? { tags: [...created.tags, ...tags.filter((t) => !created.tags.includes(t))] } : {}),
    })
    if (technology !== undefined) store.updateElementTechnology(wanted, technology)

    const warnings: string[] = []
    const finalName = created.name
    if (finalName !== name) {
      warnings.push(`name '${name}' already used; created as '${finalName}' (id ${wanted})`)
    }
    for (const view of allViewsOf(session.workspace())) {
      if (view.locked && view.elements.some((e) => e.id === wanted)) {
        warnings.push(`view '${view.key}' is layout-locked; new element has no position`)
      }
    }
    return finish('add', session, args, { elements: [wanted] }, warnings, { id: wanted, name: finalName })
  },
}

const update: CommandModule = {
  name: 'update',
  summary: 'Update an element',
  flags: {
    values: ['name', 'description', 'technology', 'url', 'add-tag', 'remove-tag', 'property', 'remove-property', 'status', 'owner', 'location'],
    booleans: MUTATING_BOOLEANS,
  },
  usage:
    'update <ref> [--name] [--description] [--technology] [--url] [--add-tag t]... [--remove-tag t]... [--property k=v]... [--remove-property k]... [--status] [--owner] [--location] [--file <dsl>] [--dry-run] [--force]',
  run(args, ctx) {
    const ref = args.positionals[0]
    if (!ref) throw new CliFailure('USAGE', 'update requires <ref>')
    const session = openForEdit(args, ctx)
    const el = resolveElement(session.workspace(), ref)
    const store = session.actions()

    const patch: Parameters<typeof store.updateElement>[1] = {}
    const name = flag(args, 'name')
    if (name !== undefined) patch.name = name
    for (const key of ['description', 'url', 'owner'] as const) {
      const v = flag(args, key)
      if (v !== undefined) patch[key] = v === '' ? undefined : v
    }
    const status = flag(args, 'status')
    if (status !== undefined) {
      if (status !== '' && !isElementStatus(status)) throw new CliFailure('USAGE', '--status must be Live, Planned, Deprecated or Removed')
      patch.status = status === '' ? undefined : status
    }
    const location = flag(args, 'location')
    if (location !== undefined) {
      if (!(LOCATIONS as string[]).includes(location)) throw new CliFailure('USAGE', `--location must be one of ${LOCATIONS.join(', ')}`)
      if (el.type !== 'person' && el.type !== 'softwareSystem') throw new CliFailure('USAGE', '--location applies to person and system only')
      patch.location = location as Location
    }
    const addTags = flagAll(args, 'add-tag')
    const removeTags = flagAll(args, 'remove-tag')
    if (addTags.length > 0 || removeTags.length > 0) {
      const next = el.tags.filter((t) => !removeTags.includes(t))
      for (const t of addTags) if (!next.includes(t)) next.push(t)
      patch.tags = next
    }
    store.updateElement(el.id, patch)

    const technology = flag(args, 'technology')
    if (technology !== undefined) {
      if (el.type !== 'container' && el.type !== 'component') throw new CliFailure('USAGE', '--technology applies to container and component only')
      store.updateElementTechnology(el.id, technology)
    }

    const setProps = flagAll(args, 'property').map(parseProperty)
    const dropProps = flagAll(args, 'remove-property')
    if (setProps.length > 0 || dropProps.length > 0) {
      setProperties(el.id, (props) => {
        for (const k of dropProps) delete props[k]
        for (const [k, v] of setProps) props[k] = v
      })
    }
    return finish('update', session, args, { elements: [el.id] }, [])
  },
}

const remove: CommandModule = {
  name: 'remove',
  summary: 'Remove an element and everything under or attached to it',
  flags: { booleans: MUTATING_BOOLEANS },
  usage: 'remove <ref> [--file <dsl>] [--dry-run] [--force]',
  run(args, ctx) {
    const ref = args.positionals[0]
    if (!ref) throw new CliFailure('USAGE', 'remove requires <ref>')
    const session = openForEdit(args, ctx)
    const el = resolveElement(session.workspace(), ref)
    const relsBefore = session.workspace().model.relationships.map((r) => r.id)
    const removedIds = [el.id, ...descendantIds(el)]

    session.actions().deleteElement(el.id)

    const relsAfter = new Set(session.workspace().model.relationships.map((r) => r.id))
    const removedRels = relsBefore.filter((id) => !relsAfter.has(id))
    for (const id of [...removedIds, ...removedRels]) session.recordRemoved(id)
    return finish('remove', session, args, { elements: removedIds }, [], { removedRelationships: removedRels.length })
  },
}

const renameId: CommandModule = {
  name: 'rename-id',
  summary: 'Change an element identifier everywhere it is referenced',
  flags: { booleans: MUTATING_BOOLEANS },
  usage: 'rename-id <ref> <newId> [--file <dsl>] [--dry-run] [--force]',
  run(args, ctx) {
    const [ref, newId] = args.positionals
    if (!ref || !newId) throw new CliFailure('USAGE', 'rename-id requires <ref> <newId>')
    const session = openForEdit(args, ctx)
    const el = resolveElement(session.workspace(), ref)
    if (newId !== el.id) requireFreeId(session.workspace(), newId, el.id)
    rename(el.id, newId)
    session.recordRename(el.id, newId)
    return finish('rename-id', session, args, { elements: [newId] }, [], { from: el.id, to: newId })
  },
}

/** `key -> serialized content` for every view, to find which ones a store action touched. */
function viewFingerprints(ws: Workspace): Map<string, string> {
  return new Map(allViewsOf(ws).map((v) => [v.key, JSON.stringify([v.elements.map((e) => e.id), v.relationships])]))
}

/** Dynamic steps as `viewKey: source -> destination` labels, keyed by view and relationship id. */
function dynamicSteps(ws: Workspace): Map<string, string> {
  const rels = new Map(ws.model.relationships.map((r) => [r.id, r]))
  const steps = new Map<string, string>()
  for (const v of ws.views.dynamicViews ?? []) {
    v.relationships.forEach((step, i) => {
      const rel = rels.get(step.id)
      steps.set(`${v.key}#${i}#${step.id}`, `${v.key}: ${step.sourceId ?? rel?.sourceId} -> ${step.destinationId ?? rel?.destinationId}`)
    })
  }
  return steps
}

const move: CommandModule = {
  name: 'move',
  summary: 'Move a container to another system, or a component to another container',
  flags: { values: ['to'], booleans: MUTATING_BOOLEANS },
  usage: 'move <ref> --to <parentRef> [--file <dsl>] [--dry-run] [--force]',
  run(args, ctx) {
    const ref = args.positionals[0]
    const to = flag(args, 'to')
    if (!ref) throw new CliFailure('USAGE', 'move requires <ref>')
    if (!to || to === 'true') throw new CliFailure('USAGE', 'move requires --to <parentRef>')
    const session = openForEdit(args, ctx)
    const el = resolveElement(session.workspace(), ref)
    const parent = resolveElement(session.workspace(), to)
    if (el.type !== 'container' && el.type !== 'component') {
      throw new CliFailure('VALIDATION', `move applies to containers and components, '${el.id}' is a ${el.type}`)
    }
    const expected = el.type === 'container' ? 'softwareSystem' : 'container'
    if (parent.type !== expected) {
      throw new CliFailure('VALIDATION', `a ${el.type} moves into a ${expected === 'softwareSystem' ? 'software system' : 'container'}, '${parent.id}' is a ${parent.type}`)
    }
    const oldParent = parentMap(session.workspace()).get(el.id)
    if (oldParent?.id === parent.id) throw new CliFailure('VALIDATION', `'${el.id}' is already in '${parent.id}'`)

    const viewsBefore = viewFingerprints(session.workspace())
    const stepsBefore = dynamicSteps(session.workspace())
    if (!session.actions().moveElement(el.id, parent.id)) {
      throw new CliFailure('VALIDATION', `Could not move '${el.id}' into '${parent.id}'`)
    }

    const ws = session.workspace()
    const viewsAfter = viewFingerprints(ws)
    const changedViews = [...viewsAfter].filter(([key, fp]) => viewsBefore.get(key) !== fp).map(([key]) => key)
    const stepsAfter = new Set(dynamicSteps(ws).keys())
    const dropped = [...stepsBefore].filter(([key]) => !stepsAfter.has(key)).map(([, label]) => label)
    const warnings = dropped.map((label) => `dynamic step dropped (no longer valid in its scope) in view ${label}`)
    for (const view of allViewsOf(ws)) {
      if (view.locked && changedViews.includes(view.key)) {
        warnings.push(`view '${view.key}' is layout-locked; moved element has no position`)
      }
    }
    return finish('move', session, args, { elements: [el.id, ...descendantIds(el)], views: changedViews }, warnings, {
      id: el.id,
      from: oldParent?.id,
      to: parent.id,
      droppedSteps: dropped,
    })
  },
}

export const elementCommands: CommandModule[] = [add, update, remove, renameId, move]
