import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { createZipBlob } from './zipUtils'

describe('createZipBlob', () => {
  it('returns an empty-but-valid zip Blob for no files', async () => {
    const blob = await createZipBlob([])

    expect(blob).toBeInstanceOf(Blob)

    const roundTripped = await JSZip.loadAsync(blob)
    expect(Object.keys(roundTripped.files)).toHaveLength(0)
  })

  it('produces a zip whose unzipped contents match the input names/bytes', async () => {
    const fileA = new Blob(['hello world'], { type: 'text/plain' })
    const fileB = new Blob(['second file contents'], { type: 'text/plain' })

    const blob = await createZipBlob([
      { name: 'a.txt', data: fileA },
      { name: 'b.txt', data: fileB },
    ])

    const roundTripped = await JSZip.loadAsync(blob)
    expect(Object.keys(roundTripped.files).sort()).toEqual(['a.txt', 'b.txt'])

    const contentsA = await roundTripped.file('a.txt')!.async('string')
    const contentsB = await roundTripped.file('b.txt')!.async('string')
    expect(contentsA).toBe('hello world')
    expect(contentsB).toBe('second file contents')
  })

  it('sanitizes file names before adding them to the zip', async () => {
    const blob = await createZipBlob([{ name: 'foo/bar.txt', data: new Blob(['x']) }])

    const roundTripped = await JSZip.loadAsync(blob)
    expect(Object.keys(roundTripped.files)).toEqual(['foo_bar.txt'])
  })
})
