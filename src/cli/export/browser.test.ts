/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { listCandidates, parseMacDefaultHandler, resolveBrowser, type SystemProbe } from './browser'

function probe(over: Partial<SystemProbe> & { files?: string[]; bins?: Record<string, string> } = {}): SystemProbe {
  const files = new Set(over.files ?? [])
  return {
    env: over.env ?? {},
    home: '/Users/me',
    fileExists: (p) => files.has(p),
    readDefaultBrowserId: over.readDefaultBrowserId ?? (() => null),
    which: (cmd) => over.bins?.[cmd] ?? null,
  }
}

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'

describe('resolveBrowser', () => {
  it('uses C4HERO_BROWSER when the file exists', () => {
    const r = resolveBrowser('darwin', probe({ env: { C4HERO_BROWSER: '/opt/b' }, files: ['/opt/b', CHROME] }))
    expect(r).toMatchObject({ path: '/opt/b', source: 'env' })
  })

  it('ignores a missing C4HERO_BROWSER and warns', () => {
    const r = resolveBrowser('darwin', probe({ env: { C4HERO_BROWSER: '/nope' }, files: [CHROME], readDefaultBrowserId: () => 'com.apple.safari' }))
    expect(r?.path).toBe(CHROME)
    expect(r?.warning).toContain('/nope')
  })

  it('uses a Chromium default on macOS without a warning', () => {
    const r = resolveBrowser('darwin', probe({ files: [CHROME, EDGE], readDefaultBrowserId: () => 'com.microsoft.edgemac' }))
    expect(r).toEqual({ name: 'Microsoft Edge', path: EDGE, source: 'default' })
  })

  it('finds browsers in ~/Applications', () => {
    const p = '/Users/me/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    expect(resolveBrowser('darwin', probe({ files: [p], readDefaultBrowserId: () => 'com.brave.browser' }))?.path).toBe(p)
  })

  it('tells Chrome Canary from Chrome', () => {
    const canary = '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
    const r = resolveBrowser('darwin', probe({ files: [CHROME, canary], readDefaultBrowserId: () => 'com.google.chrome.canary' }))
    expect(r?.path).toBe(canary)
  })

  it('falls back from a Safari default to an installed Chromium with a warning', () => {
    const r = resolveBrowser('darwin', probe({ files: [EDGE], readDefaultBrowserId: () => 'com.apple.safari' }))
    expect(r?.source).toBe('fallback')
    expect(r?.path).toBe(EDGE)
    expect(r?.warning).toMatch(/com\.apple\.safari.*headless/)
  })

  it('falls back from a Firefox default on Linux', () => {
    const r = resolveBrowser('linux', probe({ bins: { chromium: '/usr/bin/chromium' }, readDefaultBrowserId: () => 'firefox.desktop' }))
    expect(r).toMatchObject({ path: '/usr/bin/chromium', source: 'fallback' })
    expect(r?.warning).toContain('firefox.desktop')
  })

  it('uses a Chromium default on Linux', () => {
    const r = resolveBrowser('linux', probe({ bins: { 'google-chrome': '/usr/bin/google-chrome' }, readDefaultBrowserId: () => 'google-chrome.desktop' }))
    expect(r).toMatchObject({ name: 'Google Chrome', source: 'default' })
  })

  it('resolves Windows ProgId default and Program Files paths', () => {
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    const r = resolveBrowser('win32', probe({ env: { 'ProgramFiles(x86)': 'C:\\Program Files (x86)' }, files: [edge], readDefaultBrowserId: () => 'MSEdgeHTM' }))
    expect(r).toMatchObject({ path: edge, source: 'default' })
  })

  it('falls back on Windows when the default is Firefox', () => {
    const chrome = 'C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
    const r = resolveBrowser('win32', probe({ env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, files: [chrome], readDefaultBrowserId: () => 'FirefoxURL-308046B0AF4A39CB' }))
    expect(r).toMatchObject({ path: chrome, source: 'fallback' })
  })

  it('returns null when nothing is installed', () => {
    expect(resolveBrowser('darwin', probe({ readDefaultBrowserId: () => 'com.apple.safari' }))).toBeNull()
    expect(resolveBrowser('linux', probe())).toBeNull()
    expect(resolveBrowser('win32', probe())).toBeNull()
  })
})

describe('listCandidates', () => {
  it('orders env, default, then other installed browsers without duplicates', () => {
    const list = listCandidates('darwin', probe({ env: { C4HERO_BROWSER: '/opt/b' }, files: ['/opt/b', CHROME, EDGE], readDefaultBrowserId: () => 'com.microsoft.edgemac' }))
    expect(list.map((c) => [c.source, c.path])).toEqual([['env', '/opt/b'], ['default', EDGE], ['fallback', CHROME]])
    expect(list[2].warning).toBeUndefined()
  })
})

describe('parseMacDefaultHandler', () => {
  const text = `(
    {
        LSHandlerContentType = "public.url";
        LSHandlerPreferredVersions = {
            LSHandlerRoleAll = "-";
        };
        LSHandlerRoleAll = "com.apple.safari";
    },
    {
        LSHandlerPreferredVersions = {
            LSHandlerRoleAll = "-";
        };
        LSHandlerRoleAll = "com.google.chrome";
        LSHandlerURLScheme = https;
    }
)`
  it('extracts the https handler', () => expect(parseMacDefaultHandler(text)).toBe('com.google.chrome'))
  it('returns null when none is set', () => expect(parseMacDefaultHandler('(\n)')).toBeNull())
})
