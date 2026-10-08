import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { itemHitRect, rectContains } from '../../src/overlay/geometry'

// ---------------------------------------------------------------------------
// 桌面遥测窗（Overlay）
//
// 形态：每个「有可见组件的显示器」对应一个透明无边框窗口，窗口覆盖该显示器的
// bounds，组件本身只是窗口内一个绝对定位的元素。这样做的收益：
//   * 组件之间的重叠层级由 CSS z-index 决定，天然可控（一组件一窗口做不到）；
//   * 拖动 / 缩放组件完全不触碰原生窗口（只改 CSS transform），没有 IPC 抖动；
//   * 多个组件共用一个渲染进程，内存占用与组件数量无关。
//
// 鼠标穿透：透明窗口的透明像素本身不会穿透（Electron 官方限制，见
// https://www.electronjs.org/docs/latest/tutorial/custom-window-styles），所以运行期
// 默认 setIgnoreMouseEvents(true, { forward: true })：鼠标消息照常送给下面的游戏，
// 同时 forward 会把 mousemove 送进渲染进程，渲染层据此做命中检测，只在光标真的落在
// 「未锁定」组件上时切回可交互状态。锁定的组件因此完全穿透。
//
// 置顶：Windows 上 level 必须给 'screen-saver'。默认的 'floating' 会让 Electron 额外
// 调一次 SetWindowPos 把窗口塞到任务栏之下，打不过全屏应用；并且别的置顶程序会在激活
// 切换时重新把自己抬上去（此时 isAlwaysOnTop() 仍为 true，没有事件可监听），所以要
// 周期性无条件重断言。参考实现：https://github.com/kizuna-ai-lab/sokuji/pull/338
// ---------------------------------------------------------------------------

const STATE_FILE = 'overlay.json'
const STATE_VERSION = 1

const MIN_SCALE = 0.3
const MAX_SCALE = 2
const DEFAULT_OPACITY = 0.6
const DEFAULT_BASE_WIDTH = 220
const DEFAULT_BASE_HEIGHT = 120

// 重断言置顶：1s 心跳兜底；窗口可见性变化时立即补一次
const REASSERT_INTERVAL_MS = 1000

const OVERLAY_HASH = '/overlay'

export interface OverlayItem {
  id: string
  /** 渲染层组件注册表里的键，主进程不解释它 */
  widget: string
  displayId: number
  /** 相对该显示器左上角的 DIP 坐标（显示器可能带负坐标，这里是窗口内坐标） */
  x: number
  y: number
  /** 等比缩放系数，作用在 baseWidth/baseHeight 之上 */
  scale: number
  baseWidth: number
  baseHeight: number
  /** 背景黑色不透明度 0~1 */
  opacity: number
  z: number
  visible: boolean
  locked: boolean
  /** 交给组件的自定义参数（文案等） */
  props: Record<string, unknown>
}

export interface OverlayState {
  enabled: boolean
  /**
   * 游戏暂停（或没有数据）时是否整体隐藏所有遥测窗，默认开启。
   * 隐藏只影响"渲染"，**不动 items 里的 visible / x / y / z**，
   * 所以回到赛道后每个遥测窗都会原样（显隐 + 方位）恢复。
   */
  hideWhenPaused: boolean
  items: OverlayItem[]
}

export interface OverlayDisplayInfo {
  id: number
  label: string
  bounds: Electron.Rectangle
  workArea: Electron.Rectangle
  scaleFactor: number
  primary: boolean
  internal: boolean
}

export interface OverlayHostOptions {
  preload: string
  rendererDist: string
  devServerUrl?: string
  getMainWindow: () => BrowserWindow | null
}

interface OverlayEntry {
  displayId: number
  win: BrowserWindow
  interactive: boolean
  heartbeat: NodeJS.Timeout | null
  /** 主进程命中检测的结果，变化时才推给渲染层 */
  activeId: string | null
  hintId: string | null
  /** 渲染层正在拖动 / 缩放：期间强制保持可交互 */
  busy: boolean
}
let state: OverlayState = { enabled: true, hideWhenPaused: true, items: [] }
/** 遥测侧判定的"游戏暂停 / 没有数据"（运行时状态，不落盘） */
let gamePaused = false
let hostOptions: OverlayHostOptions | null = null
let initialized = false
let saveTimer: NodeJS.Timeout | null = null
let quitting = false

const entries = new Map<number, OverlayEntry>()

// ---------- 工具 ----------

const clampNum = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

const cloneItem = (item: OverlayItem): OverlayItem => ({
  ...item,
  props: { ...item.props },
})

function getDisplays(): OverlayDisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map(d => ({
    id: d.id,
    label: d.label || `Display ${d.id}`,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    primary: d.id === primaryId,
    internal: d.internal,
  }))
}

function findDisplay(displayId: number) {
  return screen.getAllDisplays().find(d => d.id === displayId) || null
}

/** 组件的屏幕占用尺寸（DIP） */
const itemSize = (item: OverlayItem) => ({
  width: item.baseWidth * item.scale,
  height: item.baseHeight * item.scale,
})

/** 约束到显示器范围内：能放下就完整放下，放不下就贴左上角 */
function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  displayWidth: number,
  displayHeight: number,
) {
  const maxX = Math.max(0, displayWidth - width)
  const maxY = Math.max(0, displayHeight - height)
  return {
    x: Math.min(Math.max(Math.round(x), 0), Math.round(maxX)),
    y: Math.min(Math.max(Math.round(y), 0), Math.round(maxY)),
  }
}

function clampItemToDisplay(item: OverlayItem) {
  const display = findDisplay(item.displayId)
  if (!display) return
  const { width, height } = itemSize(item)
  const pos = clampPosition(
    item.x,
    item.y,
    width,
    height,
    display.bounds.width,
    display.bounds.height,
  )
  item.x = pos.x
  item.y = pos.y
}

import { applyForcedSettings, forcedSettingsOf } from '../../src/overlay/fullscreen'

/**
 * 布局改版后的尺寸迁移表：某个组件的**默认尺寸**变了以后，仍停留在"旧默认尺寸"的
 * 实例要跟着迁到新默认尺寸 —— 每个实例的 baseWidth/baseHeight 是存在 overlay.json 里的，
 * 不改的话老的框会跟新内容不匹配（轮胎这次是列间距改了、整体要收窄）。
 * 只在**完全等于旧默认尺寸**时才迁（用户手动调过尺寸的实例原样保留，不掰回去）。
 */
const LEGACY_DEFAULT_SIZES: Record<
  string,
  Array<{ from: [number, number]; to: [number, number] }>
> = {
  // 轮胎：矩形离中间刹车太远 → 列间距 10→4、格子外边距 3→2，整体收窄 200 → 184
  tyre: [{ from: [200, 260], to: [184, 260] }],
  // 排名&圈速：字号整体翻倍（delta 除外）+ 名次 66px → 前两版默认尺寸都装不下，统一迁到新版
  ranking: [
    { from: [300, 84], to: [476, 212] },
    { from: [330, 140], to: [476, 212] },
  ],
}

function migrateDefaultSize(item: OverlayItem) {
  const rules = LEGACY_DEFAULT_SIZES[item.widget]
  if (!rules) return
  for (const rule of rules) {
    if (item.baseWidth === rule.from[0] && item.baseHeight === rule.from[1]) {
      console.log(
        `[overlay] ${item.widget} 迁移到新版默认尺寸：${rule.from.join('x')} → ${rule.to.join('x')}`,
      )
      item.baseWidth = rule.to[0]
      item.baseHeight = rule.to[1]
      return
    }
  }
}

function sanitizeItem(raw: any): OverlayItem | null {
  // 「全屏刹车」组件已删除：老配置里的实例直接丢弃（否则会渲染出一个空窗口）
  if (raw?.widget === 'fullscreenBrake') return null
  if (!raw || typeof raw !== 'object') return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.widget !== 'string' || !raw.widget) return null

  const fallbackDisplay = screen.getPrimaryDisplay().id
  const item: OverlayItem = {
    id: raw.id,
    widget: raw.widget,
    displayId:
      typeof raw.displayId === 'number' ? raw.displayId : fallbackDisplay,
    x: clampNum(raw.x, -100000, 100000, 0),
    y: clampNum(raw.y, -100000, 100000, 0),
    scale: clampNum(raw.scale, MIN_SCALE, MAX_SCALE, 1),
    baseWidth: clampNum(raw.baseWidth, 40, 4000, DEFAULT_BASE_WIDTH),
    baseHeight: clampNum(raw.baseHeight, 24, 4000, DEFAULT_BASE_HEIGHT),
    opacity: clampNum(raw.opacity, 0, 1, DEFAULT_OPACITY),
    z: Math.round(clampNum(raw.z, 0, 9999, 1)),
    visible: raw.visible !== false,
    locked: raw.locked === true,
    props:
      raw.props && typeof raw.props === 'object' && !Array.isArray(raw.props)
        ? { ...raw.props }
        : {},
  }
  migrateDefaultSize(item)
  // 强制设置（全屏刹车等）：铺满显示器 + 锁死 + 置顶 + 透明度夹取
  applyForcedSettings(item, displayBoundsFor(item.displayId))
  clampItemToDisplay(item)
  return item
}

/** 某个显示器 id 的 bounds（DIP）；找不到就用主显示器 */
function displayBoundsFor(displayId: number | null | undefined) {
  const display =
    (typeof displayId === 'number' ? screen.getAllDisplays().find(d => d.id === displayId) : null) ??
    screen.getPrimaryDisplay()
  return display.bounds
}

// ---------- 持久化 ----------

const stateFilePath = () => path.join(app.getPath('userData'), STATE_FILE)

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFilePath(), 'utf-8'))
    state = {
      enabled: raw?.enabled !== false,
      // 默认开启：老配置文件里没有这个字段时也按开启处理
      hideWhenPaused: raw?.hideWhenPaused !== false,
      items: Array.isArray(raw?.items)
        ? raw.items.map(sanitizeItem).filter(Boolean)
        : [],
    }
  } catch {
    // 首次运行：给一个 BaseOverlayTest 组件，方便直接看到效果
    state = {
      enabled: true,
      hideWhenPaused: true,
      items: [createItem({ widget: 'test' })],
    }
  }
}

function saveStateNow() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  try {
    fs.mkdirSync(path.dirname(stateFilePath()), { recursive: true })
    fs.writeFileSync(
      stateFilePath(),
      JSON.stringify({ version: STATE_VERSION, ...state }, null, 2),
      'utf-8',
    )
  } catch (err) {
    console.error('[overlay] 保存配置失败:', err)
  }
}

// 拖动 / 缩放结束才落盘，避免高频写文件
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveStateNow, 400)
}

// ---------- 组件增删改 ----------

function createItem(payload: {
  widget: string
  displayId?: number
  baseWidth?: number
  baseHeight?: number
  props?: Record<string, unknown>
}): OverlayItem {
  const display =
    (typeof payload.displayId === 'number' && findDisplay(payload.displayId)) ||
    screen.getPrimaryDisplay()

  const baseWidth = clampNum(
    payload.baseWidth,
    40,
    4000,
    DEFAULT_BASE_WIDTH,
  )
  const baseHeight = clampNum(
    payload.baseHeight,
    24,
    4000,
    DEFAULT_BASE_HEIGHT,
  )

  // 多个组件依次错开，避免完全重叠
  const sameDisplay = state.items.filter(i => i.displayId === display.id).length
  const offset = (sameDisplay % 8) * 24

  const item: OverlayItem = {
    id: crypto.randomUUID(),
    widget: payload.widget,
    displayId: display.id,
    x: Math.round((display.bounds.width - baseWidth) / 2) + offset,
    y: Math.round((display.bounds.height - baseHeight) / 2) + offset,
    scale: 1,
    baseWidth,
    baseHeight,
    opacity: clampNum(payload.opacity, 0, 1, DEFAULT_OPACITY),
    z: state.items.reduce((max, i) => Math.max(max, i.z), 0) + 1,
    visible: true,
    locked: false,
    props: payload.props ? { ...payload.props } : {},
  }
  // 强制设置（全屏刹车）：铺满显示器 + 锁死 + 置顶 + 透明度夹取
  applyForcedSettings(item, displayBoundsFor(item.displayId))
  clampItemToDisplay(item)
  return item
}

/** 只接受白名单字段，数值一律重新夹取，防止渲染层传出越界值 */
function applyPatch(item: OverlayItem, patch: any) {
  if (!patch || typeof patch !== 'object') return
  if (patch.x !== undefined) item.x = clampNum(patch.x, -100000, 100000, item.x)
  if (patch.y !== undefined) item.y = clampNum(patch.y, -100000, 100000, item.y)
  // 自适应尺寸的组件（「赛节信息」按内容贴合）会把量到的基准尺寸一起提交上来
  if (patch.baseWidth !== undefined) {
    item.baseWidth = clampNum(patch.baseWidth, 40, 4000, item.baseWidth)
  }
  if (patch.baseHeight !== undefined) {
    item.baseHeight = clampNum(patch.baseHeight, 24, 4000, item.baseHeight)
  }
  if (patch.scale !== undefined) {
    item.scale = clampNum(patch.scale, MIN_SCALE, MAX_SCALE, item.scale)
  }
  if (patch.opacity !== undefined) {
    item.opacity = clampNum(patch.opacity, 0, 1, item.opacity)
  }
  if (patch.z !== undefined) {
    item.z = Math.round(clampNum(patch.z, 0, 9999, item.z))
  }
  if (patch.visible !== undefined) item.visible = patch.visible !== false
  if (patch.locked !== undefined) item.locked = patch.locked === true
  if (patch.displayId !== undefined) {
    const display = findDisplay(patch.displayId)
    if (display) item.displayId = display.id
  }
  if (
    patch.props !== undefined &&
    patch.props &&
    typeof patch.props === 'object' &&
    !Array.isArray(patch.props)
  ) {
    item.props = { ...item.props, ...patch.props }
  }
  // 强制设置：全屏刹车之类 —— 用户/面板怎么改都在这之后被掰回来
  // （锁定、置顶层级、透明度范围、铺满显示器）
  applyForcedSettings(item, displayBoundsFor(item.displayId))
  clampItemToDisplay(item)
}

// ---------- 覆盖层窗口 ----------

function loadOverlay(win: BrowserWindow) {
  if (!hostOptions) return
  if (hostOptions.devServerUrl) {
    win.loadURL(`${hostOptions.devServerUrl}#${OVERLAY_HASH}`)
  } else {
    win.loadFile(path.join(hostOptions.rendererDist, 'index.html'), {
      hash: OVERLAY_HASH,
    })
  }
}

function reassertOnTop(entry: OverlayEntry) {
  const win = entry.win
  if (!win || win.isDestroyed()) return
  // 不可见时不做 z-order 操作
  if (!win.isVisible() || win.isMinimized()) return
  win.// 层级降一档：'screen-saver' 会抢走游戏的独占全屏（实测 160fps→60fps 的主因），用 'pop-up-menu' 够用
  setAlwaysOnTop(true, 'pop-up-menu')
}

function applyInteractive(entry: OverlayEntry, interactive: boolean) {
  if (entry.win.isDestroyed()) return
  if (entry.interactive === interactive) return
  entry.interactive = interactive
  // 仍然带 forward: true —— 它能让渲染层在穿透状态下收到 mouseleave 之类的鼠标事件，
  // 但「是否可交互」这个判断不依赖它（见下面的光标轮询）。
  entry.win.setIgnoreMouseEvents(!interactive, { forward: true })
}

// ---------- 命中检测（主进程权威） ----------
//
// 不放在渲染层：Electron 的 forward 只保证「鼠标移动消息」被转发，实际观察下来它
// 对真实硬件移动之外的移动并不可靠，而整层可交互又不能等渲染层先收到 mousemove
// （那会形成死循环：穿透状态下收不到点击 → 就没法判断要不要取消穿透）。
// screen.getCursorScreenPoint() 是可靠的 Win32 GetCursorPos，40ms 一次开销可以忽略，
// 于是判定完全由主进程做出，渲染层只负责显示。

const CURSOR_POLL_MS = 40
let cursorTimer: NodeJS.Timeout | null = null

function hitTest(entry: OverlayEntry, clientX: number, clientY: number) {
  const height = entry.win.getBounds().height
  const sorted = [...visibleItemsFor(entry.displayId)].sort((a, b) => b.z - a.z)
  for (const item of sorted) {
    if (rectContains(itemHitRect(item, height), clientX, clientY)) return item
  }
  return null
}

function pollCursor() {
  if (!entries.size) return
  const point = screen.getCursorScreenPoint()
  for (const entry of entries.values()) {
    if (entry.win.isDestroyed()) continue
    const bounds = entry.win.getBounds()
    const hit = hitTest(entry, point.x - bounds.x, point.y - bounds.y)
    const activeId = hit && !hit.locked ? hit.id : null
    const hintId = hit ? hit.id : null
    if (entry.activeId !== activeId || entry.hintId !== hintId) {
      entry.activeId = activeId
      entry.hintId = hintId
      entry.win.webContents.send('overlay:hover', { activeId, hintId })
    }
    // 未锁定组件被压住、或正在拖动 / 缩放时，该覆盖层接收鼠标；其余情况完全穿透
    applyInteractive(entry, entry.busy || !!activeId)
  }
}

function startCursorPoll() {
  if (cursorTimer) return
  cursorTimer = setInterval(pollCursor, CURSOR_POLL_MS)
}

function stopCursorPoll() {
  if (cursorTimer) {
    clearInterval(cursorTimer)
    cursorTimer = null
  }
}

function updateWindowBounds(entry: OverlayEntry) {
  const display = findDisplay(entry.displayId)
  if (!display || entry.win.isDestroyed()) return
  const current = entry.win.getBounds()
  const target = display.bounds
  if (
    current.x !== target.x ||
    current.y !== target.y ||
    current.width !== target.width ||
    current.height !== target.height
  ) {
    entry.win.setBounds(target)
  }
}

function createOverlayWindow(displayId: number) {
  const display = findDisplay(displayId)
  if (!display || !hostOptions) return

  const bounds = display.bounds
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    // 透明窗口不支持原生缩放（官方限制），尺寸一律由组件自身逻辑决定
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    // WS_EX_NOACTIVATE：点击不会抢走游戏的焦点，但鼠标消息照常送达
    focusable: false,
    show: false,
    backgroundColor: '#00000000',
    roundedCorners: false,
    webPreferences: {
      preload: hostOptions.preload,
      // 组件里有计时器 / 动画，别让 Chromium 在失焦时降频
      backgroundThrottling: false,
    },
  })

  const entry: OverlayEntry = {
    displayId,
    win,
    interactive: false,
    heartbeat: null,
    activeId: null,
    hintId: null,
    busy: false,
  }
  entries.set(displayId, entry)
  console.log(
    `[overlay] 为显示器 ${displayId} 创建覆盖层窗口 ${JSON.stringify(win.getBounds())}`,
  )

  win.// 层级降一档：'screen-saver' 会抢走游戏的独占全屏（实测 160fps→60fps 的主因），用 'pop-up-menu' 够用
  setAlwaysOnTop(true, 'pop-up-menu')
  win.setIgnoreMouseEvents(true, { forward: true })
  if (process.platform !== 'win32') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return
    // showInactive：绝不抢焦点
    win.showInactive()
    reassertOnTop(entry)
    // Windows 会把新建窗口夹进工作区（屏幕底部任务栏那一条），显示后再试一次抢回整个显示器。
    // 抢不到也不影响正确性：渲染层用的坐标空间就是窗口的实际 bounds，两边始终一致。
    const before = win.getBounds()
    updateWindowBounds(entry)
    const after = win.getBounds()
    if (before.width !== after.width || before.height !== after.height) {
      console.log(`[overlay] 覆盖层窗口尺寸修正为 ${JSON.stringify(after)}`)
    }
    sendRenderPayload(entry)
  })

  // 透明窗口一开 DevTools 就会变得不透明，这里不自动打开
  win.webContents.on('did-finish-load', () => sendRenderPayload(entry))

  // 透明窗口里的渲染错误在主进程终端里本来完全看不见，开发期转出来方便排查
  if (hostOptions.devServerUrl) {
    win.webContents.on(
      'console-message',
      (_event, level, message, line, sourceId) => {
        // level: 0=verbose 1=info 2=warning 3=error
        if (level >= 1) {
          console.log(`[overlay:renderer] ${message} (${sourceId}:${line})`)
        }
      },
    )
  }
  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('[overlay] 覆盖层加载失败', code, desc, url)
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(
      `[overlay] 覆盖层渲染进程退出 reason=${details.reason} exitCode=${details.exitCode}`,
    )
    destroyEntry(entry, 'renderer-gone')
  })

  entry.heartbeat = setInterval(() => reassertOnTop(entry), REASSERT_INTERVAL_MS)

  loadOverlay(win)
  return entry
}

function destroyEntry(entry: OverlayEntry, reason = '') {
  console.log(`[overlay] 销毁覆盖层窗口 display=${entry.displayId} reason=${reason}`)
  if (entry.heartbeat) {
    clearInterval(entry.heartbeat)
    entry.heartbeat = null
  }
  entries.delete(entry.displayId)
  if (!entry.win.isDestroyed()) entry.win.destroy()
}

export function destroyAllOverlays() {
  for (const entry of [...entries.values()]) destroyEntry(entry, 'all')
}

/** 供其它主进程模块（如遥测广播）使用：当前活着的覆盖层窗口 */
export function getOverlayWindows(): BrowserWindow[] {
  return [...entries.values()]
    .map(entry => entry.win)
    .filter(win => !win.isDestroyed())
}

/**
 * 游戏暂停（或没有数据）且用户开启了"游戏暂停时隐藏遥测窗"时为 true。
 * 注意：这里只影响**渲染**，`state.items` 一个字段都不改，
 * 所以回到赛道时每个遥测窗的显隐、坐标、层级都会原样回来。
 */
function isSuppressed() {
  return state.hideWhenPaused && gamePaused
}

/**
 * 遥测侧通知：游戏是否暂停 / 是否还有数据。
 * 状态变化时重新对齐窗口（暂停 → 销毁所有遥测窗；恢复 → 按原配置重建）。
 */
export function setGamePaused(paused: boolean) {
  const next = paused === true
  if (next === gamePaused) return
  gamePaused = next
  console.log(
    next
      ? `[overlay] 游戏暂停：${state.hideWhenPaused ? '隐藏全部遥测窗（保留各自显隐与方位）' : '按设置保持显示（hideWhenPaused=false）'}`
      : '[overlay] 游戏恢复：按原配置重建遥测窗',
  )
  syncWindows()
  broadcast()
}

const visibleItemsFor = (displayId: number) =>
  (isSuppressed()
    ? []
    : state.items.filter(item => item.visible && item.displayId === displayId)
  )
    .sort((a, b) => a.z - b.z)
    .map(cloneItem)

/** 按当前 state 对齐窗口集合：需要显示的显示器有窗口，不需要的销毁 */
function syncWindows() {
  // 保存的显示器 id 可能会失效：换显示器、改分辨率/缩放、显卡驱动更新、Windows
  // 重排显示都会让它变。以前这里直接静默丢窗口 → 所有遥测窗一起消失，
  // 所以先把失配的条目迁到主显示器。
  const known = new Set(screen.getAllDisplays().map(display => display.id))
  const primary = screen.getPrimaryDisplay()
  let migrated = false
  for (const item of state.items) {
    if (!known.has(item.displayId) && primary) {
      console.warn(
        `[overlay] 保存的显示器 ${item.displayId} 已不存在，组件 ${item.widget} 迁到主显示器 ${primary.id}`,
      )
      item.displayId = primary.id
      migrated = true
    }
  }
  if (migrated) {
    // 调用方紧接着会广播新 state，这里只需要落盘
    scheduleSave()
  }

  const needed = new Set<number>()
  if (state.enabled && !isSuppressed()) {
    for (const item of state.items) {
      if (item.visible) needed.add(item.displayId)
    }
  }

  for (const entry of [...entries.values()]) {
    if (!needed.has(entry.displayId)) {
      destroyEntry(entry, 'display-not-needed')
    } else if (!findDisplay(entry.displayId)) {
      console.error(
        `[overlay] 找不到显示器 ${entry.displayId}，销毁覆盖层窗口；` +
          `当前显示器=${screen.getAllDisplays().map(d => d.id).join(',')}`,
      )
      destroyEntry(entry, 'display-missing')
    }
  }

  for (const displayId of needed) {
    if (!entries.has(displayId)) {
      createOverlayWindow(displayId)
    } else {
      const entry = entries.get(displayId)!
      updateWindowBounds(entry)
      // 该显示器没有未锁定组件时，保证处于完全穿透状态
      const items = visibleItemsFor(displayId)
      if (!items.some(item => !item.locked)) applyInteractive(entry, false)
    }
  }
}

// ---------- 广播 ----------

function mainPayload() {
  return {
    scope: 'main' as const,
    enabled: state.enabled,
    /** 游戏暂停/无数据时是否隐藏全部遥测窗（设置项，默认开启） */
    hideWhenPaused: state.hideWhenPaused,
    /** 当前是否判定为"游戏暂停/无数据"（面板可据此给出提示） */
    paused: isSuppressed(),
    items: state.items.map(cloneItem),
    displays: getDisplays(),
  }
}

function overlayPayload(entry: OverlayEntry) {
  const bounds = entry.win.isDestroyed()
    ? findDisplay(entry.displayId)?.bounds
    : entry.win.getBounds()
  return {
    scope: 'overlay' as const,
    displayId: entry.displayId,
    displayWidth: bounds?.width ?? 0,
    displayHeight: bounds?.height ?? 0,
    enabled: state.enabled,
    items: visibleItemsFor(entry.displayId),
  }
}

function sendRenderPayload(entry: OverlayEntry) {
  if (entry.win.isDestroyed()) return
  entry.win.webContents.send('overlay:render', overlayPayload(entry))
}

function broadcast() {
  syncWindows()
  for (const entry of entries.values()) sendRenderPayload(entry)
  if (!hostOptions) return
  const main = hostOptions.getMainWindow()
  if (main && !main.isDestroyed()) {
    main.webContents.send('overlay:state', mainPayload())
  }
  scheduleSave()
}

// ---------- 对渲染层暴露的接口 ----------

function entryOfSender(sender: Electron.WebContents): OverlayEntry | null {
  for (const entry of entries.values()) {
    if (!entry.win.isDestroyed() && entry.win.webContents.id === sender.id) {
      return entry
    }
  }
  return null
}

function registerIpc() {
  ipcMain.handle('overlay:getState', event => {
    const entry = entryOfSender(event.sender)
    return entry ? overlayPayload(entry) : mainPayload()
  })

  ipcMain.handle('overlay:getDisplays', () => getDisplays())

  ipcMain.handle('overlay:addItem', (_event, payload) => {
    const widget = typeof payload?.widget === 'string' ? payload.widget : ''
    if (!widget) return mainPayload()
    // 同一组件同时只允许存在一个实例：已存在就复用（并让它显示出来）
    const existing = state.items.find(item => item.widget === widget)
    if (existing) {
      existing.visible = true
      broadcast()
      return mainPayload()
    }
    state.items.push(createItem({ ...payload, widget }))
    broadcast()
    return mainPayload()
  })

  ipcMain.handle('overlay:removeItem', (_event, id: string) => {
    const idx = state.items.findIndex(item => item.id === id)
    if (idx !== -1) {
      state.items.splice(idx, 1)
      broadcast()
    }
    return mainPayload()
  })

  ipcMain.handle(
    'overlay:updateItems',
    (_event, patches: Array<{ id: string; patch: any }>) => {
      if (!Array.isArray(patches)) return mainPayload()
      let changed = false
      for (const { id, patch } of patches) {
        const item = state.items.find(i => i.id === id)
        if (!item) continue
        applyPatch(item, patch)
        changed = true
      }
      if (changed) broadcast()
      return mainPayload()
    },
  )

  ipcMain.handle('overlay:setEnabled', (_event, enabled: boolean) => {
    state.enabled = enabled !== false
    broadcast()
    return mainPayload()
  })

  ipcMain.handle('overlay:setHideWhenPaused', (_event, hide: boolean) => {
    state.hideWhenPaused = hide !== false
    console.log(
      `[overlay] 游戏暂停时隐藏遥测窗：${state.hideWhenPaused ? '开启' : '关闭'}`,
    )
    broadcast()
    return mainPayload()
  })

  ipcMain.handle('overlay:setAllLocked', (_event, locked: boolean) => {
    for (const item of state.items) item.locked = locked === true
    // 强制锁定的组件不受"全部解锁"影响
    for (const item of state.items) applyForcedSettings(item, displayBoundsFor(item.displayId))
    broadcast()
    return mainPayload()
  })

  ipcMain.handle('overlay:clear', () => {
    state.items = []
    broadcast()
    return mainPayload()
  })

  // 渲染层拖动 / 缩放期间要保持可交互，否则鼠标会中途穿出去
  ipcMain.on('overlay:setBusy', (event, busy: boolean) => {
    const entry = entryOfSender(event.sender)
    if (!entry) return
    entry.busy = busy === true
    applyInteractive(entry, entry.busy || !!entry.activeId)
  })
}

function registerShortcuts() {
  // 兜底入口：组件锁定后完全穿透，只能靠热键或主窗口把它解锁回来
  const bind = (accelerator: string, handler: () => void) => {
    try {
      if (!globalShortcut.register(accelerator, handler)) {
        console.warn(`[overlay] 热键被占用，注册失败: ${accelerator}`)
      }
    } catch (err) {
      console.warn(`[overlay] 热键注册异常: ${accelerator}`, err)
    }
  }

  // 锁定后组件完全穿透，悬浮不出控制条，只能靠外部入口解锁：
  // 优先解锁光标下那个（主进程本来就知道光标压着谁），光标不在任何组件上时解锁全部兜底
  bind('CommandOrControl+Alt+L', () => {
    let target: OverlayItem | null = null
    for (const entry of entries.values()) {
      if (!entry.hintId) continue
      target = state.items.find(item => item.id === entry.hintId) || null
      if (target) break
    }
    if (target) {
      target.locked = false
    } else {
      for (const item of state.items) item.locked = false
    }
    // 强制锁定的组件（全屏刹车）解锁后立刻掰回来 —— 快捷键也解不开
    for (const item of state.items) applyForcedSettings(item, displayBoundsFor(item.displayId))
    broadcast()
  })
}

// ---------- 生命周期 ----------

export function initOverlay(options: OverlayHostOptions) {
  // 遥测窗依赖 Windows 的窗口特性（WS_EX_NOACTIVATE / WS_EX_TRANSPARENT 等），
  // 其他平台直接不启用：不建窗口、不注册 IPC / 热键，也不会去碰状态文件。
  if (process.platform !== 'win32') return
  hostOptions = options
  if (initialized) return
  initialized = true

  registerIpc()
  registerShortcuts()
  loadState()
  broadcast()
  startCursorPoll()

  screen.on('display-added', () => broadcast())
  screen.on('display-removed', () => broadcast())
  screen.on('display-metrics-changed', () => broadcast())

  app.on('before-quit', () => {
    quitting = true
    stopCursorPoll()
    saveStateNow()
    destroyAllOverlays()
    globalShortcut.unregisterAll()
  })
}

/** 主窗口关闭时调用：连同覆盖层一起收掉，避免 window-all-closed 迟迟不触发 */
export function shutdownOverlay() {
  // 未启用（非 Windows 或尚未初始化）时必须直接返回：
  // 否则 saveStateNow() 会把用户的 overlay.json 覆盖成空配置
  if (!initialized || quitting) return
  stopCursorPoll()
  saveStateNow()
  destroyAllOverlays()
}
