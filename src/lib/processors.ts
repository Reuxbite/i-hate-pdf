import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib'
import JSZip from 'jszip'
import { Document as DocxDocument, HeadingLevel, Packer, Paragraph } from 'docx'
import ExcelJS from 'exceljs'
import PptxGenJS from 'pptxgenjs'
import * as mammoth from 'mammoth'
import type { ProcessedArtifact, ToolProgress } from '../types'
import { bytesToText, safeFileName, textToBytes, withoutExtension } from './encoding'
import { canvasToBytes, extractTextPages, openPdf, renderPdfPage } from './pdfjs'
import { decryptPdf, encryptPdf, optimizePdf, repairPdf } from './qpdf'

type Options = Record<string, string | number | boolean>
type Progress = (progress: ToolProgress) => void

const A4: [number, number] = [595.28, 841.89]
const ID_CARD: [number, number] = [242.65, 153.01]

function outputName(file: File, suffix: string, extension = 'pdf'): string {
  return `${safeFileName(withoutExtension(file.name))}-${suffix}.${extension}`
}

function artifact(name: string, mime: string, bytes: Uint8Array, summary: string): ProcessedArtifact {
  return { name, mime, bytes, summary }
}

async function fileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

function firstFile(files: File[]): File {
  if (!files[0]) throw new Error('Choose a file first.')
  return files[0]
}

function requireFiles(files: File[], count: number): void {
  if (files.length < count) throw new Error(`Choose at least ${count} files.`)
}

export function parsePageSelection(input: string | number | boolean | undefined, total: number): number[] {
  const text = String(input ?? 'all').trim().toLowerCase()
  if (!text || text === 'all') return Array.from({ length: total }, (_, index) => index)
  const result: number[] = []
  for (const rawPart of text.split(',')) {
    const part = rawPart.trim()
    if (!part) continue
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part)
    if (!match) throw new Error(`Invalid page selection: "${part}".`)
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    if (start < 1 || end < 1 || start > total || end > total) {
      throw new Error(`Page selection must stay between 1 and ${total}.`)
    }
    const direction = end >= start ? 1 : -1
    for (let page = start; page !== end + direction; page += direction) result.push(page - 1)
  }
  if (!result.length) throw new Error('The page selection is empty.')
  return result
}

async function copyPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const source = await PDFDocument.load(bytes)
  const output = await PDFDocument.create()
  const copied = await output.copyPages(source, indices)
  copied.forEach((page) => output.addPage(page))
  return output.save({ useObjectStreams: true })
}

async function merge(files: File[]): Promise<ProcessedArtifact> {
  requireFiles(files, 2)
  const output = await PDFDocument.create()
  for (const file of files) {
    const source = await PDFDocument.load(await fileBytes(file))
    const pages = await output.copyPages(source, source.getPageIndices())
    pages.forEach((page) => output.addPage(page))
  }
  return artifact('merged.pdf', 'application/pdf', await output.save({ useObjectStreams: true }), `Merged ${files.length} PDFs.`)
}

async function split(file: File, ranges: string): Promise<ProcessedArtifact> {
  const bytes = await fileBytes(file)
  const source = await PDFDocument.load(bytes)
  const groups = ranges.split(';').map((group) => group.trim()).filter(Boolean)
  if (!groups.length) throw new Error('Enter at least one split group.')
  const zip = new JSZip()
  for (let index = 0; index < groups.length; index += 1) {
    const indices = parsePageSelection(groups[index], source.getPageCount())
    zip.file(`part-${String(index + 1).padStart(2, '0')}.pdf`, await copyPages(bytes, indices))
  }
  return artifact(outputName(file, 'split', 'zip'), 'application/zip', await zip.generateAsync({ type: 'uint8array' }), `Created ${groups.length} PDF parts.`)
}

async function removePages(file: File, selection: unknown): Promise<ProcessedArtifact> {
  const bytes = await fileBytes(file)
  const source = await PDFDocument.load(bytes)
  const removed = new Set(parsePageSelection(String(selection), source.getPageCount()))
  const kept = source.getPageIndices().filter((index) => !removed.has(index))
  if (!kept.length) throw new Error('At least one page must remain.')
  return artifact(outputName(file, 'pages-removed'), 'application/pdf', await copyPages(bytes, kept), `Removed ${removed.size} pages.`)
}

async function manipulate(file: File, id: string, options: Options): Promise<ProcessedArtifact> {
  const bytes = await fileBytes(file)
  const pdf = await PDFDocument.load(bytes)
  const selection = parsePageSelection(options.pages, pdf.getPageCount())
  const selected = new Set(selection)
  const font = await pdf.embedFont(id === 'sign' ? StandardFonts.TimesRomanItalic : StandardFonts.Helvetica)

  for (const [index, page] of pdf.getPages().entries()) {
    if (!selected.has(index)) continue
    const { width, height } = page.getSize()
    if (id === 'rotate') {
      const current = page.getRotation().angle
      page.setRotation(degrees((current + Number(options.degrees || 90)) % 360))
    } else if (id === 'page-numbers') {
      const text = String(index + 1)
      const size = 10
      const textWidth = font.widthOfTextAtSize(text, size)
      const position = String(options.position)
      const x = position.endsWith('right') ? width - textWidth - 28 : (width - textWidth) / 2
      const y = position.startsWith('top') ? height - 28 : 24
      page.drawText(text, { x, y, size, font, color: rgb(0.2, 0.2, 0.2) })
    } else if (id === 'watermark') {
      const text = String(options.text || 'CONFIDENTIAL')
      const size = Math.min(46, Math.max(18, width / Math.max(text.length * 0.52, 10)))
      const textWidth = font.widthOfTextAtSize(text, size)
      page.drawText(text, {
        x: (width - textWidth) / 2,
        y: height / 2,
        size,
        font,
        rotate: degrees(32),
        color: rgb(0.45, 0.12, 0.12),
        opacity: Math.min(0.8, Math.max(0.04, Number(options.opacity || 0.18))),
      })
    } else if (id === 'crop') {
      const margin = Math.max(0, Number(options.margin || 0))
      if (margin * 2 >= width || margin * 2 >= height) throw new Error('The crop margin is larger than the page.')
      page.setCropBox(margin, margin, width - margin * 2, height - margin * 2)
    } else if (id === 'edit' || id === 'sign') {
      const text = String(id === 'sign' ? options.signature : options.text).trim()
      if (!text) throw new Error(id === 'sign' ? 'Enter signature text.' : 'Enter text to add.')
      page.drawText(text, {
        x: Number(options.x || 48), y: Number(options.y || 48),
        size: id === 'sign' ? 22 : 12,
        font,
        color: id === 'sign' ? rgb(0.08, 0.12, 0.2) : rgb(0.15, 0.15, 0.15),
      })
      if (id === 'sign') {
        const signatureWidth = font.widthOfTextAtSize(text, 22)
        page.drawLine({
          start: { x: Number(options.x || 48), y: Number(options.y || 48) - 4 },
          end: { x: Number(options.x || 48) + signatureWidth, y: Number(options.y || 48) - 4 },
          color: rgb(0.08, 0.12, 0.2), thickness: 0.8,
        })
      }
    }
  }

  const suffix: Record<string, string> = {
    rotate: 'rotated', 'page-numbers': 'numbered', watermark: 'watermarked', crop: 'cropped', edit: 'edited', sign: 'signed',
  }
  return artifact(outputName(file, suffix[id]), 'application/pdf', await pdf.save({ useObjectStreams: true }), `Applied ${id} to ${selection.length} pages.`)
}

async function fillForm(file: File, rawFields: unknown): Promise<ProcessedArtifact> {
  const pdf = await PDFDocument.load(await fileBytes(file))
  const values = JSON.parse(String(rawFields || '{}')) as Record<string, unknown>
  const form = pdf.getForm()
  const fields = new Map(form.getFields().map((field) => [field.getName(), field]))
  let changed = 0
  for (const [name, value] of Object.entries(values)) {
    const field = fields.get(name)
    if (!field) continue
    if (field instanceof PDFTextField) field.setText(String(value ?? ''))
    else if (field instanceof PDFCheckBox) value ? field.check() : field.uncheck()
    else if (field instanceof PDFDropdown) field.select(String(value))
    else if (field instanceof PDFOptionList) field.select(Array.isArray(value) ? value.map(String) : String(value))
    else if (field instanceof PDFRadioGroup) field.select(String(value))
    else continue
    changed += 1
  }
  if (!changed) throw new Error(`No matching form fields were found. Available fields: ${[...fields.keys()].join(', ') || 'none'}.`)
  form.updateFieldAppearances()
  return artifact(outputName(file, 'filled'), 'application/pdf', await pdf.save({ useObjectStreams: true }), `Filled ${changed} form fields.`)
}

async function imagesToPdf(files: File[], options: Options = {}, defaultName = 'images'): Promise<ProcessedArtifact> {
  requireFiles(files, 1)
  const pdf = await PDFDocument.create()
  const requestedName = String(options.fileName || defaultName).trim()
  const documentName = safeFileName(withoutExtension(requestedName))
  const pageFormat = String(options.pageFormat || 'auto')
  pdf.setTitle(documentName)
  pdf.setCreator('I Hate PDF Android scanner')
  for (const file of files) {
    const raw = await fileBytes(file)
    let image
    if (file.type === 'image/png') image = await pdf.embedPng(raw)
    else if (file.type === 'image/jpeg') image = await pdf.embedJpg(raw)
    else {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
      bitmap.close()
      image = await pdf.embedJpg(await canvasToBytes(canvas, 'image/jpeg', 0.92))
    }
    let pageWidth = image.width
    let pageHeight = image.height
    let margin = 0
    if (pageFormat === 'a4') {
      ;[pageWidth, pageHeight] = image.height >= image.width ? A4 : [A4[1], A4[0]]
      margin = 18
    } else if (pageFormat === 'id') {
      ;[pageWidth, pageHeight] = image.height >= image.width ? [ID_CARD[1], ID_CARD[0]] : ID_CARD
      margin = 6
    }
    const page = pdf.addPage([pageWidth, pageHeight])
    if (margin > 0) page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) })
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height)
    const width = image.width * scale
    const height = image.height * scale
    page.drawImage(image, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    })
  }
  return artifact(`${documentName}.pdf`, 'application/pdf', await pdf.save({ useObjectStreams: true }), `Created a ${files.length}-page PDF.`)
}

async function pdfToImages(file: File, options: Options, progress: Progress): Promise<ProcessedArtifact> {
  const pdf = await openPdf(await fileBytes(file))
  const pages = parsePageSelection(options.pages, pdf.numPages)
  const zip = new JSZip()
  try {
    for (const [offset, pageIndex] of pages.entries()) {
      progress({ percent: Math.round((offset / pages.length) * 90), message: `Rendering page ${pageIndex + 1}` })
      const rendered = await renderPdfPage(pdf, pageIndex + 1, Number(options.scale || 1.75))
      zip.file(`page-${String(pageIndex + 1).padStart(3, '0')}.jpg`, await canvasToBytes(rendered.canvas, 'image/jpeg', 0.9))
    }
  } finally {
    await pdf.cleanup()
  }
  return artifact(outputName(file, 'images', 'zip'), 'application/zip', await zip.generateAsync({ type: 'uint8array' }), `Rendered ${pages.length} pages.`)
}

async function rasterRedact(file: File, options: Options, progress: Progress): Promise<ProcessedArtifact> {
  const source = await openPdf(await fileBytes(file))
  const selected = new Set(parsePageSelection(options.pages, source.numPages))
  const output = await PDFDocument.create()
  try {
    for (let index = 0; index < source.numPages; index += 1) {
      progress({ percent: Math.round((index / source.numPages) * 90), message: `Rebuilding page ${index + 1}` })
      const rendered = await renderPdfPage(source, index + 1, 2)
      if (selected.has(index)) {
        const context = rendered.canvas.getContext('2d')
        if (!context) throw new Error('Canvas rendering is unavailable.')
        const sx = rendered.canvas.width / rendered.widthPoints
        const sy = rendered.canvas.height / rendered.heightPoints
        context.fillStyle = '#000000'
        context.fillRect(
          Number(options.x || 0) * sx,
          rendered.canvas.height - (Number(options.y || 0) + Number(options.height || 0)) * sy,
          Number(options.width || 0) * sx,
          Number(options.height || 0) * sy,
        )
      }
      const image = await output.embedJpg(await canvasToBytes(rendered.canvas, 'image/jpeg', 0.94))
      const page = output.addPage([rendered.widthPoints, rendered.heightPoints])
      page.drawImage(image, { x: 0, y: 0, width: rendered.widthPoints, height: rendered.heightPoints })
    }
  } finally {
    await source.cleanup()
  }
  return artifact(outputName(file, 'redacted'), 'application/pdf', await output.save({ useObjectStreams: true }), `Permanently rebuilt and redacted ${selected.size} pages.`)
}

function cleanLatinText(text: string): string {
  return text.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?')
}

async function textToPdf(title: string, text: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const body = await pdf.embedFont(StandardFonts.Helvetica)
  const heading = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const margin = 54
  const bodySize = 10.5
  const lineHeight = 15
  let page = pdf.addPage(A4)
  let y = A4[1] - margin
  page.drawText(cleanLatinText(title), { x: margin, y, font: heading, size: 20, color: rgb(0.08, 0.08, 0.08) })
  y -= 34
  const maxWidth = A4[0] - margin * 2
  const paragraphs = text.replace(/\r/g, '').split('\n')
  for (const paragraph of paragraphs) {
    const words = cleanLatinText(paragraph).split(/\s+/)
    let line = ''
    const lines: string[] = []
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (body.widthOfTextAtSize(candidate, bodySize) > maxWidth && line) {
        lines.push(line)
        line = word
      } else line = candidate
    }
    if (line) lines.push(line)
    if (!lines.length) lines.push('')
    for (const row of lines) {
      if (y < margin) {
        page = pdf.addPage(A4)
        y = A4[1] - margin
      }
      page.drawText(row, { x: margin, y, font: body, size: bodySize, color: rgb(0.13, 0.13, 0.13) })
      y -= lineHeight
    }
    y -= 5
  }
  return pdf.save({ useObjectStreams: true })
}

async function wordToPdf(file: File): Promise<ProcessedArtifact> {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  const bytes = await textToPdf(withoutExtension(file.name), result.value)
  return artifact(outputName(file, 'converted'), 'application/pdf', bytes, 'Converted Word text to PDF.')
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

async function powerPointToPdf(file: File): Promise<ProcessedArtifact> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
  if (!slideNames.length) throw new Error('No slides were found in this PPTX file.')
  const slides: string[] = []
  for (const name of slideNames) {
    const xml = await zip.file(name)?.async('text') || ''
    slides.push([...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXml(match[1])).join('\n'))
  }
  const text = slides.map((slide, index) => `SLIDE ${index + 1}\n\n${slide}`).join('\n\n---\n\n')
  return artifact(outputName(file, 'converted'), 'application/pdf', await textToPdf(withoutExtension(file.name), text), `Converted ${slides.length} slides to PDF.`)
}

async function excelToPdf(file: File): Promise<ProcessedArtifact> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sections: string[] = []
  workbook.eachSheet((sheet) => {
    const rows: string[] = []
    sheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : Object.values(row.values)
      rows.push(values.map((value) => String(value ?? '')).join(' | '))
    })
    sections.push(`${sheet.name}\n${'='.repeat(Math.min(sheet.name.length, 40))}\n${rows.join('\n')}`)
  })
  return artifact(outputName(file, 'converted'), 'application/pdf', await textToPdf(withoutExtension(file.name), sections.join('\n\n')), `Converted ${workbook.worksheets.length} worksheets to PDF.`)
}

async function htmlToPdf(file: File | undefined, rawHtml: unknown): Promise<ProcessedArtifact> {
  const html = file ? bytesToText(await fileBytes(file)) : String(rawHtml || '')
  if (!html.trim()) throw new Error('Choose an HTML file or paste HTML.')
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  parsed.querySelectorAll('script, style, noscript').forEach((node) => node.remove())
  const title = parsed.title || file?.name || 'HTML document'
  const text = parsed.body.innerText.replace(/\n{3,}/g, '\n\n')
  return artifact(`${safeFileName(withoutExtension(file?.name || 'html-document'))}.pdf`, 'application/pdf', await textToPdf(title, text), 'Converted local HTML text to PDF.')
}

async function pdfToWord(file: File): Promise<ProcessedArtifact> {
  const pages = await extractTextPages(await fileBytes(file))
  const document = new DocxDocument({
    sections: [{
      children: pages.flatMap((text, index) => [
        new Paragraph({ text: `Page ${index + 1}`, heading: HeadingLevel.HEADING_1 }),
        ...text.split('\n').map((line) => new Paragraph({ text: line })),
      ]),
    }],
  })
  const blob = await Packer.toBlob(document)
  return artifact(outputName(file, 'editable', 'docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', new Uint8Array(await blob.arrayBuffer()), `Extracted ${pages.length} pages into DOCX.`)
}

async function pdfToExcel(file: File): Promise<ProcessedArtifact> {
  const pages = await extractTextPages(await fileBytes(file))
  const workbook = new ExcelJS.Workbook()
  pages.forEach((text, index) => {
    const sheet = workbook.addWorksheet(`Page ${index + 1}`)
    text.split('\n').forEach((line) => sheet.addRow(line.split(/\s{2,}|\t/)))
  })
  const buffer = await workbook.xlsx.writeBuffer()
  return artifact(outputName(file, 'extracted', 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new Uint8Array(buffer), `Extracted ${pages.length} pages into XLSX.`)
}

async function pdfToPowerPoint(file: File, progress: Progress): Promise<ProcessedArtifact> {
  const source = await openPdf(await fileBytes(file))
  const presentation = new PptxGenJS()
  presentation.layout = 'LAYOUT_WIDE'
  presentation.author = 'I Hate PDF'
  presentation.subject = `Converted from ${file.name}`
  try {
    for (let index = 1; index <= source.numPages; index += 1) {
      progress({ percent: Math.round(((index - 1) / source.numPages) * 90), message: `Rendering slide ${index}` })
      const rendered = await renderPdfPage(source, index, 1.6)
      const slide = presentation.addSlide()
      slide.background = { color: 'FFFFFF' }
      slide.addImage({ data: rendered.canvas.toDataURL('image/jpeg', 0.92), sizing: { type: 'contain', x: 0, y: 0, w: 13.333, h: 7.5 } })
    }
  } finally {
    await source.cleanup()
  }
  const result = await presentation.write({ outputType: 'arraybuffer' })
  return artifact(outputName(file, 'slides', 'pptx'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation', new Uint8Array(result as ArrayBuffer), 'Created one image-backed slide per PDF page.')
}

function markdownFromPages(pages: string[]): string {
  return pages.map((page, index) => {
    const lines = page.split('\n').filter((line) => line.trim())
    const formatted = lines.map((line, lineIndex) => {
      if (lineIndex === 0 && line.length < 90) return `## ${line}`
      if (/^\d+[.)]\s/.test(line)) return line
      if (/^[A-Z][A-Z\s-]{4,}$/.test(line) && line.length < 80) return `### ${line.replace(/\s+/g, ' ')}`
      return line
    }).join('\n\n')
    return `# Page ${index + 1}\n\n${formatted}`
  }).join('\n\n---\n\n')
}

function summarize(text: string, count: number): string {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [text]
  const words = text.toLowerCase().match(/[a-z]{3,}/g) || []
  const stop = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'have', 'were', 'will', 'into', 'your', 'their', 'there', 'about', 'which'])
  const frequency = new Map<string, number>()
  words.filter((word) => !stop.has(word)).forEach((word) => frequency.set(word, (frequency.get(word) || 0) + 1))
  return sentences
    .map((sentence, index) => ({
      sentence: sentence.trim(), index,
      score: (sentence.toLowerCase().match(/[a-z]{3,}/g) || []).reduce((sum, word) => sum + (frequency.get(word) || 0), 0) / Math.max(sentence.length, 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, count))
    .sort((a, b) => a.index - b.index)
    .map((item) => `- ${item.sentence}`)
    .join('\n')
}

async function comparePdfs(files: File[]): Promise<ProcessedArtifact> {
  requireFiles(files, 2)
  const [left, right] = await Promise.all(files.slice(0, 2).map(async (file) => (await extractTextPages(await fileBytes(file))).join('\n').split('\n')))
  const leftSet = new Set(left.map((line) => line.trim()).filter(Boolean))
  const rightSet = new Set(right.map((line) => line.trim()).filter(Boolean))
  const removed = [...leftSet].filter((line) => !rightSet.has(line))
  const added = [...rightSet].filter((line) => !leftSet.has(line))
  const report = `# PDF comparison\n\n- Left: ${files[0].name}\n- Right: ${files[1].name}\n- Removed lines: ${removed.length}\n- Added lines: ${added.length}\n\n## Removed\n\n${removed.map((line) => `- ${line}`).join('\n') || 'None'}\n\n## Added\n\n${added.map((line) => `- ${line}`).join('\n') || 'None'}\n`
  return artifact('comparison.md', 'text/markdown', textToBytes(report), `Found ${removed.length} removed and ${added.length} added lines.`)
}

async function ocrPdf(file: File, options: Options, progress: Progress): Promise<ProcessedArtifact> {
  const [{ createWorker }, source] = await Promise.all([import('tesseract.js'), openPdf(await fileBytes(file))])
  const selected = new Set(parsePageSelection(options.pages, source.numPages))
  const output = await PDFDocument.create()
  const font = await output.embedFont(StandardFonts.Helvetica)
  const worker = await createWorker(String(options.language || 'eng'), undefined, {
    logger: (message) => {
      if (typeof message.progress === 'number') progress({ percent: Math.round(message.progress * 80), message: message.status })
    },
  })
  try {
    for (let index = 1; index <= source.numPages; index += 1) {
      const rendered = await renderPdfPage(source, index, 1.8)
      const imageBytes = await canvasToBytes(rendered.canvas, 'image/jpeg', 0.92)
      const image = await output.embedJpg(imageBytes)
      const page = output.addPage([rendered.widthPoints, rendered.heightPoints])
      page.drawImage(image, { x: 0, y: 0, width: rendered.widthPoints, height: rendered.heightPoints })
      if (selected.has(index - 1)) {
        const result = await worker.recognize(rendered.canvas)
        const lines = cleanLatinText(result.data.text).split('\n').filter(Boolean).slice(0, 100)
        let y = rendered.heightPoints - 14
        for (const line of lines) {
          page.drawText(line.slice(0, 160), { x: 8, y, size: 4, font, opacity: 0 })
          y -= 5
          if (y < 4) break
        }
      }
    }
  } finally {
    await worker.terminate()
    await source.cleanup()
  }
  return artifact(outputName(file, 'ocr'), 'application/pdf', await output.save({ useObjectStreams: true }), `OCR processed ${selected.size} pages.`)
}

async function translatePdf(file: File, options: Options): Promise<ProcessedArtifact> {
  if (!window.Translator) throw new Error('This browser does not provide the on-device Translator API. Chrome may require the feature to be enabled and a supported language pack downloaded.')
  const sourceLanguage = String(options.sourceLanguage || 'en')
  const targetLanguage = String(options.targetLanguage || 'hi')
  const availability = await window.Translator.availability({ sourceLanguage, targetLanguage })
  if (availability === 'unavailable') throw new Error(`On-device translation from ${sourceLanguage} to ${targetLanguage} is unavailable.`)
  const translator = await window.Translator.create({ sourceLanguage, targetLanguage })
  const pages = await extractTextPages(await fileBytes(file))
  const translated: string[] = []
  for (const [index, page] of pages.entries()) translated.push(`# Page ${index + 1}\n\n${await translator.translate(page)}`)
  return artifact(outputName(file, `${targetLanguage}-translation`, 'md'), 'text/markdown', textToBytes(translated.join('\n\n---\n\n')), `Translated ${pages.length} pages on device.`)
}

async function runWorkflow(file: File, options: Options): Promise<ProcessedArtifact> {
  let bytes = await repairPdf(await fileBytes(file))
  const pdf = await PDFDocument.load(bytes)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const [index, page] of pdf.getPages().entries()) {
    if (options.rotate) page.setRotation(degrees((page.getRotation().angle + 90) % 360))
    if (options.numberPages) {
      const text = String(index + 1)
      page.drawText(text, { x: page.getWidth() / 2 - font.widthOfTextAtSize(text, 10) / 2, y: 24, size: 10, font })
    }
    if (String(options.watermark || '').trim()) {
      page.drawText(String(options.watermark), { x: 40, y: page.getHeight() - 40, size: 10, font, opacity: 0.25 })
    }
  }
  bytes = await pdf.save({ useObjectStreams: true })
  return artifact(outputName(file, 'workflow'), 'application/pdf', bytes, 'Completed the saved local workflow.')
}

export async function processTool(
  toolId: string,
  files: File[],
  options: Options,
  progress: Progress = () => undefined,
): Promise<ProcessedArtifact[]> {
  progress({ percent: 2, message: 'Reading local files' })
  const file = files[0]
  let result: ProcessedArtifact

  switch (toolId) {
    case 'merge': result = await merge(files); break
    case 'split': result = await split(firstFile(files), String(options.ranges || '1')); break
    case 'remove-pages': result = await removePages(firstFile(files), options.pages); break
    case 'extract-pages': {
      const source = firstFile(files)
      const bytes = await fileBytes(source)
      const pdf = await PDFDocument.load(bytes)
      const pages = parsePageSelection(options.pages, pdf.getPageCount())
      result = artifact(outputName(source, 'extracted'), 'application/pdf', await copyPages(bytes, pages), `Extracted ${pages.length} pages.`)
      break
    }
    case 'organize': {
      const source = firstFile(files)
      const bytes = await fileBytes(source)
      const pdf = await PDFDocument.load(bytes)
      const pages = parsePageSelection(options.order, pdf.getPageCount())
      result = artifact(outputName(source, 'organized'), 'application/pdf', await copyPages(bytes, pages), `Created a ${pages.length}-page sequence.`)
      break
    }
    case 'scan': result = await imagesToPdf(files, options, 'scanned-document'); break
    case 'jpg-to-pdf': result = await imagesToPdf(files, {}, 'images'); break
    case 'compress': {
      const source = firstFile(files)
      const input = await fileBytes(source)
      const output = await optimizePdf(input)
      const change = input.length ? Math.round((1 - output.length / input.length) * 100) : 0
      result = artifact(outputName(source, 'optimized'), 'application/pdf', output, `${change >= 0 ? 'Reduced' : 'Changed'} size by ${Math.abs(change)}%.`)
      break
    }
    case 'repair': {
      const source = firstFile(files)
      result = artifact(outputName(source, 'repaired'), 'application/pdf', await repairPdf(await fileBytes(source)), 'Rebuilt PDF structure with QPDF.')
      break
    }
    case 'ocr': result = await ocrPdf(firstFile(files), options, progress); break
    case 'pdf-to-jpg': result = await pdfToImages(firstFile(files), options, progress); break
    case 'word-to-pdf': result = await wordToPdf(firstFile(files)); break
    case 'ppt-to-pdf': result = await powerPointToPdf(firstFile(files)); break
    case 'excel-to-pdf': result = await excelToPdf(firstFile(files)); break
    case 'html-to-pdf': result = await htmlToPdf(file, options.html); break
    case 'pdf-to-word': result = await pdfToWord(firstFile(files)); break
    case 'pdf-to-ppt': result = await pdfToPowerPoint(firstFile(files), progress); break
    case 'pdf-to-excel': result = await pdfToExcel(firstFile(files)); break
    case 'rotate':
    case 'page-numbers':
    case 'watermark':
    case 'crop':
    case 'edit':
    case 'sign': result = await manipulate(firstFile(files), toolId, options); break
    case 'forms': result = await fillForm(firstFile(files), options.fields); break
    case 'protect': {
      const source = firstFile(files)
      result = artifact(outputName(source, 'protected'), 'application/pdf', await encryptPdf(await fileBytes(source), String(options.password || '')), 'Added AES-256 PDF encryption.')
      break
    }
    case 'unlock': {
      const source = firstFile(files)
      result = artifact(outputName(source, 'unlocked'), 'application/pdf', await decryptPdf(await fileBytes(source), String(options.password || '')), 'Removed PDF encryption using the supplied password.')
      break
    }
    case 'redact': result = await rasterRedact(firstFile(files), options, progress); break
    case 'compare': result = await comparePdfs(files); break
    case 'pdf-to-markdown': {
      const source = firstFile(files)
      const markdown = markdownFromPages(await extractTextPages(await fileBytes(source)))
      result = artifact(outputName(source, 'content', 'md'), 'text/markdown', textToBytes(markdown), 'Extracted PDF content to Markdown.')
      break
    }
    case 'summarize': {
      const source = firstFile(files)
      const text = (await extractTextPages(await fileBytes(source))).join('\n')
      const summary = `# Summary of ${source.name}\n\n${summarize(text, Number(options.sentences || 8))}\n`
      result = artifact(outputName(source, 'summary', 'md'), 'text/markdown', textToBytes(summary), 'Created a local extractive summary.')
      break
    }
    case 'translate': result = await translatePdf(firstFile(files), options); break
    case 'workflow': result = await runWorkflow(firstFile(files), options); break
    case 'pdf-to-pdfa': throw new Error('Standards-compliant PDF/A conversion needs the optional desktop companion with Ghostscript and veraPDF. The pure browser build will not mislabel an unverified file as PDF/A.')
    default: throw new Error('This tool is not implemented.')
  }

  progress({ percent: 100, message: 'Ready' })
  return [result]
}
