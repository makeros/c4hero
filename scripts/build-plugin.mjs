#!/usr/bin/env node
// Builds the committed plugin artifacts under plugins/c4hero/: the CLI bundle
// (bin/c4hero.mjs) and the export viewer (viewer/), the real app built with
// EXPORT_MODE on (see vite.config.ts).
// Usage: npm run build:plugin

import { chmodSync } from 'node:fs'
import path from 'node:path'
import { build } from 'vite'

const root = path.resolve(import.meta.dirname, '..')

await build({ configFile: path.join(root, 'vite.cli.config.ts'), logLevel: 'warn' })
chmodSync(path.join(root, 'plugins/c4hero/bin/c4hero.mjs'), 0o755)

process.env.C4HERO_EXPORT_BUILD = '1'
await build({ configFile: path.join(root, 'vite.config.ts'), logLevel: 'warn' })
