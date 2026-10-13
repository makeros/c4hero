/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface BrowserCandidate {
  name: string
  path: string
  source: 'env' | 'default' | 'fallback'
  warning?: string
}

/** Everything resolveBrowser needs from the machine, injected so tests can fake it. */
export interface SystemProbe {
  env: Record<string, string | undefined>
  home: string
  fileExists(path: string): boolean
  /** Raw OS answer: macOS bundle id, Linux .desktop name, Windows ProgId. */
  readDefaultBrowserId(): string | null
  which?(cmd: string): string | null
}

interface BrowserSpec {
  name: string
  /** Matched against the lowercased default-browser id. More specific specs come first. */
  id: RegExp
  mac: string[]
  linux: string[]
  win: string[]
}

// Priority order of fallbacks. Arc may not support headless reliably: it is
// preferred when it is the OS default, but the export command retries the next
// entry of listCandidates() when launching a candidate fails.
const BROWSERS: BrowserSpec[] = [
  { name: 'Google Chrome Canary', id: /chrome.*canary/, mac: ['Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'], linux: [], win: ['Google\\Chrome SxS\\Application\\chrome.exe'] },
  { name: 'Google Chrome Beta', id: /chrome.*beta/, mac: ['Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta'], linux: ['google-chrome-beta'], win: ['Google\\Chrome Beta\\Application\\chrome.exe'] },
  { name: 'Google Chrome', id: /chrome(?!.*(canary|beta))/, mac: ['Google Chrome.app/Contents/MacOS/Google Chrome'], linux: ['google-chrome', 'google-chrome-stable'], win: ['Google\\Chrome\\Application\\chrome.exe'] },
  { name: 'Microsoft Edge', id: /edge/, mac: ['Microsoft Edge.app/Contents/MacOS/Microsoft Edge'], linux: ['microsoft-edge', 'microsoft-edge-stable'], win: ['Microsoft\\Edge\\Application\\msedge.exe'] },
  { name: 'Brave', id: /brave/, mac: ['Brave Browser.app/Contents/MacOS/Brave Browser'], linux: ['brave-browser', 'brave'], win: ['BraveSoftware\\Brave-Browser\\Application\\brave.exe'] },
  { name: 'Arc', id: /thebrowser|^arc/, mac: ['Arc.app/Contents/MacOS/Arc'], linux: [], win: [] },
  { name: 'Chromium', id: /chromium/, mac: ['Chromium.app/Contents/MacOS/Chromium'], linux: ['chromium', 'chromium-browser'], win: ['Chromium\\Application\\chrome.exe'] },
  { name: 'Vivaldi', id: /vivaldi/, mac: ['Vivaldi.app/Contents/MacOS/Vivaldi'], linux: ['vivaldi', 'vivaldi-stable'], win: ['Vivaldi\\Application\\vivaldi.exe'] },
  { name: 'Opera', id: /opera/, mac: ['Opera.app/Contents/MacOS/Opera'], linux: ['opera'], win: ['Opera\\opera.exe'] },
]

function findInstalled(spec: BrowserSpec, platform: NodeJS.Platform, probe: SystemProbe): string | null {
  if (platform === 'darwin') {
    for (const dir of ['/Applications', join(probe.home, 'Applications')]) {
      for (const rel of spec.mac) {
        const p = join(dir, rel)
        if (probe.fileExists(p)) return p
      }
    }
    return null
  }
  if (platform === 'win32') {
    const roots = [probe.env.ProgramFiles, probe.env['ProgramFiles(x86)'], probe.env.LOCALAPPDATA].filter(
      (r): r is string => !!r,
    )
    for (const root of roots) {
      for (const rel of spec.win) {
        const p = `${root}\\${rel}`
        if (probe.fileExists(p)) return p
      }
    }
    return null
  }
  for (const cmd of spec.linux) {
    const found = probe.which?.(cmd) ?? ['/usr/bin', '/usr/local/bin', '/snap/bin'].map((d) => `${d}/${cmd}`).find((p) => probe.fileExists(p))
    if (found) return found
  }
  return null
}

/** All usable browsers in priority order: C4HERO_BROWSER, the OS default when
 *  Chromium-family, then every other installed Chromium-family browser. */
export function listCandidates(platform: NodeJS.Platform, probe: SystemProbe): BrowserCandidate[] {
  const out: BrowserCandidate[] = []
  const seen = new Set<string>()
  const push = (c: BrowserCandidate) => {
    if (seen.has(c.path)) return
    seen.add(c.path)
    out.push(c)
  }

  const override = probe.env.C4HERO_BROWSER
  let envWarning: string | undefined
  if (override) {
    if (probe.fileExists(override)) push({ name: 'C4HERO_BROWSER', path: override, source: 'env' })
    else envWarning = `C4HERO_BROWSER=${override} does not exist and was ignored.`
  }

  const defaultId = probe.readDefaultBrowserId()
  const defaultSpec = defaultId ? BROWSERS.find((b) => b.id.test(defaultId.toLowerCase())) : undefined
  const defaultPath = defaultSpec ? findInstalled(defaultSpec, platform, probe) : null
  if (defaultSpec && defaultPath) push({ name: defaultSpec.name, path: defaultPath, source: 'default' })

  let warning = envWarning
  if (!defaultPath) {
    const why = defaultId
      ? defaultSpec
        ? `Default browser ${defaultSpec.name} was not found on disk`
        : `Default browser (${defaultId}) is not Chromium-based and cannot be driven headless`
      : 'Could not determine the default browser'
    warning = [envWarning, `${why}; using another installed Chromium-based browser.`].filter(Boolean).join(' ')
  }
  for (const spec of BROWSERS) {
    const p = findInstalled(spec, platform, probe)
    if (p) push({ name: spec.name, path: p, source: 'fallback', ...(warning ? { warning } : {}) })
  }
  return out
}

export function resolveBrowser(platform: NodeJS.Platform, probe: SystemProbe): BrowserCandidate | null {
  return listCandidates(platform, probe)[0] ?? null
}

/** Pure parser for `defaults read ...launchservices.secure LSHandlers` output. */
export function parseMacDefaultHandler(text: string): string | null {
  for (const raw of text.split(/^\s*\{\s*$/m)) {
    const entry = raw.replace(/=\s*\{[^{}]*\}\s*;/g, '') // drop nested dicts (LSHandlerPreferredVersions)
    if (!/LSHandlerURLScheme\s*=\s*"?https"?\s*;/.test(entry)) continue
    const m = /LSHandlerRoleAll\s*=\s*"?([^";\s]+)"?\s*;/.exec(entry)
    if (m) return m[1]
  }
  return null
}

function run(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

export function systemProbe(platform: NodeJS.Platform = process.platform): SystemProbe {
  const home = homedir()
  return {
    env: process.env,
    home,
    fileExists: (p) => existsSync(p),
    which: platform === 'win32' ? undefined : (cmd) => run('which', [cmd])?.trim() || null,
    readDefaultBrowserId() {
      if (platform === 'darwin') {
        const out = run('defaults', ['read', join(home, 'Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure'), 'LSHandlers'])
        return out ? parseMacDefaultHandler(out) : null
      }
      if (platform === 'win32') {
        const out = run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId'])
        return out ? (/ProgId\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? null) : null
      }
      return run('xdg-settings', ['get', 'default-web-browser'])?.trim() || null
    },
  }
}
