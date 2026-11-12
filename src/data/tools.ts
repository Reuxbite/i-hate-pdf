import type { PdfTool, ToolCategory } from '../types'

export const categories: ToolCategory[] = [
  'Organize',
  'Optimize',
  'Convert to PDF',
  'Convert from PDF',
  'Edit',
  'Security',
  'Intelligence',
  'Workflow',
]

const pageRange = {
  key: 'pages',
  label: 'Pages',
  type: 'text' as const,
  defaultValue: 'all',
  placeholder: 'all or 1-3, 7, 10-12',
  help: 'Page numbers start at 1.',
}

export const tools: PdfTool[] = [
  {
    id: 'merge', name: 'Merge PDF', shortName: 'Merge', category: 'Organize',
    description: 'Combine several PDFs in the order you select.', accepts: '.pdf,application/pdf', multiple: true,
    capability: 'local', capabilityNote: 'Runs in this browser.',
  },
  {
    id: 'split', name: 'Split PDF', shortName: 'Split', category: 'Organize',
    description: 'Create one PDF for every page or page range.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Runs in this browser.',
    options: [{ key: 'ranges', label: 'Split groups', type: 'text', defaultValue: '1; 2-3', placeholder: '1; 2-3; 4-8', help: 'Separate output groups with semicolons.' }],
  },
  {
    id: 'remove-pages', name: 'Remove pages', shortName: 'Remove', category: 'Organize',
    description: 'Remove selected pages and keep the rest.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Runs in this browser.', options: [{ ...pageRange, defaultValue: '2' }],
  },
  {
    id: 'extract-pages', name: 'Extract pages', shortName: 'Extract', category: 'Organize',
    description: 'Copy selected pages into a new PDF.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Runs in this browser.', options: [pageRange],
  },
  {
    id: 'organize', name: 'Organize PDF', shortName: 'Organize', category: 'Organize',
    description: 'Reorder or duplicate pages with a page sequence.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Runs in this browser.',
    options: [{ key: 'order', label: 'New page order', type: 'text', defaultValue: '1-3', placeholder: '3, 1, 2, 2' }],
  },
  {
    id: 'scan', name: 'Scan to PDF', shortName: 'Scan', category: 'Organize',
    description: 'Scan documents or ID cards, organize pages, and create a named PDF.', accepts: 'image/jpeg,image/png,image/webp', multiple: true,
    capability: 'local', capabilityNote: 'Android adds native edge detection, crop, cleanup, filters, gallery import, and multi-page capture.',
    options: [
      { key: 'fileName', label: 'PDF name', type: 'text', defaultValue: 'scanned-document.pdf', placeholder: 'document-name.pdf' },
      {
        key: 'pageFormat', label: 'Page format', type: 'select', defaultValue: 'a4',
        choices: [
          { label: 'A4 document', value: 'a4' },
          { label: 'ID card', value: 'id' },
          { label: 'Original crop', value: 'auto' },
        ],
      },
    ],
  },
  {
    id: 'compress', name: 'Compress PDF', shortName: 'Compress', category: 'Optimize',
    description: 'Recompress streams, remove unused objects and optimize structure.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Uses QPDF WebAssembly. Image downsampling is not applied.',
  },
  {
    id: 'repair', name: 'Repair PDF', shortName: 'Repair', category: 'Optimize',
    description: 'Rebuild cross-reference data and normalize a readable PDF.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Uses QPDF WebAssembly; severely corrupt files can remain unrecoverable.',
  },
  {
    id: 'ocr', name: 'OCR PDF', shortName: 'OCR', category: 'Optimize',
    description: 'Recognize English text from scanned pages and make it searchable.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Runs Tesseract in this browser and can be slow on phones.',
    options: [{ ...pageRange }, { key: 'language', label: 'OCR language', type: 'select', defaultValue: 'eng', choices: [{ label: 'English', value: 'eng' }, { label: 'Hindi', value: 'hin' }] }],
  },
  {
    id: 'jpg-to-pdf', name: 'JPG to PDF', shortName: 'Images to PDF', category: 'Convert to PDF',
    description: 'Turn JPG, PNG or WebP images into a single PDF.', accepts: 'image/jpeg,image/png,image/webp', multiple: true,
    capability: 'local', capabilityNote: 'Runs in this browser.',
  },
  {
    id: 'word-to-pdf', name: 'Word to PDF', shortName: 'Word to PDF', category: 'Convert to PDF',
    description: 'Convert DOCX text into a clean PDF document.', accepts: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    capability: 'conditional', capabilityNote: 'Local text conversion; complex Word layout is simplified.',
  },
  {
    id: 'ppt-to-pdf', name: 'PowerPoint to PDF', shortName: 'Slides to PDF', category: 'Convert to PDF',
    description: 'Extract slide text and create one PDF page per slide.', accepts: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    capability: 'conditional', capabilityNote: 'Local structural conversion; animations and exact layout are not reproduced.',
  },
  {
    id: 'excel-to-pdf', name: 'Excel to PDF', shortName: 'Sheets to PDF', category: 'Convert to PDF',
    description: 'Render workbook cell values into paged PDF sheets.', accepts: '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    capability: 'conditional', capabilityNote: 'Local data conversion; charts and print styling are simplified.',
  },
  {
    id: 'html-to-pdf', name: 'HTML to PDF', shortName: 'HTML to PDF', category: 'Convert to PDF',
    description: 'Convert an HTML file or pasted markup to a readable PDF.', accepts: '.html,.htm,text/html',
    capability: 'conditional', capabilityNote: 'Local text conversion; remote assets and full CSS layout are not reproduced.',
    options: [{ key: 'html', label: 'Or paste HTML', type: 'textarea', placeholder: '<h1>Document title</h1>' }],
  },
  {
    id: 'pdf-to-jpg', name: 'PDF to JPG', shortName: 'PDF to images', category: 'Convert from PDF',
    description: 'Render selected pages as JPG files in a ZIP.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Runs in this browser.', options: [pageRange, { key: 'scale', label: 'Render scale', type: 'number', defaultValue: 1.75, help: '1.0 is screen resolution; 2.0 is sharper.' }],
  },
  {
    id: 'pdf-to-word', name: 'PDF to Word', shortName: 'PDF to Word', category: 'Convert from PDF',
    description: 'Extract readable text into an editable DOCX.', accepts: '.pdf,application/pdf',
    capability: 'conditional', capabilityNote: 'Local text extraction; exact visual layout is not reproduced.',
  },
  {
    id: 'pdf-to-ppt', name: 'PDF to PowerPoint', shortName: 'PDF to slides', category: 'Convert from PDF',
    description: 'Turn every page into a full-slide image in a PPTX.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Pages remain visually faithful but are not element-editable.',
  },
  {
    id: 'pdf-to-excel', name: 'PDF to Excel', shortName: 'PDF to sheets', category: 'Convert from PDF',
    description: 'Extract page text into one worksheet per page.', accepts: '.pdf,application/pdf',
    capability: 'conditional', capabilityNote: 'Local text extraction; complex table structure may need cleanup.',
  },
  {
    id: 'pdf-to-pdfa', name: 'PDF to PDF/A', shortName: 'Archive PDF', category: 'Convert from PDF',
    description: 'Create a standards-checked archival PDF/A document.', accepts: '.pdf,application/pdf',
    capability: 'companion', capabilityNote: 'Requires the optional desktop companion with Ghostscript and veraPDF; unavailable in a pure browser.',
  },
  {
    id: 'rotate', name: 'Rotate PDF', shortName: 'Rotate', category: 'Edit',
    description: 'Rotate selected pages clockwise.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Runs in this browser.', options: [pageRange, { key: 'degrees', label: 'Rotation', type: 'select', defaultValue: '90', choices: [{ label: '90 degrees', value: '90' }, { label: '180 degrees', value: '180' }, { label: '270 degrees', value: '270' }] }],
  },
  {
    id: 'page-numbers', name: 'Add page numbers', shortName: 'Page numbers', category: 'Edit',
    description: 'Add page numbers with a consistent position and size.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Runs in this browser.', options: [pageRange, { key: 'position', label: 'Position', type: 'select', defaultValue: 'bottom-center', choices: [{ label: 'Bottom center', value: 'bottom-center' }, { label: 'Bottom right', value: 'bottom-right' }, { label: 'Top right', value: 'top-right' }] }],
  },
  {
    id: 'watermark', name: 'Add watermark', shortName: 'Watermark', category: 'Edit',
    description: 'Stamp text over selected PDF pages.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Runs in this browser.', options: [pageRange, { key: 'text', label: 'Watermark text', type: 'text', defaultValue: 'CONFIDENTIAL' }, { key: 'opacity', label: 'Opacity', type: 'number', defaultValue: 0.18 }],
  },
  {
    id: 'crop', name: 'Crop PDF', shortName: 'Crop', category: 'Edit',
    description: 'Set a smaller visible page area using point margins.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Cropping changes the view box; hidden content is not erased.', options: [pageRange, { key: 'margin', label: 'Margin in points', type: 'number', defaultValue: 24 }],
  },
  {
    id: 'edit', name: 'Edit PDF', shortName: 'Add text', category: 'Edit',
    description: 'Place a text annotation on selected pages.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Adds new content; existing page text is not rewritten.', options: [pageRange, { key: 'text', label: 'Text to add', type: 'text', defaultValue: 'Reviewed' }, { key: 'x', label: 'X position', type: 'number', defaultValue: 48 }, { key: 'y', label: 'Y position', type: 'number', defaultValue: 48 }],
  },
  {
    id: 'forms', name: 'PDF Forms', shortName: 'Fill forms', category: 'Edit',
    description: 'Fill existing text fields from a JSON name/value map.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Supports existing AcroForm text, checkbox, dropdown and radio fields.', options: [{ key: 'fields', label: 'Field values as JSON', type: 'textarea', defaultValue: '{\n  "Full Name": "Example User"\n}' }],
  },
  {
    id: 'protect', name: 'Protect PDF', shortName: 'Encrypt PDF', category: 'Security',
    description: 'Add standards-based AES-256 password encryption to a PDF.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Uses QPDF WebAssembly; the password never leaves the device.', options: [{ key: 'password', label: 'PDF password', type: 'password', placeholder: 'Use a long, unique password' }],
  },
  {
    id: 'unlock', name: 'Unlock PDF', shortName: 'Decrypt PDF', category: 'Security',
    description: 'Remove PDF encryption when you know the current password.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Uses QPDF WebAssembly and requires the valid password.', options: [{ key: 'password', label: 'Current PDF password', type: 'password' }],
  },
  {
    id: 'sign', name: 'Sign PDF', shortName: 'Sign', category: 'Security',
    description: 'Place a typed visual signature on selected pages.', accepts: '.pdf,application/pdf',
    capability: 'conditional', capabilityNote: 'Creates a visual signature, not a certificate-based digital signature.', options: [pageRange, { key: 'signature', label: 'Signature text', type: 'text', placeholder: 'Your name' }, { key: 'x', label: 'X position', type: 'number', defaultValue: 48 }, { key: 'y', label: 'Y position', type: 'number', defaultValue: 64 }],
  },
  {
    id: 'redact', name: 'Redact PDF', shortName: 'Redact', category: 'Security',
    description: 'Rasterize pages and permanently cover a rectangular region.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Removes selectable underlying content by rebuilding pages as images.', options: [pageRange, { key: 'x', label: 'X from left', type: 'number', defaultValue: 40 }, { key: 'y', label: 'Y from bottom', type: 'number', defaultValue: 40 }, { key: 'width', label: 'Width', type: 'number', defaultValue: 180 }, { key: 'height', label: 'Height', type: 'number', defaultValue: 32 }],
  },
  {
    id: 'compare', name: 'Compare PDF', shortName: 'Compare', category: 'Security',
    description: 'Compare extracted text from two PDFs and download a Markdown report.', accepts: '.pdf,application/pdf', multiple: true,
    capability: 'local', capabilityNote: 'Text comparison only; visual pixel differences are not included.',
  },
  {
    id: 'summarize', name: 'PDF Summarizer', shortName: 'Summarize', category: 'Intelligence',
    description: 'Create an extractive summary without sending content to an AI service.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Uses local sentence scoring; it is not a generative model.', options: [{ key: 'sentences', label: 'Summary sentences', type: 'number', defaultValue: 8 }],
  },
  {
    id: 'translate', name: 'Translate PDF', shortName: 'Translate', category: 'Intelligence',
    description: 'Translate extracted text with the browser on-device Translator API.', accepts: '.pdf,application/pdf',
    capability: 'conditional', capabilityNote: 'Works only where the browser provides an on-device Translator API.', options: [{ key: 'sourceLanguage', label: 'Source language', type: 'text', defaultValue: 'en' }, { key: 'targetLanguage', label: 'Target language', type: 'text', defaultValue: 'hi' }],
  },
  {
    id: 'pdf-to-markdown', name: 'PDF to Markdown', shortName: 'PDF to Markdown', category: 'Intelligence',
    description: 'Extract page text into a clean Markdown document.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'Runs in this browser.',
  },
  {
    id: 'workflow', name: 'Saved workflow', shortName: 'Workflow', category: 'Workflow',
    description: 'Run a repeatable sequence of safe local PDF operations.', accepts: '.pdf,application/pdf',
    capability: 'local', capabilityNote: 'The starter workflow repairs, rotates and adds page numbers.', options: [{ key: 'rotate', label: 'Rotate 90 degrees', type: 'checkbox', defaultValue: false }, { key: 'numberPages', label: 'Add page numbers', type: 'checkbox', defaultValue: true }, { key: 'watermark', label: 'Optional watermark', type: 'text', placeholder: 'Leave blank for none' }],
  },
]

export const toolById = new Map(tools.map((tool) => [tool.id, tool]))
