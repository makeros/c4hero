/// <reference types="node" />
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DeploymentNode, DocLink, InfrastructureNode, ModelElement, Relationship, Workspace } from '@/types/model'
import { walkDeploymentNodes } from '@/lib/deployment'
import { docPathProblem, documentKind, isInsideRoot, isInsideRootReal } from '@/lib/docPath'
import { boolFlag, flag, type ParsedArgs } from '../args'
import { CliFailure } from '../errors'
import { projectRootFor } from '../discover'
import type { CliResult } from '../output'
import { resolveElement, resolveRelationship } from '../resolve'
import type { WorkspaceState } from '@/store/workspace'
import { openForEdit } from './shared'
import { MUTATING_BOOLEANS, type CommandContext, type CommandModule } from './types'

type Target =
  | { kind: 'element'; element: ModelElement }
  | { kind: 'relationship'; relationship: Relationship }
  | { kind: 'deployment'; environment: string; element: DeploymentNode | InfrastructureNode }

/** Deployment and infrastructure nodes, matched by identifier only. */
function findDeploymentElement(ws: Workspace, ref: string): Target | undefined {
  for (const env of ws.model.deploymentEnvironments ?? []) {
    let found: DeploymentNode | InfrastructureNode | undefined
    walkDeploymentNodes(env, (node) => {
      if (node.id === ref) found = node
      found ??= node.infrastructureNodes.find((i) => i.id === ref)
    })
    if (found) return { kind: 'deployment', environment: env.name, element: found }
  }
  return undefined
}

function resolveTarget(ws: Workspace, ref: string, match?: string): Target {
  if (ref.includes('->')) return { kind: 'relationship', relationship: resolveRelationship(ws, ref, match) }
  try {
    return { kind: 'element', element: resolveElement(ws, ref) }
  } catch (err) {
    if (!(err instanceof CliFailure) || err.code !== 'NOT_FOUND') throw err
    if (ws.model.relationships.some((r) => r.id === ref)) {
      return { kind: 'relationship', relationship: resolveRelationship(ws, ref, match) }
    }
    const deployment = findDeploymentElement(ws, ref)
    if (deployment) return deployment
    throw err
  }
}

function validatedPath(raw: string): string {
  const problem = docPathProblem(raw)
  if (problem) throw new CliFailure('USAGE', `Invalid document path '${raw}': ${problem}.`)
  return path.posix.normalize(raw.replace(/\\/g, '/'))
}

function scaffold(ws: Workspace, target: Target): string {
  const nameOf = (id: string) => {
    const el = [...ws.model.people, ...ws.model.softwareSystems]
      .flatMap((r) => [r, ...('containers' in r ? r.containers.flatMap((c) => [c, ...c.components]) : [])])
      .find((e) => e.id === id)
    return el ? el.name : id
  }
  const lines: string[] = []
  if (target.kind !== 'relationship') {
    const el = target.element
    lines.push(`# ${el.name}`, '')
    if (el.description) lines.push(el.description, '')
    const tech = (el as { technology?: string }).technology
    if (tech) lines.push(`**Technology:** ${tech}`, '')
    const rels = ws.model.relationships.filter((r) => r.sourceId === el.id || r.destinationId === el.id)
    lines.push('## Relationships', '')
    if (rels.length === 0) lines.push('_None._')
    for (const r of rels) {
      const outgoing = r.sourceId === el.id
      const other = nameOf(outgoing ? r.destinationId : r.sourceId)
      const detail = [r.description, r.technology ? `[${r.technology}]` : ''].filter(Boolean).join(' ')
      lines.push(`- ${outgoing ? '->' : '<-'} ${other}${detail ? `: ${detail}` : ''}`)
    }
  } else {
    const r = target.relationship
    lines.push(`# ${nameOf(r.sourceId)} -> ${nameOf(r.destinationId)}`, '')
    if (r.description) lines.push(r.description, '')
    if (r.technology) lines.push(`**Technology:** ${r.technology}`, '')
  }
  return lines.join('\n').replace(/\n+$/, '') + '\n'
}

function setDocuments(target: Target, documents: DocLink[], actions: WorkspaceState): void {
  if (target.kind === 'element') actions.updateElement(target.element.id, { documents })
  else if (target.kind === 'deployment') actions.updateDeploymentElement(target.environment, target.element.id, { documents })
  else actions.updateRelationship(target.relationship.id, { documents })
}

function targetId(target: Target): string {
  return target.kind === 'relationship' ? target.relationship.id : target.element.id
}

function changedOf(target: Target): CliResult['changed'] {
  return target.kind === 'relationship' ? { relationships: [target.relationship.id] } : { elements: [target.element.id] }
}

function commonSetup(args: ParsedArgs, ctx: CommandContext) {
  const ref = args.positionals[0]
  if (!ref) throw new CliFailure('USAGE', 'Missing <ref> (element ref or relationship ref).')
  const rawPath = flag(args, 'path')
  if (!rawPath) throw new CliFailure('USAGE', 'Missing --path <repo-relative.md|.html>.')
  const docPath = validatedPath(rawPath)
  const session = openForEdit(args, ctx)
  const target = resolveTarget(session.workspace(), ref, flag(args, 'match'))
  return { file: session.file, session, target, docPath, dryRun: boolFlag(args, 'dry-run') }
}

function currentDocs(target: Target): DocLink[] {
  return (target.kind === 'relationship' ? target.relationship.documents : target.element.documents) ?? []
}

const linkDoc: CommandModule = {
  name: 'link-doc',
  summary: 'Link a markdown document to an element or relationship',
  flags: { values: ['path', 'title', 'match'], booleans: ['create', ...MUTATING_BOOLEANS] },
  usage: 'link-doc <ref|relRef> --path <repo-relative.md|.html> [--title <text>] [--create] [--match <description>] [--file <dsl>] [--dry-run] [--force]',
  run(args, ctx) {
    const { file, session, target, docPath, dryRun } = commonSetup(args, ctx)
    const warnings: string[] = []
    const root = projectRootFor(file)
    const absolute = path.resolve(root, docPath)
    if (!isInsideRoot(root, absolute) || !isInsideRootReal(root, absolute)) {
      throw new CliFailure('USAGE', `Document path '${docPath}' resolves outside the project root ${root}.`)
    }
    if (boolFlag(args, 'create') && documentKind(docPath) !== 'markdown') {
      throw new CliFailure('USAGE', `--create only scaffolds markdown; '${docPath}' is not a markdown path.`)
    }

    const docs = currentDocs(target)
    const existing = docs.findIndex((d) => d.path === docPath)
    const title = flag(args, 'title') ?? docs[existing]?.title ?? path.posix.basename(docPath).replace(/\.(md|markdown|html|htm)$/i, '')
    const next = existing === -1 ? [...docs, { path: docPath, title }] : docs.map((d, i) => (i === existing ? { path: docPath, title } : d))
    setDocuments(target, next, session.actions())

    let created = false
    if (existsSync(absolute)) {
      if (boolFlag(args, 'create')) warnings.push(`${docPath} already exists; left untouched.`)
    } else if (boolFlag(args, 'create')) {
      if (!dryRun) {
        mkdirSync(path.dirname(absolute), { recursive: true })
        if (!isInsideRootReal(root, absolute)) throw new CliFailure('USAGE', `Document path '${docPath}' resolves outside the project root ${root}.`)
        writeFileSync(absolute, scaffold(session.workspace(), target), { flag: 'wx' })
      }
      created = true
    } else {
      warnings.push(`${docPath} does not exist under ${root}. Pass --create to scaffold it.`)
    }

    const saved = session.save({ dryRun })
    const result: CliResult = {
      ok: true,
      command: 'link-doc',
      file,
      changed: saved.changed ? changedOf(target) : {},
      data: {
        target: targetId(target),
        documents: next,
        updatedExisting: existing !== -1,
        created,
        ...(saved.diff !== undefined ? { diff: saved.diff } : {}),
      },
      warnings,
    }
    return result
  },
}

const unlinkDoc: CommandModule = {
  name: 'unlink-doc',
  summary: 'Remove a document link from an element or relationship',
  flags: { values: ['path', 'match'], booleans: MUTATING_BOOLEANS },
  usage: 'unlink-doc <ref|relRef> --path <repo-relative.md|.html> [--match <description>] [--file <dsl>] [--dry-run] [--force]',
  run(args, ctx) {
    const { file, session, target, docPath, dryRun } = commonSetup(args, ctx)
    const docs = currentDocs(target)
    if (!docs.some((d) => d.path === docPath)) {
      throw new CliFailure('NOT_FOUND', `'${targetId(target)}' has no document link '${docPath}'.`, docs.map((d) => d.path))
    }
    const next = docs.filter((d) => d.path !== docPath)
    setDocuments(target, next, session.actions())
    const saved = session.save({ dryRun })
    return {
      ok: true,
      command: 'unlink-doc',
      file,
      changed: saved.changed ? changedOf(target) : {},
      data: { target: targetId(target), documents: next, ...(saved.diff !== undefined ? { diff: saved.diff } : {}) },
      warnings: [],
    }
  },
}

export const docsCommands: CommandModule[] = [linkDoc, unlinkDoc]
