import type { CliResult } from './output'
import { CliFailure } from './errors'
import type { CommandFlags, CommandModule, FlagSet } from './commands/types'

const GLOBAL_FLAGS = ['--pretty (human-readable output)', '--file <dsl> (workspace file; discovered from the cwd when omitted)', '--help']

export interface AcceptedFlag {
  name: string
  boolean: boolean
}

const GLOBAL_ACCEPTED: AcceptedFlag[] = [
  { name: 'file', boolean: false },
  { name: 'help', boolean: true },
]

function fromSet(set: FlagSet): AcceptedFlag[] {
  return [
    ...(set.values ?? []).map((name) => ({ name, boolean: false })),
    ...(set.booleans ?? []).map((name) => ({ name, boolean: true })),
  ]
}

/** Every flag `mod` accepts for the invocation whose first positional is `sub`:
 *  global flags, the command's own, and the subcommand's. Null when `sub` is not
 *  a declared subcommand, so the command itself reports the bad subcommand. */
export function acceptedFlags(mod: { flags: CommandFlags }, sub: string | undefined): AcceptedFlag[] | null {
  const { bySubcommand, ...base } = mod.flags
  let extra: FlagSet = {}
  if (bySubcommand) {
    if (sub === undefined || !(sub in bySubcommand)) return null
    extra = bySubcommand[sub]
  }
  const merged = new Map<string, AcceptedFlag>()
  for (const f of [...GLOBAL_ACCEPTED, ...fromSet(base), ...fromSet(extra)]) merged.set(f.name, f)
  return [...merged.values()]
}

/** Per-invocation flag lists for `help <cmd>`, generated from the same declaration dispatch validates. */
function flagLists(mod: CommandModule): Record<string, string[]> {
  const render = (flags: AcceptedFlag[]) => flags.filter((f) => !GLOBAL_ACCEPTED.some((g) => g.name === f.name)).map((f) => `--${f.name}${f.boolean ? '' : ' <value>'}`)
  if (!mod.flags.bySubcommand) return { '': render(acceptedFlags(mod, undefined) ?? []) }
  return Object.fromEntries(Object.keys(mod.flags.bySubcommand).map((sub) => [sub, render(acceptedFlags(mod, sub) ?? [])]))
}

/** Splits a usage string into one line per invocation form. */
function usageLines(usage: string): string[] {
  return usage
    .split('\n')
    .flatMap((line) => line.split(' | '))
    .map((l) => l.trim())
    .filter(Boolean)
}

/** `c4hero help`: every command with its summary. */
export function helpIndex(commands: CommandModule[]): CliResult {
  return {
    ok: true,
    command: 'help',
    warnings: [],
    data: {
      usage: 'c4hero <command> [args] [flags]   |   c4hero help <command>   |   c4hero <command> --help',
      globalFlags: GLOBAL_FLAGS,
      commands: [
        ...commands.map((c) => ({ name: c.name, summary: c.summary })),
        { name: 'version', summary: 'Print the CLI version' },
        { name: 'help', summary: 'List commands, or show usage for one' },
      ],
    },
  }
}

/** `c4hero help <cmd>` / `c4hero <cmd> --help`: usage forms for one command. */
export function helpFor(commands: CommandModule[], name: string): CliResult {
  const mod = commands.find((c) => c.name === name)
  if (!mod) {
    throw new CliFailure('NOT_FOUND', `Unknown command '${name}'`, commands.map((c) => c.name))
  }
  return {
    ok: true,
    command: 'help',
    warnings: [],
    data: { name: mod.name, summary: mod.summary, usage: usageLines(mod.usage), flags: flagLists(mod), globalFlags: GLOBAL_FLAGS },
  }
}

/** Human rendering for `--pretty`. */
export function formatHelp(result: CliResult): string {
  const data = result.data as {
    commands?: { name: string; summary: string }[]
    usage: string | string[]
    name?: string
    summary?: string
    globalFlags: string[]
    flags?: Record<string, string[]>
  }
  const lines: string[] = []
  if (data.commands) {
    const width = Math.max(...data.commands.map((c) => c.name.length))
    lines.push(`Usage: ${data.usage as string}`, '', 'Commands:')
    for (const c of data.commands) lines.push(`  ${c.name.padEnd(width)}  ${c.summary}`)
  } else {
    lines.push(`${data.name} - ${data.summary}`, '', 'Usage:')
    for (const u of data.usage as string[]) lines.push(`  c4hero ${u}`)
    for (const [sub, list] of Object.entries(data.flags ?? {})) {
      if (list.length > 0) lines.push('', `Flags${sub ? ` (${sub})` : ''}: ${list.join(' ')}`)
    }
  }
  lines.push('', 'Global flags:', ...data.globalFlags.map((f) => `  ${f}`))
  return lines.join('\n')
}
