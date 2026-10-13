#!/usr/bin/env node
// Addition for Task 4.3 (not in the plan's file list).
//
// Extracts the fenced DSL examples from the plugin skill references and runs each
// through the bundled CLI (`c4hero check`), failing on any error.
//
// Fence convention in the markdown files:
//   ```dsl           a COMPLETE workspace. Written to a temp file and checked.
//   ```dsl fragment  an excerpt (syntax shapes, partial snippets). Skipped.
// Any other info string is ignored.
//
// Usage: node scripts/check-skill-dsl-examples.mjs [file.md ...]
// Defaults to plugins/c4hero/skills/structurizr-dsl/references/dsl-syntax.md.
// Requires the bundle at plugins/c4hero/bin/c4hero.mjs (run `npm run build:plugin`).

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundle = path.join(root, 'plugins/c4hero/bin/c4hero.mjs')
const defaults = ['plugins/c4hero/skills/structurizr-dsl/references/dsl-syntax.md']
const files = (process.argv.slice(2).length ? process.argv.slice(2) : defaults).map((f) => path.resolve(root, f))

if (!existsSync(bundle)) {
  console.error(`Missing bundle ${bundle}; run npm run build:plugin first.`)
  process.exit(1)
}

function extract(markdown) {
  const blocks = []
  const re = /^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm
  for (let m; (m = re.exec(markdown)); ) {
    const info = m[1].trim()
    const line = markdown.slice(0, m.index).split('\n').length
    if (info === 'dsl') blocks.push({ line, code: m[2] })
  }
  return blocks
}

const tmp = mkdtempSync(path.join(tmpdir(), 'c4hero-skill-dsl-'))
let failures = 0
let checked = 0
try {
  for (const file of files) {
    for (const { line, code } of extract(readFileSync(file, 'utf8'))) {
      const dsl = path.join(tmp, `example-${checked}.dsl`)
      writeFileSync(dsl, code)
      checked++
      let out
      try {
        out = execFileSync('node', [bundle, 'check', '--file', dsl], { encoding: 'utf8' })
      } catch (err) {
        out = err.stdout ?? String(err)
      }
      let result
      try { result = JSON.parse(out) } catch { result = { ok: false, data: { errors: [{ message: out.trim() }] } } }
      const errors = result.data?.errors ?? []
      const label = `${path.relative(root, file)}:${line}`
      if (!result.ok || errors.length > 0) {
        failures++
        console.error(`FAIL ${label}`)
        for (const e of errors) console.error(`  ${e.line ? `line ${e.line}: ` : ''}${e.message}`)
      } else {
        console.log(`ok   ${label}`)
      }
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(`${checked} example(s) checked, ${failures} failed`)
if (checked === 0) { console.error('No complete ```dsl examples found.'); process.exit(1) }
process.exit(failures ? 1 : 0)
