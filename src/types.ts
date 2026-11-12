export type ToolCategory =
  | 'Organize'
  | 'Optimize'
  | 'Convert to PDF'
  | 'Convert from PDF'
  | 'Edit'
  | 'Security'
  | 'Intelligence'
  | 'Workflow'

export type ToolCapability = 'local' | 'conditional' | 'companion'

export type ToolOption = {
  key: string
  label: string
  type: 'text' | 'number' | 'password' | 'textarea' | 'select' | 'checkbox'
  defaultValue?: string | number | boolean
  placeholder?: string
  help?: string
  choices?: Array<{ label: string; value: string }>
}

export type PdfTool = {
  id: string
  name: string
  shortName: string
  category: ToolCategory
  description: string
  accepts: string
  multiple?: boolean
  capability: ToolCapability
  capabilityNote: string
  options?: ToolOption[]
}

export type ProcessedArtifact = {
  name: string
  mime: string
  bytes: Uint8Array
  summary: string
}

export type ToolProgress = {
  percent: number
  message: string
}

export type VaultEnvelope = {
  format: 'ihatepdf-vault-v1'
  id: string
  name: string
  mime: string
  originalSize: number
  createdAt: string
  kdf: {
    name: 'PBKDF2-SHA-256'
    iterations: number
    salt: string
  }
  cipher: {
    name: 'AES-GCM-256'
    iv: string
    data: string
  }
}

export type VaultRecord = VaultEnvelope & {
  updatedAt: string
}

export type GitHubConfig = {
  owner: string
  repo: string
  branch: string
  folder: string
}

export type ViewName = 'tools' | 'vault' | 'cloud' | 'settings'
