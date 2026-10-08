/**
 * ACC **UDP Broadcasting 监听器**（主进程）。
 *
 * 用途：车号、车手评级、组别内名次与车数、其它车的信息、**赛道名与赛道长度（米）** —— 这些共享内存里没有，
 * 只能从游戏的 UDP 广播拿（详见 `ACC-接口文档调研.md` §3）。
 *
 * 实测结论（2026-10，本机 ACC 1.9 客户端在赛道上、broadcasting.json 已打开）：
 *   · 报文是**小端二进制**；第 1 字节 = 消息类型。
 *   · 我们的程序**不需要绑定配置里的端口**：从临时端口发注册包到 `127.0.0.1:<port>`，
 *     游戏会把回包发回**发送方地址**（实测收到 `REGISTRATION_RESULT`）✓。
 *   · `REGISTER_COMMAND_APPLICATION` 的第 2 个字节是**协议版本号**，实测：
 *     0/1/2/3 → "Your broadcasting control app is outdated"；**4 → 通过版本检查** ✓
 *     （SDK 文档里没写这个字节，是靠错误信息二分出来的）。
 *   · 版本对了以后剩下的失败是 "Wrong connection password"：**ACC 只在启动游戏时读**
 *     broadcasting.json，所以游戏启动后才改的密码要**重启游戏**才生效（见 acc-broadcast-config.ts）。
 *
 * 设计原则：**解析失败宁可不用，也不给界面喂垃圾** —— 每个报文都做形状校验，
 * 校验不过就把原始字节打进日志（十六进制）供事后分析，绝不让错误数据流入组件。
 * 注册失败（密码不匹配 / 游戏没开广播）时周期性重试，游戏重启后自动接上。
 */
import dgram from 'node:dgram'
import { ensureBroadcastConfig, type BroadcastConfigResult } from './acc-broadcast-config'
import {
  GAP_SEGMENTS,
  advanceSegTable,
  compareRaceOrder,
  createSegTable,
  gapFromSegTable,
  raceOrderOf,
  resetSegTable,
  signedLapDelta,
  syncSegLap,
  type SegTable,
} from './gap-segments'
// 车型 id → 组别：直接用项目自带的车型库（顶层键就是 GT3/GT4/GTC/TCX，每台车有 `id`）。
// 该文件是渲染侧的纯数据 JS 模块，这里为了在广播侧反查组别而直接引用（esbuild 会打进主进程包）。
// @ts-ignore -- 纯数据模块，无类型声明（渲染侧的 @/utils/carData 声明不覆盖主进程的相对路径引用）
import carData from '../../src/utils/carData.js'

/** 车型 id → 组别（实测广播的 carId 就是 carData 的 id：32=ferrari_296_gt3、33=huracan_gt3_evo2） */
const GROUP_BY_CAR_ID: Map<number, string> = (() => {
  const map = new Map<number, string>()
  const table = carData as Record<string, Record<string, { id?: number }>> | undefined
  if (!table || typeof table !== 'object') return map
  for (const [group, cars] of Object.entries(table)) {
    if (!cars || typeof cars !== 'object') continue
    for (const car of Object.values(cars)) {
      if (car && typeof car.id === 'number') map.set(car.id, group)
    }
  }
  return map
})()

/**
 * 车型名 → 车型 id（`carData` 里两者都有）。
 * 用途：共享内存只给车型**名**（Static `carModel`），广播只给车型 **id**，
 * 用它就能把"我这辆车"对上广播里的报名条目 —— 不需要改读取器。
 */
const ID_BY_CAR_MODEL: Map<string, number> = (() => {
  const map = new Map<string, number>()
  const table = carData as Record<string, Record<string, { id?: number }>> | undefined
  if (!table || typeof table !== 'object') return map
  for (const cars of Object.values(table)) {
    if (!cars || typeof cars !== 'object') continue
    for (const [model, car] of Object.entries(cars)) {
      if (car && typeof car.id === 'number') {
        map.set(model, car.id)
        map.set(model.toLowerCase(), car.id)
      }
    }
  }
  return map
})()

function carGroupOfId(carId: number | null | undefined): string | null {
  if (carId == null) return null
  return GROUP_BY_CAR_ID.get(carId) ?? null
}

/** 车型名（Static carModel）→ 车型 id；未知车型或没数据返回 null */
export function carIdOfModel(carModel: string | null | undefined): number | null {
  if (!carModel) return null
  return ID_BY_CAR_MODEL.get(carModel) ?? ID_BY_CAR_MODEL.get(carModel.toLowerCase()) ?? null
}

/** 实测：协议版本 4 才能通过 ACC 1.9 客户端的版本检查 */
export const BROADCAST_PROTOCOL_VERSION = 4
/** 注册重试间隔（密码错/游戏没开广播时） */
export const REGISTER_RETRY_MS = 10_000
/** 请求一次报名表后，多久没收到就再请求一次 */
/**
 * 报名表刷新间隔。实测游戏**每次请求只回一条 `ENTRY_LIST_CAR`**，所以多组别大场次要靠多次请求
 * 才能把条目收齐（收齐才敢发布"组别内名次/车数"）+ 让"总车数"跟着有人进出实时变，
 * 所以取得比较激进（1.5s）。请求带 connectionId、很轻，不会给游戏造成负担。
 */
export const ENTRY_LIST_REFRESH_MS = 1_500
/** 期望的推送间隔（毫秒） */
export const UPDATE_INTERVAL_MS = 250

/**
 * `TRACK_DATA` 的续订间隔。赛道数据整场不变，本来请求一次就够；但"注册成功那一刻"游戏可能
 * 还没备好赛道数据，换赛道/换赛节时也会重发，所以按 15s 续订一次 —— 请求包只有 5 字节。
 */
export const TRACK_DATA_REFRESH_MS = 15_000

/**
 * 赛道数据相关日志的统一前缀。
 * ⚠️ 这几行日志**刻意只用 ASCII**：终端代码页不是 UTF-8 时中文会变成乱码，甚至会**吃掉字节**
 * （实测在 GBK 终端里"（480 字节）"被显示成"锛?80 瀛楄妭"—— 数字首位直接丢了，没法判断长度）。
 * 这行是要用户复制回来做诊断的，可读性优先。
 */
const TRACK_LOG_PREFIX = '[broadcast track data]'

const MSG = {
  REGISTRATION_RESULT: 1,
  REALTIME_UPDATE: 2,
  REALTIME_CAR_UPDATE: 3,
  ENTRY_LIST: 4,
  TRACK_DATA: 5,
  ENTRY_LIST_CAR: 6,
  BROADCASTING_EVENT: 7,
} as const

const OUT = {
  REGISTER: 1,
  UNREGISTER: 9,
  REQUEST_ENTRY_LIST: 10,
  REQUEST_TRACK_DATA: 11,
} as const

/** 广播里每辆车的一条实时记录（只取实测能对上的前缀字段） */
export interface BroadcastCarUpdate {
  /** 实测 = 车 id（1001/1002…），**不是**数组下标 */
  carIndex: number
  driverIndex: number
  position: number
  cupPosition: number
  laps: number
  kmh: number
  /** 车所在地点（SDK `CAR_LOCATION`：0=Unknown 1=Track 2=Pitlane 3=PitEntry 4=PitExit） */
  carLocation: number
  /** 沿赛道的归一化位置（0..1）与 0..65535 的整数版本 —— 排行榜算秒差用 */
  trackPosition: number
  splinePosition: number
  /** 最快圈（ms）+ 是否无效圈；拿不到尾部结构时为 null */
  bestLapMs: number | null
  bestLapInvalid: boolean | null
  /** 上一圈（ms）+ 是否无效圈 */
  lastLapMs: number | null
  lastLapInvalid: boolean | null
  /** **进行中那一圈**是否已被判无效（尾部第三个 Lap 的 isInvalid）—— 正赛里的实时无效圈信号 */
  currentLapInvalid: boolean | null
  /**
   * 收到这条更新的时刻（`Date.now()`）。用来剔除**上一场残留的车**：
   * 实测换场次后 `state.cars` 里旧车的 position 还在，会把"组别内名次"算成 24（真实是 10）、
   * 组别车数算成 51（真实 21）。纯函数里不设它（视为"新鲜"）。
   */
  at?: number
}

/**
 * `state.cars` 里实际存的东西：实时行 + 收到时刻 + **分段跨线表**（秒差用，见 `gap-segments.ts`）。
 * 表跟着实时行一起走 —— 每收到一帧就推进一次（250ms），比按排行榜的 0.5s 刷新推进精确得多。
 */
export interface TrackedCarUpdate extends BroadcastCarUpdate {
  seg: SegTable
}

/** 报名表里的一辆车（含车号 / 车型 id / 每位车手的评级与短名） */
export interface BroadcastEntry {
  carEntryId: number
  /** 车型 id（= `src/utils/carData.js` 里的 `id`，实测 32=ferrari_296_gt3、33=huracan_gt3_evo2） */
  carId: number
  raceNumber: number | null
  cupCategory: number | null
  /** 车队名（SDK 的 teamName，新版报文里非空，例如 "HerMess Racing-OTAKUS"） */
  teamName?: string
  drivers: Array<{
    shortName: string
    category: number | null
    firstName?: string
    lastName?: string
    nationality?: number
  }>
}

/** ENTRY_LIST 解析结果（官方 SDK：connectionId(i32) + 车数(u16) + 车 id(u16 × 车数)） */
export interface EntryListPacket {
  connectionId: number
  carEntryIds: number[]
}

/** 只读快照：给渲染侧用的"我的车"信息 */
export interface BroadcastMeta {
  raceNumber: number | null
  driverCategory: number | null
  cupPosition: number | null
  cupCarCount: number | null
  /**
   * 本场车数（报名表条数）——**实时**：有人加入服务器时更新。
   * 比 Static `numCars`(64) 可靠：实测 3 辆车时 Static 仍是 2（它只在赛节开始时定）。
   */
  totalCarCount: number | null
  /** 节类型（SDK SESSION_TYPE，来自广播 REALTIME_UPDATE） */
  sessionType: number | null
  /** 本节已进行时间（ms） */
  sessionTimeMs: number | null
  /** 本节**总时长**（ms；练习赛等无固定时长时为 null） */
  sessionTotalMs: number | null
}

// ---------------------------------------------------------------------------
// 字节读取（小端；字符串 = u16 长度 + UTF-8）
// ---------------------------------------------------------------------------

export class ByteReader {
  private offset = 0
  constructor(private readonly buf: Buffer) {}

  get remaining(): number {
    return this.buf.length - this.offset
  }

  u8(): number {
    if (this.remaining < 1) throw new RangeError('u8 out of range')
    return this.buf.readUInt8(this.offset++)
  }

  u16(): number {
    if (this.remaining < 2) throw new RangeError('u16 out of range')
    const value = this.buf.readUInt16LE(this.offset)
    this.offset += 2
    return value
  }

  i32(): number {
    if (this.remaining < 4) throw new RangeError('i32 out of range')
    const value = this.buf.readInt32LE(this.offset)
    this.offset += 4
    return value
  }

  u32(): number {
    if (this.remaining < 4) throw new RangeError('u32 out of range')
    const value = this.buf.readUInt32LE(this.offset)
    this.offset += 4
    return value
  }

  /** 字符串 = u16 长度（字节数）+ UTF-8 */
  string(): string {
    const length = this.u16()
    if (length > this.remaining) throw new RangeError('string out of range')
    const value = this.buf.subarray(this.offset, this.offset + length).toString('utf8')
    this.offset += length
    return value
  }

  /** 取剩下的原始字节（调试用） */
  rest(): Buffer {
    return this.buf.subarray(this.offset)
  }
}

/** 判定字符串是否"看起来正常"（避免把错位解析出的乱码当车手名） */
export function isPlausibleText(value: string): boolean {
  if (value.length === 0 || value.length > 40) return false
  // 允许字母数字、空格与常见符号，拒绝控制字符与替换字符
  return /^[\p{L}\p{N} .,'\-_/&()]+$/u.test(value) && !value.includes('\uFFFD')
}

// ---------------------------------------------------------------------------
// 报文解析（纯函数，可单测）
// ---------------------------------------------------------------------------

export interface RegistrationResult {
  connectionId: number
  success: boolean
  isReadOnly: boolean
  errorMessage: string
}

export function parseRegistrationResult(buf: Buffer): RegistrationResult {
  const r = new ByteReader(buf)
  r.u8() // message type
  const connectionId = r.i32()
  const success = r.u8() === 1
  const isReadOnly = r.u8() === 1
  const errorMessage = r.remaining >= 2 ? r.string() : ''
  return { connectionId, success, isReadOnly, errorMessage }
}

/**
 * ENTRY_LIST —— **官方 SDK 布局**（`accapi/structs.py` 的 `EntryList.receive_args = "iH" + "H"×n`）：
 *   [0] type ｜ [1..4] connectionId(i32) ｜ [5..6] 车数(u16) ｜ [7..] 车 id(u16 × 车数)
 * 实测两条：
 *   · 新（2026-10，1 辆车）：`04 04000000 0100 0000` → connectionId=4、车数=1、id=[0] ✓
 *   · 旧（两辆车）：`04 02000000 0200 e903 ea03` → connectionId=2、车数=2、id=[1001,1002] ✓
 * ⚠️ 早先按"[1] 是车数、id 从尾部取"解析 —— 旧报文里 connectionId 恰好等于车数，所以**看起来是对的**
 *    （运气），一旦 connectionId ≠ 车数就全错。现按 SDK + **长度自校验**（7 + 车数×2）解析。
 * 返回 null 表示"这条报文不符合布局"，交给调用方打一次原始日志。
 */
export function parseEntryList(buf: Buffer): EntryListPacket | null {
  try {
    if (buf.length < 7) return null
    const connectionId = buf.readInt32LE(1)
    const count = buf.readUInt16LE(5)
    if (count <= 0 || count > 64) return null
    // 至少要有 count 个 id；**允许尾部多出字节**（不同构建可能附加内容），但短了就是坏的
    if (buf.length < 7 + count * 2) return null
    const carEntryIds: number[] = []
    for (let i = 0; i < count; i++) carEntryIds.push(buf.readUInt16LE(7 + i * 2))
    return { connectionId, carEntryIds }
  } catch {
    return null
  }
}

/** 读一个"u16 长度前缀 + 字节"的字符串；返回字符串与下一个偏移 */
function readLenString(buf: Buffer, offset: number): { value: string; next: number } | null {
  if (offset + 2 > buf.length) return null
  const len = buf.readUInt16LE(offset)
  const start = offset + 2
  const end = start + len
  if (len > 64 || end > buf.length) return null
  return { value: buf.subarray(start, end).toString('utf8'), next: end }
}

/**
 * ENTRY_LIST_CAR —— **官方 SDK 布局**（`EntryListCar.receive_args = "HBsiBBHB"` + `Driver × n`，
 * `Driver.receive_args = "sssBH"`），实测 67 字节**逐字节严丝合缝**：
 *   [0]      type
 *   [1..2]   carEntryId(u16)        = Graphic `playerCarID` 同域（实测 0/1001/1002 ✓）
 *   [3]      modelType(u8)          = **车型 id**（carData 的 id：32=ferrari_296_gt3、
 *                                     33=lamborghini_huracan_gt3_evo2 ✓）→ 组别靠它反查
 *   [4..]    teamName(u16 长度 + 字节)
 *   然后     raceNumber(**i32**)、cupCategory(u8)、currentDriverIndex(u8)、nationality(u16)、
 *            车手个数(u8)
 *   每位车手：firstName / lastName / shortName（都是 u16 长度 + 字节）、category(u8)、nationality(u16)
 *
 * ⚠️ **教训**：早先按"carId 是 u16@3、raceNumber 是 u16@6、车手个数在 @14"手搓偏移，在**旧报文**上
 *    恰好全对（因为旧版车队名是空字符串、各字段紧挨着），一旦车队名非空（新版 `HerMess Racing-OTKUS`）
 *    整个后半段错位 → 车号/评级/组别全解析失败。**报文布局以官方 SDK 为准，不要靠"逐字节对齐"猜**。
 */
export function parseEntryListCar(buf: Buffer): BroadcastEntry | null {
  try {
    if (buf.length < 21) return null
    const carEntryId = buf.readUInt16LE(1)
    const carId = buf.readUInt8(3)
    // 车型 id 必须像样（0 = 解析错位 / 空档），否则这条报文不可信
    if (carId === 0) return null
    let off = 4

    const team = readLenString(buf, off)
    if (!team) return null
    off = team.next

    if (off + 9 > buf.length) return null
    const raceNumber = buf.readInt32LE(off)
    off += 4
    const cupCategory = buf.readUInt8(off)
    off += 1
    off += 1 // currentDriverIndex(u8)
    const nationality = buf.readUInt16LE(off)
    off += 2
    const driverCount = buf.readUInt8(off)
    off += 1
    if (driverCount > 10) return null

    // 车手信息**尽力解析**：某个名字不合法/截断时**保留已经拿到的车手**并结束，
    // 绝不因为一个名字而丢掉整条报名条目 —— 条目还带着车型 id，
    // "组别内车数"就靠它统计（丢掉一条会让组别车数少算一辆，实测踩过：2 车显示 1/1）。
    const drivers: BroadcastEntry['drivers'] = []
    for (let i = 0; i < driverCount; i++) {
      const first = readLenString(buf, off)
      if (!first) break
      off = first.next
      const last = readLenString(buf, off)
      if (!last) break
      off = last.next
      const short = readLenString(buf, off)
      if (!short) break
      off = short.next
      if (off + 3 > buf.length) break
      const category = buf.readUInt8(off)
      off += 1
      off += 2 // nationality(u16)
      const name = short.value || last.value || first.value
      // 名字不可信时**照样收这条车手**（只是短名留空），条目不因此作废
      const plausible =
        isPlausibleText(name) || isPlausibleText(last.value) || isPlausibleText(first.value)
      if (!plausible && !name) continue
      drivers.push({
        shortName: plausible ? name : '',
        category,
        firstName: first.value,
        lastName: last.value,
        nationality,
      })
    }
    return { carEntryId, carId, raceNumber, cupCategory, teamName: team.value, drivers }
  } catch {
    return null
  }
}

/**
 * `TRACK_DATA`(5) —— 赛道名 / 赛道 id / **赛道长度（米）**。
 *
 * 布局（官方 SDK；按 npm 上的 [acc-broadcast](https://www.npmjs.com/package/acc-broadcast)
 * 的 `structs.js` 逐字段核对，该实现与本项目**实测确认**的 `ENTRY_LIST` / `ENTRY_LIST_CAR` /
 * `REALTIME_CAR_UPDATE` 三处布局完全一致，可视为 SDK 的忠实移植）：
 *   [0] type ｜ [1..4] connectionId(i32) ｜ [5..] trackName(u16 长度 + UTF-8)
 *   ｜ trackId(i32) ｜ trackMeters(i32)
 *   ｜ 相机集个数(u8) → 每个 [集合名] + 相机个数(u8) → [相机名 × n]
 *   ｜ HUD 页个数(u8) → [页名 × n]
 *
 * ⚠️ 这份布局**还没有用真实报文验证过**（本项目此前从未请求过 TRACK_DATA），所以解析器
 * 带两层自校验：`valid`（值是否像话）+ `trailingBytes`（报文是否被**完整**消费）。
 * 首次实机收到时会连原始报文一起打进日志，用真值（例如 Monza 应为 5793 m）回头确认。
 */
export interface TrackDataPacket {
  connectionId: number
  /** 赛道名（SDK 里是短名，例如 `monza`、`spa`） */
  trackName: string
  trackId: number
  /**
   * **赛道长度（米）** = 整条 spline 的总长度。拿到它就能把 spline 差值换成米：
   * `Δ距离(m) = Δspline × trackMeters`（ACC 官方示例算 live gap 用的就是这个量）。
   */
  trackMeters: number
  cameraSetNames: string[]
  cameraNames: string[]
  hudPages: string[]
  /** 解析后**剩下没被消费的字节数**：0 = 报文被完整消费，说明布局与 SDK 严格吻合（最强的自校验） */
  trailingBytes: number
  /** 值本身可用（赛道名像话 + 长度在合理区间）；`false` 时调用方应当作"没拿到" */
  valid: boolean
}

/** 赛道长度的合理区间（米）：ACC 里最短的 Oulton Park ~4.3km、最长的 Spa ~7km；放宽只为挡乱码 */
const TRACK_METERS_MIN = 500
const TRACK_METERS_MAX = 30_000

/** 纯函数：解析 `TRACK_DATA`(5)。抛异常（长度不够/字符串越界）一律返回 null —— 宁可不用，也不喂垃圾 */
export function parseTrackData(buf: Buffer): TrackDataPacket | null {
  try {
    const r = new ByteReader(buf)
    r.u8() // message type
    const connectionId = r.i32()
    const trackName = r.string()
    const trackId = r.i32()
    const trackMeters = r.i32()
    const cameraSetNames: string[] = []
    const cameraNames: string[] = []
    const cameraSetCount = r.u8()
    for (let i = 0; i < cameraSetCount; i++) {
      cameraSetNames.push(r.string())
      const cameraCount = r.u8()
      for (let j = 0; j < cameraCount; j++) cameraNames.push(r.string())
    }
    const hudPages: string[] = []
    const hudPageCount = r.u8()
    for (let i = 0; i < hudPageCount; i++) hudPages.push(r.string())
    const trailingBytes = r.remaining
    const valid =
      isPlausibleText(trackName) && trackMeters >= TRACK_METERS_MIN && trackMeters <= TRACK_METERS_MAX
    return {
      connectionId,
      trackName,
      trackId,
      trackMeters,
      cameraSetNames,
      cameraNames,
      hudPages,
      trailingBytes,
      valid,
    }
  } catch {
    return null
  }
}

/**
 * `BROADCASTING_EVENT`(7)：`[type u8][msg: u16 长度+UTF8][timeMs i32][carId i32]`
 * （官方 SDK；与 `TRACK_DATA` 取自同一份 JS 移植实现，而那个实现与本项目**实测确认**过的
 * `ENTRY_LIST`/`ENTRY_LIST_CAR`/`REALTIME_CAR_UPDATE` 布局逐字段一致）。
 *
 * `type` 是 `BroadcastingCarEventType`：
 *   1 = GreenFlag ｜ 2 = SessionOver ｜ **3 = PenaltyCommMsg（判罚消息文本）**
 *   4 = Accident ｜ 5 = LapCompleted ｜ 6 = BestSessionLap ｜ 7 = BestPersonalLap
 *
 * 用途：① 判罚的**原因文本**（也包括别人的判罚事件）；② 顺便验证一件我们还不知道的事 ——
 * **切弯警告（cut warning）会不会也来一条消息**。如果会，就能靠数消息得到 `Cut x/3`；
 * 所以这里把收到的消息按 (type,msg) 去重各打一行日志，实机跑一次就能看出来。
 */
export interface BroadcastingEvent {
  type: number
  msg: string
  timeMs: number
  carId: number
}

export function parseBroadcastingEvent(buf: Buffer): BroadcastingEvent | null {
  try {
    const r = new ByteReader(buf)
    r.u8() // message type
    const type = r.u8()
    const msg = r.string()
    const timeMs = r.i32()
    const carId = r.i32()
    // 布局自校验：这条报文应当**正好**被读完（多/少字节都说明与 SDK 不符）
    if (r.remaining !== 0) return null
    return { type, msg, timeMs, carId }
  } catch {
    return null
  }
}

export interface RealtimeUpdate {
  eventIndex: number
  sessionIndex: number
  sessionType: number
  sessionPhase: number
  sessionTimeMs: number | null
  sessionEndTimeMs: number | null
  focusedCarIndex: number | null
}

/**
 * REALTIME_UPDATE(2) 的固定前缀（**官方 SDK 布局**，实测 84 字节；结构体是**紧凑排列**，没有对齐填充）：
 *   [0] type ｜ [1..2] eventIndex(u16) ｜ [3..4] sessionIndex(u16) ｜ [5] sessionType(u8)
 *   ｜ [6] sessionPhase(u8) ｜ [7..10] sessionTime(f32, ms) ｜ [11..14] sessionEndTime(f32, ms)
 *   ｜ [15..18] focusedCarIndex(i32) ｜ @19 起是长度前缀字符串（相机/HUD）与天气，不解析。
 * 实测真实报文（84 字节，练习赛）：
 *   `02 0000 0000 00 05 0000 80bf 000080bf 00000000 0800 "Drivable" …`
 *   → sessionType=**0(Practice)**、sessionPhase=**5(Session，正在跑)**、
 *     sessionTime/sessionEndTime=**-1.0f**（本节无固定时长）、focusedCarIndex=**0**（与 0 起的车 id 同域）。
 * 正赛时 sessionEndTime 就是**本节总时长**（ms），sessionTime 是已进行时间。
 * ⚠️ 我先后写错过两次偏移（先按"最后 4 字节"读 focused、又自作聪明加了 1 字节对齐填充），
 *    都是被这条真实报文 fixture 抓出来的 —— 改这段先跑 `parseRealtimeUpdate` 的报文测试。
 */
export function parseRealtimeUpdate(buf: Buffer): RealtimeUpdate | null {
  try {
    if (buf.length < 19) return null
    const eventIndex = buf.readUInt16LE(1)
    const sessionIndex = buf.readUInt16LE(3)
    const sessionType = buf.readUInt8(5)
    const sessionPhase = buf.readUInt8(6)
    const time = buf.readFloatLE(7)
    const endTime = buf.readFloatLE(11)
    const focused = buf.readInt32LE(15)
    // -1 / NaN 表示"本节没有固定时长"（练习赛就是）
    const valid = (v: number) => (Number.isFinite(v) && v >= 0 ? v : null)
    return {
      eventIndex,
      sessionIndex,
      sessionType,
      sessionPhase,
      sessionTimeMs: valid(time),
      sessionEndTimeMs: valid(endTime),
      focusedCarIndex: focused >= 0 ? focused : null,
    }
  } catch {
    return null
  }
}

/** 一个 Lap 结构（SDK：`lapTimeMs i32, carIndex u16, driverIndex u16, splitsCount u8, splits i32×n, isInvalid u8, isValidForBest u8, isOutlap u8, isInlap u8`），实测 25 字节（3 个 split） */
export interface LapInfo {
  lapTimeMs: number
  isInvalid: boolean
  isValidForBest: boolean
  isOutlap: boolean
  isInlap: boolean
}

/**
 * 从 `base` 起读一个 Lap 结构（**结构自校验**：时间合理 + splitsCount ≤ 3 + 长度够）。
 * 不能写死偏移：实测同场有 101B 与 89B 两种报文，Lap 结构分别从 @38 / @41 开始。
 */
/** 官方在"还没有成绩"时填的哨兵（实测 bestSessionLap.lapTimeMs = 0x7fffffff）；共享内存的 iBestTime 同款 */
const LAP_TIME_SENTINEL = 2147483647

export function parseLapAt(buf: Buffer, base: number, minLapMs = 30_000, requireAllSplits = true): { lap: LapInfo; next: number } | null {
  if (base < 0 || base + 9 > buf.length) return null
  const rawLapTimeMs = buf.readInt32LE(base)
  // 0 / INT_MAX / 负数 都表示"暂无成绩"（刚过线、还没做圈速、出站圈…）
  const noTime = rawLapTimeMs <= 0 || rawLapTimeMs === LAP_TIME_SENTINEL
  const lapTimeMs = noTime ? 0 : rawLapTimeMs
  const splitsCount = buf.readUInt8(base + 8)
  if (splitsCount > 3) return null
  if (requireAllSplits && splitsCount !== 3) return null
  const size = 9 + splitsCount * 4 + 4
  if (base + size > buf.length) return null
  // 圈速合理性：0（没成绩）或 30s~10min 之外都不可信
  // minLapMs = 0 用于"进行中那一圈"：刚过线时它是部分圈速（可能只有零点几秒）
  if (!noTime && (lapTimeMs < minLapMs || lapTimeMs > 600_000)) return null
  const flags = base + 9 + splitsCount * 4
  return {
    lap: {
      lapTimeMs,
      isInvalid: buf.readUInt8(flags) !== 0,
      isValidForBest: buf.readUInt8(flags + 1) !== 0,
      isOutlap: buf.readUInt8(flags + 2) !== 0,
      isInlap: buf.readUInt8(flags + 3) !== 0,
    },
    next: base + size,
  }
}

/**
 * 尾部三个 Lap（bestSessionLap / lastLap / currentLap）。实测（本机跑出成绩后抓包核对）：
 *   `1001` 的 101B 报文里 @38 = 130.927s（= 该车最快圈 2:10.927）、@63 = 119.850s（= 上一圈 1:59.850 无效）、
 *   @88 = 进行中那圈 —— 三个结构间隔正好 25 字节 ✓
 * 起点会随前缀长度变化（89B 报文里是 @41），所以**逐个候选偏移试，能连读三个 25 字节结构才算数**。
 */
export function parseCarUpdateLaps(buf: Buffer): { best: LapInfo | null; last: LapInfo | null; current: LapInfo | null } | null {
  // 起点会随前缀长度变化（实测 101B 报文在 @38、89B 报文在 @41）→ **全报文扫描**，
  // 用"连续两个完整 Lap 结构（splitsCount=3 + 圈速合理）"自校验，第三个（进行中那圈）宽松校验。
  // ⚠️ 光靠圈速不够：'暂无成绩'哨兵 INT_MAX 会和报文里的垃圾字节撞车（实测在 @35 误判过），
  // 所以两个**完整圈**结构还要校验 `Lap.carIndex`(@+4) == 报文车号(@1)；
  // 进行中那圈不校验（实测它的 carIndex 填的是 0/1，不是真实车号，且 splitsCount 可能是 0）。
  const carIndex = buf.readUInt16LE(1)
  for (let base = 30; base + 34 + 9 <= buf.length; base++) {
    const a = parseLapAt(buf, base)
    if (!a || buf.readUInt16LE(base + 4) !== carIndex) continue
    const b = parseLapAt(buf, a.next)
    if (!b || buf.readUInt16LE(a.next + 4) !== carIndex) continue
    const c = parseLapAt(buf, b.next, 0, false)
    return { best: a.lap, last: b.lap, current: c ? c.lap : null }
  }
  return null
}

/**
 * REALTIME_CAR_UPDATE 的**前缀**（实测 101/89 字节两种，取决于尾部附加字段）。
 * 实测（新构建）：`03 0000 0000 01 02 <f32×3> 04 0000 0100 0100 0000 <f32> 0000 …`
 *   carIndex(u16) = 车 id（**不是数组下标** ✓；新构建从 0 起，实测本机 = 0 ✓，
 *   旧构建是 1001/1002 ✓）、driverIndex(u16)、driverCount(u8)、gear(u8)、worldPosX/Y/yaw(float)、
 *   carLocation(u8)、kmh(u16)、position(u16)、cupPosition(u16)、trackPosition(u16)、
 *   splinePosition(float)、laps(u16) —— 后面字段偏移不明，不解析。
 * ⚠️ **不要用 `carIndex === 0` 判非法**：新构建里 0 就是"我自己"（共享内存 playerCarID = 0 ✓），
 *    早先这一条把玩家自己的实时行全丢了，于是组别内名次永远算不出来。
 */
export function parseRealtimeCarUpdate(buf: Buffer): BroadcastCarUpdate | null {
  try {
    if (buf.length < 34) return null
    const carIndex = buf.readUInt16LE(1)
    const driverIndex = buf.readUInt16LE(3)
    const kmh = buf.readUInt16LE(20)
    const position = buf.readUInt16LE(22)
    const cupPosition = buf.readUInt16LE(24)
    const laps = buf.readUInt16LE(32)
    // SDK 布局里 carLocation 在 @19（0=Unknown 1=Track 2=Pitlane 3=PitEntry 4=PitExit）
    const carLocation = buf.length > 19 ? buf.readUInt8(19) : 0
    if (position > 500 || cupPosition > 500 || laps > 100000 || kmh > 1000) return null
    // 尾部三个 Lap（最快圈/上一圈/进行中）——结构自校验，拿不到就为 null（排行榜显示 --）
    const lapInfo = parseCarUpdateLaps(buf)
    const splinePosition = buf.length >= 32 ? buf.readFloatLE(28) : 0
    const trackPosition = buf.length >= 28 ? buf.readUInt16LE(26) : 0
    return {
      carIndex,
      driverIndex,
      position,
      cupPosition,
      laps,
      kmh,
      carLocation,
      trackPosition,
      splinePosition,
      bestLapMs: lapInfo?.best && lapInfo.best.lapTimeMs > 0 ? lapInfo.best.lapTimeMs : null,
      bestLapInvalid: lapInfo?.best ? lapInfo.best.isInvalid : null,
      lastLapMs: lapInfo?.last && lapInfo.last.lapTimeMs > 0 ? lapInfo.last.lapTimeMs : null,
      lastLapInvalid: lapInfo?.last ? lapInfo.last.isInvalid : null,
      currentLapInvalid: lapInfo?.current ? lapInfo.current.isInvalid : null,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 监听器
// ---------------------------------------------------------------------------

interface BroadcastState {
  socket: dgram.Socket | null
  config: BroadcastConfigResult | null
  connectionId: number | null
  registered: boolean
  focusedCarIndex: number | null
  /** 节类型（SDK SESSION_TYPE：0=Practice 4=Qualifying 9=Superpole 10=Race 11=Hotlap…） */
  sessionType: number | null
  /** 广播的赛节序号（换赛节 / 换赛道时变）—— 换节时立刻重取赛道数据，别等 15s 的续订 */
  sessionIndex: number | null
  /** 本节已进行时间（REALTIME_UPDATE 的 sessionTime，ms） */
  sessionTimeMs: number | null
  /** 本节**总时长**（REALTIME_UPDATE 的 sessionEndTime，ms；练习赛等无固定时长时是 null） */
  sessionTotalMs: number | null
  /** carIndex → 实时数据 */
  cars: Map<number, TrackedCarUpdate>
  /** carEntryId → 报名表信息 */
  entries: Map<number, BroadcastEntry>
  /** carEntryId ↔ carIndex 的对应（ENTRY_LIST 的顺序即 carIndex） */
  entryIdByIndex: number[]
  /** ENTRY_LIST 报出来的**本场车数**（权威：与 `carEntryIds.length` 一致；0 = 还没收到） */
  entryListCount: number
  /**
   * 赛道数据（`TRACK_DATA`：赛道名 / id / **长度（米）**）。**换赛道会变**，也可能一直拿不到 ——
   * 拿不到时保持 null，别拿旧赛道的长度去换算新赛道的 spline 差值。
   */
  track: TrackDataPacket | null
  lastError: string | null
  packets: { result: number; realtime: number; car: number; entryList: number; entryCar: number; track: number; event: number; other: number }
  registerTimer: NodeJS.Timeout | null
  entryListTimer: NodeJS.Timeout | null
  /** TRACK_DATA 的续订定时器 */
  trackTimer: NodeJS.Timeout | null
  loggedRaw: Set<number>
  /** 广播事件已打过日志的 (type|msg) 组合 —— 同一句话只打一次，避免刷屏 */
  loggedEvents: Set<string>
  /** "我的车"诊断日志只打一次（换赛节拿到新名单后允许再打一次） */
  loggedMeta: boolean
  /** 上次算出的数据指纹：变了就打一行日志（便于分辨"没连上广播"与"界面没刷新"） */
  lastMetaSignature: string
  /** 上次打印诊断日志的时刻（做节流，避免刷屏） */
  lastMetaLoggedAt: number
  /** 上一次 ENTRY_LIST 的车 id 串（只有真的变化才允许再打日志） */
  entryIdKey: string
  /** 上一次 TRACK_DATA 的指纹（赛道名/id/长度/剩余字节），只有真的变化才再打一行日志 */
  trackLoggedKey: string
  /** 上次请求报名表的时刻（出现没见过的车时立刻补拉，用这个做节流） */
  lastEntryListRequestAt: number
  /** 上次请求赛道数据的时刻 */
  lastTrackRequestAt: number
  /** 按车请求报名表的轮转游标（每次刷新推进一批，几轮覆盖完整名单） */
  entryRequestCursor: number
  /** 注册尝试次数（连续 3 次无应答就打一条诊断日志） */
  registerAttempts: number
}

const state: BroadcastState = {
  socket: null,
  config: null,
  connectionId: null,
  registered: false,
  focusedCarIndex: null,
  sessionType: null,
  sessionIndex: null,
  sessionTimeMs: null,
  sessionTotalMs: null,
  cars: new Map(),
  entries: new Map(),
  entryIdByIndex: [],
  entryListCount: 0,
  track: null,
  lastError: null,
  packets: { result: 0, realtime: 0, car: 0, entryList: 0, entryCar: 0, track: 0, event: 0, other: 0 },
  registerTimer: null,
  entryListTimer: null,
  trackTimer: null,
  loggedRaw: new Set(),
  loggedEvents: new Set(),
  loggedMeta: false,
  lastMetaSignature: '',
  lastMetaLoggedAt: 0,
  entryIdKey: '',
  trackLoggedKey: '',
  lastEntryListRequestAt: 0,
  lastTrackRequestAt: 0,
  entryRequestCursor: 0,
  registerAttempts: 0,
}

let log: (message: string) => void = message => console.log(message)

function buildString(value: string): Buffer {
  const body = Buffer.from(value, 'utf8')
  const length = Buffer.alloc(2)
  length.writeUInt16LE(body.length)
  return Buffer.concat([length, body])
}

function buildRegister(displayName: string, connection: string, command: string): Buffer {
  const interval = Buffer.alloc(4)
  interval.writeInt32LE(UPDATE_INTERVAL_MS)
  return Buffer.concat([
    Buffer.from([OUT.REGISTER, BROADCAST_PROTOCOL_VERSION]),
    buildString(displayName),
    buildString(connection),
    interval,
    buildString(command),
  ])
}

function sendSocket(buffer: Buffer) {
  const socket = state.socket
  const config = state.config
  if (!socket || !config) return
  socket.send(buffer, config.port, '127.0.0.1', error => {
    if (error) log(`[broadcast] 发送失败：${error.message}`)
  })
}

function sendRegister() {
  if (!state.config || !state.socket) return
  state.registerAttempts++
  // 连续几次注册都没人理：多半是游戏侧广播停了（旧连接堆满要重启 ACC 才能清空）
  if (state.registerAttempts === 3 && !state.registered) {
    log(
      '[broadcast] 注册连续 3 次无应答：游戏侧广播可能已停止（也可能是游戏没开广播 / 端口被占）。' +
        'ACC 会把注册过的连接一直留着，堆积后新的注册**完全不应答** —— 重启一次游戏即可清空；' +
        '本应用退出时会正确发送注销，不会再堆积。',
    )
  }
  sendSocket(
    buildRegister('Competizione Companion', state.config.connectionPassword, state.config.commandPassword),
  )
}

/** 每次刷新最多按车请求几条（轮转覆盖，避免 54 辆车时每 1.5s 发几十个包） */
export const ENTRY_REQUEST_WINDOW = 8

function sendRequestEntryList() {
  if (state.connectionId == null) return
  state.lastEntryListRequestAt = Date.now()
  const id = Buffer.alloc(4)
  id.writeInt32LE(state.connectionId)
  // ① SDK 形式（只有 connectionId）：实测单车赛节能回一条条目
  sendSocket(Buffer.concat([Buffer.from([OUT.REQUEST_ENTRY_LIST]), id]))
  // ② **再按车逐条请求**（多带一个 carEntryId u16）：这是最早那版写法，实测在服务器上
  //    能拿到**整份报名表**（当时收到 51 条 GT3 条目）；只发改成"只有 connectionId"之后
  //    就只剩自己被关注那辆车的条目了 —— 表现就是"车号/评级/组别排名又没了"。
  //    候选 id = ENTRY_LIST 报的车 id ∪ 已知条目 ∪ 已知实时行；每次轮转一小批（默认 8 条），
  //    几轮之内就能覆盖完整名单，代价可控。
  const candidates = [...new Set([...state.entryIdByIndex, ...state.entries.keys(), ...state.cars.keys()])]
  if (candidates.length === 0) return
  for (let i = 0; i < Math.min(ENTRY_REQUEST_WINDOW, candidates.length); i++) {
    const carEntryId = candidates[state.entryRequestCursor % candidates.length]
    state.entryRequestCursor = (state.entryRequestCursor + 1) % candidates.length
    const payload = Buffer.alloc(6)
    payload.writeInt32LE(state.connectionId, 0)
    payload.writeUInt16LE(carEntryId, 4)
    sendSocket(Buffer.concat([Buffer.from([OUT.REQUEST_ENTRY_LIST]), payload]))
  }
}

/**
 * 请求赛道数据：`[11][connectionId i32]`（5 字节，官方 SDK 的 `REQUEST_TRACK_DATA`）。
 * 游戏随后回一条 `TRACK_DATA`(5)：赛道名 / 赛道 id / **长度（米）** / 相机集 / HUD 页。
 */
function sendRequestTrackData() {
  if (state.connectionId == null) return
  state.lastTrackRequestAt = Date.now()
  const id = Buffer.alloc(4)
  id.writeInt32LE(state.connectionId)
  sendSocket(Buffer.concat([Buffer.from([OUT.REQUEST_TRACK_DATA]), id]))
}

/**
 * 超过这么久没收到某辆车的 `REALTIME_CAR_UPDATE` 就认为它不在本场了（换场次后 `state.cars`
 * 会残留旧车，实测会把组别内名次/车数算大：真实 10/21 被算成 24/51）。取 20s 足够宽：
 * 正常在跑的车每 250ms 就有一条更新，进站/暂停时也远小于这个值。
 */
export const STALE_CAR_MS = 20_000

/**
 * 纯函数：由"报名条目 + 各车实时行"算出要用的 meta。抽出来是为了能用真实报文做单测。
 *
 * 认车顺序：
 *   1. `localCarEntryId`（共享内存 playerCarID，与广播 carEntryId 同域）——最可靠；
 *   2. 车型名经 carData 反查车型 id → 匹配条目 `carId`；**同款车有多辆时**（例如两辆都是
 *      huracan gt3 evo2，实测踩过这个坑）再用"我的总名次"与各车广播 `position` 对照，
 *      对上哪辆就是哪辆 —— 否则会认成队友的车（表现为没有车号、没有评级）；
 *   3. 兜底第一个条目。
 *
 * 组别内名次**自己数**：广播自带的 `cupPosition` 实测不准（两车 GT3 时我的车总体第 2，
 * 广播却给 cupPosition=1 → 界面显示 1/2），所以用"同组里总名次比我好的车有几辆 + 1"。
 */
export function computeMetaFrom(input: {
  entries: BroadcastEntry[]
  cars: Map<number, BroadcastCarUpdate>
  localCarEntryId?: number | null
  carModel?: string | null
  /** 共享内存给的总名次（Graphic position），用作对照/兜底 */
  overallPosition?: number | null
  /**
   * ENTRY_LIST 报出来的本场车数（权威）。游戏**可能只推一部分** ENTRY_LIST_CAR（实测单车赛节只推 1 条），
   * 所以"组别内名次/车数"只在**条目收齐**时才发布 —— 否则会显示成 1/1 这种错数，
   * 宁愿让它为 null，组件就会退回显示总排名。
   */
  entryListCount?: number | null
  /** 共享内存的实时车数（Graphic 252 activeCars）：用来判断"报名表条目是否收齐" */
  activeCars?: number | null
  /** 共享内存 Static `numCars`(64)：**只在所有实时来源都没有时**兜底（它不随车手进出变化） */
  staticNumCars?: number | null
  /** 节信息（来自广播 REALTIME_UPDATE，见 `parseRealtimeUpdate`） */
  sessionType?: number | null
  sessionTimeMs?: number | null
  sessionTotalMs?: number | null
}): BroadcastMeta & { how: string; myEntryId: number | null; myGroup: string | null } {
  const empty = {
    raceNumber: null,
    driverCategory: null,
    cupPosition: null,
    cupCarCount: null,
    totalCarCount: null,
    // 节信息与"有没有报名条目"无关，这条路径也要带上（否则没条目时界面拿到 null）
    sessionType: input.sessionType ?? null,
    sessionTimeMs: input.sessionTimeMs ?? null,
    sessionTotalMs: input.sessionTotalMs ?? null,
    myCarLocation: null,
    how: 'none',
    myEntryId: null,
    myGroup: null,
  }
  const { entries, cars } = input
  if (entries.length === 0) return empty
  const myOverall = input.overallPosition ?? null

  let myEntry: BroadcastEntry | undefined
  let how = 'fallback'
  const localId = input.localCarEntryId ?? null
  if (localId != null) {
    myEntry = entries.find(e => e.carEntryId === localId)
    if (myEntry) how = 'playerCarId'
  }
  if (!myEntry) {
    const myCarId = carIdOfModel(input.carModel ?? null)
    if (myCarId != null) {
      const candidates = entries.filter(e => e.carId === myCarId)
      if (candidates.length === 1) {
        myEntry = candidates[0]
        how = 'carModel->carId'
      } else if (candidates.length > 1) {
        const byPosition = candidates.find(e => {
          const row = cars.get(e.carEntryId)
          return myOverall != null && row != null && row.position === myOverall
        })
        if (byPosition) {
          myEntry = byPosition
          how = 'carModel+position'
        } else {
          myEntry = candidates[0]
          how = `carModel(ambiguous:${candidates.length}->first)`
        }
      }
    }
  }
  if (!myEntry) myEntry = entries[0]

  const myGroup = carGroupOfId(myEntry.carId)
  /**
   * **只统计"本场还在跑"的车**：`state.cars` 里会残留上一场次的车（实测换场后旧 position 还在，
   * 把组别内名次算成 24、车数算成 51，而真实是 10/21）。判据 = 最近 StaleCarMs 内收到过更新。
   */
  const isFresh = (row: BroadcastCarUpdate | undefined): row is BroadcastCarUpdate =>
    row != null && (row.at == null || Date.now() - row.at <= STALE_CAR_MS)

  const myRow = cars.get(myEntry.carEntryId)
  const myPosition = (isFresh(myRow) ? myRow.position : null) ?? myOverall
  // 本场的车 id 集合（有实时行的车）
  const liveIds = [...cars.values()].filter(isFresh).map(r => r.carIndex)
  const liveIdSet = new Set(liveIds)
  // 我只认"本场有实时行"的车：它的组别从报名条目查，组别内名次/车数都基于这批车
  const groupEntries = myGroup
    ? entries.filter(e => carGroupOfId(e.carId) === myGroup && liveIdSet.has(e.carEntryId))
    : []
  // 收齐判据：**本场每辆车都拿到报名条目**才算齐（别用 ENTRY_LIST 的车数 —— 实测它可能是
  // 整个服务器的报名数，例如场上 24 辆却报 54）
  const complete = liveIds.length > 0 && liveIds.every(id => entries.some(e => e.carEntryId === id))
  const cupPosition =
    complete && myGroup && myPosition != null && myPosition > 0
      ? 1 +
        groupEntries.filter(e => {
          const row = cars.get(e.carEntryId)
          return isFresh(row) && row.position > 0 && row.position < myPosition
        }).length
      : null

  /**
   * 本场车数：**优先用实时在赛道上的车数** `activeCars`(Graphic 252) —— 它是唯一在每次实测里
   * 都对得上的来源（1/2/3/24 辆都对）；广播 `ENTRY_LIST` 的车数实测两个方向都错过
   * （2 辆报 1、24 辆报 54，后者是整个服务器的报名数），所以只作兜底；Static `numCars` 最后。
   */
  const activeCars = input.activeCars ?? 0
  const totalCarCount =
    activeCars > 0
      ? activeCars
      : liveIds.length > 0
        ? liveIds.length
        : (input.entryListCount ?? 0) > 0
          ? input.entryListCount!
          : input.staticNumCars ?? null

  return {
    raceNumber: myEntry.raceNumber != null && myEntry.raceNumber > 0 ? myEntry.raceNumber : null,
    driverCategory: myEntry.drivers[0]?.category ?? null,
    cupPosition,
    cupCarCount: complete && groupEntries.length > 0 ? groupEntries.length : null,
    totalCarCount,
    // 节信息来自广播 REALTIME_UPDATE（练习赛没有固定时长 → null）
    sessionType: input.sessionType ?? null,
    sessionTimeMs: input.sessionTimeMs ?? null,
    sessionTotalMs: input.sessionTotalMs ?? null,
    // 我所在地点（用我这条**新鲜**实时行的 carLocation；1=Track 2=Pitlane 3=PitEntry 4=PitExit）
    myCarLocation: isFresh(myRow) ? myRow.carLocation : null,
    how,
    myEntryId: myEntry.carEntryId,
    myGroup,
  }
}

/**
 * 收到报名表条目后，把"我的车"信息算出来（车号 / 评级 / 组别内名次与车数）。
 * 具体规则见 `computeMetaFrom`。
 */
export function getBroadcastMeta(input?: {
  localCarEntryId?: number | null
  carModel?: string | null
  overallPosition?: number | null
  activeCars?: number | null
  staticNumCars?: number | null
}): BroadcastMeta {
  const entries = [...state.entries.values()]
  const computed = computeMetaFrom({
    entries,
    cars: state.cars,
    localCarEntryId: input?.localCarEntryId ?? null,
    carModel: input?.carModel ?? null,
    overallPosition: input?.overallPosition ?? null,
    entryListCount: state.entryListCount,
    activeCars: input?.activeCars ?? null,
    staticNumCars: input?.staticNumCars ?? null,
    sessionType: state.sessionType,
    sessionTimeMs: state.sessionTimeMs,
    sessionTotalMs: state.sessionTotalMs,
  })
  const { raceNumber, driverCategory, cupPosition, cupCarCount, totalCarCount, how, myEntryId, myGroup } = computed
  // 节信息（类型/已进行/总时长）跟"有没有认到我的车"无关，两条返回路径都要带上 ——
  // 早先只在后半段返回里带，没认到车时界面就拿到 undefined（实测踩到）。
  const session = {
    sessionType: computed.sessionType,
    sessionTimeMs: computed.sessionTimeMs,
    sessionTotalMs: computed.sessionTotalMs,
    myCarLocation: computed.myCarLocation,
  }
  if (myEntryId == null) {
    return {
      raceNumber: null,
      driverCategory: null,
      cupPosition: null,
      cupCarCount: null,
      totalCarCount: null,
      ...session,
    }
  }
  const myEntry = entries.find(e => e.carEntryId === myEntryId)!

  // 诊断日志：首次 + 数据变化各打一行（方便分辨"广播没连上"与"界面没刷新"，
  // 也能一眼看出是不是认错了车 —— 例如 ambiguous 时）
  const signature = `${raceNumber}|${driverCategory}|${cupPosition}|${cupCarCount}|${myGroup}|${how}`
  const now = Date.now()
  // 指纹变化时打一行；另外**至少间隔 3s**，免得数据抖动导致刷屏
  if (!state.loggedMeta || (state.lastMetaSignature !== signature && now - state.lastMetaLoggedAt > 3000)) {
    const isFirst = !state.loggedMeta
    state.loggedMeta = true
    state.lastMetaSignature = signature
    state.lastMetaLoggedAt = now
    log(
      `[broadcast] ${isFirst ? '我的车' : '广播数据变化'}：匹配方式=${how} carEntryId=${myEntryId} 车型id=${myEntry.carId} ` +
        `组别=${myGroup ?? '?'} 车号=${raceNumber ?? '?'} 短名=${myEntry.drivers[0]?.shortName ?? '?'} ` +
        `评级字节=${driverCategory ?? '?'} 组别内名次=${cupPosition ?? '?'} 组别内车数=${cupCarCount ?? '?'} ` +
        `总车数=${totalCarCount ?? '?'}` +
        `（报名表 ${entries.length}/${state.entryListCount || '?'} 辆：${entries.map(e => `${e.carEntryId}/${e.carId}/#${e.raceNumber}`).join(' ')}）`,
    )
  }

  return { raceNumber, driverCategory, cupPosition, cupCarCount, totalCarCount, ...session }
}

/** 排行榜的一行（每辆车一条） */
export interface LeaderboardRow {
  carEntryId: number
  /** 车型 id（→ carData 查厂商 logo） */
  carId: number
  raceNumber: number | null
  driverName: string
  /**
   * 名次（1 起；未知时 9999 排最后）。
   * ⚠️ **正赛里这是我们自己按"跨线顺序"算出来的名次，不是游戏广播的名次**；
   *    其他节（排位/练习）仍然是游戏广播的名次。
   */
  position: number
  bestLapMs: number | null
  lastLapMs: number | null
  /**
   * 最后一列"秒差"（用户规则，**以本人为基准**）：
   *   · **正赛**：**分段跨线**（一圈 30 段，跨段界线那一刻实测，见 `gap-segments.ts`）。
   *     **严格口径**：给不出就是 null → 界面 `--`。给不出 = **差一整圈以上**（被套圈/套别人圈，
   *     界面走 `+N Lap`）或**还没有共同跨过的段界**（发车头几秒、刚换圈那一拍）。
   *     ⚠️ "前车刚冲线、我还差一点冲线"**不是**给不出 —— 那时两车圈数差 1 但只差几秒，
   *     照常显示（同圈判据是**绝对跨线序号**，不是圈数相等）。
   *   · **其他节（排位/自由练习等）**：该车最快圈与**我的最快圈**的差（直接相减）—— 原样未改
   *   · 本人 / 算不出来 → null（界面显示 `--`）
   */
  gapMs: number | null
  /** 秒差来源（`segments` = 分段跨线实测；`bestLap` = 圈速之差）。`ahead` 是历史遗留的进度差估算，正赛已不用 */
  gapKind: 'segments' | 'ahead' | 'bestLap' | null
  /**
   * **有符号圈差**：正 = 对方领先我 N 圈（他套我）；负 = 我领先对方 N 圈（我套他）。
   * ⚠️ 判定要"圈数计数器 + 赛道进度"**互相印证**（见 `gap-segments.ts` 的 `signedLapDelta`）——
   * 只看计数器会被"前车刚冲线"骗到（那时圈数差 1，实际只差几秒）。界面据此显示 `+N Lap` / `-N Lap`。
   */
  lapsDelta: number
  isMe: boolean
  /** 该车手当前是否在维修区（广播 carLocation ≥ 2：Pitlane / PitEntry / PitExit）—— 行末显示 P 标 */
  inPit: boolean
}

/** 排行榜刷新间隔（用户要求 0.5s 一次） */
export const LEADERBOARD_REFRESH_MS = 500
/** SESSION_TYPE：10 = Race（正赛）。其余（0 练习 / 4 排位 / 9 Superpole / 11 Hotlap…）用最快圈之差 */
const SESSION_TYPE_RACE = 10
let leaderboardCache: { at: number; rows: LeaderboardRow[] } = { at: 0, rows: [] }

/**
 * 组装排行榜：只统计**本场还在跑**的车（同 STALE_CAR_MS 新鲜度过滤，否则会出现"幽灵车"），
 * 再按**节类型**决定名次与最后一列：
 *   · **正赛** → 名次 = **跨线顺序**（不看游戏广播的名次）；秒差 = **分段跨线**（30 段，实测），
 *     段表给不出就 `--`（**严格口径，不退回估算**）
 *   · **其他节（排位/练习）** → 名次 = 广播名次、秒差 = 本车最快圈 − 我的最快圈（**原样未改**）
 * 结果按 0.5s 节流缓存（IPC 更小、也满足用户"半秒刷新一次"的要求）。
 */
export function getLeaderboard(
  localCarEntryId?: number | null,
  /**
   * 共享内存的最快圈（ms）。**正赛已不再用它估秒差**（严格口径：段表给不出就 `--`），
   * 参数保留是为了不动调用方（`telemetry.ts` 按位置传参）。
   */
  myBestLapMs?: number | null,
  /** 共享内存的已完成圈数 —— 我自己那行优先用它（广播给我那行可能是 0） */
  myCompletedLaps?: number | null,
): LeaderboardRow[] {
  const now = Date.now()
  if (now - leaderboardCache.at < LEADERBOARD_REFRESH_MS) return leaderboardCache.rows
  /**
   * "我是哪一行"：**优先用共享内存的 playerCarID**（它和广播 carEntryId 同域、每帧都有），
   * 报名条目里的 carEntryId 只作兜底 —— 条目是 1.5s 一辆慢慢收的，只靠它会出现
   * "榜单里没有我自己"（实测踩过两次）。
   */
  const isMeId = (carEntryId: number) =>
    (localCarEntryId != null && carEntryId === localCarEntryId) ||
    (state.myEntryId != null && carEntryId === state.myEntryId)
  const rows: Array<
    LeaderboardRow & {
      progress: number
      laps: number
      seg: SegTable | null
      /** 广播给的名次：正赛里只用于"还没跨过段界时"的相对顺序，**不再是最终名次** */
      bcastPos: number
    }
  > = []
  for (const [carEntryId, update] of state.cars) {
    if (update.at != null && now - update.at > STALE_CAR_MS) continue
    // ⚠️ 报名条目**可能还没收到**（一辆车一条、1.5s 一轮地收）—— 这时也要保留这一行，
    // 否则会出现"榜单里没有我自己"（实测踩过：自己的条目往往最后才到）。缺什么就显示 --。
    const entry = state.entries.get(carEntryId)
    const spline = Number.isFinite(update.splinePosition)
      ? Math.min(0.999, Math.max(0, update.splinePosition))
      : 0
    const driver = entry?.drivers[0]
    const fullName = driver
      ? [driver.firstName, driver.lastName].filter(v => v && v.trim().length > 0).join(' ').trim()
      : ''
    rows.push({
      carEntryId,
      carId: entry?.carId ?? 0,
      raceNumber: entry && entry.raceNumber > 0 ? entry.raceNumber : null,
      // 用户要求显示**全称**（不要三字母缩写）→ 优先 firstName + lastName，退回短名
      driverName: fullName || driver?.shortName || '--',
      position: update.position > 0 ? update.position : 9999,
      bcastPos: update.position > 0 ? update.position : 9999,
      bestLapMs: update.bestLapMs,
      lastLapMs: update.lastLapMs,
      gapMs: null,
      gapKind: null,
      lapsDelta: 0,
      isMe: isMeId(carEntryId),
      inPit: update.carLocation >= 2,
      progress: (isMeId(carEntryId) && myCompletedLaps != null ? myCompletedLaps : update.laps) + spline,
      laps: isMeId(carEntryId) && myCompletedLaps != null ? myCompletedLaps : update.laps,
      seg: update.seg ?? null,
    })
  }
  const isRace = state.sessionType === SESSION_TYPE_RACE
  /**
   * 排序 + 名次：
   *   · **正赛**：**完全不看游戏广播的名次**，按**跨线顺序**排 —— 圈数多者前 → 本圈跨过的段界靠后者前
   *     → 同一条段界上**先跨者**前（跨线时刻是实测）。排完把 `position` **改写成新名次**（界面显示的就是它）。
   *     本圈还没跨过任何段界的车（发车头几秒、刚换圈那一拍、换赛节后）排在"有跨线记录的车"之后，
   *     它们之间沿用广播名次的相对顺序 —— 所以发车瞬间整列还是发车顺序，随着一辆辆跨过第一条段界，
   *     名次自然过渡到跨线顺序。
   *   · **其他节（排位/练习）**：**保持原样** —— 按广播名次排序，一个字都没动。
   */
  if (isRace) {
    const orderOf = (r: (typeof rows)[number]) => (r.seg ? raceOrderOf(r.seg) : null)
    rows.sort((a, b) => {
      const oa = orderOf(a)
      const ob = orderOf(b)
      if (oa && ob) return compareRaceOrder(oa, ob) || a.bcastPos - b.bcastPos
      if (oa) return -1
      if (ob) return 1
      return a.bcastPos - b.bcastPos
    })
    rows.forEach((row, index) => {
      row.position = index + 1
    })
  } else {
    rows.sort((a, b) => a.position - b.position)
  }

  /**
   * 最后一列（用户规则，**以本人为基准**）：
   *   · 本人 → null（界面显示 `--`）
   *   · 排在我**前面**的车 → **正数**（界面 `+xx.xx` 橙色）
   *   · 排在我**后面**的车 → **负数**（界面 `-xx.xx` 绿色）
   * 正赛数值来源：**分段跨线**（30 段，跨段界线那一刻实测）优先，退回进度差 × 参考圈速的估算。
   * 直接用"与我的差"而不是逐格累加，避免误差沿链条叠加。
   */
  const meRow = rows.find(r => r.isMe)
  /**
   * 我自己的分段表按**共享内存的绝对圈数**向前对齐：广播给我那行的 `laps` 实测可能一直卡在 0，
   * 那样我的表会跟别人的"圈"对不上（两人永远"不同圈" → 秒差恒为 `--`）。
   * ⚠️ 只往**前**对齐（共享内存更靠前才动）、且只在差 ≥1 圈时动 —— 否则跨线那一拍的圈数抖动
   * 会每 0.5s 清一次表（两套圈数在跨线瞬间本来就可能差 1）。
   */
  if (meRow && myCompletedLaps != null) {
    const mine = state.cars.get(meRow.carEntryId)?.seg
    if (mine && myCompletedLaps - mine.lap >= 1) syncSegLap(mine, myCompletedLaps)
  }
  if (meRow) {
    for (const row of rows) {
      if (row.isMe) continue
      const ahead = row.position < meRow.position
      if (isRace) {
        /**
         * ① **圈差（有符号）**：正 = 对方领先我 N 圈（他套我）→ 界面 `+N Lap`；
         *    负 = 我领先对方（我套他）→ 界面 `-N Lap`。判定必须"计数器 + 进度"互相印证，
         *    否则"前车刚冲线、我还差一点"会被误判成差一圈（那时其实只差几秒）。
         */
        row.lapsDelta = signedLapDelta({
          meLaps: meRow.laps,
          meProgress: meRow.progress,
          otherLaps: row.laps,
          otherProgress: row.progress,
        })
        /**
         * ② **差整圈就不显示秒差**（`null`，交给上面的 `lapsDelta` 显示 `±N Lap`）——
         *    这时候"同一地点两个时刻之差"算出来是 ≈ −(一圈时间 − 实际间隔) 那种大数（例如
         *    我贴着落后一圈的车时 −85.00），看着像故障；而且它还会随我在哪一段来回跳。
         */
        if (row.lapsDelta !== 0) {
          row.gapMs = null
          row.gapKind = null
          continue
        }
        /**
         * ③ 同一圈才用**分段跨线**算秒差（双方都跨过的最近一条段界线上的时刻差）。
         * ⚠️ **严格口径（用户要求）**：段表给不出就是 `null`（界面 `--`），**不再退回估算值**；
         *   给不出只指"**还没有共同跨过的段界**"（发车头几秒、刚换圈那一拍）。
         *   ⚠️ **注意别用"已完成圈数相等"当同圈判据**（踩过）：前车刚冲线、我还差一点冲线时圈数会差 1，
         *   但我们只差几秒 —— 那种情况必须照常算（`gapFromSegTable` 内部用**绝对跨线序号**判断）。
         *   正负号是**测出来的**（对方更早跨过同一点 = 他在前 = 正数）。
         */
        const segGap = row.seg && meRow.seg ? gapFromSegTable(meRow.seg, row.seg) : null
        row.gapMs = segGap
        row.gapKind = segGap == null ? null : 'segments'
      } else {
        // 排位/练习：与本人最快圈的差（直接相减取绝对值；谁快谁"在前面"由名次决定）
        if (row.bestLapMs == null || meRow.bestLapMs == null) continue
        const magnitude = Math.abs(row.bestLapMs - meRow.bestLapMs)
        row.gapMs = ahead ? magnitude : -magnitude
        row.gapKind = 'bestLap'
      }
    }
  }

  const out: LeaderboardRow[] = rows.map(
    ({ progress: _p, laps: _l, seg: _sg, bcastPos: _b, ...rest }) => rest,
  )
  leaderboardCache = { at: now, rows: out }
  return out
}

/** 调试用：当前统计 */
export function getBroadcastStatus() {
  return {
    running: state.socket != null,
    registered: state.registered,
    connectionId: state.connectionId,
    port: state.config?.port ?? null,
    entries: state.entries.size,
    cars: state.cars.size,
    focusedCarIndex: state.focusedCarIndex,
    sessionType: state.sessionType,
    sessionTimeMs: state.sessionTimeMs,
    sessionTotalMs: state.sessionTotalMs,
    track: state.track,
    lastError: state.lastError,
    packets: { ...state.packets },
  }
}

/**
 * 赛道数据（`TRACK_DATA`）：赛道名 / id / **长度（米）**。
 * 拿不到、或值不像话（`valid` 为假：赛道名乱码 / 长度不在 500~30000 m）时返回 null ——
 * 调用方别拿旧赛道的长度算新赛道的 spline。（`getBroadcastStatus()` 里仍能看到原始解析结果，便于排障。）
 */
export function getTrackInfo(): TrackDataPacket | null {
  return state.track && state.track.valid ? state.track : null
}

function handleMessage(buffer: Buffer) {
  const type = buffer[0]
  switch (type) {
    case MSG.REGISTRATION_RESULT: {
      state.packets.result++
      const result = parseRegistrationResult(buffer)
      state.connectionId = result.connectionId
      state.registered = result.success
      state.lastError = result.success ? null : result.errorMessage || '注册失败'
      if (result.success) {
        log(`[broadcast] 注册成功（connectionId=${result.connectionId}，只读=${result.isReadOnly}）`)
        sendRequestEntryList()
        // 赛道数据（赛道名 + **长度（米）**）：和报名表一样，注册成功后主动要一次
        sendRequestTrackData()
        if (state.registerTimer) {
          clearInterval(state.registerTimer)
          state.registerTimer = null
        }
      } else {
        log(`[broadcast] 注册被拒：${state.lastError}（${REGISTER_RETRY_MS / 1000}s 后重试；注意 ACC 只在启动游戏时读 broadcasting.json，改过配置要重启游戏）`)
      }
      break
    }
    case MSG.REALTIME_UPDATE: {
      state.packets.realtime++
      const rt = parseRealtimeUpdate(buffer)
      if (rt) {
        state.focusedCarIndex = rt.focusedCarIndex
        state.sessionType = rt.sessionType
        state.sessionTimeMs = rt.sessionTimeMs
        state.sessionTotalMs = rt.sessionEndTimeMs
        // 换赛节（可能同时换了赛道）→ 立刻重取一次赛道数据（1s 节流，REALTIME_UPDATE 是 250ms 一条）
        if (rt.sessionIndex !== state.sessionIndex) {
          state.sessionIndex = rt.sessionIndex
          // 新赛节 = 圈数从头开始：把所有人的分段跨线表清掉（否则残留旧赛节的圈号，跨车永远"不同圈"）
          for (const car of state.cars.values()) resetSegTable(car.seg)
          if (Date.now() - state.lastTrackRequestAt > 1000) sendRequestTrackData()
        }
      } else logRawOnce(type, buffer, 'REALTIME_UPDATE 解析失败（与 SDK 布局不符）')
      break
    }
    case MSG.REALTIME_CAR_UPDATE: {
      state.packets.car++
      const update = parseRealtimeCarUpdate(buffer)
      if (update) {
        const now = Date.now()
        // 分段跨线表：跟着这辆车的实时行一起推进（跨段界线的时刻在这里记下来）
        const seg = state.cars.get(update.carIndex)?.seg ?? createSegTable(GAP_SEGMENTS)
        advanceSegTable(seg, update.splinePosition, update.laps, now)
        state.cars.set(update.carIndex, { ...update, at: now, seg })
        // 出现"没见过的车"（有人中途加入服务器）→ 立刻重拉一次报名表，
        // 不用等 15s 周期，这样"总车数/组别车数"能马上跟上（2s 节流防刷）
        if (!state.entries.has(update.carIndex) && Date.now() - state.lastEntryListRequestAt > 2000) {
          state.lastEntryListRequestAt = Date.now()
          sendRequestEntryList()
        }
      } else logRawOnce(type, buffer, 'REALTIME_CAR_UPDATE 解析失败')
      break
    }
    case MSG.ENTRY_LIST: {
      state.packets.entryList++
      const list = parseEntryList(buffer)
      if (!list) {
        logRawOnce(type, buffer, 'ENTRY_LIST 解析失败')
        break
      }
      // ⚠️ 只在**车 id 集合真的变了**时才允许再打一行"我的车"诊断日志。
      // 报名表刷新是 1.5s 一轮、每次请求游戏都会回一条 ENTRY_LIST，若无条件复位这个标志，
      // 日志会变成每帧刷屏（实测踩过）。
      const idKey = list.carEntryIds.join(',')
      if (state.entryIdKey !== idKey) {
        state.entryIdKey = idKey
        state.loggedMeta = false
        state.lastMetaSignature = ''
      }
      state.entryIdByIndex = list.carEntryIds
      state.entryListCount = list.carEntryIds.length
      // 名单本身已经是全量（SDK：ENTRY_LIST 里就带全部车 id），随后游戏会按 updateInterval
      // 逐辆推 ENTRY_LIST_CAR；这里只按 SDK 再请求一次全量（`[10][connectionId i32]`，5 字节）
      sendRequestEntryList()
      break
    }
    case MSG.ENTRY_LIST_CAR: {
      state.packets.entryCar++
      const entry = parseEntryListCar(buffer)
      if (entry) state.entries.set(entry.carEntryId, entry)
      else logRawOnce(type, buffer, 'ENTRY_LIST_CAR 解析失败（与官方 SDK 布局不符）')
      break
    }
    case MSG.TRACK_DATA: {
      state.packets.track++
      const track = parseTrackData(buffer)
      if (!track) {
        logRawOnce(type, buffer, 'parse FAILED (layout != SDK)', TRACK_LOG_PREFIX)
        break
      }
      state.track = track
      // ⚠️ 只有**指纹变化**才打日志（赛道数据会按 15s 续订，无条件打会刷屏；报名表那次踩过）
      const key = `${track.trackName}|${track.trackId}|${track.trackMeters}|${track.trailingBytes}|${track.cameraNames.length}|${track.hudPages.length}`
      if (state.trackLoggedKey !== key) {
        state.trackLoggedKey = key
        const layout =
          track.trailingBytes === 0
            ? `EXACT (consumed all ${buffer.length} bytes)`
            : `DIFF (${track.trailingBytes} bytes left over)`
        log(
          `${TRACK_LOG_PREFIX} name="${track.trackName}" trackId=${track.trackId} meters=${track.trackMeters} ` +
            `connectionId=${track.connectionId} cameraSets=${track.cameraSetNames.length} cameras=${track.cameraNames.length} ` +
            `hudPages=${track.hudPages.length} packetBytes=${buffer.length} layout=${layout}`,
        )
        if (!track.valid) {
          log(
            `${TRACK_LOG_PREFIX} WARN values look wrong (name="${track.trackName}" meters=${track.trackMeters}) -> treat as unavailable`,
          )
        }
        if (track.connectionId !== state.connectionId) {
          log(
            `${TRACK_LOG_PREFIX} WARN connectionId mismatch (packet=${track.connectionId} local=${state.connectionId}) -> possible misaligned read`,
          )
        }
        // 原始报文只打一次（300 字节封顶）：布局有出入时靠它逐字节定位
        log(`${TRACK_LOG_PREFIX} raw hex (${buffer.length} bytes, first ${Math.min(300, buffer.length)}): ${buffer.subarray(0, 300).toString('hex')}`)
      }
      break
    }
    case MSG.BROADCASTING_EVENT: {
      state.packets.event++
      const ev = parseBroadcastingEvent(buffer)
      if (!ev) {
        logRawOnce(type, buffer, 'BROADCASTING_EVENT 解析失败（与官方 SDK 布局不符）')
        break
      }
      /**
       * 每个 (type,msg) 只打一次：`PenaltyCommMsg`(3) 的文本就是我们想要的"判罚原因"，
       * 顺便看**切弯警告会不会也发消息**（会 → 就能数出 Cut x/3）。别无条件打（事件很频繁）。
       */
      const key = `${ev.type}|${ev.msg}`
      if (!state.loggedEvents.has(key)) {
        state.loggedEvents.add(key)
        log(
          `[broadcast event] type=${ev.type} carId=${ev.carId} timeMs=${ev.timeMs} msg="${ev.msg}"` +
            (ev.type === 3 ? '  ← PenaltyCommMsg（判罚消息）' : ''),
        )
      }
      break
    }
    default:
      state.packets.other++
  }
}

/** 同一种报文只打一次原始字节，避免刷屏（`prefix` 供不同来源用各自的日志前缀） */
function logRawOnce(type: number, buffer: Buffer, why: string, prefix = '[broadcast]') {
  if (state.loggedRaw.has(type)) return
  state.loggedRaw.add(type)
  log(`${prefix} ${why}；原始报文（${buffer.length} 字节）：${buffer.subarray(0, 200).toString('hex')}`)
}

export interface BroadcastOptions {
  /** 文档目录（Electron 里用 app.getPath('documents')），默认按用户目录推 */
  documentsDir?: string
  logger?: (message: string) => void
  /** 测试用：注入 UdpSocket 工厂 */
  socketFactory?: () => dgram.Socket
}

/** 启动监听（幂等）：读配置 → 建 socket → 注册 → 周期重试 */
export function initBroadcast(options: BroadcastOptions = {}): void {
  if (state.socket) return
  if (options.logger) log = options.logger

  const documentsDir = options.documentsDir
  if (!documentsDir) {
    log('[broadcast] 未提供文档目录，跳过广播监听')
    return
  }
  const config = ensureBroadcastConfig(documentsDir, log)
  if (!(config.port > 0)) {
    log('[broadcast] 广播端口不可用，跳过监听')
    return
  }
  state.config = config

  const socket = options.socketFactory ? options.socketFactory() : dgram.createSocket('udp4')
  state.socket = socket
  socket.on('message', handleMessage)
  socket.on('error', error => {
    state.lastError = error.message
    log(`[broadcast] socket 错误：${error.message}`)
  })
  socket.bind(0, '127.0.0.1', () => {
    log(`[broadcast] 已就绪：本地端口 ${socket.address().port} → 127.0.0.1:${config.port}`)
    sendRegister()
    state.registerTimer = setInterval(() => {
      if (!state.registered) sendRegister()
    }, REGISTER_RETRY_MS)
    state.entryListTimer = setInterval(() => {
      if (state.registered) sendRequestEntryList()
    }, ENTRY_LIST_REFRESH_MS)
    state.trackTimer = setInterval(() => {
      if (state.registered) sendRequestTrackData()
    }, TRACK_DATA_REFRESH_MS)
  })
}

/**
 * 停止监听（退出时）。
 * ⚠️ **必须先发 `UNREGISTER_COMMAND_APPLICATION`（类型 9 + connectionId）**：ACC 会把注册过的
 * 连接一直留着，只有收到注销才释放 —— 实测连接堆多了之后游戏对新注册**完全不应答**
 * （连"密码错"的回包都没有，表现为界面里车号/评级/组别全没了），重启游戏才能清空。
 */
export function stopBroadcast(): void {
  if (state.registerTimer) clearInterval(state.registerTimer)
  if (state.entryListTimer) clearInterval(state.entryListTimer)
  if (state.trackTimer) clearInterval(state.trackTimer)
  state.registerTimer = null
  state.entryListTimer = null
  state.trackTimer = null

  const socket = state.socket
  const connectionId = state.connectionId
  state.socket = null
  state.registered = false
  state.connectionId = null
  // 赛道数据跟着连接走：清掉，免得下次注册后拿旧赛道的长度去换算新赛道的 spline
  state.track = null
  state.trackLoggedKey = ''
  state.sessionIndex = null
  if (!socket) return

  const finish = () => {
    try {
      socket.close()
    } catch {
      // 忽略
    }
  }
  if (connectionId != null) {
    // 注销包：类型 9 + connectionId(i32)
    const payload = Buffer.alloc(5)
    payload.writeUInt8(OUT.UNREGISTER, 0)
    payload.writeInt32LE(connectionId, 1)
    try {
      socket.send(payload, payload.length, state.config?.port ?? 0, '127.0.0.1', () => finish())
      // 兜底：300ms 内没回调也要关掉
      setTimeout(finish, 300)
      log(`[broadcast] 已发送注销（connectionId=${connectionId}）`)
      return
    } catch {
      // 落到下面直接关
    }
  }
  finish()
}

/**
 * **我**进行中那一圈是否已无效（正赛的实时无效圈信号）。
 * 来源：广播 `REALTIME_CAR_UPDATE` 尾部第三个 `Lap`（进行中那一圈）的 `isInvalid` ——
 * 共享内存的 `isValidLap`(1408) 在正赛里常常不翻，所以正赛要靠这个。
 * 找不到我的实时行 / 结构解析不出来时返回 null（界面不要据此闪红）。
 */
export function getMyCurrentLapInvalid(localCarEntryId?: number | null): boolean | null {
  const now = Date.now()
  const isMe = (id: number) =>
    (localCarEntryId != null && id === localCarEntryId) ||
    (state.myEntryId != null && id === state.myEntryId)
  for (const [carEntryId, update] of state.cars) {
    if (!isMe(carEntryId)) continue
    if (update.at != null && now - update.at > STALE_CAR_MS) return null
    return update.currentLapInvalid ?? null
  }
  return null
}
