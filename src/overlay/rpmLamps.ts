/**
 * 「转速」组件的纯逻辑（可单测）—— 用户给的规则：
 *   · 14 盏灯，每盏对应**红线前 200rpm**；
 *   · 红线 − 3000rpm 时第 1 盏亮，之后每 +200rpm 多亮一盏；
 *   · 到达红线（rpm ≥ 红线）时**全部变蓝**，并以 0.3s 的节奏在亮蓝 / 灭之间闪；
 *   · 灯灭时灰色。
 * 灯色分段（**左右镜像对称**）：绿 = 1-3 与 12-14；黄 = 4-6 与 9-11；**红 = 7-8（最中间那一对）**。
 *
 * ⚠️ 用户描述里"每盏 200rpm"与"红线−200 全亮"数值上差 200（13 段 × 200 = 2600，从 −3000 起只能到 −400）。
 *    这里按**每盏 200rpm、第一盏 −3000** 实现（两条更明确的数值规则），实际全亮在 −400。
 *    如果希望"第 14 盏正好在 −200 亮"，把 RPM_LAMP_STEP 换成 2800/13 ≈ 215.38 即可。
 */

export const RPM_LAMP_COUNT = 14
/** 每往里推进一对灯的跨度（除了最中间那对） */
export const RPM_LAMP_STEP = 200
/** 第 1 对（首尾两盏）点亮的阈值 = 红线 − 这个值 */
export const RPM_LAMP_BASE_OFFSET = 1500
/**
 * 各对点亮的"红线以下偏移"（下标 0 = 最外侧一对，下标 6 = 最中间的一对）。
 * 用显式表而不是等差公式：用户要求**其他每对 200rpm、最中间那对只 100rpm**，
 * 这样最中间那对 = 红线 − 400（不是等差外推的 −300）。
 * ⚠️ 若以后要"最中间正好在红线−100"，把最后一项改成 100 即可（届时前 6 对的间距需要另定）。
 */
export const RPM_PAIR_OFFSETS = [1500, 1300, 1100, 900, 700, 500, 400] as const
/** 默认红线 */
export const DEFAULT_REDLINE = 8000
/**
 * 灯色分段（左右镜像对称）：绿 1-3 / 12-14，黄 4-5 / 10-11，红 6-9。
 * 用"离两端的距离"表达，天然保证对称：min(i, 15-i) 越小越靠两端。
 */
export const GREEN_EDGE = 3
export const YELLOW_EDGE = 6

export type LampColor = 'green' | 'yellow' | 'red'
/** off = 灰（未点亮）；blue = 到红线后的蓝色 */
export type LampState = 'off' | LampColor | 'blue'

/** 第 i 盏灯（1 起）的底色分段 */
export function lampColor(i: number): LampColor {
  // 到两端的最短距离：1 = 最外侧一对，7 = 最中间一对（每一对左右同色）
  const edge = Math.min(i, RPM_LAMP_COUNT + 1 - i)
  if (edge <= GREEN_EDGE) return 'green' // 1-3 与 12-14
  if (edge <= YELLOW_EDGE) return 'yellow' // 4-6 与 9-11
  return 'red' // 第 7 对：最中间两盏（= 转速最高的一对）
}

/** 第 i 盏灯（1 起）所属那一对亮起的转速阈值（首尾同一对，阈值相同） */
export function lampThreshold(redline: number, i: number): number {
  const pair = Math.min(i, RPM_LAMP_COUNT + 1 - i) // 1 = 最外侧一对，7 = 最中间一对
  const offset = RPM_PAIR_OFFSETS[pair - 1] ?? RPM_LAMP_BASE_OFFSET
  return redline - offset
}

/** 当前亮到第几对（0..7）：0 = 一盏没亮，7 = 14 盏全亮 */
export function litPairs(rpm: number, redline: number): number {
  if (!Number.isFinite(rpm) || !Number.isFinite(redline) || redline <= 0) return 0
  let n = 0
  for (let pair = 1; pair <= RPM_LAMP_COUNT / 2; pair++) {
    const offset = RPM_PAIR_OFFSETS[pair - 1] ?? RPM_LAMP_BASE_OFFSET
    if (rpm >= redline - offset) n = pair
  }
  return n
}

/** 当前亮几盏（0..14，对称点亮所以总是偶数） */
export function litCount(rpm: number, redline: number): number {
  return litPairs(rpm, redline) * 2
}

/** 是否已到红线（此时全部变蓝并闪烁） */
export function atRedline(rpm: number, redline: number): boolean {
  return Number.isFinite(rpm) && Number.isFinite(redline) && redline > 0 && rpm >= redline
}

/**
 * 14 盏灯各自的状态。
 * @param blinkOn 闪烁的当前相位（仅到红线时有意义：false 表示"灭"那一拍 → 灯灭成灰）
 */
export function lampStates(rpm: number, redline: number, blinkOn = true): LampState[] {
  const out: LampState[] = []
  if (atRedline(rpm, redline)) {
    for (let i = 0; i < RPM_LAMP_COUNT; i++) out.push(blinkOn ? 'blue' : 'off')
    return out
  }
  // 从两端向中间：灯 i 属于第 edge 对（edge = min(i, 15-i)），亮到第 pairs 对就点亮
  const pairs = litPairs(rpm, redline)
  for (let i = 1; i <= RPM_LAMP_COUNT; i++) {
    const edge = Math.min(i, RPM_LAMP_COUNT + 1 - i)
    out.push(edge <= pairs ? lampColor(i) : 'off')
  }
  return out
}

/**
 * 维修区限速（PIT LIMIT）时的灯组模式（用户要求）：
 *   · 1、2、13、14 灭；
 *   · 3-12 以 0.5s 交替：**奇数灯蓝 / 偶数灯红** ↔ **奇数灯红 / 偶数灯蓝**。
 * 按灯的**绝对编号**取奇偶，没有对称概念。
 * @param phaseA true = 奇数蓝/偶数红那一拍
 */
export const RPM_PIT_BLINK_MS = 500
export function pitLimitStates(phaseA: boolean): LampState[] {
  const out: LampState[] = []
  for (let i = 1; i <= RPM_LAMP_COUNT; i++) {
    if (i <= 2 || i >= RPM_LAMP_COUNT - 1) {
      out.push('off') // 1、2、13、14
      continue
    }
    const odd = i % 2 === 1
    out.push((phaseA ? odd : !odd) ? 'blue' : 'red')
  }
  return out
}

/** 闪烁节拍：每 0.1s 切换一次（蓝 0.1s / 灭 0.1s，用户要求） */
export const RPM_BLINK_MS = 100
