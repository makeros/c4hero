import { defineConfig } from 'vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf8')) as {
  version: string
}

// Bundles src/cli/bin.ts into one dependency-free Node ESM file. Run via
// scripts/build-plugin.mjs (`npm run build:plugin`). Deliberately does not
// import vite.config.ts: that one drags in PWA/React/Tailwind plugins.
export default defineConfig({
  publicDir: false,
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  define: { __CLI_VERSION__: JSON.stringify(version), 'process.env.NODE_ENV': '"production"' },
  build: {
    ssr: path.resolve(import.meta.dirname, 'src/cli/bin.ts'),
    target: 'node22',
    outDir: 'plugins/c4hero/bin',
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'c4hero.mjs',
        banner: '#!/usr/bin/env node',
        codeSplitting: false,
      },
    },
  },
  ssr: { noExternal: true },
})
