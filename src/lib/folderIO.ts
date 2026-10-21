import { sidecarName } from '@/lib/sidecar'
import { createLogger } from '@/lib/logger'
import { readTextFileWithLimit } from '@/lib/fileIO'
import { isRecord } from '@/lib/guards'

const log = createLogger('folderIO')

// ─── Module-level state ───────────────────────────────────────────────

let currentDirHandle: FileSystemDirectoryHandle | null = null

// ─── IndexedDB helpers ────────────────────────────────────────────────

const DB_NAME = 'c4hero'
const STORE_NAME = 'handles'

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ─── Public API ───────────────────────────────────────────────────────

/** Check if the File System Access API directory picker is available */
/** Convert a friendly display name to a filesystem-safe slug */
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/[^a-z0-9\-_.]/g, '') // remove invalid chars
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^[-_.]+|[-_.]+$/g, '') // trim leading/trailing
    || 'collection'
}

/** Check if a folder name already exists in the given parent handle */
export async function folderExists(parent: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await parent.getDirectoryHandle(name, { create: false })
    return true
  } catch {
    return false
  }
}

export function hasFolderAccess(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/** Get the currently active directory handle */
export function getCurrentDirHandle(): FileSystemDirectoryHandle | null {
  return currentDirHandle
}

export async function setDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  currentDirHandle = handle
  await persistDirHandle()
}

/** Open a folder via showDirectoryPicker, list .dsl files within it */
export async function openFolder(): Promise<{ dirHandle: FileSystemDirectoryHandle; dslFiles: string[] } | null> {
  if (!hasFolderAccess()) return null
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
    currentDirHandle = dirHandle
    const dslFiles = await listDSLFilesIn(dirHandle)
    await persistDirHandle()
    return { dirHandle, dslFiles }
  } catch (err) {
    // AbortError = user cancelled — silence it; log anything unexpected
    if (err instanceof Error && err.name !== 'AbortError') {
      log.warn('openFolder failed', err)
    }
    return null
  }
}

// ─── External-change tracking ─────────────────────────────────────────
// The text this tab last read or wrote per file (DSL and sidecar alike, a
// missing sidecar as ''), so `readDSLFileIfChanged` can tell another
// program's edit from this tab's own autosave. A read that overlaps one of
// our writes can't be trusted either way, hence the generation counter.

const knownText = new Map<string, string>()
let writesInFlight = 0
let writeGeneration = 0

async function readDSLPair(dir: FileSystemDirectoryHandle, filename: string): Promise<{ content: string; sidecarJson?: string }> {
  const fileHandle = await dir.getFileHandle(filename)
  const file = await fileHandle.getFile()
  const content = await readTextFileWithLimit(file, 'DSL file')

  let sidecarJson: string | undefined
  try {
    const sidecarFilename = sidecarName(filename)
    const sidecarHandle = await dir.getFileHandle(sidecarFilename)
    const sidecarFile = await sidecarHandle.getFile()
    sidecarJson = await readTextFileWithLimit(sidecarFile, 'Sidecar file')
  } catch {
    // No sidecar — expected for new workspaces
  }

  return { content, sidecarJson }
}

function rememberPair(filename: string, pair: { content: string; sidecarJson?: string }): void {
  knownText.set(filename, pair.content)
  knownText.set(sidecarName(filename), pair.sidecarJson ?? '')
}

/** Read a .dsl file and its matching .c4hero.json sidecar from the current directory */
export async function readDSLFile(filename: string): Promise<{ content: string; sidecarJson?: string } | null> {
  if (!currentDirHandle) return null
  try {
    const pair = await readDSLPair(currentDirHandle, filename)
    rememberPair(filename, pair)
    return pair
  } catch (err) {
    log.warn('readDSLFile failed', err)
    return null
  }
}

/** Like `readDSLFile`, but only returns the pair when the DSL or its sidecar
 *  differs from what this tab last read or wrote — i.e. something else edited
 *  them. Null when unchanged, unreadable, or overlapping one of our writes. */
export async function readDSLFileIfChanged(filename: string): Promise<{ content: string; sidecarJson?: string } | null> {
  if (!currentDirHandle || writesInFlight > 0) return null
  const generation = writeGeneration
  let pair: { content: string; sidecarJson?: string }
  try {
    pair = await readDSLPair(currentDirHandle, filename)
  } catch {
    return null // deleted or renamed mid-session — nothing to reload
  }
  if (writesInFlight > 0 || generation !== writeGeneration) return null
  // A file this tab never read or wrote (e.g. the sidecar of a workspace
  // created in-app) has no baseline yet — record one rather than reporting it.
  const differs = (key: string, text: string) => knownText.has(key) && knownText.get(key) !== text
  const changed = differs(filename, pair.content) || differs(sidecarName(filename), pair.sidecarJson ?? '')
  rememberPair(filename, pair)
  return changed ? pair : null
}

async function writeTrackedFile(filename: string, content: string): Promise<void> {
  if (!currentDirHandle) throw new Error('No folder open')
  writesInFlight++
  writeGeneration++
  try {
    const fileHandle = await currentDirHandle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
    knownText.set(filename, content)
  } finally {
    writesInFlight--
    writeGeneration++
  }
}

/** Write DSL content to a file in the current directory (creates if not present) */
export async function writeDSLFile(filename: string, content: string): Promise<boolean> {
  if (!currentDirHandle) return false
  try {
    await writeTrackedFile(filename, content)
    return true
  } catch (err) {
    log.error('writeDSLFile failed', err)
    return false
  }
}

/** Write sidecar JSON to the matching .c4hero.json file in the current directory */
export async function writeSidecarFile(dslFilename: string, json: string): Promise<boolean> {
  if (!currentDirHandle) return false
  try {
    await writeTrackedFile(sidecarName(dslFilename), json)
    return true
  } catch (err) {
    log.error('writeSidecarFile failed', err)
    return false
  }
}

/** List all .dsl files in the current directory */
export async function listDSLFiles(): Promise<string[]> {
  if (!currentDirHandle) return []
  return listDSLFilesIn(currentDirHandle)
}

/** Persist a directory handle to IndexedDB keyed by folder name */
export async function persistDirHandle(): Promise<void> {
  if (!currentDirHandle) return
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    // Always update the "last" handle for quick restore on startup
    store.put(currentDirHandle, 'dirHandle')
    // Also key by folder name so recents can be restored without re-prompting
    store.put(currentDirHandle, `folder:${currentDirHandle.name}`)
  } catch (err) {
    log.warn('persistDirHandle failed', err)
  }
}

/** Try to restore a handle by folder name (for recents).
 *  - If permission is granted: restores silently.
 *  - If permission is 'prompt': requests permission scoped to that folder (no generic picker).
 *  - If folder is gone or permission denied: returns null.
 */
export async function restoreDirHandleByName(name: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const handle: FileSystemDirectoryHandle = await new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).get(`folder:${name}`)
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle)
      req.onerror = () => reject(req.error)
    })
    if (!handle) return null

    let perm = await handle.queryPermission({ mode: 'readwrite' })

    // If permission needs re-confirmation, request it scoped to this folder
    if (perm === 'prompt') {
      perm = await handle.requestPermission({ mode: 'readwrite' })
    }

    if (perm !== 'granted') return null

    // Verify folder is still accessible (handles deleted/moved folders)
    try {
      // Attempt a benign read — iterating 0 entries is enough to detect a missing folder
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of handle.entries()) { break }
    } catch {
      return null // Folder no longer exists or was moved
    }

    currentDirHandle = handle
    return handle
  } catch {
    return null
  }
}

/** Restore directory handle from IndexedDB if permission is still granted */
export async function restoreDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const handle: FileSystemDirectoryHandle = await new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).get('dirHandle')
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle)
      req.onerror = () => reject(req.error)
    })
    if (!handle) return null
    const perm = await handle.queryPermission({ mode: 'readwrite' })
    if (perm === 'granted') {
      currentDirHandle = handle
      return handle
    }
    return null
  } catch {
    return null
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────

async function listDSLFilesIn(dirHandle: FileSystemDirectoryHandle): Promise<string[]> {
  const files: string[] = []
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === 'file' && name.toLowerCase().endsWith('.dsl')) {
      files.push(name)
    }
  }
  return files.sort()
}

// ─── Collection settings (.c4hero/settings.json) ─────────────────────────────

export interface CollectionSettings {
  name?: string          // Display name override for the collection
  defaultScope?: string  // Default scope for new workspaces
  createdAt?: string     // ISO timestamp
  [key: string]: unknown // Forward-compatible — unknown keys are preserved
}

const C4HERO_DIR = '.c4hero'
const SETTINGS_FILE = 'settings.json'

function parseCollectionSettings(text: string): CollectionSettings | null {
  const parsed = JSON.parse(text)
  if (!isRecord(parsed)) return null
  if ('name' in parsed && parsed.name !== undefined && typeof parsed.name !== 'string') return null
  if ('defaultScope' in parsed && parsed.defaultScope !== undefined && typeof parsed.defaultScope !== 'string') return null
  if ('createdAt' in parsed && parsed.createdAt !== undefined && typeof parsed.createdAt !== 'string') return null
  return parsed as CollectionSettings
}

async function getC4HeroDir(create = false): Promise<FileSystemDirectoryHandle | null> {
  if (!currentDirHandle) return null
  try {
    return await currentDirHandle.getDirectoryHandle(C4HERO_DIR, { create })
  } catch {
    return null
  }
}

export async function readCollectionSettings(): Promise<CollectionSettings | null> {
  try {
    const dir = await getC4HeroDir(false)
    if (!dir) return null
    const fileHandle = await dir.getFileHandle(SETTINGS_FILE)
    const file = await fileHandle.getFile()
    const text = await readTextFileWithLimit(file, 'Collection settings file')
    return parseCollectionSettings(text)
  } catch {
    return null
  }
}

export async function writeCollectionSettings(settings: CollectionSettings): Promise<boolean> {
  try {
    const dir = await getC4HeroDir(true)
    if (!dir) return false
    const fileHandle = await dir.getFileHandle(SETTINGS_FILE, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(settings, null, 2))
    await writable.close()
    return true
  } catch {
    return false
  }
}

export async function initCollectionSettings(name: string): Promise<CollectionSettings> {
  const existing = await readCollectionSettings()
  if (existing) return existing
  const settings: CollectionSettings = {
    name,
    createdAt: new Date().toISOString(),
  }
  await writeCollectionSettings(settings)
  return settings
}

/** Check if a stored handle exists in IDB (regardless of permission state) */
export async function handleExistsInIDB(name: string): Promise<boolean> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const handle: FileSystemDirectoryHandle = await new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).get(`folder:${name}`)
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle)
      req.onerror = () => reject(req.error)
    })
    return !!handle
  } catch {
    return false
  }
}

/** Filter a list of recent folder names to only those we have a stored handle for */
export async function filterValidRecentFolders(names: string[]): Promise<string[]> {
  const results = await Promise.all(names.map(async name => ({
    name,
    valid: await handleExistsInIDB(name),
  })))
  return results.filter(r => r.valid).map(r => r.name)
}
