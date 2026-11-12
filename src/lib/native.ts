import { Capacitor, registerPlugin } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import type { ProcessedArtifact } from '../types'
import { bytesToBase64, safeFileName } from './encoding'

const VAULT_PASSWORD_KEY = 'vault-password'
const GITHUB_TOKEN_KEY = 'github-token'
let secureStorageReady = false

export type AndroidScannerMode = 'pdf' | 'document' | 'id'

type NativeScannerPage = {
  uri: string
  name: string
  size: number
}

type NativeScannerResult = {
  cancelled: boolean
  mode?: AndroidScannerMode
  pages: NativeScannerPage[]
}

interface DocumentScannerPlugin {
  scan(options: { mode: AndroidScannerMode; pageLimit: number }): Promise<NativeScannerResult>
}

const DocumentScanner = registerPlugin<DocumentScannerPlugin>('DocumentScanner')

export function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function scanAndroidDocuments(mode: AndroidScannerMode, pageLimit: number): Promise<File[]> {
  if (!isAndroidNative()) throw new Error('The native document scanner is available only in the Android app.')
  const result = await DocumentScanner.scan({ mode, pageLimit })
  if (result.cancelled) return []
  const files: File[] = []
  for (const [index, page] of result.pages.entries()) {
    const response = await fetch(Capacitor.convertFileSrc(page.uri))
    if (!response.ok) throw new Error(`Could not load scanned page ${index + 1}.`)
    const blob = await response.blob()
    files.push(new File([blob], page.name, {
      type: blob.type || 'image/jpeg',
      lastModified: Date.now() + index,
    }))
  }
  return files
}

async function prepareSecureStorage(): Promise<void> {
  if (!isAndroidNative() || secureStorageReady) return
  await SecureStorage.setKeyPrefix('ihatepdf_')
  secureStorageReady = true
}

export async function saveArtifactToDevice(artifact: ProcessedArtifact): Promise<string> {
  if (!isAndroidNative()) {
    const url = URL.createObjectURL(new Blob([artifact.bytes as BlobPart], { type: artifact.mime }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = artifact.name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
    return artifact.name
  }

  const path = `I Hate PDF/${Date.now()}-${safeFileName(artifact.name)}`
  const result = await Filesystem.writeFile({
    path,
    data: bytesToBase64(artifact.bytes),
    directory: Directory.Documents,
    recursive: true,
  })
  try {
    await Share.share({ title: artifact.name, files: [result.uri], dialogTitle: 'Save or share document' })
  } catch {
    // The file remains saved if the share sheet is dismissed.
  }
  return result.uri
}

export async function biometricAvailability(): Promise<{ available: boolean; reason: string }> {
  if (!isAndroidNative()) return { available: false, reason: 'Biometric unlock is Android-only.' }
  const info = await BiometricAuth.checkBiometry()
  return {
    available: info.isAvailable,
    reason: info.isAvailable ? 'Biometric authentication is ready.' : (info.reason || 'Enroll biometrics in Android settings first.'),
  }
}

async function authenticate(): Promise<void> {
  await BiometricAuth.authenticate({
    reason: 'Unlock your encrypted document vault',
    androidTitle: 'Unlock I Hate PDF',
    androidSubtitle: 'Confirm your identity to use the saved vault password',
    allowDeviceCredential: false,
  })
}

export async function enableBiometricVaultPassword(password: string): Promise<void> {
  if (!isAndroidNative()) throw new Error('Biometric unlock is available only in the Android app.')
  const availability = await biometricAvailability()
  if (!availability.available) throw new Error(availability.reason)
  await authenticate()
  await prepareSecureStorage()
  await SecureStorage.set(VAULT_PASSWORD_KEY, password)
}

export async function disableBiometricVaultPassword(): Promise<void> {
  if (!isAndroidNative()) return
  await prepareSecureStorage()
  await SecureStorage.remove(VAULT_PASSWORD_KEY)
}

export async function readBiometricVaultPassword(): Promise<string> {
  if (!isAndroidNative()) throw new Error('Biometric unlock is available only in the Android app.')
  await authenticate()
  await prepareSecureStorage()
  const value = await SecureStorage.get(VAULT_PASSWORD_KEY)
  if (typeof value !== 'string' || !value) throw new Error('No vault password is enrolled for biometric unlock.')
  return value
}

export async function saveGitHubToken(token: string): Promise<void> {
  if (isAndroidNative()) {
    await prepareSecureStorage()
    await SecureStorage.set(GITHUB_TOKEN_KEY, token)
  } else {
    sessionStorage.setItem(GITHUB_TOKEN_KEY, token)
  }
}

export async function readGitHubToken(): Promise<string> {
  if (isAndroidNative()) {
    await prepareSecureStorage()
    const value = await SecureStorage.get(GITHUB_TOKEN_KEY)
    return typeof value === 'string' ? value : ''
  }
  return sessionStorage.getItem(GITHUB_TOKEN_KEY) || ''
}

export async function clearGitHubToken(): Promise<void> {
  if (isAndroidNative()) {
    await prepareSecureStorage()
    await SecureStorage.remove(GITHUB_TOKEN_KEY)
  } else {
    sessionStorage.removeItem(GITHUB_TOKEN_KEY)
  }
}
