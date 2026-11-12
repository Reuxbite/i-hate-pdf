import Dexie, { type EntityTable } from 'dexie'
import type { VaultEnvelope, VaultRecord } from '../types'
import { validateVaultEnvelope } from './crypto'

class VaultDatabase extends Dexie {
  documents!: EntityTable<VaultRecord, 'id'>

  constructor() {
    super('ihatepdf-vault')
    this.version(1).stores({
      documents: 'id, name, createdAt, updatedAt',
    })
  }
}

export const vaultDb = new VaultDatabase()

export async function saveEnvelope(envelope: VaultEnvelope): Promise<VaultRecord> {
  const record: VaultRecord = { ...envelope, updatedAt: new Date().toISOString() }
  await vaultDb.documents.put(record)
  return record
}

export async function listVaultRecords(): Promise<VaultRecord[]> {
  return vaultDb.documents.orderBy('updatedAt').reverse().toArray()
}

export async function removeVaultRecord(id: string): Promise<void> {
  await vaultDb.documents.delete(id)
}

export function serializeEnvelope(record: VaultEnvelope): string {
  return JSON.stringify(record)
}

export function parseEnvelope(raw: string): VaultEnvelope {
  const value: unknown = JSON.parse(raw)
  if (!validateVaultEnvelope(value)) throw new Error('This is not an I Hate PDF encrypted vault file.')
  return value
}
