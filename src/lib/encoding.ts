export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function textToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function bytesToText(value: Uint8Array): string {
  return new TextDecoder().decode(value)
}

export function safeFileName(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
  return clean || 'document'
}

export function withoutExtension(value: string): string {
  return value.replace(/\.[^.]+$/, '')
}
