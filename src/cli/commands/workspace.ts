/// <reference types="node" />
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DocLink, Workspace } from '@/types/model'
import { walkDeploymentNodes } from '@/lib/deployment'
import { serializeDSL } from '@/lib/dsl'
import { applyEditPlan, summarizeSkips, type AppliedOp, type EditActions } from '@/lib/ai/operations'
import { MAX_PLAN_OPS, isEditOp, sanitizeEditOp } from '@/lib/ai/schema'
import { healthFieldCounts, missingInfoGaps } from '@/lib/ai/sweep'
import { flattenElements } from '@/lib/ai/context'
import type { EditOp } from '@/lib/ai/types'
import { checkModelIntegrity } from '@/lib/modelIntegrity'
import { isInsideRoot, isInsideRootReal } from '@/lib/docPath'
import { deriveIdentifier, renameElementId } from '@/lib/renameIdentifier'
import { validateScope } from '@/lib/scopeValidation'
import { extractSidecar, serializeSidecar } from '@/lib/sidecar'
import { sidecarName } from '@/lib/sidecarName'
import {
  createBigBankSample,
  createBlankWorkspace,
  createEventDrivenTemplate,
  createMicroservicesTemplate,
  createMonolithTemplate,
} from '@/lib/templates'
import type { WorkspaceState } from '@/store/workspace'
import { allViewsOf } from '@/store/workspace-helpers'
import { boolFlag, flag } from '../args'
import { CliFailure, ParseFailedError } from '../errors'
import { discoverWorkspace, findRoot, projectRootFor } from '../discover'
import { describeFinding, findLossyConstructs } from '../lossyGuard'
import type { CliResult } from '../output'
import { openSession } from '../session'
import { takenIds } from './shared'
import { MUTATING_BOOLEANS, type CommandContext, type CommandModule } from './types'

// ─── init ───────────────────────────────────────────────────────────

const TEMPLATES: Record<string, () => Workspace> = {
  blank: () => createBlankWorkspace(),
  microservices: createMicroservicesTemplate,
  monolith: createMonolithTemplate,
  eventDriven: createEventDrivenTemplate,
  bigBank: createBigBankSample,
}

const init: CommandModule = {
  name: 'init',
  summary: 'Create a workspace from a template',
  flags: { values: ['template', 'name'], booleans: ['overwrite'] },
  usage: 'init --template blank|microservices|monolith|eventDriven|bigBank [--name <name>] [--file <dsl>] [--overwrite]',
  run(args, ctx) {
    const templateName = flag(args, 'template') ?? 'blank'
    const make = templateName in TEMPLATES ? TEMPLATES[templateName] : undefined
    if (!make) throw new CliFailure('USAGE', `--template must be one of ${Object.keys(TEMPLATES).join(', ')}`)

    const file = path.resolve(ctx.cwd, flag(args, 'file') ?? 'workspace.dsl')
    const root = findRoot(ctx.cwd)
    if (!isInsideRoot(root, file) || !isInsideRootReal(root, file)) {
      throw new CliFailure('USAGE', `--file '${flag(args, 'file')}' resolves outside the project root ${root}.`)
    }
    if (existsSync(file) && !boolFlag(args, 'overwrite')) {
      throw new CliFailure('USAGE', `${file} already exists. Pass --overwrite to replace it.`)
    }

    const ws = make()
    const name = flag(args, 'name')
    if (name !== undefined) ws.name = name

    const sidecarPath = path.join(path.dirname(file), sidecarName(path.basename(file)))
    const sidecar = extractSidecar(ws)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, serializeDSL(ws))
    if (sidecar) writeFileSync(sidecarPath, serializeSidecar(sidecar))
    else rmSync(sidecarPath, { force: true })

    return {
      ok: true,
      command: 'init',
      file,
      data: { template: templateName, name: ws.name, sidecar: sidecar ? sidecarPath : null },
      warnings: [],
    }
  },
}

// ─── check ──────────────────────────────────────────────────────────

interface Finding {
  kind: string
  message: string
  line?: number
  id?: string
}

interface CheckData {
  errors: Finding[]
  warnings: Finding[]
  info: Finding[]
  health: (ReturnType<typeof healthFieldCounts> & { gaps: Record<string, number> }) | null
}

function checkResult(file: string, data: CheckData): CliResult {
  if (data.errors.length === 0) return { ok: true, command: 'check', file, data, warnings: [] }
  const parse = data.errors.some((e) => e.kind === 'parse')
  return {
    ok: false,
    command: 'check',
    file,
    data,
    warnings: [],
    error: {
      code: parse ? 'PARSE_FAILED' : 'VALIDATION',
      message: `${data.errors.length} error(s) in ${file}`,
    },
  }
}

function parseFinding(text: string): Finding {
  const m = /^line (\d+): (.*)$/s.exec(text)
  return m ? { kind: 'parse', message: m[2], line: Number(m[1]) } : { kind: 'parse', message: text }
}

function allElements(ws: Workspace) {
  return [
    ...ws.model.people,
    ...ws.model.softwareSystems.flatMap((s) => [s, ...s.containers.flatMap((c) => [c, ...c.components])]),
  ]
}

/** Elements that take part in no relationship, directly or through a descendant. */
function orphans(ws: Workspace): Finding[] {
  const linked = new Set(ws.model.relationships.flatMap((r) => [r.sourceId, r.destinationId]))
  const touches = (ids: string[]) => ids.some((id) => linked.has(id))
  const out: Finding[] = []
  const report = (el: { id: string; name: string }, ids: string[]) => {
    if (!touches(ids)) out.push({ kind: 'orphan', message: `${el.name} has no relationships`, id: el.id })
  }
  for (const p of ws.model.people) report(p, [p.id])
  for (const s of ws.model.softwareSystems) {
    report(s, [s.id, ...s.containers.flatMap((c) => [c.id, ...c.components.map((k) => k.id)])])
    for (const c of s.containers) {
      report(c, [c.id, ...c.components.map((k) => k.id)])
      for (const k of c.components) report(k, [k.id])
    }
  }
  return out
}

function missingDocuments(ws: Workspace, root: string): Finding[] {
  const out: Finding[] = []
  const holders: { id: string; documents?: DocLink[] }[] = [...allElements(ws), ...ws.model.relationships]
  for (const env of ws.model.deploymentEnvironments ?? []) {
    walkDeploymentNodes(env, (node) => holders.push(node, ...node.infrastructureNodes))
  }
  for (const h of holders) {
    for (const doc of h.documents ?? []) {
      const abs = path.resolve(root, doc.path)
      const rel = path.relative(root, abs)
      const inside = !path.isAbsolute(doc.path) && !rel.startsWith('..') && !path.isAbsolute(rel)
      if (!inside || !existsSync(abs) || !statSync(abs).isFile()) {
        out.push({ kind: 'missing-document', message: `${h.id}: document ${doc.path} not found under ${root}`, id: h.id })
      }
    }
  }
  return out
}

const GAP_KIND: Record<string, string> = {
  title: 'missing-name',
  desc: 'missing-description',
  tech: 'missing-technology',
  rel: 'missing-relationship-label',
}

const check: CommandModule = {
  name: 'check',
  summary: 'Validate the workspace (parse, integrity, scope, model health, docs)',
  flags: { booleans: ['fast'] },
  usage: 'check [--fast] [--file <dsl>]',
  run(args, ctx) {
    const file = discoverWorkspace({ file: flag(args, 'file'), cwd: ctx.cwd })
    const fast = boolFlag(args, 'fast')
    const data: CheckData = { errors: [], warnings: [], info: [], health: null }

    let ws: Workspace
    try {
      ws = openSession(file, { force: true }).workspace()
    } catch (err) {
      if (!(err instanceof ParseFailedError)) throw err
      data.errors.push(...(err.candidates ?? []).map(parseFinding))
      return checkResult(file, data)
    }

    for (const v of checkModelIntegrity(ws)) {
      data.errors.push({ kind: v.code, message: v.message, id: v.elementId ?? v.relationshipId ?? v.viewKey })
    }
    if (fast) return checkResult(file, data)

    for (const v of validateScope(ws)) {
      const finding = { kind: 'scope', message: v.message, id: v.elementId ?? v.relationshipId }
      ;(v.type === 'error' ? data.errors : data.warnings).push(finding)
    }

    const gaps = missingInfoGaps(ws)
    const gapCounts: Record<string, number> = {}
    for (const g of gaps) {
      gapCounts[g.kind] = (gapCounts[g.kind] ?? 0) + 1
      data.warnings.push({ kind: GAP_KIND[g.kind], message: `${g.label}: ${GAP_KIND[g.kind].replace('missing-', 'no ')}`, id: g.targetId })
    }
    data.health = { ...healthFieldCounts(ws), gaps: gapCounts }

    data.warnings.push(...orphans(ws), ...missingDocuments(ws, projectRootFor(file)))
    data.info.push(
      ...findLossyConstructs(readFileSync(file, 'utf8')).map((f) => ({
        kind: `lossy-${f.kind}`,
        message: describeFinding(f),
        line: f.line,
      })),
    )
    return checkResult(file, data)
  },
}

// ─── apply ──────────────────────────────────────────────────────────

/** EditActions bound to the session's store, mirroring `storeEditActions` in
 *  src/components/ai/aiHelpers.ts (which is React-coupled, so not importable).
 *  Ids the store mints are recorded so refs can be given readable ids later. */
function editActions(s: () => WorkspaceState, created: string[]): EditActions {
  const track = (id: string) => (created.push(id), id)
  return {
    addPerson: (name) => track(s().addPerson(name)),
    addSoftwareSystem: (name, external) => track(s().addSoftwareSystem(name, undefined, external ? 'External' : undefined)),
    addContainer: (systemId, name) => track(s().addContainer(systemId, name)),
    addComponent: (containerId, name) => track(s().addComponent(containerId, name)),
    addRelationship: (src, dst, desc, tech) => s().addRelationship(src, dst, desc, tech),
    updateElement: (id, patch) => s().updateElement(id, patch),
    updateRelationship: (id, patch) => s().updateRelationship(id, patch),
    deleteElement: (id) => s().deleteElement(id),
    addView: (type, scopeId, title) => s().addView(type, scopeId, title),
  }
}

function readPlan(file: string): { operations: EditOp[]; rejected: { index: number; reason: string }[] } {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new CliFailure('USAGE', `Cannot read plan ${file}: ${(err as Error).message}`)
  }
  const ops = (raw as { operations?: unknown } | null)?.operations
  if (!Array.isArray(ops)) throw new CliFailure('VALIDATION', 'Plan must be a JSON object { "operations": [...] }')

  const operations: EditOp[] = []
  const rejected: { index: number; reason: string }[] = []
  ops.forEach((candidate, index) => {
    if (operations.length >= MAX_PLAN_OPS) return rejected.push({ index, reason: `plan exceeds ${MAX_PLAN_OPS} operations` })
    const clean = isEditOp(candidate) ? sanitizeEditOp(candidate) : null
    if (clean) operations.push(clean)
    else rejected.push({ index, reason: 'invalid operation' })
  })
  return { operations, rejected }
}

const apply: CommandModule = {
  name: 'apply',
  summary: 'Apply an EditPlan JSON file to the workspace',
  flags: { values: ['plan'], booleans: MUTATING_BOOLEANS },
  usage: 'apply --plan <file.json> [--file <dsl>] [--dry-run] [--force]',
  run(args, ctx: CommandContext) {
    const planFile = flag(args, 'plan')
    if (!planFile) throw new CliFailure('USAGE', 'apply requires --plan <file.json>')
    const { operations, rejected } = readPlan(path.resolve(ctx.cwd, planFile))

    const file = discoverWorkspace({ file: flag(args, 'file'), cwd: ctx.cwd })
    const session = openSession(file, { force: boolFlag(args, 'force') })

    const before = session.workspace()
    const beforeIds = new Set(flattenElements(before).map((e) => e.id))
    const beforeViews = new Set(allViewsOf(before).map((v) => v.key))
    const created: string[] = []
    const result = applyEditPlan({ operations }, editActions(() => session.actions(), created), before)

    // Deleted elements (and their cascaded descendants) leave the sidecar.
    const afterApply = session.workspace()
    const surviving = new Set(flattenElements(afterApply).map((e) => e.id))
    for (const id of beforeIds) if (!surviving.has(id)) session.recordRemoved(id)

    // Created elements get readable ids. Renaming after the apply keeps
    // applyEditPlan's ref resolution on the store-minted ids.
    const refs: Record<string, string> = {}
    const elementCreates = result.applied.filter((a) => a.ok && /^add(Person|SoftwareSystem|Container|Component)$/.test(a.op.op))
    if (elementCreates.length > 0) {
      const ws = structuredClone(afterApply)
      const taken = takenIds(ws)
      const names = new Map(flattenElements(ws).map((e) => [e.id, e.name]))
      elementCreates.forEach((a, i) => {
        const oldId = created[i]
        const newId = deriveIdentifier(names.get(oldId) ?? 'item', taken)
        taken.add(newId)
        try {
          renameElementId(ws, oldId, newId)
        } catch (err) {
          throw new CliFailure('VALIDATION', `Cannot give ${oldId} the id ${newId}: ${(err as Error).message}`)
        }
        session.recordRename(oldId, newId)
        const ref = (a.op as { ref?: string }).ref
        refs[ref || oldId] = newId
      })
      session.actions().loadWorkspace(ws)
    }

    const dryRun = boolFlag(args, 'dry-run')
    // Save first: it renames store-minted view keys to readable ones.
    const save = session.save({ dryRun })
    const final = session.workspace()
    const finalIds = new Set(flattenElements(final).map((e) => e.id))

    const describe = (a: AppliedOp) => ({
      op: a.op.op,
      ...('ref' in a.op && a.op.ref ? { ref: a.op.ref } : {}),
      ...('name' in a.op && a.op.name ? { name: a.op.name } : {}),
      status: a.ok ? 'applied' : 'skipped',
      ...(a.reason ? { reason: a.reason } : {}),
    })
    const skipSummary = summarizeSkips(result)
    const warnings = [
      ...(skipSummary ? [skipSummary] : []),
      ...(rejected.length > 0 ? [`Rejected ${rejected.length} invalid operation(s): index ${rejected.map((r) => r.index).join(', ')}`] : []),
    ]
    return {
      ok: true,
      command: 'apply',
      file: session.file,
      changed: save.changed
        ? {
            elements: [...finalIds].filter((id) => !beforeIds.has(id)),
            views: allViewsOf(final).map((v) => v.key).filter((k) => !beforeViews.has(k)),
          }
        : {},
      data: {
        applied: result.appliedCount,
        skipped: result.skippedCount + rejected.length,
        ops: result.applied.map(describe),
        rejected,
        refs,
        saved: !dryRun && save.changed,
        ...(Object.keys(save.renamedViews).length > 0 ? { renamedViews: save.renamedViews } : {}),
        ...(save.diff !== undefined ? { diff: save.diff } : {}),
      },
      warnings,
    }
  },
}

export const workspaceCommands: CommandModule[] = [init, check, apply]
