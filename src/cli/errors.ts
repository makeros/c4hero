import type { CliError } from './output'

/** A failure a command reports as `error` in its CliResult. `code` must be one
 *  of the strings in output.ts's exit-code map. */
export class CliFailure extends Error {
  readonly code: string
  readonly candidates?: string[]

  constructor(code: string, message: string, candidates?: string[]) {
    super(message)
    this.name = 'CliFailure'
    this.code = code
    this.candidates = candidates
  }

  toCliError(): CliError {
    return { code: this.code, message: this.message, ...(this.candidates ? { candidates: this.candidates } : {}) }
  }
}

export class LossyFileError extends CliFailure {
  constructor(findings: string[]) {
    super(
      'LOSSY_FILE',
      'Rewriting this file would drop content c4hero does not model. Edit the DSL by hand, or pass --force to accept the loss.',
      findings,
    )
  }
}

export class ParseFailedError extends CliFailure {
  constructor(message: string, errors: string[]) {
    super('PARSE_FAILED', message, errors)
  }
}
