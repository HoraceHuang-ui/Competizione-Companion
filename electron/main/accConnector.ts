import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import dns from 'node:dns'

// 数据管道：ACC 局域网发现时，注入的 DLL 从这里读取要伪造的服务器列表
const DATA_PIPE = '\\\\.\\pipe\\competizione-acc-connector'
// 状态管道：DLL 被 ACC 加载后的握手，用于判定“注入已生效”
const STATUS_PIPE = '\\\\.\\pipe\\competizione-acc-connector-status'
const HOOK_HANDSHAKE_PREFIX = 'competizione-acc-connector'
const HOOK_VERSION = '1.0.0.0'
const MAX_SERVER_NAME_LEN_CHARS = 256

export interface ConnectorServer {
  name: string
  hostname: string
  port: number
}

interface ResolvedServer extends ConnectorServer {
  ip: Buffer | null // 4 字节 IPv4（网络字节序），解析失败为 null（跳过）
}

export interface ConnectorStatus {
  supported: boolean
  dllAvailable: boolean
  accPath: string | null
  accPathValid: boolean
  hookInstalled: boolean
  hookMatches: boolean
  hookConflict: boolean
  accRunning: boolean
  hookActive: boolean
  pipeRunning: boolean
  version: string
}

let win: BrowserWindow | null = null
let resolvedServers: ResolvedServer[] = []
let accPath: string | null = null
let hookActiveAt: number | null = null
let dataPipeRunning = false
let statusPipeRunning = false
let lastStatusJson = ''
let pollTimer: NodeJS.Timeout | null = null

// ---------- ACC 路径 ----------

const getUserDataFile = () => path.join(app.getPath('userData'), 'acc-connector.json')

function loadAccPath() {
  try {
    const data = JSON.parse(fs.readFileSync(getUserDataFile(), 'utf-8'))
    if (typeof data.accPath === 'string' && data.accPath) {
      accPath = data.accPath
    }
  } catch {
    accPath = null
  }
}

function saveAccPath(p: string) {
  accPath = p
  try {
    fs.mkdirSync(path.dirname(getUserDataFile()), { recursive: true })
    fs.writeFileSync(getUserDataFile(), JSON.stringify({ accPath: p }), 'utf-8')
  } catch (e) {
    console.error('[accConnector] Failed to save ACC path:', e)
  }
}

const getHookDllPath = (acc: string) =>
  path.join(acc, 'AC2', 'Binaries', 'Win64', 'hid.dll')

// 随应用分发的 DLL：打包后位于 resources/hook，开发时位于 native/out
function getBundledDllPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'hook', 'client-hooks.dll')
  }
  return path.join(process.env.APP_ROOT || '', 'native', 'out', 'client-hooks.dll')
}

function isAccDirValid(acc: string): boolean {
  return !!acc && fs.existsSync(path.dirname(getHookDllPath(acc)))
}

// ---------- Steam / ACC 安装目录发现 ----------

function regQuery(args: string[]): Promise<string> {
  return new Promise(resolve => {
    execFile(
      'reg.exe',
      ['query', ...args],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => resolve(err ? '' : stdout || ''),
    )
  })
}

async function findSteamPath(): Promise<string | null> {
  // 64 位注册表视图优先，再尝试 32 位视图
  const views: Array<[string, string]> = [
    ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath'],
    ['HKLM\\SOFTWARE\\Wow6432Node\\Valve\\Steam', 'InstallPath'],
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
  ]
  for (const [key, value] of views) {
    const out = await regQuery([key, '/v', value, '/reg:64'])
    const m = out.match(/REG_SZ\s+(.+)/)
    if (m) return m[1].trim()
    const out32 = await regQuery([key, '/v', value, '/reg:32'])
    const m32 = out32.match(/REG_SZ\s+(.+)/)
    if (m32) return m32[1].trim()
  }
  return null
}

// 极简 Valve VDF 解析：按行提取 "key" "value" 对（libraryfolders.vdf / appmanifest 均适用）
function vdfValues(content: string, key: string): string[] {
  const res: string[] = []
  const re = new RegExp('"' + key + '"\\s+"((?:[^"\\\\]|\\\\.)*)"', 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    res.push(m[1].replace(/\\\\/g, '\\'))
  }
  return res
}

export async function findAccInstallDir(): Promise<string | null> {
  if (process.platform !== 'win32') return null
  const steamPath = await findSteamPath()
  if (!steamPath) return null

  const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')
  if (!fs.existsSync(libraryFoldersPath)) return null

  let vdfContent = ''
  try {
    vdfContent = fs.readFileSync(libraryFoldersPath, 'utf-8')
  } catch {
    return null
  }

  const libraries = [steamPath, ...vdfValues(vdfContent, 'path')]
  for (const lib of libraries) {
    const manifestPath = path.join(lib, 'steamapps', 'appmanifest_805550.acf')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const acf = fs.readFileSync(manifestPath, 'utf-8')
      const installDir = vdfValues(acf, 'installdir')[0]
      if (!installDir) continue
      const candidate = path.join(lib, 'steamapps', 'common', installDir)
      if (fs.existsSync(path.join(candidate, 'AC2', 'Binaries', 'Win64'))) {
        return candidate
      }
    } catch {
      // ignore malformed manifest
    }
  }
  return null
}

// ---------- 服务器列表序列化（与 client-hooks 的 server_entry 结构对应） ----------

function utf32leBytes(str: string): Buffer {
  const out = Buffer.alloc(MAX_SERVER_NAME_LEN_CHARS * 4)
  let off = 0
  for (const ch of str) {
    const cp = ch.codePointAt(0) as number
    out.writeUInt32LE(cp, off)
    off += 4
  }
  return out
}

function buildServerData(): Buffer {
  const chunks: Buffer[] = []
  for (const server of resolvedServers.slice(0, 100)) {
    if (!server.ip) continue
    const displayName = server.name
      ? `${server.name} (${server.hostname}:${server.port})`
      : `${server.hostname}:${server.port}`
    const truncated = displayName.slice(0, MAX_SERVER_NAME_LEN_CHARS)

    const nameBuf = utf32leBytes(truncated)
    const entry = Buffer.alloc(MAX_SERVER_NAME_LEN_CHARS * 4 + 1 + 4 + 2)
    nameBuf.copy(entry, 0)
    entry.writeUInt8(truncated.length, MAX_SERVER_NAME_LEN_CHARS * 4) // UTF-16 长度，与上游一致
    server.ip.copy(entry, MAX_SERVER_NAME_LEN_CHARS * 4 + 1)
    entry.writeUInt16BE(server.port, MAX_SERVER_NAME_LEN_CHARS * 4 + 1 + 4)
    chunks.push(entry)
  }
  return Buffer.concat(chunks)
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

async function resolveServerIp(server: ConnectorServer): Promise<ResolvedServer> {
  const match = IPV4_RE.exec(String(server.hostname || '').trim())
  if (match) {
    const ok = match.slice(1).every(p => Number(p) >= 0 && Number(p) <= 255)
    if (ok) {
      return { ...server, ip: Buffer.from(match.slice(1).map(Number)) }
    }
  }
  try {
    const { address } = await dns.promises.lookup(server.hostname, {
      family: 4,
      verbatim: true,
    })
    const m = IPV4_RE.exec(address)
    if (m) {
      return { ...server, ip: Buffer.from(m.slice(1).map(Number)) }
    }
  } catch {
    // DNS 解析失败 → 跳过该服务器
  }
  return { ...server, ip: null }
}

// ---------- 命名管道服务器 ----------

function startPipeServers() {
  if (process.platform !== 'win32') return

  const dataServer = net.createServer(socket => {
    socket.on('error', () => {})
    socket.on('data', () => {})
    socket.write(buildServerData(), () => socket.end())
  })
  dataServer.on('error', err => {
    console.error('[accConnector] data pipe error:', err.message)
  })
  dataServer.listen(DATA_PIPE, () => {
    dataPipeRunning = true
    broadcastStatus()
  })

  const statusServer = net.createServer(socket => {
    let buf = ''
    socket.on('data', d => {
      buf += d.toString('utf-8')
    })
    socket.on('error', () => {})
    socket.on('close', () => {
      if (buf.startsWith(HOOK_HANDSHAKE_PREFIX)) {
        console.log('[accConnector] Hook handshake received:', buf.trim())
        hookActiveAt = Date.now()
        broadcastStatus()
      }
    })
  })
  statusServer.on('error', err => {
    console.error('[accConnector] status pipe error:', err.message)
  })
  statusServer.listen(STATUS_PIPE, () => {
    statusPipeRunning = true
    broadcastStatus()
  })
}

// ---------- ACC 运行状态检测 ----------

function isAccRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise(resolve => {
    execFile(
      'tasklist.exe',
      ['/FI', 'IMAGENAME eq AC2-Win64-Shipping.exe', '/NH'],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        resolve(
          !!stdout &&
            stdout.toLowerCase().includes('ac2-win64-shipping.exe'),
        )
      },
    )
  })
}

// ---------- hook 安装 / 卸载 ----------

function fileSha256(p: string): string | null {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
  } catch {
    return null
  }
}

async function installHook(): Promise<ConnectorStatus> {
  if (!accPath || !isAccDirValid(accPath)) {
    const discovered = await findAccInstallDir()
    if (discovered) {
      saveAccPath(discovered)
    } else {
      return buildStatus()
    }
  }
  const src = getBundledDllPath()
  if (!fs.existsSync(src)) return buildStatus()
  fs.copyFileSync(src, getHookDllPath(accPath))
  console.log('[accConnector] Hook installed to', getHookDllPath(accPath))
  return buildStatus()
}

function removeHook(): ConnectorStatus {
  if (!accPath) return buildStatus()
  const hookPath = getHookDllPath(accPath)
  if (!fs.existsSync(hookPath)) return buildStatus()
  // 只移除我们自己的 DLL，避免误删第三方注入
  const bundled = getBundledDllPath()
  const sameAsBundled =
    fs.existsSync(bundled) && fileSha256(hookPath) === fileSha256(bundled)
  if (!sameAsBundled) return buildStatus()
  fs.unlinkSync(hookPath)
  console.log('[accConnector] Hook removed from', hookPath)
  return buildStatus()
}

// ---------- 状态 ----------

function buildStatus(): ConnectorStatus {
  const bundled = getBundledDllPath()
  const dllAvailable = fs.existsSync(bundled)
  const accValid = !!accPath && isAccDirValid(accPath)
  const hookPath = accPath ? getHookDllPath(accPath) : ''
  const hookInstalled = !!accValid && fs.existsSync(hookPath)
  const hookMatches =
    hookInstalled && dllAvailable && fileSha256(hookPath) === fileSha256(bundled)

  return {
    supported: process.platform === 'win32',
    dllAvailable,
    accPath,
    accPathValid: accValid,
    hookInstalled,
    hookMatches,
    hookConflict: hookInstalled && !hookMatches,
    accRunning: false,
    hookActive: hookActiveAt !== null,
    pipeRunning: dataPipeRunning && statusPipeRunning,
    version: HOOK_VERSION,
  }
}

async function getStatus(): Promise<ConnectorStatus> {
  const status = buildStatus()
  status.accRunning = await isAccRunning()
  return status
}

function broadcastStatus() {
  if (!win || win.isDestroyed()) return
  getStatus().then(status => {
    const json = JSON.stringify(status)
    if (json !== lastStatusJson) {
      lastStatusJson = json
      win?.webContents.send('accConnector:status', status)
    }
  })
}

// ---------- IPC ----------
// 在模块加载时无条件注册（不依赖 createWindow 的执行路径），
// 保证渲染层调用任何 accConnector:* 通道时处理器一定存在

ipcMain.handle(
  'accConnector:setServers',
  async (_event, servers: ConnectorServer[]) => {
    const list = Array.isArray(servers) ? servers : []
    resolvedServers = await Promise.all(list.map(resolveServerIp))
  },
)
ipcMain.handle('accConnector:getStatus', () => getStatus())
ipcMain.handle('accConnector:discoverAccPath', async () => {
  const p = await findAccInstallDir()
  if (p) {
    saveAccPath(p)
  }
  return { path: p }
})
ipcMain.handle('accConnector:selectAccPath', async () => {
  const options: Electron.OpenDialogOptions = {
    title: 'Select ACC install folder',
    properties: ['openDirectory'],
  }
  const result =
    win && !win.isDestroyed()
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
  if (!result.canceled && result.filePaths.length > 0) {
    const selected = result.filePaths[0]
    if (fs.existsSync(path.join(selected, 'AC2', 'Binaries', 'Win64'))) {
      saveAccPath(selected)
    } else {
      console.warn('[accConnector] Selected folder is not a valid ACC install dir')
    }
  }
  return getStatus()
})
ipcMain.handle('accConnector:installHook', () => installHook())
ipcMain.handle('accConnector:removeHook', () => removeHook())

// ---------- 初始化 ----------

let started = false

export function initAccConnector(window: BrowserWindow) {
  win = window
  // macOS 上窗口关闭后再次 activate 会重建窗口，管道与轮询只启动一次
  if (started) {
    broadcastStatus()
    return
  }
  started = true

  loadAccPath()
  startPipeServers()

  if (process.platform === 'win32') {
    const poll = async () => {
      const running = await isAccRunning()
      if (!running) {
        hookActiveAt = null
      }
      broadcastStatus()
    }
    poll()
    pollTimer = setInterval(poll, 3000)
    pollTimer.unref?.()
  } else {
    broadcastStatus()
  }

  console.log('[accConnector] initialized, platform:', process.platform)
}
