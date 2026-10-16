// PostToolUse hook: after Edit/Write/MultiEdit on a .dsl file, run
// `c4hero check` and report parse/integrity errors to the agent (exit 2 + stderr).
// Non-fast check is used so lossy findings (parser-tolerated garbage) can be surfaced
// as a non-blocking stderr note; it measures ~40 ms on Big Bank, same as --fast.
// Infrastructure failures (CLI crash, timeout, unreadable output) never block: exit 0.
// Workspaces using `!include` are skipped: the CLI does not resolve includes, so
// every reference into an included file would be a false "Unresolved reference".
// Detection is a line-start regex (`^\s*!include\b`) on the edited file, not
// string/comment-aware; a commented-out `!include` only skips validation (fail open).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

function readFilePath() {
  try {
    const payload = JSON.parse(readFileSync(0, 'utf8'))
    const path = payload?.tool_input?.file_path
    return typeof path === 'string' ? path : null
  } catch {
    return null
  }
}

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'c4hero.mjs')

function usesInclude(filePath) {
  try {
    return /^\s*!include\b/m.test(readFileSync(filePath, 'utf8'))
  } catch {
    return false
  }
}

function runCheck(filePath) {
  let stdout
  try {
    stdout = execFileSync(process.execPath, [cli, 'check', '--file', filePath], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (err) {
    // The CLI exits non-zero when the check fails; its JSON is still on stdout.
    stdout = typeof err?.stdout === 'string' ? err.stdout : ''
  }
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

const filePath = readFilePath()
if (!filePath || !filePath.endsWith('.dsl')) process.exit(0)

if (usesInclude(filePath)) {
  process.stderr.write(`c4hero: validation skipped for ${filePath}: workspaces using !include are not validated.\n`)
  process.exit(0)
}

const result = runCheck(filePath)
const errors = result && result.ok === false ? result.data?.errors : null
if (!Array.isArray(errors) || errors.length === 0) {
  const lossy = (result?.data?.info ?? []).filter((i) => String(i.kind).startsWith('lossy-'))
  if (lossy.length > 0) {
    const notes = lossy.map((i) => `  ${i.message}`)
    process.stderr.write(`c4hero: ${filePath} has ${lossy.length} line(s) the model cannot represent (not blocking):\n${notes.join('\n')}\n`)
  }
  process.exit(0)
}

const lines = errors.map((e) => `  ${e.line ? `line ${e.line}: ` : ''}${e.message}`)
process.stderr.write(
  `c4hero: ${filePath} has ${errors.length} DSL error(s):\n${lines.join('\n')}\n` +
    `Fix the DSL, or run for details: node "${cli}" check --file "${filePath}"\n`,
)
process.exit(2)
