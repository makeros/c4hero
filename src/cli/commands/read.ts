import type { Container, Component, ModelElement, Person, SoftwareSystem, View, Workspace } from '@/types/model'
import { allViewsOf } from '@/store/workspace-helpers'
import { flag, type ParsedArgs } from '../args'
import { CliFailure } from '../errors'
import { discoverWorkspace } from '../discover'
import type { CliResult } from '../output'
import { parentMap, resolveElement } from '../resolve'
import { openSession } from '../session'
import type { CommandContext, CommandModule } from './types'

const ELEMENT_TYPES = ['person', 'softwareSystem', 'container', 'component'] as const

function load(args: ParsedArgs, ctx: CommandContext): { file: string; ws: Workspace } {
  const file = discoverWorkspace({ file: flag(args, 'file'), cwd: ctx.cwd })
  return { file, ws: openSession(file, { force: true }).workspace() }
}

function children(el: ModelElement): ModelElement[] {
  if (el.type === 'softwareSystem') return el.containers
  if (el.type === 'container') return el.components
  return []
}

function descendants(el: ModelElement): ModelElement[] {
  return children(el).flatMap((c) => [c, ...descendants(c)])
}

function allElements(ws: Workspace): ModelElement[] {
  const roots: Array<Person | SoftwareSystem> = [...ws.model.people, ...ws.model.softwareSystems]
  return roots.flatMap((r) => [r, ...descendants(r)])
}

function summarize(el: ModelElement, parent: ModelElement | undefined) {
  const tech = (el as Container | Component).technology
  return {
    id: el.id,
    type: el.type,
    name: el.name,
    ...(parent ? { parent: parent.id } : {}),
    ...(el.description ? { description: el.description } : {}),
    ...(tech ? { technology: tech } : {}),
    tags: el.tags,
  }
}

function result(command: string, file: string, data: unknown): CliResult {
  return { ok: true, command, file, data, warnings: [] }
}

const list: CommandModule = {
  name: 'list',
  summary: 'List model elements',
  flags: { values: ['type', 'parent'] },
  usage: 'list [--type person|softwareSystem|container|component] [--parent <ref>] [--file <dsl>]',
  run(args, ctx) {
    const { file, ws } = load(args, ctx)
    const type = flag(args, 'type')
    if (type !== undefined && !(ELEMENT_TYPES as readonly string[]).includes(type)) {
      throw new CliFailure('USAGE', `--type must be one of ${ELEMENT_TYPES.join(', ')}`)
    }
    const parentRef = flag(args, 'parent')
    const parent = parentRef === undefined ? undefined : resolveElement(ws, parentRef)
    const parents = parentMap(ws)
    const pool = parent ? children(parent) : allElements(ws)
    const elements = pool
      .filter((el) => type === undefined || el.type === type)
      .map((el) => summarize(el, parents.get(el.id)))
    return result('list', file, { elements })
  },
}

const show: CommandModule = {
  name: 'show',
  summary: 'Show one element with relationships and views',
  flags: {},
  usage: 'show <ref> [--file <dsl>]',
  run(args, ctx) {
    const ref = args.positionals[0]
    if (!ref) throw new CliFailure('USAGE', 'show requires <ref>')
    const { file, ws } = load(args, ctx)
    const el = resolveElement(ws, ref)
    const parent = parentMap(ws).get(el.id)
    const rel = (r: Workspace['model']['relationships'][number]) => ({
      id: r.id,
      source: r.sourceId,
      destination: r.destinationId,
      ...(r.description ? { description: r.description } : {}),
      ...(r.technology ? { technology: r.technology } : {}),
    })
    const location = el.type === 'person' || el.type === 'softwareSystem' ? el.location : undefined
    const technology = el.type === 'container' || el.type === 'component' ? el.technology : undefined
    return result('show', file, {
      id: el.id,
      type: el.type,
      name: el.name,
      description: el.description ?? null,
      technology: technology ?? null,
      tags: el.tags,
      properties: el.properties,
      url: el.url ?? null,
      documents: el.documents ?? [],
      status: el.status ?? null,
      owner: el.owner ?? null,
      location: location ?? null,
      parent: parent?.id ?? null,
      children: children(el).map((c) => c.id),
      incoming: ws.model.relationships.filter((r) => r.destinationId === el.id).map(rel),
      outgoing: ws.model.relationships.filter((r) => r.sourceId === el.id).map(rel),
      views: allViewsOf(ws)
        .filter((v) => v.elements.some((e) => e.id === el.id))
        .map((v) => v.key),
    })
  },
}

function viewScope(v: View): string | null {
  return v.containerId ?? v.softwareSystemId ?? v.environment ?? null
}

const views: CommandModule = {
  name: 'views',
  summary: 'List views',
  flags: {},
  usage: 'views [--file <dsl>]',
  run(args, ctx) {
    const { file, ws } = load(args, ctx)
    return result('views', file, {
      views: allViewsOf(ws).map((v) => ({
        key: v.key,
        type: v.type,
        title: v.title ?? null,
        scope: viewScope(v),
        elements: v.elements.length,
        relationships: v.relationships.length,
        autoLayout: v.autoLayout?.direction ?? null,
        locked: v.locked === true,
      })),
    })
  },
}

const graph: CommandModule = {
  name: 'graph',
  summary: 'Nodes and edges of the model, or one element\'s neighbourhood',
  flags: {},
  usage: 'graph [<ref>] [--file <dsl>]',
  run(args, ctx) {
    const { file, ws } = load(args, ctx)
    const ref = args.positionals[0]
    let edges = ws.model.relationships
    let nodes = allElements(ws)
    if (ref !== undefined) {
      const root = resolveElement(ws, ref)
      const inside = new Set([root, ...descendants(root)].map((e) => e.id))
      edges = edges.filter((r) => inside.has(r.sourceId) || inside.has(r.destinationId))
      const keep = new Set(inside)
      for (const r of edges) {
        keep.add(r.sourceId)
        keep.add(r.destinationId)
      }
      nodes = nodes.filter((n) => keep.has(n.id))
    }
    const parents = parentMap(ws)
    return result('graph', file, {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        name: n.name,
        ...(parents.get(n.id) ? { parent: parents.get(n.id)!.id } : {}),
      })),
      edges: edges.map((r) => ({
        id: r.id,
        source: r.sourceId,
        destination: r.destinationId,
        ...(r.description ? { description: r.description } : {}),
        ...(r.technology ? { technology: r.technology } : {}),
      })),
    })
  },
}

export const readCommands: CommandModule[] = [list, show, views, graph]
