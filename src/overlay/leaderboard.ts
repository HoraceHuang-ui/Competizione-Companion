/**
 * 排行榜的**行选择**规则（纯函数，可单测）—— 用户要求：
 *   · 第 1 名**固定置顶**；
 *   · 再展示**用户当前名次及前后各两名**（共 5 行）；
 *   · 一边不够就**往另一边补位**（例：用户最后一名 → 第一名 + 用户的前 4 名 + 用户）；
 *   · 两边都不够就**减少行数**（小车场）。
 */
export interface RowLike {
  position: number
  isMe: boolean
  /** 是否在维修区（广播 carLocation ≥ 2）；预览样例可以不给 */
  inPit?: boolean
}

/**
 * 渲染侧的排行榜行类型（与主进程 `electron/main/acc-broadcast.ts` 的 `LeaderboardRow` 一一对应；
 * 渲染侧不能 import 主进程模块，所以这里再声明一份，改任一边记得同步）。
 */
export interface LeaderboardRow {
  carEntryId: number
  carId: number
  raceNumber: number | null
  driverName: string
  position: number
  bestLapMs: number | null
  lastLapMs: number | null
  /**
   * 秒差（正赛 = 分段跨线实测，段表还没数据时退回"进度差 × 参考圈速"的估算；
   * 其他节 = 与第一名最快圈之差）；第一名 / 不同圈 / 无法计算为 null
   */
  gapMs: number | null
  /** 秒差来源：`segments` = 分段跨线（实测）/ `ahead` = 进度差估算 / `bestLap` = 圈速之差 */
  gapKind: 'segments' | 'ahead' | 'bestLap' | null
  /**
   * **有符号圈差**：正 = 对方领先我 N 圈（他套我）；负 = 我领先对方 N 圈（我套他）；0 = 同一圈。
   * 非 0 时界面显示 `+N L` / `-N L`（**不显示秒差**）。
   */
  lapsDelta: number
  isMe: boolean
}

/** 用户窗口的行数（前后各两名 = 5） */
export const WINDOW_SIZE = 5

export function selectLeaderboardRows<T extends RowLike>(rows: T[]): T[] {
  if (rows.length === 0) return []
  const sorted = [...rows].sort((a, b) => a.position - b.position)
  const leader = sorted[0]
  const hasMe = sorted.some(r => r.isMe)

  // 认不到本人 → 只显示最前面的（含第一名）
  if (!hasMe) return sorted.slice(0, Math.max(1, WINDOW_SIZE))

  const meIndex = sorted.findIndex(r => r.isMe) // 0 基
  const n = sorted.length
  // 先取"用户 ±2"的窗口，再**截断**到榜单范围内（不平移 —— 上面不够时窗口会自然含进第一名，
  // 那时就只有 5 行；下面不够时才靠"补位"补出第 6 行，例如用户最后一名 → 第一名 + 前 4 名 + 用户）
  const half = Math.floor(WINDOW_SIZE / 2)
  let start = Math.max(0, meIndex - half)
  let end = Math.min(n - 1, meIndex + half)
  // 上面被截断（用户很靠前）→ 往下补足到 WINDOW_SIZE 行
  if (end - start + 1 < WINDOW_SIZE) end = Math.min(n - 1, start + WINDOW_SIZE - 1)
  // 下面被截断（用户很靠后）→ 往上补足
  if (end - start + 1 < WINDOW_SIZE) start = Math.max(0, end - WINDOW_SIZE + 1)
  const window = sorted.slice(start, end + 1)
  // 第一名固定置顶；若窗口里已经含第一名就不重复
  const rest = window.filter(r => r !== leader)
  return [leader, ...rest]
}
