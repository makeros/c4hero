// The project's markdown file list (`/__docs/__index.json`), fetched once per
// page load. Wikilinks resolve by name against it; null means unavailable
// (older build without an index, or a host answering with something else).
let cached: Promise<string[] | null> | null = null

export function fetchDocIndex(): Promise<string[] | null> {
  cached ??= (async () => {
    try {
      const res = await fetch('/__docs/__index.json')
      if (!res.ok) return null
      const data: unknown = JSON.parse(await res.text())
      const files = (data as { files?: unknown } | null)?.files
      return Array.isArray(files) && files.every((f) => typeof f === 'string') ? (files as string[]) : null
    } catch {
      return null
    }
  })()
  return cached
}

export function resetDocIndexCache(): void {
  cached = null
}
