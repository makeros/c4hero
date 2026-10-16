import { lex } from '@/lib/dsl/lexer'
import { parseDSL } from '@/lib/dsl'

export interface LossyFinding {
  line: number
  kind: 'comment' | 'directive' | 'unmodelled'
  text: string
}

/** The only `!` directive that survives a parse and serialize round trip
 *  (the parser stores it as `workspace.impliedRelationships`, the serializer
 *  writes it back). Every other directive (`!include`, `!const`, `!var`,
 *  `!identifiers`, `!docs`, `!adrs`, `!script`, `!element`, ...) is dropped. */
const ROUND_TRIPPING_DIRECTIVE = /^!impliedRelationships\s+(true|false)\s*$/

/** Everything a canonical rewrite of `source` would silently drop, ordered by
 *  line. Three sources, all driven by the real lexer and parser so `#` in hex
 *  colors and `//` inside strings are never mistaken for comments:
 *  - comment tokens (line `//`, line `#`, and block comments), which the lexer discards;
 *  - `!` directives, which the lexer keeps as opaque lines;
 *  - statements the parser consumed without modelling (`branding`,
 *    `terminology`, `animation`, `users`, unknown keywords, ...). */
export function findLossyConstructs(source: string): LossyFinding[] {
  const findings: LossyFinding[] = []
  for (const token of lex(source).tokens) {
    if (token.type === 'COMMENT') {
      findings.push({ line: token.line, kind: 'comment', text: firstLine(token.value) })
    } else if (token.type === 'KEYWORD' && token.value.startsWith('!') && !ROUND_TRIPPING_DIRECTIVE.test(token.value)) {
      findings.push({ line: token.line, kind: 'directive', text: token.value.trim() })
    }
  }
  for (const skipped of parseDSL(source).skipped) {
    findings.push({ line: skipped.line, kind: 'unmodelled', text: skipped.text })
  }
  return findings.sort((a, b) => a.line - b.line)
}

export function describeFinding(f: LossyFinding): string {
  return `line ${f.line}: ${f.kind} \`${f.text}\``
}

function firstLine(text: string): string {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : `${text.slice(0, nl)} ...`
}
