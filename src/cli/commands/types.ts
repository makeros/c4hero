import type { ParsedArgs } from '../args'
import type { CliResult } from '../output'

/** Execution context handed to every command. */
export interface CommandContext {
  cwd: string
}

/** Flag names (without `--`) one invocation form accepts, beyond the global `--file` and `--help`. */
export interface FlagSet {
  /** Flags that take a value (repeatable ones included). */
  values?: string[]
  /** Flags that never take a value; each must also be in BOOLEAN_FLAGS in args.ts. */
  booleans?: string[]
}

/** A command's flag declaration. `bySubcommand` is keyed by the first
 *  positional (`view add`, `deploy node add`: `node`), and adds to the base set. */
export interface CommandFlags extends FlagSet {
  bySubcommand?: Record<string, FlagSet>
}

/** Boolean flags every mutating command accepts. */
export const MUTATING_BOOLEANS = ['dry-run', 'force']

/** The contract every command module follows.
 *
 *  - One exported `CommandModule` (or an array of them) per file in
 *    `src/cli/commands/`; the registry in `commands/index.ts` collects them.
 *  - `run` resolves its workspace with `discoverWorkspace({ file: <--file>, cwd: ctx.cwd })`,
 *    opens a session (`force: true` for read-only commands), and returns a
 *    `CliResult` whose `command` is `name`.
 *  - Failures are thrown as `CliFailure`; the dispatcher turns them into
 *    `{ ok: false, error }`. Never write to stdout from a command.
 *  - `flags` declares every flag the command accepts; dispatch rejects any
 *    other with USAGE. Read flags only through `flag`/`flagAll`/`boolFlag`
 *    from `args.ts`, and register boolean flags in `args.ts`.
 *  - A mutating command reports `changed` only when `session.save` reports a change, else `{}`.
 */
export interface CommandModule {
  name: string
  summary: string
  usage: string
  flags: CommandFlags
  run(args: ParsedArgs, ctx: CommandContext): Promise<CliResult> | CliResult
}
