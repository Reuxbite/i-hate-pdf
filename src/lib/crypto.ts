import type { VaultEnvelope } from '../types'
import { base64ToBytes, bytesToBase64 } from './encoding'

export const KDF_ITERATIONS = 310_000

function associatedData(envelope: Pick<VaultEnvelope, 'format' | 'id' | 'name' | 'mime'>): Uint8Array {
  return new TextEncoder().encode(`${envelope.format}\n${envelope.id}\n${envelope.name}\n${envelope.mime}`)
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  if (password.length < 10) throw new Error('Use a vault password with at least 10 characters.')
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptForVault(
  bytes: Uint8Array,
  metadata: { name: string; mime: string },
  password: string,
): Promise<VaultEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const envelope: VaultEnvelope = {
    format: 'ihatepdf-vault-v1',
    id: crypto.randomUUID(),
    name: metadata.name,
    mime: metadata.mime,
    originalSize: bytes.byteLength,
    createdAt: new Date().toISOString(),
    kdf: {
      name: 'PBKDF2-SHA-256',
      iterations: KDF_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: {
      name: 'AES-GCM-256',
      iv: bytesToBase64(iv),
      data: '',
    },
  }
  const key = await deriveKey(password, salt, KDF_ITERATIONS)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: associatedData(envelope) as BufferSource, tagLength: 128 },
    key,
    bytes as BufferSource,
  )
  envelope.cipher.data = bytesToBase64(new Uint8Array(cipher))
  return envelope
}

export async function decryptVaultEnvelope(envelope: VaultEnvelope, password: string): Promise<Uint8Array> {
  if (envelope.format !== 'ihatepdf-vault-v1') throw new Error('Unsupported encrypted file format.')
  const salt = base64ToBytes(envelope.kdf.salt)
  const iv = base64ToBytes(envelope.cipher.iv)
  const key = await deriveKey(password, salt, envelope.kdf.iterations)
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: associatedData(envelope) as BufferSource, tagLength: 128 },
      key,
      base64ToBytes(envelope.cipher.data) as BufferSource,
    )
    return new Uint8Array(plain)
  } catch {
    throw new Error('Wrong password or the encrypted file has been changed.')
  }
}

export function validateVaultEnvelope(value: unknown): value is VaultEnvelope {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<VaultEnvelope>
  return candidate.format === 'ihatepdf-vault-v1'
    && typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.mime === 'string'
    && typeof candidate.originalSize === 'number'
    && candidate.kdf?.name === 'PBKDF2-SHA-256'
    && typeof candidate.kdf?.salt === 'string'
    && candidate.cipher?.name === 'AES-GCM-256'
    && typeof candidate.cipher?.iv === 'string'
    && typeof candidate.cipher?.data === 'string'
}
