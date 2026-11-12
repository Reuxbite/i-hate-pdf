import { useEffect, useMemo, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import {
  ArrowsClockwise,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Camera,
  Code,
  Columns,
  CloudArrowDown,
  CloudArrowUp,
  Crop,
  DotsNine,
  DownloadSimple,
  Drop,
  Eraser,
  FileArrowDown,
  FileArrowUp,
  FileDoc,
  FileLock,
  FileMinus,
  FilePdf,
  FilePlus,
  Files,
  FlowArrow,
  Fingerprint,
  FolderOpen,
  GearSix,
  GitFork,
  GitBranch,
  GitMerge,
  HardDrive,
  Image,
  Images,
  Info,
  ListNumbers,
  LockOpen,
  LockKey,
  MagnifyingGlass,
  Minus,
  PencilSimple,
  Play,
  PresentationChart,
  Scan,
  ShieldCheck,
  Signature,
  Sparkle,
  SpinnerGap,
  Table,
  TextAa,
  Textbox,
  Trash,
  Translate,
  ArrowsOut,
  Wrench,
  X,
} from '@phosphor-icons/react'
import { categories, toolById, tools } from './data/tools'
import type { GitHubConfig, PdfTool, ProcessedArtifact, ToolCategory, ToolProgress, VaultRecord, ViewName } from './types'
import { processTool } from './lib/processors'
import { decryptVaultEnvelope, encryptForVault } from './lib/crypto'
import { listVaultRecords, parseEnvelope, removeVaultRecord, saveEnvelope, serializeEnvelope } from './lib/vault'
import { bytesToText, textToBytes } from './lib/encoding'
import type { AndroidScannerMode } from './lib/native'
import {
  biometricAvailability,
  clearGitHubToken,
  disableBiometricVaultPassword,
  enableBiometricVaultPassword,
  isAndroidNative,
  readBiometricVaultPassword,
  readGitHubToken,
  saveArtifactToDevice,
  saveGitHubToken,
  scanAndroidDocuments,
} from './lib/native'
import { downloadEncryptedEnvelope, listCloudFiles, testGitHubConnection, uploadEncryptedEnvelope } from './lib/github'

const DEFAULT_GITHUB: GitHubConfig = { owner: '', repo: 'i-hate-pdf-vault', branch: 'main', folder: 'vault' }
const BACK_EXIT_WINDOW_MS = 2_000
const BACK_EXIT_MESSAGE = 'Press Back again within 2 seconds to exit.'

function initialOptions(tool: PdfTool): Record<string, string | number | boolean> {
  return Object.fromEntries((tool.options || []).map((option) => [option.key, option.defaultValue ?? '']))
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}

function capabilityLabel(tool: PdfTool): string {
  if (tool.capability === 'local') return 'LOCAL'
  if (tool.capability === 'conditional') return 'LOCAL, SIMPLIFIED'
  return 'DESKTOP COMPANION'
}

function CategoryGlyph({ category }: { category: ToolCategory | 'All' }) {
  const props = { size: 22, weight: 'bold' as const }
  if (category === 'All') return <DotsNine {...props} />
  if (category === 'Organize') return <Files {...props} />
  if (category === 'Optimize') return <Wrench {...props} />
  if (category === 'Convert to PDF') return <FileArrowUp {...props} />
  if (category === 'Convert from PDF') return <FileArrowDown {...props} />
  if (category === 'Edit') return <PencilSimple {...props} />
  if (category === 'Security') return <LockKey {...props} />
  if (category === 'Intelligence') return <Sparkle {...props} />
  return <FlowArrow {...props} />
}

function ToolGlyph({ id }: { id: string }) {
  const props = { size: 31, weight: 'regular' as const }
  const glyphs: Record<string, React.ReactNode> = {
    merge: <GitMerge {...props} />, split: <GitFork {...props} />, 'remove-pages': <FileMinus {...props} />,
    'extract-pages': <FileArrowDown {...props} />, organize: <ArrowsClockwise {...props} />, scan: <Scan {...props} />,
    compress: <ArrowsOut {...props} />, repair: <Wrench {...props} />, ocr: <TextAa {...props} />,
    'jpg-to-pdf': <Image {...props} />, 'word-to-pdf': <FileDoc {...props} />, 'ppt-to-pdf': <PresentationChart {...props} />,
    'excel-to-pdf': <Table {...props} />, 'html-to-pdf': <Code {...props} />, 'pdf-to-jpg': <Images {...props} />,
    'pdf-to-word': <FileDoc {...props} />, 'pdf-to-ppt': <PresentationChart {...props} />, 'pdf-to-excel': <Table {...props} />,
    'pdf-to-pdfa': <FilePdf {...props} />, rotate: <ArrowsClockwise {...props} />, 'page-numbers': <ListNumbers {...props} />,
    watermark: <Drop {...props} />, crop: <Crop {...props} />, edit: <PencilSimple {...props} />, forms: <Textbox {...props} />,
    protect: <LockKey {...props} />, unlock: <LockOpen {...props} />, sign: <Signature {...props} />, redact: <Eraser {...props} />,
    compare: <Columns {...props} />, summarize: <Sparkle {...props} />, translate: <Translate {...props} />,
    'pdf-to-markdown': <Code {...props} />, workflow: <FlowArrow {...props} />,
  }
  return glyphs[id] || <FilePdf {...props} />
}

function App() {
  const [view, setView] = useState<ViewName>('tools')
  const [activeToolId, setActiveToolId] = useState('merge')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ToolCategory | 'All'>('All')
  const [files, setFiles] = useState<File[]>([])
  const [options, setOptions] = useState<Record<string, string | number | boolean>>(initialOptions(toolById.get('merge')!))
  const [results, setResults] = useState<ProcessedArtifact[]>([])
  const [progress, setProgress] = useState<ToolProgress | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [vaultPassword, setVaultPassword] = useState('')
  const [vaultRecords, setVaultRecords] = useState<VaultRecord[]>([])
  const [unlockPasswords, setUnlockPasswords] = useState<Record<string, string>>({})
  const [githubConfig, setGithubConfig] = useState<GitHubConfig>(() => {
    try {
      return { ...DEFAULT_GITHUB, ...JSON.parse(localStorage.getItem('ihatepdf-github-config') || '{}') }
    } catch {
      return DEFAULT_GITHUB
    }
  })
  const [githubToken, setGithubToken] = useState('')
  const [remoteFiles, setRemoteFiles] = useState<Array<{ name: string; path: string; size: number }>>([])
  const [busyAction, setBusyAction] = useState('')
  const [biometricStatus, setBiometricStatus] = useState('Checking Android availability…')
  const [biometricPassword, setBiometricPassword] = useState('')
  const [toolWindowOpen, setToolWindowOpen] = useState(false)
  const [toolWindowMaximized, setToolWindowMaximized] = useState(false)
  const [scannerMode, setScannerMode] = useState<AndroidScannerMode>('document')
  const [scannerBusy, setScannerBusy] = useState(false)
  const homeBackAt = useRef(0)
  const homeBackTimer = useRef<number | null>(null)
  const activeTool = toolById.get(activeToolId)!

  const filteredTools = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tools.filter((tool) => (category === 'All' || tool.category === category)
      && (!query || `${tool.name} ${tool.description} ${tool.category}`.toLowerCase().includes(query)))
  }, [category, search])

  async function refreshVault() {
    setVaultRecords(await listVaultRecords())
  }

  useEffect(() => {
    void refreshVault()
    void readGitHubToken().then(setGithubToken)
    void biometricAvailability().then((status) => setBiometricStatus(status.reason)).catch((cause: unknown) => setBiometricStatus(cause instanceof Error ? cause.message : 'Biometric check failed.'))
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (view !== 'tools' || toolWindowOpen || category !== 'All' || search.trim()) clearPendingExit()
  }, [category, search, toolWindowOpen, view])

  useEffect(() => {
    if (!isAndroidNative()) return
    let disposed = false
    let removeListener: (() => Promise<void>) | undefined

    void CapacitorApp.addListener('backButton', () => {
      if (toolWindowOpen || view !== 'tools' || category !== 'All' || search.trim()) {
        resetToInitialMenu()
        return
      }

      const now = Date.now()
      if (homeBackAt.current > 0 && now - homeBackAt.current <= BACK_EXIT_WINDOW_MS) {
        clearPendingExit()
        void CapacitorApp.exitApp()
        return
      }

      homeBackAt.current = now
      setNotice(BACK_EXIT_MESSAGE)
      if (homeBackTimer.current !== null) window.clearTimeout(homeBackTimer.current)
      homeBackTimer.current = window.setTimeout(() => {
        homeBackAt.current = 0
        homeBackTimer.current = null
        setNotice((current) => current === BACK_EXIT_MESSAGE ? '' : current)
      }, BACK_EXIT_WINDOW_MS)
    }).then((handle) => {
      if (disposed) void handle.remove()
      else removeListener = () => handle.remove()
    })

    return () => {
      disposed = true
      if (removeListener) void removeListener()
    }
  }, [category, search, toolWindowOpen, view])

  function chooseTool(tool: PdfTool) {
    clearPendingExit()
    setActiveToolId(tool.id)
    setOptions(initialOptions(tool))
    setFiles([])
    setResults([])
    setError('')
    setView('tools')
    setToolWindowOpen(true)
    setToolWindowMaximized(false)
    setScannerMode('document')
  }

  function acceptFiles(incoming: FileList | File[]) {
    const selected = Array.from(incoming)
    setFiles((current) => activeTool.id === 'scan'
      ? [...current, ...selected]
      : activeTool.multiple ? selected : selected.slice(0, 1))
    setResults([])
    setError('')
  }

  function selectScannerMode(mode: AndroidScannerMode) {
    setScannerMode(mode)
    setOptions((current) => ({
      ...current,
      pageFormat: mode === 'id' ? 'id' : mode === 'document' ? 'a4' : 'auto',
    }))
  }

  async function startAndroidScan() {
    const pageLimit = scannerMode === 'id' ? 2 - files.length : 24
    if (pageLimit < 1) {
      setError('An ID scan already has front and back pages. Remove a page before scanning again.')
      return
    }
    setScannerBusy(true)
    setError('')
    try {
      const scanned = await scanAndroidDocuments(scannerMode, pageLimit)
      if (!scanned.length) return
      setFiles((current) => {
        const appended = scanned.map((file, index) => {
          const page = current.length + index + 1
          const name = scannerMode === 'id'
            ? (page === 1 ? 'id-front.jpg' : 'id-back.jpg')
            : `${scannerMode}-page-${String(page).padStart(2, '0')}.jpg`
          return new File([file], name, { type: file.type || 'image/jpeg', lastModified: file.lastModified })
        })
        return scannerMode === 'id' ? [...current, ...appended].slice(0, 2) : [...current, ...appended]
      })
      setResults([])
      setNotice(`Added ${scanned.length} scanned page${scanned.length === 1 ? '' : 's'}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Android document scanner failed.')
    } finally {
      setScannerBusy(false)
    }
  }

  function renamePage(index: number, nextName: string) {
    setFiles((current) => current.map((file, fileIndex) => fileIndex === index
      ? new File([file], nextName, { type: file.type, lastModified: file.lastModified })
      : file))
    setResults([])
  }

  function moveFile(index: number, direction: -1 | 1) {
    const next = [...files]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setFiles(next)
  }

  async function runTool() {
    setError('')
    setResults([])
    setProgress({ percent: 1, message: 'Preparing local processor' })
    try {
      const output = await processTool(activeTool.id, files, options, setProgress)
      setResults(output)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The operation failed.')
    } finally {
      setProgress(null)
    }
  }

  async function saveResultsToVault() {
    if (vaultPassword.length < 10) {
      setError('Use a vault password with at least 10 characters.')
      return
    }
    setBusyAction('vault-save')
    setError('')
    try {
      for (const result of results) {
        await saveEnvelope(await encryptForVault(result.bytes, { name: result.name, mime: result.mime }, vaultPassword))
      }
      await refreshVault()
      setVaultPassword('')
      setNotice(`Encrypted ${results.length} result${results.length === 1 ? '' : 's'} in the local vault.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not encrypt the result.')
    } finally {
      setBusyAction('')
    }
  }

  async function unlockRecord(record: VaultRecord, biometric = false) {
    setBusyAction(`unlock-${record.id}`)
    setError('')
    try {
      const password = biometric ? await readBiometricVaultPassword() : (unlockPasswords[record.id] || '')
      const bytes = await decryptVaultEnvelope(record, password)
      await saveArtifactToDevice({ name: record.name, mime: record.mime, bytes, summary: 'Decrypted from local vault.' })
      setNotice(`${record.name} was decrypted locally.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not unlock this document.')
    } finally {
      setBusyAction('')
    }
  }

  async function exportEnvelope(record: VaultRecord) {
    await saveArtifactToDevice({
      name: `${record.name}.ihpdf`, mime: 'application/vnd.ihatepdf+json',
      bytes: textToBytes(serializeEnvelope(record)), summary: 'Encrypted vault envelope.',
    })
  }

  async function deleteLocalRecord(record: VaultRecord) {
    if (!window.confirm(`Delete the local encrypted copy of ${record.name}? This does not delete any GitHub copy.`)) return
    await removeVaultRecord(record.id)
    await refreshVault()
    setNotice(`Deleted the local encrypted copy of ${record.name}.`)
  }

  async function importEnvelopes(input: FileList | null) {
    if (!input) return
    setBusyAction('import')
    setError('')
    try {
      for (const file of Array.from(input)) await saveEnvelope(parseEnvelope(bytesToText(new Uint8Array(await file.arrayBuffer()))))
      await refreshVault()
      setNotice(`Imported ${input.length} encrypted file${input.length === 1 ? '' : 's'}.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import the encrypted file.')
    } finally {
      setBusyAction('')
    }
  }

  async function saveCloudSettings() {
    setBusyAction('cloud-settings')
    setError('')
    try {
      await testGitHubConnection(githubConfig, githubToken)
      localStorage.setItem('ihatepdf-github-config', JSON.stringify(githubConfig))
      await saveGitHubToken(githubToken)
      setNotice('Private repository connection verified. Sync remains manual.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect to GitHub.')
    } finally {
      setBusyAction('')
    }
  }

  async function refreshCloud() {
    setBusyAction('cloud-list')
    setError('')
    try {
      const listed = await listCloudFiles(githubConfig, githubToken)
      setRemoteFiles(listed.map(({ name, path, size }) => ({ name, path, size })))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not list encrypted cloud files.')
    } finally {
      setBusyAction('')
    }
  }

  async function uploadRecord(record: VaultRecord) {
    setBusyAction(`upload-${record.id}`)
    setError('')
    try {
      const name = await uploadEncryptedEnvelope(githubConfig, githubToken, record)
      setNotice(`Uploaded encrypted ${name}.`)
      await refreshCloud()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cloud upload failed.')
    } finally {
      setBusyAction('')
    }
  }

  async function downloadRecord(path: string) {
    setBusyAction(`download-${path}`)
    setError('')
    try {
      const record = await downloadEncryptedEnvelope(githubConfig, githubToken, path)
      await saveEnvelope(record)
      await refreshVault()
      setNotice(`${record.name} was copied into the local encrypted vault.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cloud download failed.')
    } finally {
      setBusyAction('')
    }
  }

  async function enrollBiometrics() {
    setBusyAction('biometric')
    setError('')
    try {
      await enableBiometricVaultPassword(biometricPassword)
      setBiometricPassword('')
      setBiometricStatus('Biometric vault unlock is enabled on this Android device.')
      setNotice('Biometric unlock enabled.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not enable biometric unlock.')
    } finally {
      setBusyAction('')
    }
  }

  function navigate(next: ViewName) {
    clearPendingExit()
    setView(next)
    setError('')
    if (next !== 'tools') setToolWindowOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function clearPendingExit() {
    homeBackAt.current = 0
    if (homeBackTimer.current !== null) {
      window.clearTimeout(homeBackTimer.current)
      homeBackTimer.current = null
    }
    setNotice((current) => current === BACK_EXIT_MESSAGE ? '' : current)
  }

  function resetToInitialMenu() {
    clearPendingExit()
    setView('tools')
    setToolWindowOpen(false)
    setToolWindowMaximized(false)
    setCategory('All')
    setSearch('')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={resetToInitialMenu} aria-label="I Hate PDF home">
          <span className="brand-mark"><FilePdf size={22} weight="fill" /></span>
          <span>I HATE PDF</span>
        </button>
        <div className="top-search"><MagnifyingGlass size={23} weight="regular" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && filteredTools[0]) chooseTool(filteredTools[0]) }} placeholder="SEARCH TOOLS" aria-label="Search tools" /></div>
        <div className="local-indicator"><span /> LOCAL <i /> LOCKED</div>
        <nav className="nav" aria-label="Primary navigation">
          <button title="Tools" aria-label="Tools" className={view === 'tools' && !toolWindowOpen ? 'active' : ''} onClick={resetToInitialMenu}><DotsNine size={21} weight="bold" /><span>Tools</span></button>
          {isAndroidNative() && <button title="Scan" aria-label="Scan documents" className={view === 'tools' && toolWindowOpen && activeTool.id === 'scan' ? 'active' : ''} onClick={() => chooseTool(toolById.get('scan')!)}><Scan size={21} weight="bold" /><span>Scan</span></button>}
          <button title="Vault" aria-label="Vault" className={view === 'vault' ? 'active' : ''} onClick={() => navigate('vault')}><FileLock size={21} weight="bold" /><span>Vault</span></button>
          <button title="Cloud" aria-label="Cloud" className={view === 'cloud' ? 'active' : ''} onClick={() => navigate('cloud')}><CloudArrowUp size={21} weight="bold" /><span>Cloud</span></button>
          <button title="Settings" aria-label="Settings" className={view === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><GearSix size={21} weight="bold" /><span>Settings</span></button>
        </nav>
      </header>

      {error && <div className="global-message error-message" role="alert"><Info size={18} weight="fill" /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} weight="bold" /></button></div>}
      {notice && <div className="global-message notice-message" role="status"><Check size={18} weight="bold" /><span>{notice}</span></div>}

      {view === 'tools' && (
        <main>
          <section className="hero reveal">
            <p className="eyebrow">PRIVATE DOCUMENT WORKBENCH</p>
            <h1>PDF work without<br />the upload anxiety.</h1>
            <p className="hero-copy">Thirty-three tools run on your device whenever the open web can do the job. Save encrypted work locally. Push to your private GitHub repository only when you ask.</p>
            <div className="trust-row">
              <span><HardDrive size={17} weight="bold" /> Local processing</span>
              <span><LockKey size={17} weight="bold" /> AES-GCM vault</span>
              <span><GitBranch size={17} weight="bold" /> Manual cloud sync</span>
            </div>
          </section>

          <section className="tool-browser reveal">
            <div className="section-heading">
              <div><p className="eyebrow">THE TOOLBOX</p><h2>Choose the job. Keep the file.</h2></div>
              <div className="search-box"><MagnifyingGlass size={19} weight="bold" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a tool" aria-label="Find a tool" /></div>
            </div>
            <div className="category-row" aria-label="Tool categories">
              {(['All', ...categories] as const).map((item) => <button title={item} aria-label={item} key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}><CategoryGlyph category={item} /><span>{item}</span></button>)}
            </div>
            <div className="tool-grid">
              {filteredTools.map((tool, index) => (
                <button title={tool.name} aria-label={tool.name} className={`tool-card ${activeTool.id === tool.id && toolWindowOpen ? 'selected' : ''}`} style={{ '--index': index } as React.CSSProperties} key={tool.id} onClick={() => chooseTool(tool)}>
                  <span className={`tool-icon category-${tool.category.toLowerCase().replaceAll(' ', '-')}`}><ToolGlyph id={tool.id} /></span>
                  <span className="tool-card-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span>
                  <span className={`capability capability-${tool.capability}`}>{capabilityLabel(tool)}</span>
                  <ArrowUpRight className="tool-arrow" size={18} weight="bold" />
                </button>
              ))}
            </div>
          </section>

          {toolWindowOpen && <section className={`workbench reveal ${toolWindowMaximized ? 'maximized' : ''}`}>
            <div className="window-bar"><DotsNine size={21} weight="bold" /><small>{activeTool.shortName.toUpperCase()}</small><div className="window-actions"><button aria-label="Minimize tool window" title="Minimize" onClick={() => setToolWindowOpen(false)}><Minus size={17} /></button><button aria-label="Maximize tool window" title="Maximize" onClick={() => setToolWindowMaximized(!toolWindowMaximized)}><ArrowsOut size={16} /></button><button aria-label="Close tool window" title="Close" onClick={() => setToolWindowOpen(false)}><X size={18} /></button></div></div>
            <div className="workbench-layout">
              <aside className="workbench-info">
                <p className="eyebrow">ACTIVE TOOL</p>
                <h2>{activeTool.name}</h2>
                <p>{activeTool.description}</p>
                <div className={`capability-note note-${activeTool.capability}`}><ShieldCheck size={20} weight="fill" /><div><strong>{capabilityLabel(activeTool)}</strong><span>{activeTool.capabilityNote}</span></div></div>
                <p className="privacy-note">Files are not sent to our server. Browser operations use memory and local storage only.</p>
              </aside>
              <div className="processor-panel">
                {activeTool.id === 'scan' && isAndroidNative() && <div className="scanner-console">
                  <div className="scanner-mode-row" role="group" aria-label="Scanner mode">
                    {(['pdf', 'document', 'id'] as AndroidScannerMode[]).map((mode) => <button
                      key={mode}
                      className={scannerMode === mode ? 'active' : ''}
                      aria-pressed={scannerMode === mode}
                      onClick={() => selectScannerMode(mode)}
                    >{mode === 'document' ? 'DOC' : mode.toUpperCase()}</button>)}
                  </div>
                  <button
                    className="native-scan-button"
                    aria-label={files.length ? 'Scan and add pages' : 'Start document scanner'}
                    onClick={() => void startAndroidScan()}
                    disabled={scannerBusy || (scannerMode === 'id' && files.length >= 2)}
                  >
                    {scannerBusy ? <SpinnerGap className="spin" size={30} weight="bold" /> : files.length ? <FilePlus size={30} weight="bold" /> : <Scan size={32} weight="bold" />}
                    <span>{scannerBusy ? 'OPENING' : files.length ? 'ADD' : 'SCAN'}</span>
                  </button>
                  <div className="scan-page-count"><strong>{String(files.length).padStart(2, '0')}</strong><span>PAGES</span></div>
                  <p className="scanner-permission-note"><Camera size={16} weight="bold" /> Camera permission is requested when Scan opens. Captures stay on this device.</p>
                </div>}

                {!(activeTool.id === 'scan' && isAndroidNative()) && <label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); acceptFiles(event.dataTransfer.files) }}>
                  <input type="file" accept={activeTool.accepts} multiple={activeTool.multiple} capture={activeTool.id === 'scan' ? 'environment' : undefined} onChange={(event) => event.target.files && acceptFiles(event.target.files)} />
                  <span className="drop-icon"><FileArrowUp size={28} weight="bold" /></span>
                  <strong>{files.length ? 'Add more files' : 'Drop files here or choose from device'}</strong>
                  <small>{activeTool.multiple ? 'Multiple files accepted. Their displayed order is used.' : 'One file is processed at a time.'}</small>
                </label>}

                {files.length > 0 && <div className="file-queue">
                  {files.map((file, index) => <div className={`file-row ${activeTool.id === 'scan' ? 'scan-page-row' : ''}`} key={`${file.lastModified}-${index}`}>
                    {activeTool.id === 'scan' ? <Image size={20} weight="bold" /> : <FilePdf size={20} weight="fill" />}
                    <div>{activeTool.id === 'scan'
                      ? <><input className="scan-page-name" value={file.name} aria-label={`Rename page ${index + 1}`} onChange={(event) => renamePage(index, event.target.value)} /><span>PAGE {String(index + 1).padStart(2, '0')} · {formatBytes(file.size)}</span></>
                      : <><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></>}
                    </div>
                    {files.length > 1 && <div className="row-actions"><button onClick={() => moveFile(index, -1)} disabled={index === 0} aria-label="Move file up"><ArrowUp size={15} weight="bold" /></button><button onClick={() => moveFile(index, 1)} disabled={index === files.length - 1} aria-label="Move file down"><ArrowDown size={15} weight="bold" /></button></div>}
                    <button className="quiet-icon" onClick={() => setFiles(files.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove ${file.name}`}><X size={16} weight="bold" /></button>
                  </div>)}
                </div>}

                {activeTool.options && activeTool.options.length > 0 && <div className="options-grid">
                  {activeTool.options.map((option) => <label key={option.key} className={option.type === 'textarea' ? 'wide-field' : option.type === 'checkbox' ? 'checkbox-field' : ''}>
                    {option.type !== 'checkbox' && <span>{option.label}</span>}
                    {option.type === 'select' ? <select value={String(options[option.key] ?? '')} onChange={(event) => setOptions({ ...options, [option.key]: event.target.value })}>{option.choices?.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
                      : option.type === 'textarea' ? <textarea rows={5} value={String(options[option.key] ?? '')} placeholder={option.placeholder} onChange={(event) => setOptions({ ...options, [option.key]: event.target.value })} />
                        : option.type === 'checkbox' ? <><input type="checkbox" checked={Boolean(options[option.key])} onChange={(event) => setOptions({ ...options, [option.key]: event.target.checked })} /><span>{option.label}</span></>
                          : <input type={option.type} value={String(options[option.key] ?? '')} placeholder={option.placeholder} step={option.type === 'number' ? 'any' : undefined} onChange={(event) => setOptions({ ...options, [option.key]: option.type === 'number' ? Number(event.target.value) : event.target.value })} />}
                    {option.help && <small>{option.help}</small>}
                  </label>)}
                </div>}

                <button aria-label={activeTool.id === 'scan' ? 'Create PDF' : `Run ${activeTool.shortName}`} title={activeTool.id === 'scan' ? 'Create PDF' : `Run ${activeTool.shortName}`} className="primary-button process-button" disabled={scannerBusy || progress !== null || (files.length === 0 && activeTool.id !== 'html-to-pdf')} onClick={() => void runTool()}>
                  {progress ? <><SpinnerGap className="spin" size={23} weight="bold" /><span className="button-label">{progress.message} · {progress.percent}%</span></> : <><Play size={24} weight="fill" /><span className="button-label">{activeTool.id === 'scan' ? 'Create PDF' : `Run ${activeTool.shortName}`}</span></>}
                </button>
                {progress && <div className="progress-track" aria-label={`${progress.percent}% complete`}><span style={{ transform: `scaleX(${progress.percent / 100})` }} /></div>}

                {results.length > 0 && <div className="result-panel">
                  <div className="result-heading"><Check size={20} weight="bold" /><div><strong>Finished locally</strong><span>{results[0].summary}</span></div></div>
                  {results.map((result) => <div className="result-row" key={result.name}><div><strong>{result.name}</strong><span>{formatBytes(result.bytes.byteLength)}</span></div><button aria-label={`Save ${result.name}`} title="Save" className="secondary-button" onClick={() => void saveArtifactToDevice(result)}><DownloadSimple size={19} weight="bold" /><span className="button-label">Save</span></button></div>)}
                  <div className="vault-save-row"><label><span>VAULT KEY</span><input type="password" value={vaultPassword} onChange={(event) => setVaultPassword(event.target.value)} placeholder="10+ CHARACTERS" /></label><button aria-label="Encrypt in vault" title="Encrypt in vault" className="secondary-button" onClick={() => void saveResultsToVault()} disabled={busyAction === 'vault-save'}><FileLock size={19} weight="bold" /><span className="button-label">Encrypt in vault</span></button></div>
                </div>}
              </div>
            </div>
          </section>}
        </main>
      )}

      {view === 'vault' && <main className="page-main">
        <section className="page-header"><div><p className="eyebrow">LOCAL ENCRYPTED STORAGE</p><h1>Your vault stays here.</h1><p>Documents are encrypted before IndexedDB storage. A password is always required; Android biometrics can release a password held by the platform keystore.</p></div><label className="secondary-button file-button"><FolderOpen size={18} weight="bold" /> Import encrypted file<input type="file" accept=".ihpdf,application/vnd.ihatepdf+json" multiple onChange={(event) => void importEnvelopes(event.target.files)} /></label></section>
        <section className="records-list">
          {vaultRecords.length === 0 ? <div className="empty-state"><FileLock size={34} weight="duotone" /><h2>No encrypted documents yet</h2><p>Process a file and choose “Encrypt in vault.”</p></div>
            : vaultRecords.map((record) => <article className="record-row" key={record.id}>
              <span className="record-icon"><FileLock size={22} weight="fill" /></span>
              <div className="record-copy"><strong>{record.name}</strong><span>{formatBytes(record.originalSize)} · encrypted {new Date(record.updatedAt).toLocaleString()}</span></div>
              <label className="inline-password"><span>Password</span><input type="password" value={unlockPasswords[record.id] || ''} onChange={(event) => setUnlockPasswords({ ...unlockPasswords, [record.id]: event.target.value })} /></label>
              <div className="record-actions"><button className="primary-button small" onClick={() => void unlockRecord(record)} disabled={busyAction === `unlock-${record.id}`}><LockKey size={16} weight="bold" /> Unlock</button>{isAndroidNative() && <button className="secondary-button small" onClick={() => void unlockRecord(record, true)}><Fingerprint size={17} weight="bold" /> Biometric</button>}<button className="icon-button" onClick={() => void exportEnvelope(record)} title="Export encrypted file"><DownloadSimple size={18} weight="bold" /></button><button className="icon-button danger" onClick={() => void deleteLocalRecord(record)} title="Delete local encrypted file"><Trash size={18} weight="bold" /></button></div>
            </article>)}
        </section>
      </main>}

      {view === 'cloud' && <main className="page-main">
        <section className="page-header"><div><p className="eyebrow">PRIVATE GITHUB STORAGE</p><h1>Cloud, only on command.</h1><p>Configure a private repository with a fine-grained token limited to Contents read/write. Only <code>.ihpdf</code> encrypted envelopes are uploaded.</p></div><div className="manual-badge"><CloudArrowUp size={19} weight="bold" /> NO AUTO-SAVE</div></section>
        <section className="settings-card cloud-config">
          <div className="section-title"><GitBranch size={22} weight="bold" /><div><h2>Repository connection</h2><p>The token is session-only in the web app and Android secure storage in the native app.</p></div></div>
          <div className="form-grid">
            <label><span>Owner</span><input value={githubConfig.owner} onChange={(event) => setGithubConfig({ ...githubConfig, owner: event.target.value })} placeholder="github-user" /></label>
            <label><span>Private repository</span><input value={githubConfig.repo} onChange={(event) => setGithubConfig({ ...githubConfig, repo: event.target.value })} /></label>
            <label><span>Branch</span><input value={githubConfig.branch} onChange={(event) => setGithubConfig({ ...githubConfig, branch: event.target.value })} /></label>
            <label><span>Folder</span><input value={githubConfig.folder} onChange={(event) => setGithubConfig({ ...githubConfig, folder: event.target.value })} /></label>
            <label className="wide-field"><span>Fine-grained token</span><input type="password" value={githubToken} onChange={(event) => setGithubToken(event.target.value)} placeholder="Contents: read and write for this repository only" /></label>
          </div>
          <div className="button-row"><button className="primary-button" onClick={() => void saveCloudSettings()} disabled={busyAction === 'cloud-settings'}><ShieldCheck size={18} weight="bold" /> Verify and save</button><button className="text-button" onClick={() => void clearGitHubToken().then(() => setGithubToken(''))}>Forget token</button></div>
        </section>
        <div className="cloud-columns">
          <section className="settings-card"><div className="section-title"><HardDrive size={22} weight="bold" /><div><h2>Local vault</h2><p>Choose an encrypted object to upload now.</p></div></div>{vaultRecords.length === 0 ? <p className="muted">The local vault is empty.</p> : <div className="compact-list">{vaultRecords.map((record) => <div key={record.id}><span><strong>{record.name}</strong><small>{formatBytes(record.originalSize)}</small></span><button className="secondary-button small" onClick={() => void uploadRecord(record)} disabled={busyAction === `upload-${record.id}`}><CloudArrowUp size={16} weight="bold" /> Upload</button></div>)}</div>}</section>
          <section className="settings-card"><div className="section-title"><CloudArrowDown size={22} weight="bold" /><div><h2>Repository vault</h2><p>Refresh manually, then copy an encrypted object down.</p></div></div><button className="secondary-button" onClick={() => void refreshCloud()} disabled={busyAction === 'cloud-list'}><CloudArrowDown size={17} weight="bold" /> Refresh list</button>{remoteFiles.length > 0 && <div className="compact-list remote-list">{remoteFiles.map((remote) => <div key={remote.path}><span><strong>{remote.name}</strong><small>{formatBytes(remote.size)}</small></span><button className="secondary-button small" onClick={() => void downloadRecord(remote.path)} disabled={busyAction === `download-${remote.path}`}><DownloadSimple size={16} weight="bold" /> Copy local</button></div>)}</div>}</section>
        </div>
      </main>}

      {view === 'settings' && <main className="page-main">
        <section className="page-header"><div><p className="eyebrow">SECURITY AND CAPABILITIES</p><h1>Know what the app does.</h1><p>This screen records the security boundary and the browser limitations instead of hiding them behind a generic promise.</p></div></section>
        <div className="settings-stack">
          <section className="settings-card"><div className="section-title"><Fingerprint size={24} weight="bold" /><div><h2>Android biometric unlock</h2><p>{biometricStatus}</p></div></div>{isAndroidNative() ? <><div className="form-grid single"><label><span>Vault password to protect with the Android keystore</span><input type="password" value={biometricPassword} onChange={(event) => setBiometricPassword(event.target.value)} placeholder="Same password you use for vault documents" /></label></div><div className="button-row"><button className="primary-button" onClick={() => void enrollBiometrics()} disabled={busyAction === 'biometric'}><Fingerprint size={18} weight="bold" /> Enable biometric unlock</button><button className="text-button" onClick={() => void disableBiometricVaultPassword().then(() => setBiometricStatus('Biometric vault password removed.'))}>Disable</button></div></> : <p className="constraint-note">Biometric controls appear only inside the installed Android app. The PC browser always asks for the vault password.</p>}</section>
          <section className="settings-card"><div className="section-title"><LockKey size={24} weight="bold" /><div><h2>Encryption boundary</h2><p>Vault files use AES-GCM-256 with a unique salt and IV. Password keys are derived with PBKDF2-SHA-256 at 310,000 iterations. File identity metadata is authenticated.</p></div></div><div className="fact-grid"><div><strong>Original files</strong><span>Never auto-uploaded</span></div><div><strong>Cloud files</strong><span>Encrypted envelopes only</span></div><div><strong>Web token</strong><span>Session storage only</span></div><div><strong>Android token</strong><span>Platform secure storage</span></div></div></section>
          <section className="settings-card"><div className="section-title"><Files size={24} weight="bold" /><div><h2>Tool coverage</h2><p>Core organization, editing, redaction, standard PDF encryption, extraction and conversion run locally. Three boundaries remain explicit.</p></div></div><div className="limitations"><div><span>01</span><p><strong>PDF/A needs a companion.</strong> Standards compliance requires Ghostscript conversion and veraPDF validation; the browser does not label an unverified file as archival.</p></div><div><span>02</span><p><strong>Office conversion is structural.</strong> Text, data and rendered PDF pages are preserved, but advanced Office layout and animation are not reproduced by browser libraries.</p></div><div><span>03</span><p><strong>Translation depends on the browser.</strong> It uses the free on-device Translator API where available and never falls back to a paid or remote service.</p></div></div></section>
        </div>
      </main>}

      <footer><span><b /> LOCAL</span><span>0 UPLOADS</span><span>AES-256</span></footer>
    </div>
  )
}

export default App
