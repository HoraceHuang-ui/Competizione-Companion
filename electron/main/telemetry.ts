import { app, BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { PauseDetector } from './pause-detect'
import { getBroadcastMeta, getLeaderboard, type LeaderboardRow, getMyCurrentLapInvalid } from './acc-broadcast'


// ---------------------------------------------------------------------------
// ACC 遥测：主进程按 ~60Hz 广播给覆盖层窗口
//
// 📌 字段偏移 / 单位 / 加字段步骤：见仓库根目录 ACC-遥测数据参考.md（AGENTS.md 也指向它）
// 数据源是 native/shm-reader/acc-shm-reader.cs 编译出的小读取器（native/out/
// acc-shm-reader.exe）：它按需映射共享内存 `Local\acpmf_physics` / `_graphics` /
// `_static`，只读用到的偏移（官方 SharedFileOut.h 是 `#pragma pack(4)`），每行一条
// JSON 打到 stdout。
//   偏移  0  int   packetId
//   偏移  4  float gas             [0,1]   官方 PDF 原文 "from -0 to 1.0"
//   偏移  8  float brake           [0,1]
//   偏移 12  float fuel            kg
//   偏移 16  int   gear            AC 惯例：0=R、1=N、2..=1 挡..
//   偏移 20  int   rpms
//   偏移 24  float steerAngle      [-1,1]  官方 PDF 原文 "from -1.0 to 1.0"
//   偏移 28  float speedKmh        km/h
//
// 之所以只读需要的字节：不碰后面那些有争议的 struct 大小 / 尾部新增字段。
// 退出与暂停检测：共享内存不会告诉你游戏关了（句柄还在、数据冻结），所以除了
// 读取器自己的 active 标志，这里还有一道「停更看门狗」——超过 STALE_MS 没收到
// 新数据就判定停更（ACC-接口文档调研.md §6.3）。
// **判定停更后只打日志、不推空快照**：界面保持最后一帧（用户要求），
// 免得 ACC 一退到菜单，所有组件就变回占位符。
// 开预览：CC_TELEMETRY_SIM=1 时改用内置模拟源（不启动读取器）。
// ---------------------------------------------------------------------------

export interface TelemetrySnapshot {
  /** 是否有有效数据；false 时界面显示占位符 */
  active: boolean
  gas: number
  brake: number
  steer: number
  speedKmh: number
  rpms: number
  gear: number
  packetId: number
  /** 四轮胎压（psi），顺序 [FL, FR, RL, RR] */
  tyrePressure: number[]
  /** 四轮胎心温度（℃），顺序 [FL, FR, RL, RR] */
  tyreCoreTemp: number[]
  /** 四轮刹车片温度（℃），顺[FL, FR, RL, RR] */
  brakeTemp: number[]
  /** 胎种名（Graphic `tyreCompound`）；读不到或非可打印文本时为 null */
  compound: string | null
  /** 当前使用的轮胎编号（Graphic `currentTyreSet`，偏1572 实测确认*/
  tyreSet: number | null
  /** 四轮刹车片剩余寿命（Physics `padLife[4]`，偏740 实测确认），顺序 [FL, FR, RL, RR] */
  padLife: number[] | null
  /** Graphic `status`=OFF 1=REPLAY 2=LIVE 3=PAUSE */
  status: number
  /** Graphic `session`（ACC_SESSION_TYPE）：-1 未知 0 练习 1 排位 2 正赛 3 热圈 4 计时*/
  session: number
  /** 已完成圈*/
  completedLaps: number
  /** 名次 起） */
  position: number
  /** 赛程总圈数（练习/排位0*/
  numberOfLaps: number
  /** 当前所在扇*/
  sectorIndex: number
  /** 当前圈时/ 上圈 / 最快圈（ms）；无效时为哨兵 2147483647 */
  iCurrentTime: number
  iLastTime: number
  iBestTime: number
  /** 赛节剩余时间（秒）；练习等无时限赛节为负（哨兵） */
  sessionTimeLeft: number
  /** Graphic `flag`（ACC_FLAG_TYPE），ACC-遥测数据参md §1.2.3 */
  flag: number
  /** Graphic `penalty`（ACC_PENALTY_TYPE 枚举），0 = 无判罚 */
  penalty: number
  /**
   * Graphic `penaltyTime`（偏移 1220，float，**秒**）—— 官方说明 "Penalty time to wait"。
   * 用途：SG 的等待秒数 / **罚时秒数**（`penalty == 14` PostRaceTime 时就是"+xx s"）。
   * （罚时到底怎么落到这个字段上，靠「判罚」组件在实机里核对，见参考文档 §1.6）
   */
  penaltyTime: number
  /** Graphic `trackGripStatus`（ACC_TRACK_GRIP_STATUS，偏1556 实测确认*/
  trackGripStatus: number | null
  /** Physics 248：限速器是否开启（0/1）—— 行驶状态组件用它显示 PIT LIMIT */
  pitLimiterOn: number | null
  /** 一天中的时间（秒，Graphic `Clock`，偏1488 实测确认*/
  timeOfDay: number | null
  /** 气温 ℃（Physics 288，实测确认） */
  airTemp: number
  /** 赛道温度 ℃（Physics 292，实测确认） */
  roadTemp: number
  /** 全局旗（Graphic 1500..1528.9 追加区，0/1）——全场比赛的旗语状*/
  globalYellow: number
  globalYellow1: number
  globalYellow2: number
  globalYellow3: number
  globalWhite: number
  globalGreen: number
  globalChequered: number
  globalRed: number
  /** 进站窗口圈号区间（Static 676/680）；null 0/负数表示本赛节没有进站窗*/
  pitWindowStart: number | null
  pitWindowEnd: number | null
  /**
   * 车损原始值（Physics 224，float[5]）：中   * ⚠️ 实测单位不是秒，而是「损伤点」：撞车实测 25.5732/12.0880/5.3215
   * 游戏内显示修7.22/3.41/1.50 显示秒数 = 原始/ 3.542（见参考文§1.2.2   */
  carDamage: number[] | null
  /** 悬挂损伤原始值（Physics 680，float[4]，FL/FR/RL/RR），单位carDamage */
  suspensionDamage: number[] | null
  /** 后刹车片型号（Physics 732/736*/
  brakeCompoundFront: number | null
  brakeCompoundRear: number | null
  /** TC 是否正在介入（Physics 204/1）—不是 TC 档位（档位在 Graphic 1268*/
  tc: number
  /** ABS 是否正在介入（Physics 252/1）—不是 ABS 档位（档位在 Graphic 1280*/
  abs: number
  /** 四轮滑移（Physics 56，官"Tyre slip"），顺序 [FL, FR, RL, RR]；单位未定，槽位刻度见实*/
  wheelSlip: number[] | null
  /** 当前雨强（Graphic 1560，ACC_RAIN_INTENSITY 0..5*/
  rainIntensity: number | null
  /** 10 分钟后的雨强预报（Graphic 1564）—游戏 HUD 天气图标的数据源 */
  rainIntensityIn10min: number | null
  /** 30 分钟后的雨强预报（Graphic 1568*/
  rainIntensityIn30min: number | null
  /** TC 档位（Graphic 1268..N）—不是 Physics 204 那个"是否介入"0/1 */
  tcLevel: number | null
  /** ABS 档位（Graphic 1280..N*/
  absLevel: number | null
  /** 当前圈与最快圈的 delta（Graphic 1360，ms **绝对值**）；符号看 deltaPositive */
  deltaLapTimeMs: number | null
  /** 游戏自己算的预测圈速（Graphic 1396，ms） */
  estimatedLapTimeMs: number | null
  /** delta 符号：1 = 正（比最快圈慢），0 = 负（更快） */
  deltaPositive: number | null
  /** 玩家车 id（Graphic 1216，实测 1001/1002；与 UDP 广播的 carEntryId 同域） */
  playerCarId: number | null
  /**
   * Driver stint **剩余额度**（Graphic 1308/1312，ms）——官方语义是"还允许开多久"：
   * TotalTimeLeft = 本场还剩多少驾驶时间、TimeLeft = 本 stint 还剩多少。
   * 单人/无换人规则时是 **-1000（N/A 哨兵）**，组件此时隐藏该行。
   */
  driverStintTotalTimeLeft: number | null
  driverStintTimeLeft: number | null
  /** 本场车数（Static 64；官方另有 Graphic 252 activeCars，但官方标注不可信） */
  numCars: number | null
  /** **实时**车数（Graphic 252 activeCars，实测 3 辆车时 = 3；Static 的 numCars 有车加入不会变） */
  activeCars: number | null
  /** 剩余油量（Physics 12，官方 "Amount of fuel remaining"；游戏里按 L 显示） */
  fuel: number | null
  /**
   * 每圈平均油耗（Graphic `fuelXLap` 1284，float L/lap，**实测确认**：本机读到 3.15）
   */
  fuelXLap: number | null
  /** 上次加油后用掉的油量（Graphic `usedFuel` 1324，已核对 ✅） */
  usedFuel: number | null
  /** 节类型（广播 REALTIME_UPDATE 的 SESSION_TYPE：0=Practice 4=Qualifying 10=Race …） */
  sessionType: number | null
  /** 本节已进行时间（广播 REALTIME_UPDATE 的 sessionTime，ms） */
  sessionTimeMs: number | null
  /** 本节总时长（广播 REALTIME_UPDATE 的 sessionEndTime，ms；练习赛等无固定时长时 null） */
  sessionTotalMs: number | null
  /** 我所在地点（广播 CAR_LOCATION：1=Track 2=Pitlane 3=PitEntry 4=PitExit）—— 用来排除进站圈 */
  carLocation: number | null
  /** 我进行中那一圈是否已无效（广播实时信号） */
  currentLapInvalid: boolean | null
  /** 排行榜（每辆车一行，见 acc-broadcast.ts 的 LeaderboardRow） */
  leaderboard: LeaderboardRow[]
  /** 当前圈是否有效（Graphic 1408 `isValidLap`：1 = 有效、0 = 无效） */
  isValidLap: number | null
  /** 车型名（Static 68，用于推组别 GT3/GT4/GTC/TCX） */
  carModel: string | null
  /** 车手三字母短名（Static 332 playerNick） */
  playerNick: string | null
  /**
   * 以下 4 项**共享内存里没有**，只能由 UDP Broadcasting 提供（ENTRY_LIST / ENTRY_LIST_CAR）：
   * 车号、车手评级、组别内名次、组别内车数。监听器见 `acc-broadcast.ts`；没连上时恒为 null，
   * 组件按 null 优雅降级。
   */
  raceNumber: number | null
  /** ACC_DRIVER_CATEGORY：0 = 未知、1 = AM、2 = SILVER(PRO-AM)、3 = PRO（实机实测） */
  driverCategory: number | null
  /** 组别内名次（广播 cupPosition） */
  cupPosition: number | null
  /** 组别内车数（按车型 id 反查组别后统计） */
  cupCarCount: number | null
  /** **实时**总车数（广播报名表条数；Static numCars 不会随车辆加入更新） */
  totalCarCount: number | null
}

// 注意：这里刻意**不推空快照**：
//   · 数据停更 / ACC 退出：保持最后一帧（markStale），绝不推空值把界面打回占位符；
//   · 从未收到过数据：界面本来就是渲染侧的初值（src/overlay/telemetry.ts 里 state 的初值）。
/** 模拟源用；读取器自己按 ~60Hz 出数据，不受这个值影响 */
const SIM_TICK_MS = 16
/** 超过这么久没收到读取器的新数据就判定失效（ACC 退出 / 暂停） */
const STALE_MS = 1200

const SIM = process.env.CC_TELEMETRY_SIM === '1'

let getWindows: () => BrowserWindow[] = () => []
let lastSentJson = ''
let lastLineAt = 0
/** 收到过有效数据 */
let active = false
/** 数据已停更 / 游戏暂停；只用于日志与内部判断，界面保持最后一帧不再刷新 */
let stale = false
/** 游戏暂停状态；变化时通知宿主（覆盖层据此隐藏/恢复遥测窗） */
let gamePaused = false
let setGamePaused: (paused: boolean) => void = () => {}

/**
 * 只能由 UDP Broadcasting 提供的会话信息（车号 / 评级 / 组别内名次与车数）。
 * 实现在 `acc-broadcast.ts`：注册成功后解析 `ENTRY_LIST` / `ENTRY_LIST_CAR` /
 * `REALTIME_CAR_UPDATE`，这里每帧取一次（用 `playerCarId` 精确锁定"我这辆车"）；
 * 没连上广播时它返回全 null，组件按 null 优雅降级。
 */
function broadcastSnapshot(
  localCarEntryId: number | null,
  carModel: string | null,
  overallPosition: number | null,
  activeCars: number | null,
  staticNumCars: number | null,
) {
  return getBroadcastMeta({ localCarEntryId, carModel, overallPosition, activeCars, staticNumCars })
}

let simTimer: NodeJS.Timeout | null = null
let watchdogTimer: NodeJS.Timeout | null = null
let child: ChildProcess | null = null
let restartTimer: NodeJS.Timeout | null = null
let childStartedAt = 0

// ---------- 广播 ----------

function publish(snapshot: TelemetrySnapshot) {
  const windows = getWindows().filter(win => !win.isDestroyed())
  if (!windows.length) return

  const json = JSON.stringify(snapshot)
  if (json === lastSentJson) return
  lastSentJson = json

  for (const win of windows) {
    win.webContents.send('telemetry:data', snapshot)
  }
}

/**
 * 数据停更 / ACC 退/ 读取器退/ 游戏暂停 * **按需求：保持界面上的最后一帧，不再往下推空状*（以前推 EMPTY 会把所有组件打回占位符）；
 * 同时游戏暂停"告诉宿主（覆盖层窗口可以据此整体隐藏遥测窗） */
function markStale(reason: string) {
  if (!stale) {
    stale = true
    if (active) {
      console.log(`[telemetry] ${reason}，保持最后一帧数据不再更新`)
    }
  }
  pauseDetector.noData()
  setPaused(true, reason)
}

/** 有新数据了：清掉停更/暂停标记，遥测窗可以恢复显示 */
function markRunning() {
  stale = false
  setPaused(false, '')
}

function setPaused(paused: boolean, reason: string) {
  if (paused === gamePaused) return
  gamePaused = paused
  console.log(
    paused
      ? `[telemetry] 判定游戏已暂停（${reason}）`
      : '[telemetry] 数据恢复，判定游戏已回到赛道',
  )
  setGamePaused(paused)
}

/**
 * 游戏暂停 / 无数据的判定（清零帧、只packetId 在变的冻结帧、完全没数据 * 全在 pause-detect.ts 里，那边是纯逻辑、可单测 */
const pauseDetector = new PauseDetector()

// ---------- 真实数据源：共享内存读取----------

function readerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'shm', 'acc-shm-reader.exe')
  }
  return path.join(process.env.APP_ROOT || '', 'native', 'out', 'acc-shm-reader.exe')
}

function handleReaderLine(line: string) {
  const text = line.trim()
  if (!text) return
  let parsed: Partial<TelemetrySnapshot>
  try {
    parsed = JSON.parse(text)
  } catch {
    console.warn('[telemetry] 读取器输出无法解析', text.slice(0, 200))
    return
  }

  if (!parsed.active) {
    // 读取器说"没有数据"（ACC 没开/退回菜单）：保持最后一帧，不推空状态
    lastLineAt = Date.now()
    markStale('读取器无数据（ACC 退出或暂停）')
    return
  }

  active = true
  lastLineAt = Date.now()
  const quad = (value: unknown): number[] =>
    Array.isArray(value) && value.length === 4
      ? value.map(v => Number(v) || 0)
      : [0, 0, 0, 0]
  const int = (value: unknown, fallback: number) =>
    Number.isFinite(value) ? Number(value) : fallback
  const nullableInt = (value: unknown) =>
    Number.isFinite(value) ? Number(value) : null
  // 广播侧（车号/评级/组别内名次与车数）每帧取一次；没连上就是全 null
  const broadcast = broadcastSnapshot(
    nullableInt(parsed.playerCarId),
    typeof parsed.carModel === 'string' ? parsed.carModel : null,
    int(parsed.position, 0) > 0 ? int(parsed.position, 0) : null,
    nullableInt(parsed.activeCars),
    nullableInt(parsed.numCars),
  )
  const snapshot: TelemetrySnapshot = {
    active: true,
    gas: Number(parsed.gas) || 0,
    brake: Number(parsed.brake) || 0,
    steer: Number(parsed.steer) || 0,
    speedKmh: Number(parsed.speedKmh) || 0,
    rpms: Number(parsed.rpms) || 0,
    gear: Number.isFinite(parsed.gear) ? Number(parsed.gear) : 1,
    packetId: Number(parsed.packetId) || 0,
    tyrePressure: quad(parsed.tyrePressure),
    tyreCoreTemp: quad(parsed.tyreCoreTemp),
    brakeTemp: quad(parsed.brakeTemp),
    compound: typeof parsed.compound === 'string' ? parsed.compound : null,
    tyreSet: nullableInt(parsed.tyreSet),
    padLife:
      Array.isArray(parsed.padLife) && parsed.padLife.length === 4
        ? parsed.padLife.map(v => Number(v) || 0)
        : null,
    status: int(parsed.status, 0),
    session: int(parsed.session, -1),
    completedLaps: int(parsed.completedLaps, 0),
    position: int(parsed.position, 0),
    numberOfLaps: int(parsed.numberOfLaps, 0),
    sectorIndex: int(parsed.sectorIndex, 0),
    iCurrentTime: int(parsed.iCurrentTime, 0),
    iLastTime: int(parsed.iLastTime, 0),
    iBestTime: int(parsed.iBestTime, 0),
    sessionTimeLeft: int(parsed.sessionTimeLeft, 0),
    flag: int(parsed.flag, 0),
    penalty: int(parsed.penalty, 0),
    penaltyTime: Number(parsed.penaltyTime) || 0,
    trackGripStatus: nullableInt(parsed.trackGripStatus),
    pitLimiterOn: nullableInt(parsed.pitLimiterOn),
    timeOfDay: nullableInt(parsed.timeOfDay),
    airTemp: Number(parsed.airTemp) || 0,
    roadTemp: Number(parsed.roadTemp) || 0,
    globalYellow: int(parsed.globalYellow, 0),
    globalYellow1: int(parsed.globalYellow1, 0),
    globalYellow2: int(parsed.globalYellow2, 0),
    globalYellow3: int(parsed.globalYellow3, 0),
    globalWhite: int(parsed.globalWhite, 0),
    globalGreen: int(parsed.globalGreen, 0),
    globalChequered: int(parsed.globalChequered, 0),
    globalRed: int(parsed.globalRed, 0),
    pitWindowStart: nullableInt(parsed.pitWindowStart),
    pitWindowEnd: nullableInt(parsed.pitWindowEnd),
    carDamage:
      Array.isArray(parsed.carDamage) && parsed.carDamage.length === 5
        ? parsed.carDamage.map(v => Number(v) || 0)
        : null,
    suspensionDamage:
      Array.isArray(parsed.suspensionDamage) && parsed.suspensionDamage.length === 4
        ? parsed.suspensionDamage.map(v => Number(v) || 0)
        : null,
    brakeCompoundFront: nullableInt(parsed.brakeCompoundFront),
    brakeCompoundRear: nullableInt(parsed.brakeCompoundRear),
    tc: Number(parsed.tc) || 0,
    abs: Number(parsed.abs) || 0,
    wheelSlip:
      Array.isArray(parsed.wheelSlip) && parsed.wheelSlip.length === 4
        ? parsed.wheelSlip.map(v => Number(v) || 0)
        : null,
    rainIntensity: nullableInt(parsed.rainIntensity),
    rainIntensityIn10min: nullableInt(parsed.rainIntensityIn10min),
    rainIntensityIn30min: nullableInt(parsed.rainIntensityIn30min),
    tcLevel: nullableInt(parsed.tcLevel),
    absLevel: nullableInt(parsed.absLevel),
    deltaLapTimeMs: nullableInt(parsed.deltaLapTimeMs),
    estimatedLapTimeMs: nullableInt(parsed.estimatedLapTimeMs),
    deltaPositive: nullableInt(parsed.deltaPositive),
    playerCarId: nullableInt(parsed.playerCarId),
    driverStintTotalTimeLeft: nullableInt(parsed.driverStintTotalTimeLeft),
    driverStintTimeLeft: nullableInt(parsed.driverStintTimeLeft),
    numCars: nullableInt(parsed.numCars),
    activeCars: nullableInt(parsed.activeCars),
    isValidLap: nullableInt(parsed.isValidLap),
    fuel: nullableInt(parsed.fuel),
    fuelXLap: nullableInt(parsed.fuelXLap),
    usedFuel: nullableInt(parsed.usedFuel),
    sessionType: broadcast.sessionType,
    sessionTimeMs: broadcast.sessionTimeMs,
    sessionTotalMs: broadcast.sessionTotalMs,
    /** 我所在地点（广播 CAR_LOCATION：1=Track 2=Pitlane 3=PitEntry 4=PitExit） */
    carLocation: broadcast.myCarLocation,
    /** 我进行中那一圈是否已无效（广播实时信号；正赛用它做红闪） */
    currentLapInvalid: getMyCurrentLapInvalid(nullableInt(parsed.playerCarId)),
    /** 排行榜：每辆车一行（车型/车号/名字/名次/最快圈/上一圈/秒差）；主进程 0.5s 才重建一次 */
    leaderboard: getLeaderboard(
      nullableInt(parsed.playerCarId),
      // 共享内存最快圈：官方"还没有成绩"时是 INT_MAX 哨兵，这里当无效
      parsed.iBestTime > 0 && parsed.iBestTime < 2147483647 ? parsed.iBestTime : null,
      nullableInt(parsed.completedLaps),
    ),
    carModel: typeof parsed.carModel === 'string' ? parsed.carModel : null,
    playerNick: typeof parsed.playerNick === 'string' ? parsed.playerNick : null,
    // 广播侧的数据（UDP 监听，见 acc-broadcast.ts）：没连上时全是 null，组件优雅降级
    raceNumber: broadcast.raceNumber,
    driverCategory: broadcast.driverCategory,
    cupPosition: broadcast.cupPosition,
    cupCarCount: broadcast.cupCarCount,
    totalCarCount: broadcast.totalCarCount,
  }

  // 被游戏清零的帧 / 只有 packetId 在变的冻结帧：既不推给界面，也不写进 lastGood。
  // 这样界面永远冻在最后一帧"数值正常"的帧上；连续 800ms 如此即判定游戏暂停。
  const verdict = pauseDetector.accept(snapshot)
  if (verdict !== 'ok') {
    if (pauseDetector.isPaused) {
      markStale(
        verdict === 'blank'
          ? '数据被游戏清空（车库/主菜单/暂停）'
          : '数据冻结（只有 packetId 在变）',
      )
    }
    return
  }

  markRunning()
  publish(snapshot)
}

function startReader() {
  if (SIM || child) return
  const exe = readerPath()
  if (!existsSync(exe)) {
    console.warn(
      `[telemetry] 共享内存读取器不存在: ${exe}（开发环境先跑 pnpm build:reader）`,
    )
    return
  }

  childStartedAt = Date.now()
  const proc = spawn(exe, [], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  child = proc

  const rl = readline.createInterface({ input: proc.stdout! })
  rl.on('line', handleReaderLine)

  proc.stderr?.on('data', data => {
    const text = String(data).trim()
    if (text) console.log('[telemetry] ' + text)
  })

  proc.on('error', err => {
    console.error('[telemetry] 读取器启动失败', err.message)
  })

  proc.on('exit', code => {
    if (rl) rl.close()
    child = null
    markStale('读取器退出')
    console.warn(`[telemetry] 读取器退出 code=${code}，稍后重启`)
    // 刚起来就退出：多半是缺文件/被拦截，退避久一点，避免打转
    const delay = Date.now() - childStartedAt < 2000 ? 5000 : 1000
    restartTimer = setTimeout(startReader, delay)
  })

  console.log(`[telemetry] 已启动共享内存读取器: ${exe}`)
}

function stopReader() {
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (child) {
    const proc = child
    child = null
    proc.removeAllListeners('exit')
    proc.kill()
  }
}

/**
 * 读取器"活着但瞎了"的兜底：ACC 从服务器/单人退出到菜单、再进赛道时，游戏会**重建共享内存页**，
 * 而读取器还握着**旧句柄** —— 读到的永远停在最后一份数据、`packetId` 不再前进，主进程就判定为
 * "冻结/暂停"，表现就是**所有遥测窗回到赛道也拿不到数据、一直保持暂停态**（还叠加"暂停时隐藏" → 再也不显示）。
 * 读取器只在**抛异常**时才重新等待共享内存，而读陈旧映射不会抛，所以它一直"活着但瞎了"。
 * 对策：持续停更超过 READER_REOPEN_MS 就重启读取器（让它重新打开共享内存），并加退避避免真暂停时反复重启。
 */
const READER_REOPEN_MS = 4_000
const READER_REOPEN_BACKOFF_MS = 15_000
let lastReaderRestartAt = 0

/**
 * 停更看门狗：读取器在跑但连一行数据都没来（ACC 退出 / 暂停 / 退回菜单）。
 * 只标记停更并打日志，**不再把界面刷成空状态**（保持最后一帧，用户要求）。
 * ⚠️ 这里必须放在 `stale` 早退之前：否则一旦停更就永远不会再尝试恢复（踩过）。
 */
function watchdog() {
  if (!active) return
  const idle = Date.now() - lastLineAt
  if (
    idle > READER_REOPEN_MS &&
    Date.now() - lastReaderRestartAt > READER_REOPEN_BACKOFF_MS
  ) {
    lastReaderRestartAt = Date.now()
    console.log(
      `[telemetry] 数据停更 ${Math.round(idle / 1000)}s，重启读取器以重新打开共享内存（换场次/回菜单后常见）`,
    )
    if (restartTimer) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
    // ⚠️ 这里只能用模块级的 `child`：`proc` / `stopReader` 都是 startReader() 内部的局部量（踩过 ReferenceError）
    if (child) {
      child.removeAllListeners('exit')
      child.kill()
      child = null
    }
    restartTimer = setTimeout(startReader, 200)
  }
  if (stale) return
  if (idle <= STALE_MS) return
  markStale('数据停更（ACC 退出或暂停）')
}

// ---------- 模拟源（仅开发：CC_TELEMETRY_SIM=1）----------

let simT = 0
let simSpeed = 90
let simRpm = 3000

function readSim(dt: number): TelemetrySnapshot {
  simT += dt
  const lap = 24
  const phase = (simT % lap) / lap

  let gas = 0
  let brake = 0
  if (phase < 0.62) {
    gas = 0.45 + 0.55 * Math.abs(Math.sin(simT * 2.2))
  } else if (phase < 0.78) {
    brake = 0.35 + 0.65 * Math.abs(Math.sin(simT * 9))
  } else {
    gas = 0.12
  }

  const targetSpeed = 70 + gas * 150 - brake * 60
  simSpeed += (targetSpeed - simSpeed) * 0.04
  simSpeed = Math.max(30, Math.min(230, simSpeed))

  const gear = Math.max(1, Math.min(6, Math.floor(simSpeed / 34) + 1))
  const targetRpm = 2600 + gas * 5200 + 700 * Math.abs(Math.sin(simT * 5))
  simRpm += (targetRpm - simRpm) * 0.25
  simRpm = Math.max(900, Math.min(7900, simRpm))

  // 赛节信息：模拟源要能把旗/ 抓地 / 时间都演示一遍，否则不进游戏就没法看渲染
  const lapMs = Math.round((simT % lap) * 1000)
  const gripCycle = [0, 1, 2, 3, 4, 5, 6]
  const flagCycle = [0, 2, 6, 7, 1, 4, 5, 3, 8]

  return {
    active: true,
    gas,
    brake,
    steer: 0.75 * Math.sin(simT * 1.4),
    speedKmh: simSpeed,
    rpms: simRpm,
    // 转成 AC 惯例 = 2
    gear: gear + 1,
    packetId: Math.round(simT * 60),
    // 四条轮胎的假数据，顺序固[FL, FR, RL, RR]；刹车温度跟着刹车开度走
    tyrePressure: [
      24.4 + 0.2 * Math.sin(simT * 0.7),
      24.5 + 0.2 * Math.sin(simT * 0.7 + 1),
      23.9 + 0.2 * Math.sin(simT * 0.7 + 2),
      24.0 + 0.2 * Math.sin(simT * 0.7 + 3),
    ],
    tyreCoreTemp: [
      78 + 14 * Math.sin(simT * 0.5),
      80 + 14 * Math.sin(simT * 0.5 + 0.6),
      74 + 12 * Math.sin(simT * 0.5 + 1.2),
      75 + 12 * Math.sin(simT * 0.5 + 1.8),
    ],
    brakeTemp: [
      320 + brake * 380 + 15 * Math.sin(simT),
      330 + brake * 380,
      180 + brake * 260,
      190 + brake * 260,
    ],
    compound: 'dry_compound',
    tyreSet: 3,
    // 实车实测 padLife 是「厚度」量级（新车约 29，同车 discLife = 32，游戏内刹车盘寿命 99%）
    padLife: [
      28.6 - simT * 0.0002,
      28.4 - simT * 0.0002,
      30.1 - simT * 0.0002,
      30.0 - simT * 0.0002,
    ],
    status: 2,
    session: 2,
    // 圈数按赛程循环，好让「进站窗口开启」的白底状态能被预览到
    completedLaps: Math.floor(simT / lap) % 12,
    position: 3,
    numberOfLaps: 12,
    sectorIndex: 1 + (Math.floor((simT % lap) / (lap / 3)) % 3),
    iCurrentTime: lapMs,
    iLastTime: 82_431,
    iBestTime: 81_502,
    sessionTimeLeft: Math.max(0, 1800 - simT),
    flag: flagCycle[Math.floor(simT / 5) % flagCycle.length],
    penalty: 0,
    penaltyTime: 0,
    pitLimiterOn: 0,
    trackGripStatus: gripCycle[Math.floor(simT / 7) % gripCycle.length],
    // 模拟时间加速推进，方便HH:MM 变化
    timeOfDay: 13 * 3600 + simT * 37,
    airTemp: 22.5,
    roadTemp: 27.4,
    globalYellow: 0,
    globalYellow1: 0,
    globalYellow2: 0,
    globalYellow3: 0,
    globalWhite: 0,
    // 绿旗常亮 + 20 秒来一次黄红旗，方便看旗帜颜色切换
    globalGreen: Math.floor(simT / 20) % 3 === 2 ? 0 : 1,
    globalChequered: 0,
    globalRed: Math.floor(simT / 20) % 3 === 1 ? 1 : 0,
    pitWindowStart: 4,
    pitWindowEnd: 8,
    // 车损：模拟源给一个能看出颜色渐变的损伤（前 7.22s、后 3.41s、左 1.5s、右 0、悬挂 0）
    carDamage: [25.57, 12.09, 5.32, 0, 42.98],
    suspensionDamage: [0, 0, 0, 0],
    // 原始值是 0 起编号（组件显示时会 +1 变成游戏里的 1 起）/0 显示 BRAKE 3/1
    brakeCompoundFront: 2,
    brakeCompoundRear: 0,
    // 让模拟源也能看到介入色：大油门出弯时 TC 介入、重刹时 ABS 介入
    tc: gas > 0.92 && Math.sin(simT * 24) > 0.4 ? 1 : 0,
    abs: brake > 0.85 ? 1 : 0,
    // 滑移：模拟前轮跟刹车、后轮跟油门（形态同实测），量级压在 0~2.8 之间。
    // 这样预览里能同时看到白槽、红槽与满槽（刻度见组件里 SLIP_FULL=2 / SLIP_RED=1.6）
    wheelSlip: [
      brake * 2.6 + gas * 0.15,
      brake * 2.75 + gas * 0.14,
      brake * 0.2 + gas * 1.25,
      brake * 0.22 + gas * 1.28,
    ],
    // 雨强：让模拟里天气"逐渐转雨"——当前多变（偶尔小雨），10 分钟后中雨、30 分钟后大雨
    rainIntensity: Math.floor(Math.abs(Math.sin(simT * 0.7)) * 2),
    rainIntensityIn10min: 3,
    rainIntensityIn30min: 4,
    // 档位：模拟沿用实测这台车的设定（TC 6 / ABS 6）
    tcLevel: 6,
    absLevel: 6,
    // 圈delta：模拟成"±0.35s 之间摆动"，符号随正弦变化
    deltaLapTimeMs: Math.round(Math.abs(Math.sin(simT * 0.9)) * 350),
    deltaPositive: Math.sin(simT * 0.9) > 0 ? 1 : 0,
    estimatedLapTimeMs: 106552,
    // 会话信息：车数/短名（广播侧那 4 项仍是 null）
    numCars: 30,
    carModel: 'ferrari_488_gt3_evo',
    playerNick: 'YOU',
    raceNumber: null,
    driverCategory: null,
    cupPosition: null,
    cupCarCount: null,
  }
}

// ---------- 生命周期 ----------

export function initTelemetry(opts: {
  getWindows: () => BrowserWindow[]
  /** 游戏暂停状态变化时回调（覆盖层据此隐藏/恢复遥测窗） */
  onPausedChange?: (paused: boolean) => void
}) {
  if (process.platform !== 'win32') return
  getWindows = opts.getWindows
  if (opts.onPausedChange) setGamePaused = opts.onPausedChange

  lastLineAt = Date.now()
  if (SIM) {
    console.log('[telemetry] 使用模拟数据源（CC_TELEMETRY_SIM=1）')
    if (simTimer) return
    simTimer = setInterval(() => publish(readSim(SIM_TICK_MS / 1000)), SIM_TICK_MS)
  } else {
    if (watchdogTimer) return
    startReader()
    watchdogTimer = setInterval(watchdog, 500)
  }
}

export function stopTelemetry() {
  if (simTimer) {
    clearInterval(simTimer)
    simTimer = null
  }
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = null
  }
  stopReader()
}
