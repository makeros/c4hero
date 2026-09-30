import { sanitizeFilename } from '@/lib/filenames'

/** Bundle named blobs into a single zip Blob. Dynamically imports `jszip` to keep it out of the main bundle. */
export async function createZipBlob(files: { name: string; data: Blob }[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const file of files) {
    zip.file(sanitizeFilename(file.name), file.data)
  }
  return zip.generateAsync({ type: 'blob' })
}
