import { reactive } from 'vue'

// ---------------------------------------------------------------------------
// 覆盖层遥测状态（模块级单例）
//
// 📌 字段来源与偏移：见仓库根目录 ACC-遥测数据参考.md（加字段要改的 4 处也写在里面）
//
// 数据由主进程按 ~30Hz 广播（electron/main/telemetry.ts），这里做两件事：
//   1. 维护一份响应式快照，组件用 useTelemetry() 直接读；
//   2. 提供 onTelemetrySample() 给需要「每一个样本」的消费者（比如曲线图，
//      它不能走 Vue 的批处理，否则会丢样本）。
//
// 注意：不要换成 Pinia —— 覆盖层窗口刻意没有接 Pinia
// （两个窗口共用同一份 localStorage 会互相覆盖），遥测状态就放这个模块。
// ---------------------------------------------------------------------------

export interface TelemetryState {
  /** 是否有有效数据源；false 时界面显示占位符 */
  active: boolean
  /** 油门开度 0..1 */
  gas: number
  /** 刹车开度 0..1 */
  brake: number
  /** 方向盘输入 -1..1（官方 PDF：steerAngle from -1.0 to 1.0） */
  steer: number
  speedKmh: number
  rpms: number
  /** AC 惯例：0=R、1=N、2..=1 挡.. */
  gear: number
  packetId: number
  /** 四轮胎压 psi，顺序 [FL, FR, RL, RR] */
  tyrePressure: number[]
  /** 四轮胎心温度 ℃，顺序 [FL, FR, RL, RR] */
  tyreCoreTemp: number[]
  /** 四轮刹车片温度 ℃，顺序 [FL, FR, RL, RR] */
  brakeTemp: number[]
  /** 胎种名（Graphic `tyreCompound`），读不到为 null */
  compound: string | null
  /** 当前轮胎编号（Graphic `currentTyreSet`，实测偏移 1572） */
  tyreSet: number | null
  /** 四轮刹车片剩余寿命（Physics `padLife[4]`，实测偏移 740），顺序 [FL, FR, RL, RR] */
  padLife: number[] | null
  /** Graphic `status`：0=OFF 1=REPLAY 2=LIVE 3=PAUSE */
  status: number
  /** Graphic `session`（-1 未知 0 练习 1 排位 2 正赛 3 热圈 4 计时赛 …） */
  session: number
  /** 已完成圈数 */
  completedLaps: number
  /** 名次（1 起） */
  position: number
  /** 赛程总圈数（练习/排位为 0） */
  numberOfLaps: number
  /** 当前扇区 */
  sectorIndex: number
  /** 当前圈时间（ms）；无效时是哨兵 2147483647 */
  iCurrentTime: number
  /** 上一圈时间（ms） */
  iLastTime: number
  /** 最快圈时间（ms） */
  iBestTime: number
  /** 赛节剩余时间（秒）；无时限赛节为负 */
  sessionTimeLeft: number
  /** 旗帜（ACC_FLAG_TYPE），见 ACC-遥测数据参考.md §1.2.3 */
  flag: number
  /** 判罚（ACC_PENALTY_TYPE），0 = 无 */
  penalty: number
  /** 判罚时间（秒，Graphic `penaltyTime` 偏移 1220）：SG 的等待秒数 / 罚时秒数 */
  penaltyTime: number
  /** 抓地等级（ACC_TRACK_GRIP_STATUS，实测偏移 1556） */
  trackGripStatus: number | null
  /** Physics 248：限速器是否开启（0/1） */
  pitLimiterOn: number | null
  /** 一天中的时间（秒，Graphic `Clock`，实测偏移 1488） */
  timeOfDay: number | null
  /** 气温 ℃（Physics 288） */
  airTemp: number
  /** 赛道温度 ℃（Physics 292） */
  roadTemp: number
  /** 全局旗（Graphic 1500..1528，0/1） */
  globalYellow: number
  globalYellow1: number
  globalYellow2: number
  globalYellow3: number
  globalWhite: number
  globalGreen: number
  globalChequered: number
  globalRed: number
  /** 进站窗口圈号区间（Static 676/680）；null = 本赛节没有进站窗口 */
  pitWindowStart: number | null
  pitWindowEnd: number | null
  /** 车损原始值（Physics 224，前/后/左/右/中）；显示秒数 = 值 / 3.545（实测标定，见参考文档 §1.2.2） */
  carDamage: number[] | null
  /** 悬挂损伤原始值（Physics 680，FL/FR/RL/RR） */
  suspensionDamage: number[] | null
  /** 前/后刹车片型号（Physics 732/736，0 起编号，显示要 +1） */
  brakeCompoundFront: number | null
  brakeCompoundRear: number | null
  /** TC 是否正在介入（Physics 204，0/1） */
  tc: number
  /** ABS 是否正在介入（Physics 252，0/1） */
  abs: number
  /** 四轮滑移（Physics 56，官方 "Tyre slip"），顺序 [FL, FR, RL, RR] */
  wheelSlip: number[] | null
  /** 当前雨强（Graphic 1560，ACC_RAIN_INTENSITY 0..5） */
  rainIntensity: number | null
  /** 10 分钟后的雨强预报（Graphic 1564）—— 游戏 HUD 天气图标用的就是它 */
  rainIntensityIn10min: number | null
  /** 30 分钟后的雨强预报（Graphic 1568） */
  rainIntensityIn30min: number | null
  /** TC 档位（Graphic 1268，0..N）—— 不是 Physics 204 的"是否介入" */
  tcLevel: number | null
  /** ABS 档位（Graphic 1280，0..N） */
  absLevel: number | null
  /** 当前圈与最快圈的 delta（Graphic 1360，ms 绝对值）；符号看 deltaPositive */
  deltaLapTimeMs: number | null
  /** 玩家车 id（Graphic 1216，实测 1001/1002；与 UDP 广播的 carEntryId 同域） */
  playerCarId: number | null
  /** 游戏算的预测圈速（Graphic 1396，ms） */
  estimatedLapTimeMs: number | null
  /** delta 符号：1 = 正（比最快圈慢），0 = 负（更快） */
  deltaPositive: number | null
  /** 本场车数（Static 64，不随车辆加入更新） */
  numCars: number | null
  /** 实时车数（Graphic 252 activeCars） */
  activeCars: number | null
  /** 当前圈是否有效（Graphic 1408 isValidLap：1 = 有效、0 = 无效） */
  isValidLap: number | null
  /** 剩余油量（Physics 12） */
  fuel: number | null
  /** 每圈平均油耗 L/lap（Graphic fuelXLap 1284，实测确认） */
  fuelXLap: number | null
  /** 上次加油后已用油量（Graphic usedFuel 1324） */
  usedFuel: number | null
  /** 节类型（广播）：0=Practice 4=Qualifying 10=Race … */
  sessionType: number | null
  /** 本节已进行时间 ms（广播） */
  sessionTimeMs: number | null
  /** 本节总时长 ms（广播；无固定时长时 null） */
  sessionTotalMs: number | null
  /** 我所在地点（广播 CAR_LOCATION） */
  carLocation: number | null
  /** 我进行中那一圈是否已无效（广播实时信号） */
  currentLapInvalid: boolean | null
  /** 排行榜（每辆车一行；见 electron/main/acc-broadcast.ts 的 LeaderboardRow） */
  leaderboard: import('./leaderboard').LeaderboardRow[]
  /** 车型名（Static 68，用于推组别 GT3/GT4/GTC/TCX） */
  carModel: string | null
  /** 车手三字母短名（Static 332） */
  playerNick: string | null
  /** Driver stint 剩余额度（Graphic 1308/1312，ms）：官方语义是"还允许开多久"，单人时 -1000 = N/A */
  driverStintTotalTimeLeft: number | null
  driverStintTimeLeft: number | null
  /** 以下 4 项只能来自 UDP 广播（监听器见 electron/main/acc-broadcast.ts），未连上时恒为 null */
  raceNumber: number | null
  /** ACC_DRIVER_CATEGORY：0 = 未知、1 = AM、2 = SILVER(PRO-AM)、3 = PRO（实测） */
  driverCategory: number | null
  /** 组别内名次 */
  cupPosition: number | null
  /** 组别内车数 */
  cupCarCount: number | null
  /** 实时总车数（广播报名表条数） */
  totalCarCount: number | null
}

const state = reactive<TelemetryState>({
  active: false,
  gas: 0,
  brake: 0,
  steer: 0,
  speedKmh: 0,
  rpms: 0,
  gear: 1,
  packetId: 0,
  tyrePressure: [0, 0, 0, 0],
  tyreCoreTemp: [0, 0, 0, 0],
  brakeTemp: [0, 0, 0, 0],
  compound: null,
  tyreSet: null,
  padLife: null,
  status: 0,
  session: -1,
  completedLaps: 0,
  position: 0,
  numberOfLaps: 0,
  sectorIndex: 0,
  iCurrentTime: 0,
  iLastTime: 0,
  iBestTime: 0,
  sessionTimeLeft: 0,
  flag: 0,
  penalty: 0,
  penaltyTime: 0,
  trackGripStatus: null,
  pitLimiterOn: null,
  timeOfDay: null,
  airTemp: 0,
  roadTemp: 0,
  globalYellow: 0,
  globalYellow1: 0,
  globalYellow2: 0,
  globalYellow3: 0,
  globalWhite: 0,
  globalGreen: 0,
  globalChequered: 0,
  globalRed: 0,
  pitWindowStart: null,
  pitWindowEnd: null,
  carDamage: null,
  suspensionDamage: null,
  brakeCompoundFront: null,
  brakeCompoundRear: null,
  tc: 0,
  abs: 0,
  wheelSlip: null,
  rainIntensity: null,
  rainIntensityIn10min: null,
  rainIntensityIn30min: null,
  tcLevel: null,
  absLevel: null,
  deltaLapTimeMs: null,
  playerCarId: null,
  driverStintTotalTimeLeft: null,
  driverStintTimeLeft: null,
  estimatedLapTimeMs: null,
  deltaPositive: null,
  numCars: null,
  activeCars: null,
  isValidLap: null,
  fuel: null,
  fuelXLap: null,
  usedFuel: null,
  sessionType: null,
  sessionTimeMs: null,
  sessionTotalMs: null,
  carLocation: null,
  currentLapInvalid: null,
  leaderboard: [],
  carModel: null,
  playerNick: null,
  raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  cupCarCount: null,
  totalCarCount: null,
})

const sampleListeners = new Set<(snapshot: TelemetryState) => void>()
let started = false

function ensureStarted() {
  if (started) return
  started = true
  window.overlay?.onTelemetry(snapshot => {
    if (!snapshot) return
    // 遥测停更时主进程不再推空快照（界面保持最后一帧）；这里再把 active:false 的
    // 快照也挡掉，万一有旧版本/异常路径推来空值，也不会把组件打回占位符。
    if (snapshot.active === false) return
    Object.assign(state, snapshot)
    for (const listener of sampleListeners) listener(state)
  })
}

/** 组件里用：const tm = useTelemetry() */
export function useTelemetry() {
  ensureStarted()
  return state
}

/** 需要逐个样本的消费者（曲线图）用这个；返回取消订阅函数 */
export function onTelemetrySample(fn: (snapshot: TelemetryState) => void) {
  ensureStarted()
  sampleListeners.add(fn)
  return () => {
    sampleListeners.delete(fn)
  }
}

// ---------------------------------------------------------------------------
// 管理面板预览用的静态样例
//
// 为什么需要：遥测只广播给覆盖层窗口（electron/main/overlay.ts 的 getOverlayWindows），
// 管理面板所在的主窗口收不到任何数据，于是每个组件在预览里都是占位符（--）。
// 这里给一份"看起来在跑"的完整快照，数值全部取自实车实测 / 按实测标定反推：
//   · 车损 carDamage[4] = centre = 前后左右之（18.00 + 3.41 + 6.00 + 0 = 27.41s）
//   · 悬挂等级 0.30 → ×30 = 9.00s，Total = 27.41 + 9.00 = 36.41s
//   · padLife 22.6 → 29 定标下 78%
// 覆盖层窗口不要调用 fillTelemetryPreview（那边走真实广播）。
// ---------------------------------------------------------------------------

export const TELEMETRY_PREVIEW: Readonly<TelemetryState> = {
  active: true,
  gas: 0.62,
  // 预览样例：刹车 65%（行驶状态组件的刹车槽要看得到填充）
  brake: 0.65,
  steer: -0.18,
  speedKmh: 187.4,
  rpms: 6480,
  gear: 5,
  packetId: 1,
  tyrePressure: [24.9, 24.9, 23.6, 23.6],
  tyreCoreTemp: [82.4, 84.1, 76.2, 77.5],
  brakeTemp: [612, 634, 378, 392],
  compound: 'dry_compound',
  tyreSet: 3,
  padLife: [22.6, 22.5, 24.1, 24.0],
  status: 2,
  session: 2,
  completedLaps: 12,
  position: 2,
  numberOfLaps: 30,
  sectorIndex: 2,
  iCurrentTime: 58_594,
  iLastTime: 82_905,
  iBestTime: 82_337,
  // sessionTimeLeft 是**毫秒**（Graphic 152），这里给 30 分钟
  sessionTimeLeft: 1_845_000,
  flag: 0,
  // 「判罚」组件：**没有判罚时整块不显示**（含背景），所以预览里给一个判罚样例（DT），
  // 否则管理面板里这个组件那个位置会是一片空白、看不出效果。
  penalty: 1,
  penaltyTime: 0,
  trackGripStatus: 2,
  pitLimiterOn: 0,
  timeOfDay: 14 * 3600 + 35 * 60,
  airTemp: 23.4,
  roadTemp: 30.1,
  globalYellow: 0,
  globalYellow1: 0,
  globalYellow2: 0,
  globalYellow3: 0,
  globalWhite: 0,
  globalGreen: 1,
  globalChequered: 0,
  globalRed: 0,
  pitWindowStart: 0,
  pitWindowEnd: -1000,
  carDamage: [63.756, 12.088, 21.252, 0, 97.096],
  suspensionDamage: [0.3, 0, 0, 0],
  // 0 起编号的原始值：2/0 → 组件里显示 BRAKE 3/1（和游戏 MFD 一致）
  brakeCompoundFront: 2,
  brakeCompoundRear: 0,
  // TC 介入 / ABS 未介入：管理面板预览里"电控"组件两种状态都能看到
  // （驾驶组件的油门槽也会因此显示介入色，属于预期）
  tc: 1,
  abs: 0,
  // 档位样例：沿用实测这台车的设定
  tcLevel: 6,
  absLevel: 6,
  // 滑移样例：按刻度 2.00/1.60 给（1.9 红、0.6 白、0.05 近空、1.7 红），预览里四种状态都能看到
  wheelSlip: [1.9, 0.6, 0.05, 1.7],
  // 雨强样例：当前小雨、10 分钟后中雨、30 分钟后大雨（预览里三个图标各不相同）
  rainIntensity: 2,
  rainIntensityIn10min: 3,
  rainIntensityIn30min: 4,
  // 圈速/排名样例：delta 给正的（预览里显示红槽），会话信息给车型与车数
  deltaLapTimeMs: 218,
  deltaPositive: 1,
  playerCarId: 1002,
  // 预览里给一个"有效的剩余额度"（1 小时 23 分 45 秒），这样 Stint 行会显示出来
  driverStintTotalTimeLeft: 7200000,
  driverStintTimeLeft: 5025000,
  estimatedLapTimeMs: 106552,
  numCars: 3,
  activeCars: 3,
  isValidLap: 1,
  fuel: 62.4,
  fuelXLap: 3.15,
  usedFuel: 12.6,
  sessionType: 10,
  sessionTimeMs: 620000,
  sessionTotalMs: 1200000,
  carLocation: 1,
  currentLapInvalid: false,
  // 秒差：正赛现在是**分段跨线**实测（`gapKind: 'segments'`）；段表给不出时为 null → 界面 `--`。
  // `lapsDelta` 有符号：正 = 对方领先我 N 圈（他套我）→ `+N L`；负 = 我领先对方 → `-N L`。
  leaderboard: [
    { carEntryId: 2, carId: 12, raceNumber: 45, driverName: 'Marco Rossi', position: 1, bestLapMs: 105337, lastLapMs: 106112, gapMs: 2150, gapKind: 'segments', lapsDelta: 0, isMe: false },
    { carEntryId: 3, carId: 32, raceNumber: 77, driverName: 'Luca Bianchi', position: 2, bestLapMs: 105980, lastLapMs: 106540, gapMs: 1620, gapKind: 'segments', lapsDelta: 0, isMe: false },
    { carEntryId: 8, carId: 24, raceNumber: 9, driverName: 'Anna Verdi', position: 3, bestLapMs: 106120, lastLapMs: 106870, gapMs: 1230, gapKind: 'segments', lapsDelta: 0, isMe: false },
    { carEntryId: 4, carId: 20, raceNumber: 8, driverName: 'Paolo Neri', position: 4, bestLapMs: 106334, lastLapMs: 107112, gapMs: 610, gapKind: 'segments', lapsDelta: 0, isMe: false },
    { carEntryId: 5, carId: 33, raceNumber: 404, driverName: 'Horace Huang', position: 5, bestLapMs: 106552, lastLapMs: 107880, gapMs: null, gapKind: null, lapsDelta: 0, isMe: true },
    { carEntryId: 6, carId: 31, raceNumber: 12, driverName: 'Giulia Fontana', position: 6, bestLapMs: 107001, lastLapMs: 108220, gapMs: -380, gapKind: 'segments', lapsDelta: 0, isMe: false },
    { carEntryId: 7, carId: 30, raceNumber: 21, driverName: 'Sara Conti', position: 7, bestLapMs: 107620, lastLapMs: 109004, gapMs: -920, gapKind: 'segments', lapsDelta: 0, isMe: false },
    // 一辆**已经被我套圈**的车：秒差不再有意义，改由 `lapsDelta` 显示 `-1 L`（绿色）
    { carEntryId: 9, carId: 25, raceNumber: 63, driverName: 'Bruno Galli', position: 8, bestLapMs: 108110, lastLapMs: 109560, gapMs: null, gapKind: null, lapsDelta: -1, isMe: false },
  ],
  carModel: 'ferrari_488_gt3_evo',
  playerNick: 'YOU',
  // 广播侧那 4 项预览里给一份样例，方便看"有评级/车号"时的排版
  raceNumber: 44,
  driverCategory: 3,
  cupPosition: 2,
  cupCarCount: 3,
  totalCarCount: 3,
}

/** 把样例数组复制一份，免得组件不小心改到常量本身 */
function cloneSample(): TelemetryState {
  return {
    ...TELEMETRY_PREVIEW,
    tyrePressure: [...TELEMETRY_PREVIEW.tyrePressure],
    tyreCoreTemp: [...TELEMETRY_PREVIEW.tyreCoreTemp],
    brakeTemp: [...TELEMETRY_PREVIEW.brakeTemp],
    padLife: TELEMETRY_PREVIEW.padLife ? [...TELEMETRY_PREVIEW.padLife] : null,
    carDamage: TELEMETRY_PREVIEW.carDamage ? [...TELEMETRY_PREVIEW.carDamage] : null,
    suspensionDamage: TELEMETRY_PREVIEW.suspensionDamage
      ? [...TELEMETRY_PREVIEW.suspensionDamage]
      : null,
    wheelSlip: TELEMETRY_PREVIEW.wheelSlip ? [...TELEMETRY_PREVIEW.wheelSlip] : null,
  }
}

/**
 * 给管理面板里的预览灌静态样例（只应由 OverlayPage 调用）。
 * 顺便给曲线类组件补一段示例波形：曲线是走 onTelemetrySample 逐样本累积的，
 * 只塞一份静态快照的话，预览里的曲线会是一条空图。
 * 所以要在预览组件挂载之后（监听器已注册）再调，比如 nextTick 里。
 */
export function fillTelemetryPreview() {
  Object.assign(state, cloneSample())

  const listeners = [...sampleListeners]
  if (!listeners.length) return

  const steps = 240
  for (let i = 0; i < steps; i++) {
    // 一段"给油—收油—重刹"的循环，形状和真实驾驶类似
    const phase = (i % 96) / 96
    state.gas = phase < 0.62 ? 0.45 + 0.5 * Math.abs(Math.sin(i / 7)) : 0.05
    state.brake = phase >= 0.78 ? 0.35 + 0.6 * Math.abs(Math.sin(i / 3)) : 0
    // 顺便让曲线演示 TC/ABS 介入换色（出弯与重刹两段）
    state.tc = phase >= 0.44 && phase < 0.6 ? 1 : 0
    state.abs = state.brake > 0.5 ? 1 : 0
    for (const listener of listeners) listener(state)
  }
  // 波形灌完把静态值放回去（否则预览里的读数会停在波形最后一帧）
  state.gas = TELEMETRY_PREVIEW.gas
  state.brake = TELEMETRY_PREVIEW.brake
  state.tc = TELEMETRY_PREVIEW.tc
  state.abs = TELEMETRY_PREVIEW.abs
}
