/**
 * Stint（一段连续驾驶）累计器 —— 纯逻辑，可单测。
 *
 * 为什么自己累计：官方 Graphic 里那两个 stint 字段（`DriverStintTotalTimeLeft` 1308 /
 * `DriverStintTimeLeft` 1312）实测在单人模式下是 **-1000（N/A 哨兵）**，而且给的是
 * "还能开多久"的剩余额度，不是"已经开了多久"。所以"当前 Stint 驾驶时长 / 圈数"
 * 只能由我们自己累计。
 *
 * 判定规则（尽量保守，宁可不重置也别乱重置）：
 *   · `laps` 比上次小（换赛节/重置车辆/重开）→ 重置；
 *   · 首次拿到数据 → 记为 stint 起点（不把"进游戏前的时间"算进来）；
 *   · 数据断流（暂停/回菜单）**不计时**：主进程暂停时根本不推数据，这里的
 *     `dtMs` 由调用方按"两帧间隔"给，超过 `GAP_MS` 的间隔会被丢弃（当作断流）。
 *
 * ⚠️ 还没做的：进站切段。要按"进站即结束本段 stint"切分的话需要 Graphic `isInPit`(160)
 *   —— 该偏移在我们文档里属于"1320 之前的推算值"，尚未实测确认，所以先不用它，
 *   等哪天在赛道上核对过（进站/出站各读一次）再打开。
 */
export interface StintInput {
  /** 当前累计圈数（Graphic completedLaps） */
  laps: number
  /** 距离上一帧的毫秒数（由调用方给；第一帧给 0） */
  dtMs: number
}

export interface StintState {
  /** 本段 stint 已驾驶时长（ms） */
  timeMs: number
  /** 本段 stint 已跑圈数 */
  laps: number
  /** 上次的累计圈数 */
  lastLaps: number
  /** 是否已经对齐过基线（第一帧只对齐，不计时也不计圈 —— 否则会把进游戏前跑的圈算进来） */
  started: boolean
}

/** 两帧间隔超过这个值就算断流（暂停/回菜单），不计入驾驶时长 */
export const STINT_GAP_MS = 1500

export function createStintState(): StintState {
  return { timeMs: 0, laps: 0, lastLaps: 0, started: false }
}

/**
 * 推进一帧，返回新的 stint 状态（不修改入参，便于测试与 Vue 响应式）。
 */
export function advanceStint(state: StintState, input: StintInput): StintState {
  const gap = Number.isFinite(input.dtMs) && input.dtMs > 0 ? input.dtMs : 0
  const disconnected = gap > STINT_GAP_MS

  // 圈数倒退 = 新赛节/重置 → 整段重来（基线对齐到新圈数，但这段 stint 从 0 起算）
  if (input.laps < state.lastLaps) {
    return { timeMs: 0, laps: 0, lastLaps: input.laps, started: true }
  }

  // 第一帧：只把基线对齐到当前圈数（不把"进游戏前跑的圈/时间"算成本段 stint）
  if (!state.started) {
    return { timeMs: 0, laps: 0, lastLaps: input.laps, started: true }
  }

  const next: StintState = {
    // 断流的间隔不计时（暂停期间不该算进"驾驶时长"）
    timeMs: state.timeMs + (disconnected ? 0 : gap),
    laps: state.laps,
    lastLaps: input.laps,
    started: true,
  }
  if (input.laps > state.lastLaps) {
    next.laps = state.laps + (input.laps - state.lastLaps)
  }
  return next
}

/**
 * 把累计器喂给组件的展示层：`H:MM:ss`。
 * 官方字段不可用（单人 -1000）时我们仍显示自己累计的值，所以这里不会返回 N/A。
 */
export function formatStintTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
