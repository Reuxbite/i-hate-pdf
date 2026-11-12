import { mkdir, writeFile } from 'node:fs/promises'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

await mkdir('output/playwright', { recursive: true })

for (const [index, label] of ['Alpha document', 'Beta document'].entries()) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([420, 595])
  page.drawText(label, { x: 48, y: 510, size: 24, font, color: rgb(0.1, 0.1, 0.1) })
  page.drawText(`Fixture ${index + 1} for local browser processing.`, { x: 48, y: 470, size: 12, font, color: rgb(0.35, 0.35, 0.35) })
  await writeFile(`output/playwright/fixture-${index + 1}.pdf`, await pdf.save())
}
