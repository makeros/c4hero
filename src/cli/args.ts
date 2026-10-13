export interface ParsedArgs {
  command: string | undefined
  positionals: string[]
  flags: Record<string, string[]>
  pretty: boolean
}

// Flags that never take a value, so `--dry-run foo` leaves `foo` positional.
const BOOLEAN_FLAGS = new Set(['pretty', 'dry-run', 'force', 'fast', 'external', 'create', 'help', 'response', 'overwrite'])

/** Splits argv into a subcommand, positionals and flags. Repeated flags accumulate in order. */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = []
  const flags: Record<string, string[]> = {}
  let pretty = false

  const push = (name: string, value: string) => {
    ;(flags[name] ??= []).push(value)
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (!arg.startsWith('--') || arg === '--') {
      positionals.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
    if (name === 'pretty') {
      pretty = !(eq !== -1 && arg.slice(eq + 1) === 'false')
      continue
    }
    if (eq !== -1) {
      push(name, arg.slice(eq + 1))
    } else if (BOOLEAN_FLAGS.has(name)) {
      push(name, 'true')
    } else {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        push(name, 'true')
      } else {
        push(name, next)
        i++
      }
    }
  }

  const [command, ...rest] = positionals
  return { command, positionals: rest, flags, pretty }
}

/** The last value given for a value flag. */
export function flag(args: ParsedArgs, name: string): string | undefined {
  const values = args.flags[name]
  return values?.[values.length - 1]
}

/** Every value given for a repeatable value flag, in order. */
export function flagAll(args: ParsedArgs, name: string): string[] {
  return args.flags[name] ?? []
}

/** The one accessor for boolean flags: present means true, `--name=false` means false. */
export function boolFlag(args: ParsedArgs, name: string): boolean {
  const value = flag(args, name)
  return value !== undefined && value !== 'false'
}

/** Flags that never take a value; commands declare theirs in `CommandModule.flags.booleans`. */
export const BOOLEAN_FLAG_NAMES: ReadonlySet<string> = BOOLEAN_FLAGS
