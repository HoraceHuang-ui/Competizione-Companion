/**
 * 「判罚」组件的**纯逻辑**：把共享内存的判罚字段翻译成屏幕上那几个圆角矩形（chip）。
 *
 * 数据来源（全部是**自己车**的）：
 *   · `Graphic.penalty`（偏移 1228，`ACC_PENALTY_TYPE` 枚举）—— 当前判罚的**类型 + 原因**
 *   · `Graphic.penaltyTime`（偏移 1220，float，秒）—— 官方说明 "Penalty time to wait"
 *
 * ⚠️ **没有 cut 警告次数**（用户要求不显示）：共享内存里没有这个字段，广播事件里也没有
 * （实测：故意切弯拿到 warning 后，一局 34 条广播事件只有 `LapCompleted`/`Accident`，没有判罚消息）。
 * 所以这里**只产出"真的被判罚了"的 chip**；没有判罚时返回**空数组** → 组件整块都不渲染（连背景都不画）。
 * 将来若用 `native/probe-diff.cjs` 差分找到了 cut 计数槽位，再回来加"黄底 cut chip"（见参考文档 §1.6）。
 *
 * 枚举取值来自官方共享内存文档 `ACC-SharedMemory官方字段说明.txt` 的 `ACC_PENALTY_TYPE`
 * （1..6 = 切弯系列、7..12 = 维修区超速系列、13/15..21 = 各种 DSQ、14 = 赛后罚时）。
 * ⚠️ 文档里 `ACC_Disqualified_Wrongway = 18`，但本项目实测逆行/DSQ 出现的是 **22**（18 已废弃）。
 */

export interface PenaltyChip {
  /** 稳定的 key（渲染 v-for 用） */
  key: string
  /** 屏幕上显示的文字 */
  text: string
  /** 鼠标悬停说明（判罚类型 + 原因） */
  title: string
}

/**
 * `ACC_PENALTY_TYPE` → 屏幕文字 + 原因。
 * 文字刻意用赛道上的简称（DT / SG10 / SG30 / DSQ），原因放进 `title`，不占地方。
 */
const PENALTY_TABLE: Record<number, { text: string; reason: string }> = {
  1: { text: 'DT', reason: '切弯（Cutting）' },
  2: { text: 'SG10', reason: '切弯（Cutting）' },
  3: { text: 'SG20', reason: '切弯（Cutting）' },
  4: { text: 'SG30', reason: '切弯（Cutting）' },
  5: { text: 'DSQ', reason: '切弯（Cutting）' },
  6: { text: 'NO BEST', reason: '切弯（Cutting）· 最快圈被取消' },
  7: { text: 'DT', reason: '维修区超速（Pit Speeding）' },
  8: { text: 'SG10', reason: '维修区超速（Pit Speeding）' },
  9: { text: 'SG20', reason: '维修区超速（Pit Speeding）' },
  10: { text: 'SG30', reason: '维修区超速（Pit Speeding）' },
  11: { text: 'DSQ', reason: '维修区超速（Pit Speeding）' },
  12: { text: 'NO BEST', reason: '维修区超速（Pit Speeding）· 最快圈被取消' },
  13: { text: 'DSQ', reason: '未完成强制进站（Ignored Mandatory Pit）' },
  15: { text: 'DSQ', reason: '恶意行为（Trolling）' },
  16: { text: 'DSQ', reason: '维修区入口违规（Pit Entry）' },
  17: { text: 'DSQ', reason: '维修区出口违规（Pit Exit）' },
  18: { text: 'DSQ', reason: '逆行（Wrong Way）· 文档值，实测多为 22' },
  19: { text: 'DT', reason: '忽略车手 stint（Ignored Driver Stint）' },
  20: { text: 'DSQ', reason: '忽略车手 stint（Ignored Driver Stint）' },
  21: { text: 'DSQ', reason: '超出车手 stint 上限（Exceeded Driver Stint Limit）' },
  22: { text: 'DSQ', reason: '逆行（Wrong Way）· **实测值**' },
}

export interface PenaltyChipsInput {
  /** Graphic `penalty`（ACC_PENALTY_TYPE），0 = 无判罚 */
  penalty: number
  /** Graphic `penaltyTime`（秒）—— 罚时/等待秒数（`penalty == 14` 时就是 `+xx s` 的秒数） */
  penaltyTime: number
}

/**
 * 组装要显示的 chip 列表（横向排列）：
 *   · **没有判罚 → 空数组**（组件据此整块不渲染，背景也不画）
 *   · `penalty == 14`（`PostRaceTime`，赛后罚时）→ `+{penaltyTime}s`（秒数读不到时显示 `TIME`）
 *   · 其余 `penalty > 0` → `DT` / `SG10` / `SG20` / `SG30` / `DSQ` / `NO BEST`（未知码显示 `PEN`）
 */
export function penaltyChips(input: PenaltyChipsInput): PenaltyChip[] {
  const code = Math.floor(input.penalty) || 0
  if (code <= 0) return []

  if (code === 14) {
    const seconds = Number.isFinite(input.penaltyTime) ? Math.round(input.penaltyTime) : 0
    return [
      {
        key: 'penalty-14',
        text: seconds > 0 ? `+${seconds}s` : 'TIME',
        title: seconds > 0 ? `赛后罚时 +${seconds} 秒` : '赛后罚时（秒数读不到）',
      },
    ]
  }

  const known = PENALTY_TABLE[code]
  return [
    {
      key: `penalty-${code}`,
      text: known ? known.text : 'PEN',
      title: known ? `${known.text} —— ${known.reason}` : `未知判罚码 ${code}`,
    },
  ]
}
