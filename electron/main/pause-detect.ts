// ---------------------------------------------------------------------------
// 游戏暂停 / 无数据的判定（纯逻辑，不依赖 electron，方便单测）
//
// ACC 在车库、主菜单、暂停时有两种表现，两种都要当成"暂停"，而且这些帧
// **既不能推给界面、也不能当作 lastGood**，否则界面会停在一帧被清零的数据上：
//
//   1. 整页被清零（`isBlankFrame`）：胎压 / 胎心温度 / 刹车温度 / 刹车片厚度被清成 0，
//      车速与转速也是 0（**注意 compound 等字段可能保留，不能当判据**，见下）。
//   2. 物理页被冻住（`sameData`）：只有 `packetId` 在跳，其余字段一字不差。
//
// 判定要一点去抖（默认 800ms）：车停在维修区时，偶尔也会有连续几帧数值不动。
// 真正暂停时物理页会一直冻着，所以等一小会儿再下结论，代价只是晚 0.8 秒。
// ---------------------------------------------------------------------------

/** 判定所需的最小字段集（完整快照也满足这个结构） */
export interface PauseFrame {
  packetId: number
  speedKmh: number
  rpms: number
  tyrePressure: number[] | null
  tyreCoreTemp: number[] | null
  brakeTemp: number[] | null
  padLife: number[] | null
}

/** 连续"没有新数据"多久才判定暂停 */
export const FROZEN_MS = 800

const allZero = (values: number[] | null) =>
  !values || values.every(v => !Number.isFinite(v) || v === 0)

/**
 * 这一帧是不是"被游戏清空"的异常帧。ACC 在车库 / 主菜单 / 暂停时就是这么清页的。
 *
 * ⚠️ 判据只能看"真车里不可能是 0"的每轮胎数组 —— 2026-10 实测（游戏暂停时逐槽读）：
 *   tyrePressure / tyreCoreTemp / brakeTemp / padLife / wheelSlip 全 0、speed/rpms 也是 0，
 *   **但 `compound` 原始值 0 是合法胎种**（读取器映射成 "dry_compound"），
 *   airTemp/roadTemp 之类静态数据也可能留着。所以绝对不能拿 `compound == null`
 *   或气温路温当"被清空"的判据 —— 早先就是这么漏掉暂停帧的，界面会停在清零的那一帧。
 */
export function isBlankFrame(s: PauseFrame): boolean {
  // 单个数组全 0 就已经不可能了（真车胎压/胎温不会同时为 0）
  const pressureGone = allZero(s.tyrePressure)
  const tempGone = allZero(s.tyreCoreTemp)
  if (pressureGone || tempGone) return true
  // 弱一些的组合：刹车温度与刹车片厚度同时全 0，且车是停着的
  return allZero(s.brakeTemp) && allZero(s.padLife) && s.speedKmh === 0 && s.rpms === 0
}

/** 只比"数据"，忽略 packetId：相同即说明物理页被冻结 */
export function sameData(a: PauseFrame, b: PauseFrame): boolean {
  const strip = (f: PauseFrame) => {
    const { packetId: _ignored, ...rest } = f
    return rest
  }
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b))
}

export type FrameVerdict = 'ok' | 'blank' | 'frozen'

export class PauseDetector {
  /** 最后一个"数值正常"的帧：暂停期间保持不变，界面就冻在它上面 */
  private lastGood: PauseFrame | null = null
  private frozenSince = 0
  private paused = false

  constructor(private readonly frozenMs: number = FROZEN_MS) {}

  /**
   * 喂一帧读取器数据。
   * @returns `'ok'` = 正常帧（已记为 lastGood，可以推给界面）；
   *          `'blank'` = 被游戏清零；`'frozen'` = 只有 packetId 在变。
   *          **后两种都不要推给界面，也不要记为 lastGood**（去抖期间同样不落地，
   *          所以界面不会闪一下 0）。
   */
  accept(frame: PauseFrame, now: number = Date.now()): FrameVerdict {
    let verdict: FrameVerdict = 'ok'
    if (isBlankFrame(frame)) verdict = 'blank'
    else if (this.lastGood !== null && sameData(frame, this.lastGood)) verdict = 'frozen'

    if (verdict !== 'ok') {
      if (!this.frozenSince) this.frozenSince = now
      if (now - this.frozenSince >= this.frozenMs) this.paused = true
      return verdict
    }

    this.frozenSince = 0
    this.paused = false
    this.lastGood = frame
    return 'ok'
  }

  /** 完全没有数据（读取器退出 / 看门狗超时 / ACC 关闭）：直接判暂停 */
  noData(): void {
    this.frozenSince = 0
    this.paused = true
  }

  get isPaused(): boolean {
    return this.paused
  }

  /** 最后一个正常帧（调试 / 单测用） */
  get lastGoodFrame(): PauseFrame | null {
    return this.lastGood
  }
}
