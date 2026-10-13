/// <reference types="node" />

export interface CliError {
  code: string
  message: string
  candidates?: string[]
}

export interface CliResult {
  ok: boolean
  command: string
  file?: string
  changed?: { elements?: string[]; relationships?: string[]; views?: string[]; styles?: string[] }
  data?: unknown
  warnings: string[]
  error?: CliError
}

export const EXIT = {
  OK: 0,
  USAGE: 1,
  VALIDATION: 2,
  LOSSY: 3,
  EXPORT_ENV: 4,
  INTERNAL: 5,
} as const

const EXIT_BY_CODE: Record<string, number> = {
  USAGE: EXIT.USAGE,
  UNKNOWN_COMMAND: EXIT.USAGE,
  NOT_FOUND: EXIT.USAGE,
  AMBIGUOUS: EXIT.USAGE,
  MULTIPLE_WORKSPACES: EXIT.USAGE,
  PARSE_FAILED: EXIT.VALIDATION,
  VALIDATION: EXIT.VALIDATION,
  LOSSY_FILE: EXIT.LOSSY,
  EXPORT_ENV: EXIT.EXPORT_ENV,
  INTERNAL: EXIT.INTERNAL,
}

export function exitCodeFor(result: CliResult): number {
  if (result.ok) return EXIT.OK
  return EXIT_BY_CODE[result.error?.code ?? ''] ?? EXIT.USAGE
}

export function formatResult(result: CliResult, pretty: boolean): string {
  if (!pretty) return JSON.stringify(result)
  const lines = [
    `${result.ok ? 'OK' : 'ERROR'} ${result.command}`,
    ...(result.error ? [`  ${result.error.code}: ${result.error.message}`] : []),
    ...(result.error?.candidates ?? []).map((c) => `    - ${c}`),
    ...result.warnings.map((w) => `  warning: ${w}`),
  ]
  if (result.data !== undefined) lines.push(JSON.stringify(result.data, null, 2))
  return lines.join('\n')
}

/** The single stdout writer; returns the process exit code. */
export function printResult(result: CliResult, pretty: boolean): number {
  process.stdout.write(formatResult(result, pretty) + '\n')
  return exitCodeFor(result)
}
