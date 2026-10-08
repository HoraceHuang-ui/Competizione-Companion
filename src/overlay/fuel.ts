/**
 * 「燃油」组件要用的几个量（**纯函数，可单测**）。
 *
 * 数据来源（全部已实测确认，见 ACC-遥测数据参考.md §1.2）：
 *   · 剩余油量 `fuel`        = Physics 12（float，本机实测 62）
 *   · 每圈平均油耗 `fuelXLap` = Graphic 1284（float L/lap，本机实测 3.15）
 *   · 上次加油后已用油 `usedFuel` = Graphic 1324（官方 "Used fuel since last time refueling"）
 *   · 圈数 `completedLaps` / 本场总圈数 `numberOfLaps`、最快圈 `iBestTime`、节剩余 `sessionTimeLeft`(ms)
 */

/** 时间哨兵：官方在"还没做出成绩"时给 INT_MAX（见 lapFormat 的同名常量） */
const TIME_SENTINEL = 2147483647

/**
 * 每圈油耗（L/lap）：
 *   优先用官方的 `fuelXLap`（游戏自己算的滚动平均）；
 *   它不可用时退回 `usedFuel / completedLaps`（加油后 usedFuel 会清零，所以只在没有官方值时兜底）。
 */
export function fuelPerLapOf(
  fuelXLap: number | null | undefined,
  usedFuel?: number | null,
  completedLaps?: number | null,
): number | null {
  if (fuelXLap != null && Number.isFinite(fuelXLap) && fuelXLap > 0) return fuelXLap
  if (
    usedFuel != null &&
    Number.isFinite(usedFuel) &&
    usedFuel > 0 &&
    completedLaps != null &&
    Number.isFinite(completedLaps) &&
    completedLaps > 0
  ) {
    return usedFuel / completedLaps
  }
  return null
}

/** 当前油量还能跑几圈（Est.） */
export function estimatedLaps(
  fuel: number | null | undefined,
  perLap: number | null | undefined,
): number | null {
  if (fuel == null || !Number.isFinite(fuel) || fuel <= 0) return null
  if (perLap == null || !Number.isFinite(perLap) || perLap <= 0) return null
  return fuel / perLap
}

/** `62.40L`（两位小数 + L） */
export function formatFuelLiters(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return `--.${'-'.repeat(digits)}L`
  return `${value.toFixed(digits)}L`
}

/** `19.8 Laps`（一位小数 + Laps） */
export function formatLaps(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return `--.${'-'.repeat(digits)} Laps`
  return `${value.toFixed(digits)} Laps`
}

// ---------------------------------------------------------------------------
// 平均圈速（用于 target）。共享内存只给最快圈/上一圈，**没有平均值** → 自己累计：
//   · 每跨一次线（completedLaps 增加）取一次 `iLastTime`；
//   · **排除有进站的圈**（那一圈必然很慢）：跑这圈期间广播的 `carLocation` 出现在
//     2=Pitlane / 3=PitEntry / 4=PitExit 就算进站圈；
//   · 排除无效值（0 / INT_MAX）；
//   · 只保留最近 LAP_WINDOW 个有效圈（滚动窗口）—— 油量变化会让早期圈偏慢，
//     用最近几圈更贴近当前节奏。
// ---------------------------------------------------------------------------

/** 平均圈速取最近多少个有效圈 */
export const LAP_WINDOW = 10

/** target 油量上限（L）：超过就按 120 显示（用户要求） */
export const TARGET_MAX_LITERS = 120

export interface FuelLapState {
  /** 最近的有效圈速（ms，最新的在末尾） */
  lapTimes: number[]
  /** 上一帧看到的 completedLaps（用来识别"跨线"） */
  lastLaps: number
  /** 本圈内是否出现过进站地点 */
  pitSeen: boolean
  /** 是否已经开始观察（首帧只对齐基线，不记圈） */
  started: boolean
}

export function createFuelLapState(): FuelLapState {
  return { lapTimes: [], lastLaps: 0, pitSeen: false, started: false }
}

/** 进站地点：2=Pitlane 3=PitEntry 4=PitExit（1=Track） */
export function isPitLocation(carLocation: number | null | undefined): boolean {
  return carLocation != null && carLocation >= 2
}

/**
 * 逐帧喂：返回新的状态（纯函数，便于单测）。
 * `lastLapMs` 是这一帧的 `iLastTime`（跨线后它就是刚完成那一圈的成绩）。
 */
export function advanceFuelLaps(
  state: FuelLapState,
  input: { completedLaps: number | null | undefined; lastLapMs: number | null | undefined; carLocation?: number | null },
): FuelLapState {
  const laps = input.completedLaps
  if (laps == null || !Number.isFinite(laps)) return state
  if (!state.started) {
    return { ...state, started: true, lastLaps: laps, pitSeen: isPitLocation(input.carLocation) }
  }
  // 圈数倒退（换赛节/重置）→ 清空重来
  if (laps < state.lastLaps) {
    return { lapTimes: [], lastLaps: laps, pitSeen: isPitLocation(input.carLocation), started: true }
  }
  const pitSeen = state.pitSeen || isPitLocation(input.carLocation)
  if (laps === state.lastLaps) {
    return pitSeen === state.pitSeen ? state : { ...state, pitSeen }
  }
  // 跨线了：把刚完成那一圈记下来（进站圈丢弃）
  const lapMs = input.lastLapMs
  const valid =
    lapMs != null && Number.isFinite(lapMs) && lapMs > 0 && lapMs < TIME_SENTINEL && !pitSeen
  const lapTimes = valid ? [...state.lapTimes, lapMs].slice(-LAP_WINDOW) : state.lapTimes
  return { lapTimes, lastLaps: laps, pitSeen: isPitLocation(input.carLocation), started: true }
}

/** 平均圈速（ms）；样本为空时 null */
export function averageLapMs(state: FuelLapState): number | null {
  if (state.lapTimes.length === 0) return null
  const sum = state.lapTimes.reduce((a, b) => a + b, 0)
  return sum / state.lapTimes.length
}

/**
 * target 油量（用户给的公式）：
 *   `min(本节剩余时长, Stint 剩余时长) ÷ 平均圈速 × 每圈油耗`
 *   · 不知道平均圈速 → null（界面显示 `--`）
 *   · 结果超过 `TARGET_MAX_LITERS`(120) → 按上限
 *   · Stint 剩余无效（练习赛 -1000 / 无限制 65535s 哨兵，或没开换人规则）→ 只用本节剩余
 */
export function targetFuelByTime(
  sessionTimeLeftMs: number | null | undefined,
  stintTimeLeftMs: number | null | undefined,
  avgLapMs: number | null | undefined,
  perLap: number | null | undefined,
): number | null {
  if (avgLapMs == null || !Number.isFinite(avgLapMs) || avgLapMs <= 0) return null
  if (perLap == null || !Number.isFinite(perLap) || perLap <= 0) return null
  const session = sessionTimeLeftMs != null && Number.isFinite(sessionTimeLeftMs) && sessionTimeLeftMs > 0
    ? sessionTimeLeftMs
    : null
  // 合法性：>0 且不超过 8 小时（哨兵 65535000ms=65535s 排除掉，同"排名&圈速"的 Stint 判定）
  const stint =
    stintTimeLeftMs != null &&
    Number.isFinite(stintTimeLeftMs) &&
    stintTimeLeftMs > 0 &&
    stintTimeLeftMs <= 8 * 60 * 60 * 1000
      ? stintTimeLeftMs
      : null
  const window =
    session != null && stint != null ? Math.min(session, stint) : (session ?? stint)
  if (window == null) return null
  const liters = (window / avgLapMs) * perLap
  if (!Number.isFinite(liters) || liters <= 0) return null
  return Math.min(TARGET_MAX_LITERS, liters)
}

/** target 的显示：正常两位小数；**到达上限按要求显示 `120.0L`**；未知显示 `--` */
export function formatTargetLiters(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--'
  if (value >= TARGET_MAX_LITERS) return '120.0L'
  return `${value.toFixed(2)}L`
}
