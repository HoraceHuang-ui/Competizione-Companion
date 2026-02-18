import { ref } from 'vue'
import JSZip from 'jszip'
import { snackbar } from 'mdui'
import { translate } from '@/i18n'
import trackData from '@/utils/trackData'
import { trackIndex } from '@/utils/enums'

type FileEntry = {
  file: File
  path: string
}

type VirtualFile = {
  path: string
  name: string
  content: string
}

type TreeNode = {
  files: VirtualFile[]
  children: Map<string, TreeNode>
}

type BatchImportItem = {
  fileName: string
  setup: any
  track: any
}

type TrackImportGroup = {
  trackKey: string
  carName: string
  items: Array<{ fileName: string; setup: any }>
}

const trackKeyMap = new Map(
  trackData.map(track => [track[trackIndex.ID].toLowerCase(), track[0]]),
)

const normalizePath = (path: string) => {
  return path.replace(/\\/g, '/').replace(/^\/+/, '')
}

const ensureJsonFileName = (name: string) => {
  return name.toLowerCase().endsWith('.json') ? name : `${name}.json`
}

const isJsonFileName = (name: string) => {
  return name.toLowerCase().endsWith('.json')
}

const isZipFileName = (name: string) => {
  return name.toLowerCase().endsWith('.zip')
}

const isIgnoredPath = (path: string) => {
  const parts = normalizePath(path).split('/').filter(Boolean)
  return parts.some(part => part === '__MACOSX' || part.startsWith('.'))
}

const parseSetupContent = (content: string) => {
  try {
    const jsonContent = JSON.parse(content)
    if (!jsonContent?.carName) {
      return undefined
    }
    return jsonContent
  } catch (err) {
    return undefined
  }
}

const buildTree = (files: VirtualFile[]) => {
  const root: TreeNode = { files: [], children: new Map() }

  for (const file of files) {
    const parts = normalizePath(file.path).split('/').filter(Boolean)
    const fileName = parts.pop() || file.name
    let node = root
    for (const part of parts) {
      if (!node.children.has(part)) {
        node.children.set(part, { files: [], children: new Map() })
      }
      node = node.children.get(part) as TreeNode
    }
    node.files.push({ ...file, name: fileName })
  }

  return root
}

const analyzeTree = (
  node: TreeNode,
):
  | { mode: 'flat'; files: VirtualFile[] }
  | { mode: 'track'; tracks: Array<[string, TreeNode]> }
  | { mode: 'none' } => {
  const trackChildren = Array.from(node.children.entries()).filter(([name]) =>
    trackKeyMap.has(name.toLowerCase()),
  )

  if (node.files.length > 0) {
    return { mode: 'flat', files: node.files }
  }

  if (trackChildren.length > 0) {
    return { mode: 'track', tracks: trackChildren }
  }

  if (node.children.size === 1) {
    const onlyChild = Array.from(node.children.values())[0]
    return analyzeTree(onlyChild)
  }

  return { mode: 'none' }
}

const collectNodeFiles = (node: TreeNode) => {
  const collected = [...node.files]
  for (const child of node.children.values()) {
    collected.push(...collectNodeFiles(child))
  }
  return collected
}

const extractZipFiles = async (file: File) => {
  const zip = await JSZip.loadAsync(file)
  const files: VirtualFile[] = []
  const entries = Object.values(zip.files)

  for (const entry of entries) {
    if (entry.dir || !isJsonFileName(entry.name)) {
      continue
    }
    if (isIgnoredPath(entry.name)) {
      continue
    }
    const content = await entry.async('string')
    const path = normalizePath(entry.name)
    const name = path.split('/').pop() || path
    files.push({ path, name, content })
  }

  return files
}

const collectVirtualFiles = async (entries: FileEntry[]) => {
  const collected: VirtualFile[] = []

  for (const entry of entries) {
    const name = entry.file.name
    if (isZipFileName(name)) {
      collected.push(...(await extractZipFiles(entry.file)))
      continue
    }

    if (!isJsonFileName(name)) {
      continue
    }

    if (isIgnoredPath(entry.path || name)) {
      continue
    }

    const content = await entry.file.text()
    collected.push({
      path: normalizePath(entry.path || name),
      name,
      content,
    })
  }

  return collected
}

const readFileEntry = (fileEntry: any) => {
  return new Promise<File>(resolve => {
    fileEntry.file((file: File) => resolve(file))
  })
}

const readDirectoryEntries = (dirEntry: any) => {
  return new Promise<any[]>(resolve => {
    const reader = dirEntry.createReader()
    const entries: any[] = []
    const readBatch = () => {
      reader.readEntries((batch: any[]) => {
        if (!batch.length) {
          resolve(entries)
          return
        }
        entries.push(...batch)
        readBatch()
      })
    }
    readBatch()
  })
}

const collectEntryFiles = async (
  entry: any,
  basePath = '',
): Promise<FileEntry[]> => {
  if (entry.isFile) {
    const file = await readFileEntry(entry)
    return [
      {
        file,
        path: normalizePath(`${basePath}${entry.name}`),
      },
    ]
  }

  if (entry.isDirectory) {
    const dirEntries = await readDirectoryEntries(entry)
    const results: FileEntry[] = []
    for (const child of dirEntries) {
      results.push(
        ...(await collectEntryFiles(child, `${basePath}${entry.name}/`)),
      )
    }
    return results
  }

  return []
}

const collectDropEntries = async (event: DragEvent) => {
  const items = Array.from(event.dataTransfer?.items || [])
  const entries = items
    .map(item => (item as any).webkitGetAsEntry?.())
    .filter(Boolean)

  if (entries.some(entry => entry.isDirectory)) {
    const results: FileEntry[] = []
    for (const entry of entries) {
      results.push(...(await collectEntryFiles(entry, '')))
    }
    return results
  }

  return Array.from(event.dataTransfer?.files || []).map(file => ({
    file,
    path: file.name,
  }))
}

const fileEntryFromList = (fileList: FileList) => {
  return Array.from(fileList).map(file => ({
    file,
    path: file.webkitRelativePath || file.name,
  }))
}

const shouldUseBatchImport = (entries: FileEntry[]) => {
  if (entries.length > 1) return true
  return entries.some(
    entry =>
      isZipFileName(entry.file.name) || normalizePath(entry.path).includes('/'),
  )
}

export const useSetupImport = () => {
  const batchImportOpen = ref(false)
  const batchImportItems = ref<BatchImportItem[]>([])
  const batchImportSaving = ref(false)

  const trackImportConfirmOpen = ref(false)
  const trackImportGroups = ref<TrackImportGroup[]>([])
  const trackImportSaving = ref(false)

  const closeBatchImportDialog = () => {
    batchImportOpen.value = false
    batchImportItems.value = []
    batchImportSaving.value = false
  }

  const openBatchImportDialog = (items: BatchImportItem[]) => {
    batchImportItems.value = items
    batchImportOpen.value = true
  }

  const closeTrackImportDialog = () => {
    trackImportConfirmOpen.value = false
    trackImportGroups.value = []
    trackImportSaving.value = false
  }

  const openTrackImportDialog = (groups: TrackImportGroup[]) => {
    trackImportGroups.value = groups
    trackImportConfirmOpen.value = true
  }

  const saveBatchImport = async () => {
    if (batchImportSaving.value) return

    if (!batchImportItems.value.length) {
      snackbar({
        message: translate('setup.batchImportEmpty'),
        autoCloseDelay: 3000,
      })
      return
    }

    if (batchImportItems.value.some(item => !item.track)) {
      snackbar({
        message: translate('setup.batchImportTrackRequired'),
        autoCloseDelay: 3000,
      })
      return
    }

    batchImportSaving.value = true
    try {
      for (const item of batchImportItems.value) {
        await window.fs.setupFile(
          item.setup.carName,
          item.track.value,
          ensureJsonFileName(item.fileName),
          JSON.stringify(item.setup),
          true,
        )
      }
      closeBatchImportDialog()
    } finally {
      batchImportSaving.value = false
    }
  }

  const buildTrackImportGroups = (tracks: Array<[string, TreeNode]>) => {
    const groups: TrackImportGroup[] = []

    for (const [folderName, node] of tracks) {
      const trackKey = trackKeyMap.get(folderName.toLowerCase())
      if (!trackKey) continue

      const files = collectNodeFiles(node)
      let standardCarName: string | undefined
      const parsed: Array<{ fileName: string; setup: any }> = []

      for (const file of files) {
        const setup = parseSetupContent(file.content)
        if (!setup) continue
        if (!standardCarName) {
          standardCarName = setup.carName
        }
        parsed.push({ fileName: file.name, setup })
      }

      if (!standardCarName || !parsed.length) continue

      groups.push({
        trackKey,
        carName: standardCarName,
        items: parsed,
      })
    }

    return groups
  }

  const saveTrackImportGroups = async (groups: TrackImportGroup[]) => {
    if (trackImportSaving.value) return
    trackImportSaving.value = true
    try {
      for (const group of groups) {
        for (const item of group.items) {
          item.setup.carName = group.carName
          await window.fs.setupFile(
            group.carName,
            group.trackKey,
            ensureJsonFileName(item.fileName),
            JSON.stringify(item.setup),
            true,
          )
        }
      }
      closeTrackImportDialog()
    } finally {
      trackImportSaving.value = false
    }
  }

  const handleBatchImport = async (entries: FileEntry[]) => {
    const virtualFiles = await collectVirtualFiles(entries)
    if (!virtualFiles.length) {
      snackbar({
        message: translate('setup.batchImportEmpty'),
        autoCloseDelay: 3000,
      })
      return
    }

    const tree = buildTree(virtualFiles)
    const result = analyzeTree(tree)

    if (result.mode === 'flat') {
      const items: BatchImportItem[] = []
      for (const file of result.files) {
        const setup = parseSetupContent(file.content)
        if (!setup) continue
        items.push({
          fileName: file.name,
          setup,
          track: undefined,
        })
      }

      if (!items.length) {
        snackbar({
          message: translate('setup.batchImportEmpty'),
          autoCloseDelay: 3000,
        })
        return
      }

      openBatchImportDialog(items)
      return
    }

    if (result.mode === 'track') {
      const groups = buildTrackImportGroups(result.tracks)
      if (!groups.length) {
        snackbar({
          message: translate('setup.trackImportEmpty'),
          autoCloseDelay: 3000,
        })
        return
      }
      openTrackImportDialog(groups)
      return
    }

    snackbar({
      message: translate('setup.batchImportEmpty'),
      autoCloseDelay: 3000,
    })
  }

  return {
    batchImportOpen,
    batchImportItems,
    batchImportSaving,
    trackImportConfirmOpen,
    trackImportGroups,
    trackImportSaving,
    closeBatchImportDialog,
    closeTrackImportDialog,
    saveBatchImport,
    saveTrackImportGroups,
    handleBatchImport,
    fileEntryFromList,
    collectDropEntries,
    shouldUseBatchImport,
  }
}

export type { FileEntry, BatchImportItem, TrackImportGroup }
