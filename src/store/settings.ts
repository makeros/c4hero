import { create } from 'zustand'
import { isRecord } from '@/lib/guards'
import { readJSON, writeJSON } from '@/lib/safeStorage'
import { isLineStyle, type LineStyle } from '@/types/model'

// ─── Types ──────────────────────────────────────────────────────────

export type MinimapMode = 'always' | 'auto' | 'never'
export type ColorTheme =
  | 'readability'
  | 'structurizr'
  | 'grayscale'
  | 'light'
  | 'highContrast'
  | 'semantic'
  | 'pastel'
  | 'slate'
  | 'sepia'
  | 'solarizedDark'
  | 'whiteboard'
  | 'monoAccent'

export interface AppSettings {
  minimapMode: MinimapMode
  showUndoRedo: boolean
  showZoomControls: boolean
  snapToGrid: boolean
  colorTheme: ColorTheme
  canvasGuideDismissed: boolean
  alwaysExpandDetails: boolean
  /** Global override for relationship line style, applied to every edge on the
   *  canvas regardless of its own per-relationship `lineStyle`. `undefined`
   *  ("Default") leaves each relationship's own style (or Curved) in effect. */
  globalLineStyle: LineStyle | undefined
  /** Whether the documents sidebar is docked open on the right of the canvas. */
  documentsSidebarOpen: boolean
  /** Width in px of the documents sidebar, clamped to
   *  [DOCUMENTS_SIDEBAR_MIN_WIDTH, DOCUMENTS_SIDEBAR_MAX_WIDTH]. */
  documentsSidebarWidth: number
  /** Whether the dev-only agent terminal is docked open on the left of the canvas. */
  agentTerminalOpen: boolean
  /** Width in px of the agent terminal, clamped to
   *  [AGENT_TERMINAL_MIN_WIDTH, AGENT_TERMINAL_MAX_WIDTH]. */
  agentTerminalWidth: number
}

export const DOCUMENTS_SIDEBAR_MIN_WIDTH = 280
export const DOCUMENTS_SIDEBAR_MAX_WIDTH = 640
export const DOCUMENTS_SIDEBAR_DEFAULT_WIDTH = 340

export const AGENT_TERMINAL_MIN_WIDTH = 360
export const AGENT_TERMINAL_MAX_WIDTH = 1200
export const AGENT_TERMINAL_DEFAULT_WIDTH = 560

const DEFAULTS: AppSettings = {
  // Minimap is off by default; users can switch it to Auto/Always in canvas settings.
  minimapMode: 'never',
  showUndoRedo: false,
  showZoomControls: false,
  snapToGrid: false,
  colorTheme: 'readability',
  canvasGuideDismissed: false,
  alwaysExpandDetails: false,
  globalLineStyle: undefined,
  documentsSidebarOpen: false,
  documentsSidebarWidth: DOCUMENTS_SIDEBAR_DEFAULT_WIDTH,
  agentTerminalOpen: false,
  agentTerminalWidth: AGENT_TERMINAL_DEFAULT_WIDTH,
}

const STORAGE_KEY = 'c4hero.json'

const MINIMAP_MODES: ReadonlySet<string> = new Set<MinimapMode>(['always', 'auto', 'never'])
const COLOR_THEMES: ReadonlySet<string> = new Set<ColorTheme>([
  'readability',
  'structurizr',
  'grayscale',
  'light',
  'highContrast',
  'semantic',
  'pastel',
  'slate',
  'sepia',
  'solarizedDark',
  'whiteboard',
  'monoAccent',
])

function isMinimapMode(value: unknown): value is MinimapMode {
  return typeof value === 'string' && MINIMAP_MODES.has(value)
}

function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === 'string' && COLOR_THEMES.has(value)
}

function readBoolean(source: Record<string, unknown>, key: keyof AppSettings, fallback: boolean): boolean {
  return typeof source[key] === 'boolean' ? source[key] : fallback
}

function clampSidebarWidth(value: number): number {
  return Math.min(DOCUMENTS_SIDEBAR_MAX_WIDTH, Math.max(DOCUMENTS_SIDEBAR_MIN_WIDTH, value))
}

function readDocumentsSidebarWidth(source: Record<string, unknown>): number {
  const value = source.documentsSidebarWidth
  return typeof value === 'number' && Number.isFinite(value)
    ? clampSidebarWidth(value)
    : DEFAULTS.documentsSidebarWidth
}

function readAgentTerminalWidth(source: Record<string, unknown>): number {
  const value = source.agentTerminalWidth
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(AGENT_TERMINAL_MAX_WIDTH, Math.max(AGENT_TERMINAL_MIN_WIDTH, value))
    : DEFAULTS.agentTerminalWidth
}

function normalizeSettings(value: unknown): AppSettings {
  const source = isRecord(value) ? value : {}
  return {
    minimapMode: isMinimapMode(source.minimapMode) ? source.minimapMode : DEFAULTS.minimapMode,
    showUndoRedo: readBoolean(source, 'showUndoRedo', DEFAULTS.showUndoRedo),
    showZoomControls: readBoolean(source, 'showZoomControls', DEFAULTS.showZoomControls),
    snapToGrid: readBoolean(source, 'snapToGrid', DEFAULTS.snapToGrid),
    colorTheme: isColorTheme(source.colorTheme) ? source.colorTheme : DEFAULTS.colorTheme,
    canvasGuideDismissed: readBoolean(source, 'canvasGuideDismissed', DEFAULTS.canvasGuideDismissed),
    alwaysExpandDetails: readBoolean(source, 'alwaysExpandDetails', DEFAULTS.alwaysExpandDetails),
    globalLineStyle: typeof source.globalLineStyle === 'string' && isLineStyle(source.globalLineStyle)
      ? source.globalLineStyle
      : DEFAULTS.globalLineStyle,
    documentsSidebarOpen: readBoolean(source, 'documentsSidebarOpen', DEFAULTS.documentsSidebarOpen),
    documentsSidebarWidth: readDocumentsSidebarWidth(source),
    agentTerminalOpen: readBoolean(source, 'agentTerminalOpen', DEFAULTS.agentTerminalOpen),
    agentTerminalWidth: readAgentTerminalWidth(source),
  }
}

// ─── Persistence ────────────────────────────────────────────────────

function load(): AppSettings {
  // normalizeSettings already absorbs any shape — pass-through validator.
  const raw = readJSON<unknown>(STORAGE_KEY, (v): v is unknown => v !== null && v !== undefined)
  return normalizeSettings(raw)
}

function persist(settings: AppSettings) {
  writeJSON(STORAGE_KEY, settings)
}

// ─── Store ──────────────────────────────────────────────────────────

interface SettingsState extends AppSettings {
  update: (patch: Partial<AppSettings>) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...load(),

  update: (patch) => {
    set(patch)
    // persist full settings after update
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring to exclude `update` from persisted settings
    const { update: _, ...rest } = get()
    persist(rest as AppSettings)
  },
}))
