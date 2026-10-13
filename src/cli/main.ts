/// <reference types="node" />
import { parseArgs, type ParsedArgs } from './args'
import { COMMANDS } from './commands'
import type { CommandModule } from './commands/types'
import { CliFailure } from './errors'
import { acceptedFlags, formatHelp, helpFor, helpIndex } from './help'
import { exitCodeFor, formatResult, type CliResult } from './output'

declare const __CLI_VERSION__: string | undefined

const VERSION = typeof __CLI_VERSION__ === 'string' ? __CLI_VERSION__ : 'dev'

export interface CliIo {
  cwd: string
  stdout: (text: string) => void
  /** Diagnostics channel; stack traces go here, and only when C4HERO_DEBUG=1. */
  stderr?: (text: string) => void
}

function failure(command: string, err: CliFailure): CliResult {
  return { ok: false, command, warnings: [], error: err.toCliError() }
}

/** USAGE failure for any flag the command does not declare. */
function rejectUnknownFlags(mod: CommandModule, args: ParsedArgs): void {
  const accepted = acceptedFlags(mod, args.positionals[0])
  if (accepted === null) return
  const known = new Set(accepted.map((f) => f.name))
  const unknown = Object.keys(args.flags).filter((name) => !known.has(name))
  if (unknown.length === 0) return
  throw new CliFailure(
    'USAGE',
    `Unknown flag${unknown.length > 1 ? 's' : ''} ${unknown.map((f) => `--${f}`).join(', ')} for '${mod.name}'. Run 'c4hero help ${mod.name}'.`,
    accepted.map((f) => `--${f.name}${f.boolean ? '' : ' <value>'}`),
  )
}

async function dispatch(argv: string[], cwd: string): Promise<{ result: CliResult; pretty: boolean; cause?: unknown }> {
  const args = parseArgs(argv)
  const { command, pretty } = args
  try {
    if (command === 'version') {
      return { result: { ok: true, command, data: { version: VERSION }, warnings: [] }, pretty }
    }
    if (command === 'help') {
      const target = args.positionals[0]
      return { result: target ? helpFor(COMMANDS, target) : helpIndex(COMMANDS), pretty }
    }
    if (command === undefined && args.flags['help']) return { result: helpIndex(COMMANDS), pretty }
    const mod = COMMANDS.find((c) => c.name === command)
    if (mod) {
      if (args.flags['help']) return { result: helpFor(COMMANDS, mod.name), pretty }
      rejectUnknownFlags(mod, args)
      return { result: await mod.run(args, { cwd }), pretty }
    }
    return {
      result: {
        ok: false,
        command: command ?? '',
        warnings: [],
        error: {
          code: command ? 'UNKNOWN_COMMAND' : 'USAGE',
          message: command ? `Unknown command '${command}'. Run 'c4hero help'.` : "No command given. Run 'c4hero help'.",
        },
      },
      pretty,
    }
  } catch (err) {
    if (err instanceof CliFailure) return { result: failure(command ?? '', err), pretty }
    return { result: internalFailure(command ?? '', err), pretty, cause: err }
  }
}

function internalFailure(command: string, err: unknown): CliResult {
  const message = err instanceof Error ? err.message : String(err)
  return { ok: false, command, warnings: [], error: { code: 'INTERNAL', message: `Unexpected error: ${message}` } }
}

/** Runs one CLI invocation and returns the process exit code. Side effects are
 *  limited to the injected `stdout`, so tests can call it in-process. */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const { result, pretty, cause } = await dispatch(argv, io.cwd)
  if (cause !== undefined && process.env.C4HERO_DEBUG === '1') {
    io.stderr?.(`${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}\n`)
  }
  const text = pretty && result.ok && result.command === 'help' ? formatHelp(result) : formatResult(result, pretty)
  io.stdout(text + '\n')
  return exitCodeFor(result)
}
