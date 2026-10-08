/**
 * 圈速 / 时间格式化（纯函数，可单测）——「排名&圈速」遥测窗用。
 *
 * 约定（用户指定）：
 *   · 当前圈计时：`MM:ss.000`，精确到三位小数（例 `01:23.456`）
 *   · Best / Last / Pred：`M:ss.000`（分钟不补零，三位小数，例 `1:46.552`）
 *   · Stint 时长：`H:MM:ss`
 *   · 没有数据 / N/A：`--:--.---`（组件按需隐藏整行）
 */

/**
 * 官方图形页里的 N/A 哨兵：`iBestTime`/`iLastTime`/`iCurrentTime`/`iEstimatedLapTime`
 * 在第一圈/无成绩时会返回 **INT_MAX（2147483647 ms）** —— 实测第一圈 best/last 都是它，
 * 按毫秒格式化会显示成 `35791:23.647`，所以必须当无效值处理。
 */
export const TIME_SENTINEL = 2147483647

/** 有效的圈速毫秒（>0 且不是哨兵），否则 null */
function validMs(ms: number | null | undefined): number | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null
  if (ms >= TIME_SENTINEL - 1) return null
  return ms
}

/** 毫秒 → `MM:ss.mmm`（当前圈计时用，分钟补零到 2 位） */
export function formatLapTimeMs(ms: number | null | undefined): string {
  const valid = validMs(ms)
  if (valid == null) return '--:--.---'
  const total = Math.round(valid)
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const milli = total % 1000
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`
}

/** 毫秒 → `M:ss.mmm`（Best / Last / Pred 用，分钟不补零） */
export function formatLapShort(ms: number | null | undefined): string {
  const valid = validMs(ms)
  if (valid == null) return '--:--.---'
  const total = Math.round(valid)
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const milli = total % 1000
  return `${m}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`
}

/**
 * 带符号的 delta，例 `+0.218` / `-0.106`（秒，三位小数）。
 * `value` 是绝对值、`positive` 是符号（官方 Graphic 就是这么分开给的）。
 * **值为 0（三位小数显示成 `0.000`）时不带符号** —— 用户要求，此时组件走"中性灰"样式。
 */
export function formatDeltaSeconds(
  valueMs: number | null | undefined,
  positive: number | null | undefined,
): string {
  if (valueMs == null || !Number.isFinite(valueMs)) return '--.---'
  const seconds = Math.abs(valueMs) / 1000
  if (seconds < DELTA_ZERO_EPSILON_SECONDS) return '0.000'
  const sign = positive ? '+' : '-'
  return `${sign}${seconds.toFixed(3)}`
}

/** 小于这个秒数就按"显示为 0.000"处理（`toFixed(3)` 的半个刻度） */
export const DELTA_ZERO_EPSILON_SECONDS = 0.0005

/** delta 是否应视为 0（= 界面显示 0.000 的那些值） */
export function deltaIsZero(valueMs: number | null | undefined): boolean {
  if (valueMs == null || !Number.isFinite(valueMs)) return true
  return Math.abs(valueMs) / 1000 < DELTA_ZERO_EPSILON_SECONDS
}

/**
 * delta 的**符号判定**（踩过的坑）：官方字段 `iDeltaLapTime` 有时给的是**有符号值**（负数=更快），
 * 有时给的是绝对值 + `isDeltaPositive` 符号位。界面必须两者都认，否则负数那一侧会被当成
 * "没数据"而显示成灰色（用户实测：delta 为负时槽是灰的、不是绿的）。
 *
 * 返回：
 *   · `magnitudeMs` 绝对值（格式化用）
 *   · `faster`      true = 比上一圈快（绿）
 *   · `zero`        视为 0.000（中性灰、不带正负号）
 */
export function deltaSignOf(
  valueMs: number | null | undefined,
  positiveFlag: number | null | undefined,
): { magnitudeMs: number; faster: boolean; zero: boolean } {
  if (valueMs == null || !Number.isFinite(valueMs)) {
    return { magnitudeMs: 0, faster: false, zero: true }
  }
  const magnitudeMs = Math.abs(valueMs)
  if (deltaIsZero(valueMs)) return { magnitudeMs, faster: false, zero: true }
  // 有符号值直接以符号为准；正值时才看官方的 isDeltaPositive（0 = 更快）
  const faster = valueMs < 0 ? true : positiveFlag === 0
  return { magnitudeMs, faster, zero: false }
}

/** delta 的槽填充比例：用户指定 **0.5s 为满槽**，超过就是满槽。**正负都按 |delta| 填**（从左向右） */
export const DELTA_FULL_SECONDS = 0.5

export function deltaFillRatio(
  valueMs: number | null | undefined,
  _positive?: number | null,
): number {
  if (valueMs == null || !Number.isFinite(valueMs)) return 0
  const seconds = Math.abs(valueMs) / 1000
  return Math.max(0, Math.min(1, seconds / DELTA_FULL_SECONDS))
}

/**
 * 预测圈速 = 最快圈 + delta（用户指定实时计算）。
 * delta 为正表示更慢，所以直接相加；任一缺失就返回 null（组件显示占位）。
 */
export function predictLapMs(
  bestMs: number | null | undefined,
  deltaMs: number | null | undefined,
  positive: number | null | undefined,
): number | null {
  const best = validMs(bestMs)
  if (best == null) return null
  if (deltaMs == null || !Number.isFinite(deltaMs)) return null
  const signed = (positive ? 1 : -1) * Math.abs(deltaMs)
  const predicted = best + signed
  return predicted > 0 && predicted < TIME_SENTINEL - 1 ? predicted : null
}

/** 排名文案：`4/19`（前一个数字加粗，组件里拆成两段渲染） */
export function formatPlacement(
  position: number | null | undefined,
  total: number | null | undefined,
): { pos: string; of: string } | null {
  if (position == null || !Number.isFinite(position) || position <= 0) return null
  const of = total != null && Number.isFinite(total) && total > 0 ? String(total) : null
  return { pos: String(position), of: of ? `/${of}` : '/--' }
}

/** 界面上的三档评级（用户指定：AM 红底黑字 / SILVER 灰底白字 / PRO 白底黑字） */
export type DriverCategory = 'am' | 'silver' | 'pro'

/**
 * 广播 `ENTRY_LIST_CAR` 里的车手评级字节 —— **官方 SDK 的 `DRIVER_CATEGORY`**
 * （见 `accapi/enums.py`：`{0: Bronze, 1: Silver, 2: Gold, 3: Platinum, 255: Unknown}`），
 * 实测两名车手取到过 **1** 与 **3**。
 * 界面只有三档，所以映射：**Bronze → AM**、**Silver → SILVER**、**Gold/Platinum → PRO**，
 * 其余（含 255 与 null）不显示评级色。
 * ⚠️ 别拿共享内存那套 `ACC_DRIVER_CATEGORY`（AM/SILVER/PRO）来套这里的字节，两者不是一套枚举。
 */
export function driverCategoryOf(value: number | null | undefined): DriverCategory | null {
  if (value == null || !Number.isFinite(value)) return null
  if (value === 0) return 'am'
  if (value === 1) return 'silver'
  if (value === 2 || value === 3) return 'pro'
  return null
}

/**
 * 车型 → 组别：直接用项目自带的车型库 `src/utils/carData.js`（顶层键就是
 * **GT3 / GT4 / GTC / TCX**，实测库里 46 台：GT3=31、GT4=11、GTC=3、TCX=1），
 * 所以"拿到 Static `carModel` 再去库里匹配"就能得到组别，不用猜车名规则。
 *
 * 做成"传数据进来"的纯函数，方便单测（组件把 `@/utils/carData` 传进来）。
 */
export interface CarGroupIndex {
  /** 车型键（如 `ferrari_488_gt3_evo`）→ 组别 */
  byKey: Map<string, string>
  /** 车型数字 id → 组别（`carData` 里的 `id`） */
  byId: Map<number, string>
}

export function buildCarGroupIndex(data: unknown): CarGroupIndex {
  const byKey = new Map<string, string>()
  const byId = new Map<number, string>()
  if (!data || typeof data !== 'object') return { byKey, byId }
  for (const [group, cars] of Object.entries(data as Record<string, unknown>)) {
    if (!cars || typeof cars !== 'object') continue
    for (const [key, car] of Object.entries(cars as Record<string, unknown>)) {
      byKey.set(key, group)
      byKey.set(key.toLowerCase(), group)
      const id = (car as { id?: unknown } | null)?.id
      if (typeof id === 'number') byId.set(id, group)
    }
  }
  return { byKey, byId }
}

/**
 * 由车型名取组别：先精确匹配，再小写匹配，最后退化为"库里的键是它的前缀"
 * （例：游戏给出 `ferrari_488_gt3_evo` 而库里键完全一致时就是第一条命中）。
 */
export function carGroupOf(
  carModel: string | null | undefined,
  index: CarGroupIndex,
): string | null {
  if (!carModel) return null
  const exact = index.byKey.get(carModel)
  if (exact) return exact
  const lower = index.byKey.get(carModel.toLowerCase())
  if (lower) return lower
  // 兜底：库里的键是车型名的前缀（取最长且唯一命中的那个）
  const name = carModel.toLowerCase()
  let best: { key: string; group: string } | null = null
  for (const [key, group] of index.byKey) {
    if (key.length < 8 || !name.startsWith(key)) continue
    if (!best || key.length > best.key.length) best = { key, group }
  }
  return best ? best.group : null
}

/** 车型数字 id → 组别（将来若能从广播拿到别的车的车型 id，就能按组统计） */
export function carGroupOfId(
  id: number | null | undefined,
  index: CarGroupIndex,
): string | null {
  if (id == null || !Number.isFinite(id)) return null
  return index.byId.get(id) ?? null
}
