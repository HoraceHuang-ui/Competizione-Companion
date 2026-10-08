// ---------------------------------------------------------------------------
// 轮胎"受冲击掉胎压"的检测（纯逻辑，不依赖 Vue，方便单测）
//
// 为什么不用现成字段：ACC **没有**任何"轮胎损伤 / 漏气 / 掉压"字段。
// 官方页面里与轮胎有关的只有 wheelsPressure[4]（Physics 88，psi）、
// tyreWear[4]（120）、tyreDirtyLevel[4]（136）—— 后两个在官方"ACC 不使用"
// 名单里，1.9 实测也恒为 0（见 ACC-遥测数据参考.md §1.2.2）。所以只能盯
// wheelsPressure 本身的变化。
//
// 判据（用户口径）：
//   1. **瞬时下跌**：与最近 `windowMs`（默认 120ms）内的最高值相比掉了
//      ≥ `minDrop`（默认 0.01 psi）→ 记一次冲击掉落，累计到该轮胎头上。
//      自然降温大约 0.0001 psi/帧、维修区停一下也到不了 0.01，所以能分开；
//      用"时间窗内最高值"而不是"上一帧"，是为了抓住跨两三帧完成的下跌。
//   2. **暂停 / 断流**：两帧间隔 > `gapMs`（默认 1.5s）。主进程在游戏暂停、
//      回菜单、清零时根本不推数据，所以"断流"就是暂停的信号。断流后的第一帧
//      只重设基线、绝不算冲击（那可能是玩家重置车辆/换胎造成的跳变）；
//      若任一轮胎相比断流前变化 > `resetDelta`（1.00 psi），则把所有轮胎的
//      累计值清零（用户要求）。
// ---------------------------------------------------------------------------

export interface TyreImpactOptions {
  /** 判定"瞬时下跌"的最小幅度，psi */
  minDrop?: number
  /**
   * 判定"瞬时"的时间窗，ms。
   * 400ms 的依据：ACC 的胎压基本跟胎温走（约 0.084 psi/℃），停车自然降温也就
   * 1℃/10~20s ≈ 0.004~0.008 psi/s，400ms 内顶多掉 0.003 —— 离 0.01 的阈值还有
   * 3 倍余量；而吃路肩那种跌落是一两帧内完成的台阶，肯定落在窗内。
   * 取 400 而不是更短，是因为主进程只在数据变化时推帧，偶尔会有 100~300ms 的
   * 空档，窗口太短会漏掉跨这几帧完成的跌落。
   */
  windowMs?: number
  /** 暂停恢复后，任一轮胎变化超过它就整体清零，psi */
  resetDelta?: number
  /** 两帧间隔超过它就认为中间发生过暂停/断流，ms */
  gapMs?: number
}

const TYRE_COUNT = 4

export class TyreImpactDetector {
  /** 每个轮胎累计因冲击掉掉的胎压（psi），展示成 0.00 */
  readonly lost: number[] = new Array(TYRE_COUNT).fill(0)
  /** 每个轮胎的冲击次数（调试 / 单测用） */
  readonly hits: number[] = new Array(TYRE_COUNT).fill(0)

  private readonly minDrop: number
  private readonly windowMs: number
  private readonly resetDelta: number
  private readonly gapMs: number

  private lastValues: number[] | null = null
  private lastAt = 0
  /** 时间窗内的最高值及其时刻 */
  private peaks: number[] = new Array(TYRE_COUNT).fill(0)
  private peakAt: number[] = new Array(TYRE_COUNT).fill(0)

  constructor(options: TyreImpactOptions = {}) {
    this.minDrop = options.minDrop ?? 0.01
    this.windowMs = options.windowMs ?? 400
    this.resetDelta = options.resetDelta ?? 1
    this.gapMs = options.gapMs ?? 1500
  }

  /** 清零所有轮胎的累计损失（保留检测基线） */
  reset(): void {
    for (let i = 0; i < TYRE_COUNT; i++) {
      this.lost[i] = 0
      this.hits[i] = 0
    }
  }

  /**
   * 喂一帧四轮胎压（psi，顺序 FL/FR/RL/RR）。
   * @returns 本帧判定为"冲击掉压"的轮胎下标（可能是空数组）
   */
  push(pressures: readonly number[] | null | undefined, now: number): number[] {
    if (!pressures || pressures.length < TYRE_COUNT) return []
    const values: number[] = []
    for (let i = 0; i < TYRE_COUNT; i++) {
      const v = Number(pressures[i])
      // 读到 NaN/Infinity（读取器会把哨兵值写成 0）时放弃这一帧，避免误判
      if (!Number.isFinite(v) || v <= 0) return []
      values.push(v)
    }

    const gap = this.lastValues !== null && now - this.lastAt > this.gapMs
    if (this.lastValues === null || gap) {
      // 断流后的第一帧：先看是不是"玩家重置了车辆/胎压"
      if (this.lastValues !== null) {
        const before = this.lastValues
        const jump = Math.max(...values.map((v, i) => Math.abs(v - before[i])))
        if (jump > this.resetDelta) {
          this.reset()
        }
      }
      this.setBaseline(values, now)
      return []
    }

    const fired: number[] = []
    for (let i = 0; i < TYRE_COUNT; i++) {
      const v = values[i]
      // 时间窗外的旧峰值作废
      if (now - this.peakAt[i] > this.windowMs) {
        this.peaks[i] = v
        this.peakAt[i] = now
      }
      if (v > this.peaks[i]) {
        this.peaks[i] = v
        this.peakAt[i] = now
      }
      const drop = this.peaks[i] - v
      if (drop >= this.minDrop) {
        this.lost[i] += drop
        this.hits[i] += 1
        this.peaks[i] = v
        this.peakAt[i] = now
        fired.push(i)
      }
    }

    this.lastValues = values
    this.lastAt = now
    return fired
  }

  private setBaseline(values: number[], now: number): void {
    this.lastValues = values.slice()
    this.lastAt = now
    for (let i = 0; i < TYRE_COUNT; i++) {
      this.peaks[i] = values[i]
      this.peakAt[i] = now
    }
  }
}
