import { describe, expect, it } from 'vitest'
import { decryptVaultEnvelope, encryptForVault, validateVaultEnvelope } from '../src/lib/crypto'

describe('encrypted vault envelope', () => {
  it('round-trips bytes and authenticates metadata', async () => {
    const source = new TextEncoder().encode('private document contents')
    const envelope = await encryptForVault(source, { name: 'private.pdf', mime: 'application/pdf' }, 'a-long-test-password')

    expect(validateVaultEnvelope(envelope)).toBe(true)
    expect(envelope.cipher.data).not.toContain('private document contents')
    await expect(decryptVaultEnvelope(envelope, 'a-long-test-password')).resolves.toEqual(source)
  })

  it('rejects a wrong password and tampered metadata', async () => {
    const envelope = await encryptForVault(new Uint8Array([1, 2, 3]), { name: 'one.pdf', mime: 'application/pdf' }, 'a-long-test-password')
    await expect(decryptVaultEnvelope(envelope, 'wrong-password-value')).rejects.toThrow('Wrong password')
    await expect(decryptVaultEnvelope({ ...envelope, name: 'changed.pdf' }, 'a-long-test-password')).rejects.toThrow('Wrong password')
  })
})
