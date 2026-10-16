/// <reference types="node" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { hasHiddenSegment, isInsideRoot, isInsideRootReal } from '@/lib/docPath'
import { sidecarName } from '@/lib/sidecarName'
import { allViewsOf, findViewHelper } from '@/store/workspace-helpers'
import { flag, type ParsedArgs } from '../args'
import { discoverWorkspace, projectRootFor } from '../discover'
import { CliFailure } from '../errors'
import { listCandidates, systemProbe, type BrowserCandidate } from '../export/browser'
import { launchBrowser, openPage, type LaunchedBrowser, type Page } from '../export/cdp'
import { resolveViewerDir, startStaticServer, type StaticServer } from '../export/server'
import type { CliResult } from '../output'
import { openSession } from '../session'
import type { CommandContext, CommandModule } from './types'

const HARD_TIMEOUT_MS = 60_000
const POLL_MS = 100

/** Everything the command needs from the machine, injected so tests run without a browser. */
export interface ExportDeps {
  candidates(): BrowserCandidate[]
  launch(candidate: BrowserCandidate, opts: { timeoutMs: number }): Promise<LaunchedBrowser>
  openPage(cdp: LaunchedBrowser['cdp'], url: string, opts: { injectScript: string; timeoutMs: number }): Promise<Page>
  startServer(dir: string): Promise<StaticServer>
  viewerDir(): string
  timeoutMs: number
}

const defaultDeps: ExportDeps = {
  candidates: () => listCandidates(process.platform, systemProbe()),
  launch: launchBrowser,
  openPage,
  startServer: startStaticServer,
  viewerDir: () => resolveViewerDir(),
  timeoutMs: HARD_TIMEOUT_MS,
}

type ExportReply = { ok: true; mime: string; base64: string } | { ok: false; error: string }

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Waits for the viewer to report ready (or an input error), within `deadline`. */
async function waitReady(page: Page, deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    const state = await page.evaluate<{ ready: boolean; error: string | null }>(
      '({ ready: window.__c4heroExportReady === true, error: window.__c4heroExportError ?? null })',
    )
    if (state.error) throw new CliFailure('VALIDATION', `The export viewer rejected the workspace: ${state.error}`)
    if (state.ready) return
    await sleep(POLL_MS)
  }
  throw new Error('Timed out waiting for the export viewer to become ready')
}

interface Job {
  injectScript: string
  request: { view: string; format: 'png' | 'svg'; theme: 'light' | 'dark'; padding?: number }
  deadline: number
  /** Browsers launched so far; the command closes any still open when it ends (close is idempotent). */
  launched: LaunchedBrowser[]
}

async function renderWith(deps: ExportDeps, candidate: BrowserCandidate, url: string, job: Job): Promise<Buffer> {
  const remaining = () => Math.max(1000, job.deadline - Date.now())
  const browser = await deps.launch(candidate, { timeoutMs: remaining() })
  job.launched.push(browser)
  try {
    const page = await deps.openPage(browser.cdp, url, { injectScript: job.injectScript, timeoutMs: remaining() })
    await waitReady(page, job.deadline)
    const reply = await page.evaluate<ExportReply>(`window.__c4heroExport(${JSON.stringify(job.request)})`, true)
    if (!reply.ok) throw new CliFailure('VALIDATION', `Export failed: ${reply.error}`)
    return Buffer.from(reply.base64, 'base64')
  } finally {
    await browser.close()
  }
}

function envFailure(detail: string): CliFailure {
  return new CliFailure(
    'EXPORT_ENV',
    `${detail} Install a Chromium-based browser (Chrome, Edge, Brave, Chromium) or point C4HERO_BROWSER at its binary.`,
  )
}

export function createExportCommand(deps: ExportDeps): CommandModule {
  return {
    name: 'export',
    summary: 'Render a view to a PNG or SVG file using a local Chromium-based browser',
    flags: { values: ['view', 'format', 'theme', 'out', 'padding'] },
    usage:
      'export --view <key> --format png|svg [--theme light|dark] [--out <path>] [--padding <fraction, default 0.05>] [--file <dsl>]',
    async run(args: ParsedArgs, ctx: CommandContext): Promise<CliResult> {
      const view = flag(args, 'view')
      if (!view) throw new CliFailure('USAGE', '--view <key> is required')
      const format = flag(args, 'format')
      if (format !== 'png' && format !== 'svg') throw new CliFailure('USAGE', '--format must be png or svg')
      const theme = flag(args, 'theme') ?? 'light'
      if (theme !== 'light' && theme !== 'dark') throw new CliFailure('USAGE', '--theme must be light or dark')
      const paddingRaw = flag(args, 'padding')
      const padding = paddingRaw === undefined ? undefined : Number(paddingRaw)
      if (padding !== undefined && !(Number.isFinite(padding) && padding >= 0)) {
        throw new CliFailure('USAGE', '--padding must be a non-negative fraction of the canvas, e.g. 0.05')
      }

      const file = discoverWorkspace({ file: flag(args, 'file'), cwd: ctx.cwd })
      const session = openSession(file, { force: true })
      const ws = session.workspace()
      if (!findViewHelper(ws, view)) {
        throw new CliFailure('NOT_FOUND', `No view '${view}'.`, allViewsOf(ws).map((v) => v.key))
      }

      const root = projectRootFor(session.file)
      const outFlag = flag(args, 'out')
      const out = outFlag ? path.resolve(ctx.cwd, outFlag) : path.join(path.dirname(session.file), `${view}.${format}`)
      if (!isInsideRoot(root, out) || !isInsideRootReal(root, out)) {
        throw new CliFailure('USAGE', `--out '${outFlag ?? out}' resolves outside the project root ${root}.`)
      }
      if (path.extname(out).toLowerCase() !== `.${format}`) {
        throw new CliFailure('USAGE', `--out '${outFlag ?? out}' must end in .${format} to match --format ${format}.`)
      }
      if (hasHiddenSegment(path.relative(root, out))) {
        throw new CliFailure('USAGE', `--out '${outFlag ?? out}' must not contain hidden ('.'-prefixed) path segments.`)
      }

      const candidates = deps.candidates()
      if (candidates.length === 0) throw envFailure('No Chromium-based browser was found.')

      const sidecarPath = path.join(path.dirname(session.file), sidecarName(path.basename(session.file)))
      const input = {
        dsl: readFileSync(session.file, 'utf8'),
        sidecar: existsSync(sidecarPath) ? readFileSync(sidecarPath, 'utf8') : null,
        name: path.basename(session.file, path.extname(session.file)),
      }
      const deadline = Date.now() + deps.timeoutMs
      const job: Job = {
        injectScript: `window.__C4HERO_EXPORT_INPUT__ = ${JSON.stringify(input)};`,
        request: { view, format, theme, ...(padding !== undefined ? { padding } : {}) },
        deadline,
        launched: [],
      }

      const warnings: string[] = []
      let timer: ReturnType<typeof setTimeout> | undefined
      const server = await deps.startServer(deps.viewerDir())
      try {
        const work = (async () => {
          const failures: string[] = []
          for (const candidate of candidates) {
            try {
              const bytes = await renderWith(deps, candidate, server.url, job)
              return { candidate, bytes }
            } catch (e) {
              if (e instanceof CliFailure) throw e
              failures.push(`${candidate.name}: ${e instanceof Error ? e.message : String(e)}`)
            }
          }
          throw envFailure(`Could not export with any browser (${failures.join('; ')}).`)
        })()
        work.catch(() => {})
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(envFailure(`Export timed out after ${deps.timeoutMs / 1000}s.`)), deps.timeoutMs)
        })
        const { candidate, bytes } = await Promise.race([work, timeout])
        if (candidate.warning) warnings.push(candidate.warning)
        mkdirSync(path.dirname(out), { recursive: true })
        writeFileSync(out, bytes)
        return {
          ok: true,
          command: 'export',
          file: session.file,
          data: { view, format, out, bytes: bytes.length, browser: { name: candidate.name, source: candidate.source } },
          warnings,
        }
      } finally {
        clearTimeout(timer)
        await Promise.allSettled(job.launched.map((b) => b.close()))
        await server.close()
      }
    },
  }
}

export const exportCommands: CommandModule[] = [createExportCommand(defaultDeps)]
