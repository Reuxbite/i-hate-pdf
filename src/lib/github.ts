import type { GitHubConfig, VaultEnvelope } from '../types'
import { base64ToBytes, bytesToBase64, safeFileName, textToBytes } from './encoding'
import { parseEnvelope, serializeEnvelope } from './vault'

type GitHubContent = {
  name: string
  path: string
  sha: string
  type: 'file' | 'dir'
  size: number
  download_url: string | null
  content?: string
}

function validateConfig(config: GitHubConfig): void {
  if (!/^[a-zA-Z0-9_.-]+$/.test(config.owner)) throw new Error('Enter a valid GitHub owner.')
  if (!/^[a-zA-Z0-9_.-]+$/.test(config.repo)) throw new Error('Enter a valid private repository name.')
  if (!config.branch.trim()) throw new Error('Enter a branch name.')
}

function apiPath(config: GitHubConfig, path = ''): string {
  const clean = [config.folder, path].filter(Boolean).join('/').replace(/^\/+|\/+$/g, '')
  const encoded = clean.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encoded}`
}

async function githubRequest<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  if (!token.trim()) throw new Error('Enter a fine-grained GitHub token for this session.')
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message || `GitHub request failed with ${response.status}.`)
  }
  return response.json() as Promise<T>
}

export async function testGitHubConnection(config: GitHubConfig, token: string): Promise<void> {
  validateConfig(config)
  await githubRequest(`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`, token)
}

export async function listCloudFiles(config: GitHubConfig, token: string): Promise<GitHubContent[]> {
  validateConfig(config)
  try {
    const result = await githubRequest<GitHubContent[] | GitHubContent>(`${apiPath(config)}?ref=${encodeURIComponent(config.branch)}`, token)
    return Array.isArray(result) ? result.filter((item) => item.type === 'file' && item.name.endsWith('.ihpdf')) : []
  } catch (error) {
    if (error instanceof Error && error.message === 'Not Found') return []
    throw error
  }
}

async function existingSha(config: GitHubConfig, token: string, path: string): Promise<string | undefined> {
  try {
    const result = await githubRequest<GitHubContent>(`${apiPath(config, path)}?ref=${encodeURIComponent(config.branch)}`, token)
    return result.sha
  } catch (error) {
    if (error instanceof Error && error.message === 'Not Found') return undefined
    throw error
  }
}

export async function uploadEncryptedEnvelope(config: GitHubConfig, token: string, envelope: VaultEnvelope): Promise<string> {
  validateConfig(config)
  const fileName = `${safeFileName(envelope.name)}-${envelope.id.slice(0, 8)}.ihpdf`
  const sha = await existingSha(config, token, fileName)
  const body: Record<string, unknown> = {
    message: `Store encrypted document ${fileName}`,
    content: bytesToBase64(textToBytes(serializeEnvelope(envelope))),
    branch: config.branch,
  }
  if (sha) body.sha = sha
  await githubRequest(apiPath(config, fileName), token, { method: 'PUT', body: JSON.stringify(body) })
  return fileName
}

export async function downloadEncryptedEnvelope(config: GitHubConfig, token: string, path: string): Promise<VaultEnvelope> {
  validateConfig(config)
  const prefix = config.folder.replace(/^\/+|\/+$/g, '')
  const relative = prefix && path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : path
  const result = await githubRequest<GitHubContent>(`${apiPath(config, relative)}?ref=${encodeURIComponent(config.branch)}`, token)
  if (!result.content) throw new Error('GitHub did not return the encrypted file contents.')
  return parseEnvelope(new TextDecoder().decode(base64ToBytes(result.content)))
}
