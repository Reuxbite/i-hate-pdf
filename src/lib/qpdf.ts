import { createQpdfRunner, type QpdfRunner } from 'qpdf-run'
import workerUrl from 'qpdf-run/worker?url'
import qpdfJsUrl from 'qpdf-run/qpdf.js?url'
import qpdfWasmUrl from 'qpdf-run/qpdf.wasm?url'

let runnerPromise: Promise<QpdfRunner> | undefined

function runner(): Promise<QpdfRunner> {
  if (!runnerPromise) {
    runnerPromise = createQpdfRunner({
      workerUrl,
      qpdfJsUrl,
      wasmUrl: qpdfWasmUrl,
      timeoutMs: 90_000,
    })
  }
  return runnerPromise
}

async function runOne(bytes: Uint8Array, args: string[]): Promise<Uint8Array> {
  const qpdf = await runner()
  return qpdf.runOne({
    input: bytes,
    inputName: 'input.pdf',
    outputName: 'output.pdf',
    args,
  })
}

export function optimizePdf(bytes: Uint8Array): Promise<Uint8Array> {
  return runOne(bytes, [
    '--object-streams=generate',
    '--recompress-flate',
    '--compression-level=9',
    '--',
    'input.pdf',
    'output.pdf',
  ])
}

export function repairPdf(bytes: Uint8Array): Promise<Uint8Array> {
  return runOne(bytes, ['--linearize', '--', 'input.pdf', 'output.pdf'])
}

export function encryptPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (!password) throw new Error('Enter a PDF password.')
  const ownerPassword = crypto.randomUUID().replace(/-/g, '')
  return runOne(bytes, ['--encrypt', password, ownerPassword, '256', '--', 'input.pdf', 'output.pdf'])
}

export function decryptPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (!password) throw new Error('Enter the current PDF password.')
  return runOne(bytes, [`--password=${password}`, '--decrypt', '--', 'input.pdf', 'output.pdf'])
}
