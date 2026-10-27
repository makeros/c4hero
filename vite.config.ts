import { defineConfig } from 'vitest/config'
import { createServer, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { execSync } from 'child_process'
import {
  contentTypeFor,
  docRelativePath,
  documentKind,
  docsRootFor,
  hasAssetExtension,
  hasHiddenSegment,
  isInsideRoot,
  isInsideRootReal,
  listDocumentFiles,
  resolveDocRequest,
} from './src/lib/docPath.ts'
import { DOC_CHANGED_EVENT, type DocChange } from './src/lib/docLiveReload.ts'
import { readFileSync, existsSync, statSync, readdirSync } from 'fs'
import type { ServerResponse } from 'node:http'
import { agentTerminalPlugin } from './dev-server/agentTerminalPlugin.ts'

// Set by scripts/build-plugin.mjs: builds the headless export viewer into
// plugins/c4hero/viewer/ (relative base, no PWA, no document collection, a
// fixed commit label so consecutive builds are byte-identical).
const exportBuild = process.env.C4HERO_EXPORT_BUILD === '1'

// Set by scripts/build-viewer.mjs (see the virtual:locked-workspace plugin
// below). The locked viewer is often deployed behind HTTP basic auth, where
// the service worker's precache requests are rejected and the worker fails
// to install. It also needs no offline support, so it ships a
// self-destroying worker instead (which also removes any previously installed
// one).
const lockedViewerBuild = Boolean(process.env.LOCKED_WORKSPACE_PATH)

const commitHash = exportBuild ? 'export' : execSync('git rev-parse --short HEAD').toString().trim()
const appVersion = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version

// Virtual module that bakes a single workspace's DSL (and optional sidecar)
// into a standalone "locked viewer" build. Resolves to `export default null`
// when LOCKED_WORKSPACE_PATH is unset, which is the case for every normal
// `npm run dev` / `npm run build` invocation — see scripts/build-viewer.mjs
// for how the env var gets set.
const LOCKED_WORKSPACE_VIRTUAL_ID = 'virtual:locked-workspace'
const LOCKED_WORKSPACE_RESOLVED_ID = '\0' + LOCKED_WORKSPACE_VIRTUAL_ID

// Fixed mount point every environment fetches a `documents[].path` link's raw
// markdown from (see specifications/document-links/document-links.plan.md's
// "File resolution — one URL shape, three environments"). Dev and the prod
// build are covered by the `document-links` plugin below; the locked viewer
// build (`npm run build:viewer`) is a separate script/plugin pairing.
const DOCS_MOUNT_PREFIX = '/__docs/'
const DOCS_INDEX_NAME = '__index.json'

// D2/D3: the iframe `sandbox` flags (HtmlDocumentFrame, Phase 3), repeated
// here as a `Content-Security-Policy: sandbox …` response header so a raw
// `/__docs/*.html` (or asset) request opened outside the iframe is isolated
// too, on any host that can set response headers. Never add
// `allow-same-origin` — see the plan's Security Considerations.
const DOCS_SANDBOX_CSP =
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation'

// Local mirror of `DocumentCopyPlan` (src/lib/documentCollection.ts) for the
// dev middleware's typed access to the `ssrLoadModule`-loaded module below —
// see the `closeBundle` hook's own typed `plan`/`writeDocumentCopies` locals
// for why a plain `import` of that module can't be used here instead.
interface DevDocumentCopyPlan {
  copies: Array<{ from: string; to: string; kind: 'markdown' | 'html' | 'asset' }>
  missing: string[]
  warnings: string[]
}

// Shared by the dev middleware's `getPlan` and `closeBundle`: the `*.dsl`
// files directly inside `dir` (non-recursive — matches `planDocumentCopies`'s
// own expectation of one workspace's top-level DSL files), absolute paths.
function listDslFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.dsl'))
    .map((name) => path.join(dir, name))
}

// `closeBundle` runs after `tsc -b`'s separate pass, inside the already-
// bundled `vite.config.ts` module — which means a plain `import` of
// `src/lib/documentCollection.ts` here can't resolve its own `@/*` aliases or
// extensionless `./dsl` import (Vite's config loader bundles this file with
// plain Node module resolution, not the app's `resolve.alias`/bundler-mode
// resolution). A short-lived, middleware-mode Vite dev server gives us that
// same alias/extension resolution to `ssrLoadModule` the real
// `planDocumentCopies` instead of reimplementing its DSL-parsing logic here.
let resolvedOutDir = 'dist'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Strip dev-only CSP relaxations from index.html in production builds.
    // Vite's HMR client uses eval() and a websocket connection, so the dev
    // server needs `unsafe-eval` in script-src and `ws:`/`wss:` in connect-src.
    // Production has neither, so the meta CSP can be tighter — matching the
    // strict Vercel response-header CSP for self-hosters who don't replicate
    // those headers on their origin.
    {
      name: 'tighten-csp-in-prod',
      transformIndexHtml: {
        order: 'pre' as const,
        handler(html: string, ctx: { server?: unknown }) {
          if (ctx.server) return html // dev — leave CSP loose for HMR
          return html
            .replace(" 'unsafe-eval'", '')
            .replace(' ws: wss:', '')
        },
      },
    },
    {
      name: 'locked-workspace',
      resolveId(id: string) {
        if (id === LOCKED_WORKSPACE_VIRTUAL_ID) return LOCKED_WORKSPACE_RESOLVED_ID
      },
      load(id: string) {
        if (id !== LOCKED_WORKSPACE_RESOLVED_ID) return
        const workspacePath = process.env.LOCKED_WORKSPACE_PATH
        if (!workspacePath) return 'export default null'
        const dsl = readFileSync(workspacePath, 'utf8')
        const sidecarPath = process.env.LOCKED_WORKSPACE_SIDECAR_PATH
        const sidecar = sidecarPath ? readFileSync(sidecarPath, 'utf8') : null
        const name = path.basename(workspacePath).replace(/\.dsl$/i, '')
        return `export default ${JSON.stringify({ dsl, sidecar, name })}`
      },
    },
    ...(exportBuild ? [] : [{
      name: 'document-links',
      configResolved(config) {
        resolvedOutDir = config.build.outDir
      },
      configureServer(server) {
        // Document-link paths are relative to the workspace's project root
        // (git root of the --workspace folder), not to this repo.
        const devWorkspace = process.env.VITE_DEV_WORKSPACE_PATH
        const docsRoot = devWorkspace ? docsRootFor(devWorkspace) : __dirname

        // Documents are served raw, outside the module graph, so HMR never
        // sees them — push a custom event instead (see src/lib/docLiveReload.ts).
        // The docs root usually lies outside Vite's root, hence the explicit
        // add; Vite's default `ignored` still skips .git and node_modules.
        server.watcher.add(docsRoot)
        const notifyDocChange = (kind: DocChange['kind']) => (file: string) => {
          const docPath = docRelativePath(docsRoot, file)
          if (!docPath) return
          server.ws.send({ type: 'custom', event: DOC_CHANGED_EVENT, data: { path: docPath, kind } satisfies DocChange })
        }
        server.watcher.on('change', notifyDocChange('change'))
        server.watcher.on('add', notifyDocChange('add'))
        server.watcher.on('unlink', notifyDocChange('unlink'))

        // D5: dev serves an HTML document or asset only when the build would
        // copy it too — computed by the same `planDocumentCopies`, from the
        // dev workspace's `*.dsl` files, and cached until a change that could
        // affect the plan invalidates it (below). A markdown edit can add or
        // remove an HTML link (D6) or change which `[[wikilink]]` falls back
        // to `.html` (D8), and an add/unlink of any document or asset changes
        // which subresources exist to crawl — so any document/asset path
        // under the docs root invalidates the cache, not just `.html`/`.css`.
        let cachedPlan: DevDocumentCopyPlan | null = null
        const invalidatePlanOn = (file: string): void => {
          const lower = file.toLowerCase()
          const isDsl = lower.endsWith('.dsl') && isInsideRoot(docsRoot, file)
          if (isDsl || docRelativePath(docsRoot, file) !== null) cachedPlan = null
        }
        server.watcher.on('add', invalidatePlanOn)
        server.watcher.on('change', invalidatePlanOn)
        server.watcher.on('unlink', invalidatePlanOn)

        // `documentCollection.ts` imports `@/store/workspace-helpers` and an
        // extensionless `./dsl`, which a plain `import` here can't resolve
        // (see the `closeBundle` hook's own comment on this); `htmlDocLinks.ts`
        // imports `./docLinks` the same extensionless way. `ssrLoadModule`
        // gives both their real alias/extension resolution instead.
        let modulesPromise: Promise<{
          planDocumentCopies: (dslFilePaths: string[], projectRoot: string) => DevDocumentCopyPlan
          servedPaths: (plan: DevDocumentCopyPlan) => Set<string>
          rewriteHtmlDocLinks: (html: string, docPath: string) => string
        }> | null = null
        const loadDocModules = () => {
          modulesPromise ??= (async () => {
            const collection = await server.ssrLoadModule('/src/lib/documentCollection.ts')
            const htmlLinks = await server.ssrLoadModule('/src/lib/htmlDocLinks.ts')
            const planDocumentCopies: (dslFilePaths: string[], projectRoot: string) => DevDocumentCopyPlan = collection.planDocumentCopies
            const servedPaths: (plan: DevDocumentCopyPlan) => Set<string> = collection.servedPaths
            const rewriteHtmlDocLinks: (html: string, docPath: string) => string = htmlLinks.rewriteHtmlDocLinks
            return { planDocumentCopies, servedPaths, rewriteHtmlDocLinks }
          })()
          return modulesPromise
        }

        const getPlan = async (): Promise<DevDocumentCopyPlan> => {
          if (cachedPlan) return cachedPlan
          const { planDocumentCopies } = await loadDocModules()
          const dslFilePaths = devWorkspace ? listDslFiles(devWorkspace) : []
          cachedPlan = planDocumentCopies(dslFilePaths, docsRoot)
          return cachedPlan
        }

        // HTML and asset responses (D5/D3): 404 unless the path is one the
        // build would copy, else served with the sandbox CSP header. HTML is
        // rewritten the same way `writeDocumentCopies` rewrites it for a
        // build, so a `.md` link inside it opens `/document-view` here too.
        const serveDocFileOrAsset = async (decoded: string, res: ServerResponse): Promise<void> => {
          const absolute = path.resolve(docsRoot, decoded)
          if (hasHiddenSegment(decoded) || !isInsideRoot(docsRoot, absolute)) {
            res.statusCode = 400
            res.end('Bad request')
            return
          }

          const [plan, { servedPaths, rewriteHtmlDocLinks }] = await Promise.all([getPlan(), loadDocModules()])
          const isServed =
            servedPaths(plan).has(decoded) &&
            existsSync(absolute) &&
            statSync(absolute).isFile() &&
            isInsideRootReal(docsRoot, absolute)
          if (!isServed) {
            res.statusCode = 404
            res.end('Not found')
            return
          }

          res.setHeader('Content-Security-Policy', DOCS_SANDBOX_CSP)
          res.setHeader('X-Content-Type-Options', 'nosniff')
          res.setHeader('Content-Type', contentTypeFor(decoded))
          res.statusCode = 200
          res.end(documentKind(decoded) === 'html' ? rewriteHtmlDocLinks(readFileSync(absolute, 'utf8'), decoded) : readFileSync(absolute))
        }

        server.middlewares.use((req, res, next) => {
          if (!req.url || !req.url.startsWith(DOCS_MOUNT_PREFIX)) return next()

          const encodedPath = req.url.slice(DOCS_MOUNT_PREFIX.length).split('?')[0]

          // Document file list for wikilink resolution (D8: markdown and
          // HTML). Can't collide with a document path: those must end in
          // .md/.markdown/.html/.htm.
          if (encodedPath === DOCS_INDEX_NAME) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(listDocumentFiles(docsRoot)))
            return
          }

          let decoded: string
          try {
            decoded = decodeURIComponent(encodedPath)
          } catch {
            res.statusCode = 400
            res.end('Bad request')
            return
          }

          if (documentKind(decoded) === 'html' || hasAssetExtension(decoded)) {
            serveDocFileOrAsset(decoded, res).catch(next)
            return
          }

          // Markdown keeps today's rule: any .md/.markdown file under the
          // docs root is served, independent of the DSL-derived plan.
          let absolute: string
          let rejected: boolean
          try {
            ;({ absolute, rejected } = resolveDocRequest(encodedPath, docsRoot))
          } catch {
            res.statusCode = 400
            res.end('Bad request')
            return
          }

          if (rejected) {
            res.statusCode = 400
            res.end('Bad request')
            return
          }

          if (!existsSync(absolute) || !statSync(absolute).isFile()) {
            res.statusCode = 404
            res.end('Not found')
            return
          }

          if (!isInsideRootReal(docsRoot, absolute)) {
            res.statusCode = 400
            res.end('Bad request')
            return
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
          res.end(readFileSync(absolute))
        })
      },
      async closeBundle() {
        // Optional: only set when `scripts/build-app.mjs` was invoked with
        // `--workspace <dir>` — the bare `npm run build` every current
        // deploy (Vercel, CI) runs leaves this unset, so collection is
        // skipped entirely with no warning, matching today's build exactly.
        const workspaceDir = process.env.DOCUMENT_WORKSPACE_DIR
        if (!workspaceDir) return

        const dslFilePaths = listDslFiles(workspaceDir)

        const server = await createServer({
          configFile: false,
          root: __dirname,
          resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
          server: { middlewareMode: true, hmr: false },
          optimizeDeps: { noDiscovery: true },
          logLevel: 'error',
        })

        let plan: DevDocumentCopyPlan
        let writeDocumentCopies: (plan: Pick<DevDocumentCopyPlan, 'copies'>, outDir: string) => void
        try {
          const collection = await server.ssrLoadModule('/src/lib/documentCollection.ts')
          writeDocumentCopies = collection.writeDocumentCopies
          plan = collection.planDocumentCopies(dslFilePaths, docsRootFor(workspaceDir))
        } finally {
          await server.close()
        }

        writeDocumentCopies(plan, path.resolve(__dirname, resolvedOutDir))
        for (const missingPath of plan.missing) {
          // Intentional: this is the plan's own Definition of Done ("logs a
          // console.warn per missing file") for Task 3.2.
          // eslint-disable-next-line no-console
          console.warn(
            `[document-links] referenced document not found (or resolves outside the project root), skipped: ${missingPath}`,
          )
        }
        for (const warning of plan.warnings) {
          // eslint-disable-next-line no-console
          console.warn(`[document-links] ${warning}`)
        }
      },
    } satisfies Plugin]),
    ...(exportBuild ? [] : [agentTerminalPlugin()]),
    ...(exportBuild ? [] : [VitePWA({
      registerType: 'autoUpdate',
      selfDestroying: lockedViewerBuild,
      // Without `crossorigin="use-credentials"` browsers fetch the manifest
      // without credentials, so it fails behind basic auth.
      useCredentials: true,
      includeAssets: ['c4-logo.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'c4hero',
        short_name: 'c4hero',
        description: 'Design, document, and share software architecture with C4 model diagrams. Local-first, open source.',
        theme_color: '#0d1117',
        background_color: '#0d1117',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // `__docs/` is author-controlled document/asset output, never app
        // shell: it must not be precached, and the SPA navigation fallback
        // must not serve `index.html` for a direct/iframe navigation to it
        // (see the plan's "Service worker" section and Security
        // Considerations — the service worker could otherwise defeat the
        // sandbox by answering the iframe's navigation with the app shell).
        globIgnores: ['**/c4-logo.svg', '**/favicon.svg', '__docs/**'],
        navigateFallbackDenylist: [/^\/__docs\//],
      },
      devOptions: { enabled: false },
    })]),
  ],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __APP_VERSION__: JSON.stringify(appVersion),
    __EXPORT_MODE__: JSON.stringify(exportBuild),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: exportBuild ? './' : '/',
  publicDir: exportBuild ? false : 'public',
  build: {
    ...(exportBuild ? { outDir: 'plugins/c4hero/viewer', emptyOutDir: true } : {}),
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-router')) return 'react-vendor'
          if (/[\\/]react(?:-dom)?[\\/]/.test(id)) return 'react-vendor'
          if (id.includes('@xyflow')) return 'xyflow'
          if (id.includes('@dagrejs/dagre')) return 'dagre'
        },
      },
    },
  },
  server: {
    port: 3004,
    strictPort: true,
    // Extra hostnames the dev server will serve when proxied (e.g. a tunnel
    // or reverse-proxy domain). Comma-separated; unset for localhost dev.
    allowedHosts:
      process.env.VITE_ALLOWED_HOSTS?.split(',')
        .map((h) => h.trim())
        .filter(Boolean) ?? [],
    // HMR over wss:443 is only correct when served via Cloudflare Tunnel.
    // For plain localhost dev (and E2E), leave HMR as the default so the
    // browser connects to ws://localhost:3004 without errors.
    hmr: process.env.VITE_HMR_TUNNEL
      ? { clientPort: 443, protocol: 'wss' }
      : undefined,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/main.tsx',
        'src/types/**',
        'src/components/welcome/mocks/**',
      ],
      // Baseline thresholds set at current measured values rounded down.
      // CI will fail on regression, but won't block until coverage actually
      // drops. As coverage rises (UI components are the laggard), tighten
      // these gates. The src/lib and src/store layers are already well above
      // 90% — the floor here is dragged down by component-level UI tests.
      // Re-baselined for @vitest/coverage-v8 v4 (same actual coverage; v4
      // counts arrow functions, type-emitted branches, and synthetic
      // accessors that v3 missed, so the headline numbers are stricter).
      thresholds: {
        statements: 48,
        branches: 44,
        functions: 39,
        lines: 52,
      },
    },
  },
})
