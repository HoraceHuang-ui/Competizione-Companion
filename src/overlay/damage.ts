// ---------------------------------------------------------------------------
// 车损换算 + 碰撞检测（纯逻辑，不依赖 Vue，便于单测）
//
// 单位标定（实测，见 ACC-遥测数据参考.md §1.2.2）—— **车身与悬挂是两套系数**：
//   · 车身 carDamage[0..4]：不是秒，是「损伤点」。撞车实测 25.5732 / 12.0880 / 5.3215
//     ↔ 游戏内修车 7.22 / 3.41 / 1.50 秒，三处比值一致（≈3.542）⇒ 秒 = 原始值 ÷ 3.542；
//     carDamage[4]（centre）本身就是车身四处之和，要车身总时长直接用它。
//   · 悬挂 suspensionDamage[4]：是 0..1 的损伤等级，每 1 单位 = 30 秒
//     （实测 0.59771 ↔ 17.931 秒）。
//
// 碰撞检测：这两种损伤在同一次碰撞里只会**增加**（ACC 把它当累计量），
// 所以"损伤变大"就是碰撞的信号 —— 拿它点亮整块红色覆盖。
// ---------------------------------------------------------------------------

/** 1 显示秒 ≈ 3.542 损伤点 */
export const DAMAGE_RAW_PER_SECOND = 3.542
/** 悬挂每 1 单位损伤等级 = 30 秒修车时间 */
export const SUSPENSION_SECONDS_PER_UNIT = 30
/** 达到这个秒数，长条全红 */
export const DAMAGE_FULL_SECONDS = 15
/** 小于这个秒数就当作"没有损伤"（显示 No Damage，避免出现 0.00s） */
export const NO_DAMAGE_EPS = 0.005

/** 车身原始损伤点 → 秒 */
export function bodySeconds(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null
  return raw / DAMAGE_RAW_PER_SECOND
}

/** 悬挂损伤等级（四轮之和）→ 秒 */
export function suspensionSeconds(level: number | null | undefined): number | null {
  if (level == null || !Number.isFinite(level)) return null
  return level * SUSPENSION_SECONDS_PER_UNIT
}

export interface CollisionFrame {
  /** Physics 224 carDamage[5]（前/后/左/右/中） */
  carDamage: number[] | null
  /** Physics 680 suspensionDamage[4] */
  suspensionDamage: number[] | null
}

export interface CollisionOptions {
  /** 损伤增加超过这个秒数才算一次碰撞（低于它的浮点抖动忽略掉） */
  minSeconds?: number
  /** 两帧间隔超过它就认为中间暂停过：那一段变化不计入（可能被重置/维修过） */
  gapMs?: number
}

export class CollisionDetector {
  private readonly minSeconds: number
  private readonly gapMs: number
  private lastTotal: number | null = null
  private lastAt = 0
  /** 累计判定出的碰撞次数（调试 / 单测用） */
  hits = 0

  constructor(options: CollisionOptions = {}) {
    this.minSeconds = options.minSeconds ?? 0.02
    this.gapMs = options.gapMs ?? 1500
  }

  /**
   * 喂一帧损伤数据。
   * @returns true = 这一帧损伤比上一帧变大（判定为碰撞），调用方据此点亮红色覆盖
   */
  push(frame: CollisionFrame, now: number): boolean {
    const body = frame.carDamage
    if (!Array.isArray(body) || body.length < 5) return false
    const centre = Number(body[4])
    if (!Number.isFinite(centre) || centre < 0) return false
    const suspList = Array.isArray(frame.suspensionDamage)
      ? frame.suspensionDamage.filter(v => Number.isFinite(v))
      : []
    const suspLevel = suspList.length ? suspList.reduce((a, b) => a + b, 0) : 0
    // 用"秒"统一口径，两种系数不同的原始值才能放在一起比
    const totalSeconds = centre / DAMAGE_RAW_PER_SECOND + suspLevel * SUSPENSION_SECONDS_PER_UNIT

    const gap = this.lastTotal !== null && now - this.lastAt > this.gapMs
    const increased = this.lastTotal !== null && totalSeconds - this.lastTotal >= this.minSeconds

    this.lastTotal = totalSeconds
    this.lastAt = now

    if (increased && !gap) {
      this.hits += 1
      return true
    }
    return false
  }
}
