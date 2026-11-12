import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { parsePageSelection, processTool } from '../src/lib/processors'

async function onePagePdf(name: string): Promise<File> {
  const document = await PDFDocument.create()
  document.addPage([200, 300])
  const bytes = await document.save()
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return new File([buffer], name, { type: 'application/pdf' })
}

function scannedImage(name: string): File {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  return new File([bytes], name, { type: 'image/png' })
}

describe('PDF processors', () => {
  it('parses ordered and descending page selections', () => {
    expect(parsePageSelection('3, 1-2, 5-4', 5)).toEqual([2, 0, 1, 4, 3])
    expect(() => parsePageSelection('0', 5)).toThrow('between 1 and 5')
  })

  it('merges PDFs entirely in memory', async () => {
    const result = await processTool('merge', [await onePagePdf('one.pdf'), await onePagePdf('two.pdf')], {})
    const merged = await PDFDocument.load(result[0].bytes)
    expect(merged.getPageCount()).toBe(2)
    expect(result[0].name).toBe('merged.pdf')
  })

  it('creates a renamed multi-page ID scan PDF', async () => {
    const result = await processTool(
      'scan',
      [scannedImage('id-front.png'), scannedImage('id-back.png')],
      { fileName: 'passport copy.pdf', pageFormat: 'id' },
    )
    const scanned = await PDFDocument.load(result[0].bytes)
    expect(result[0].name).toBe('passport-copy.pdf')
    expect(scanned.getPageCount()).toBe(2)
    expect(scanned.getTitle()).toBe('passport-copy')
    expect(scanned.getPage(0).getSize()).toEqual({ width: 153.01, height: 242.65 })
  })
})
