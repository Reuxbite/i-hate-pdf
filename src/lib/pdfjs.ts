import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export async function openPdf(bytes: Uint8Array, password?: string): Promise<pdfjs.PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password,
    useWorkerFetch: true,
  })
  return task.promise
}

export async function extractTextPages(bytes: Uint8Array, password?: string): Promise<string[]> {
  const document = await openPdf(bytes, password)
  const pages: string[] = []
  try {
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index)
      const content = await page.getTextContent()
      const lines: string[] = []
      let lastY: number | undefined
      let line = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        const y = item.transform[5]
        if (lastY !== undefined && Math.abs(y - lastY) > 3 && line.trim()) {
          lines.push(line.trim())
          line = ''
        }
        line += `${line ? ' ' : ''}${item.str}`
        lastY = y
      }
      if (line.trim()) lines.push(line.trim())
      pages.push(lines.join('\n'))
      page.cleanup()
    }
  } finally {
    await document.cleanup()
  }
  return pages
}

export type RenderedPage = {
  canvas: HTMLCanvasElement
  widthPoints: number
  heightPoints: number
}

export async function renderPdfPage(
  pdfDocument: pdfjs.PDFDocumentProxy,
  pageNumber: number,
  scale = 1.75,
): Promise<RenderedPage> {
  const page = await pdfDocument.getPage(pageNumber)
  const displayViewport = page.getViewport({ scale })
  const pointViewport = page.getViewport({ scale: 1 })
  const canvas = globalThis.document.createElement('canvas')
  canvas.width = Math.ceil(displayViewport.width)
  canvas.height = Math.ceil(displayViewport.height)
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Canvas rendering is unavailable in this browser.')
  await page.render({ canvas, canvasContext: context, viewport: displayViewport }).promise
  page.cleanup()
  return { canvas, widthPoints: pointViewport.width, heightPoints: pointViewport.height }
}

export function canvasToBytes(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.9): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not encode the rendered page.'))
        return
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))).catch(reject)
    }, type, quality)
  })
}
