import { defineConfig } from 'vitest/config'
import { createServer, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { execSync } from 'child_process'
import { docsRootFor, isInsideRootReal, resolveDocRequest } from './src/lib/docPath.ts'
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, copyFileSync } from 'fs'

// Set by scripts/build-plugin.mjs: builds the headless export viewer into
// plugins/c4hero/viewer/ (relative base, no PWA, no document collection, a
// fixed commit label so consecutive builds are byte-identical).
const exportBuild = process.env.C4HERO_EXPORT_BUILD === '1'

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
        server.middlewares.use((req, res, next) => {
          if (!req.url || !req.url.startsWith(DOCS_MOUNT_PREFIX)) return next()

          const encodedPath = req.url.slice(DOCS_MOUNT_PREFIX.length).split('?')[0]

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

        const dslFilePaths = readdirSync(workspaceDir)
          .filter((name) => name.toLowerCase().endsWith('.dsl'))
          .map((name) => path.join(workspaceDir, name))

        const server = await createServer({
          configFile: false,
          root: __dirname,
          resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
          server: { middlewareMode: true, hmr: false },
          optimizeDeps: { noDiscovery: true },
          logLevel: 'error',
        })

        let plan: { copies: Array<{ from: string; to: string }>; missing: string[] }
        try {
          const { planDocumentCopies } = await server.ssrLoadModule('/src/lib/documentCollection.ts')
          plan = planDocumentCopies(dslFilePaths, docsRootFor(workspaceDir))
        } finally {
          await server.close()
        }

        const outDirAbsolute = path.resolve(__dirname, resolvedOutDir)
        for (const { from, to } of plan.copies) {
          const dest = path.join(outDirAbsolute, to)
          mkdirSync(path.dirname(dest), { recursive: true })
          copyFileSync(from, dest)
        }
        for (const missingPath of plan.missing) {
          // Intentional: this is the plan's own Definition of Done ("logs a
          // console.warn per missing file") for Task 3.2.
          // eslint-disable-next-line no-console
          console.warn(
            `[document-links] referenced document not found (or resolves outside the project root), skipped: ${missingPath}`,
          )
        }
      },
    } satisfies Plugin]),
    ...(exportBuild ? [] : [VitePWA({
      registerType: 'autoUpdate',
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
        globIgnores: ['**/c4-logo.svg', '**/favicon.svg'],
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
