/**
 * **分段跨线秒差**（纯逻辑，可单测；被 `acc-broadcast.ts` 的排行榜调用）。
 *
 * 口径 —— 就是真实计时的那一套"同一地点、两个时刻之差"：
 *   ① 把一圈按 spline 均分成 `GAP_SEGMENTS` 段（默认 30 段，Valencia 4005m → 每段约 134m）；
 *   ② 每辆车跨过第 k 条段界线时**记下时刻**（本圈内）；
 *   ③ 两车在同一条"双方都跨过"的最近段界线上的时刻之差 = 秒差 —— **跨线那一刻是实测**，
 *      两段之间保持上一次读数（F1 官方 Live Timing 也是每 ~200m 更新一次，一圈约 25 次）。
 *
 * ⚠️ **"是不是同圈"必须用绝对跨线序号判断，不能拿"已完成圈数相等"判断**（踩过）：
 * 圈数只在**过线那一刻**才 +1，所以前车刚冲线、我还差一点冲线时，两车圈数会差 1，
 * 而我们物理上只差几秒 —— 用圈数相等当判据，这"几秒"（差距越大窗口越长）里秒差全是 `--`。
 * 正解：给每条段界线一个**绝对序号** `G = 圈数 × 段数 + 段号`（单调递增，跨车可比），
 * 两车 `|G_我 − G_他| < 段数` 才算同圈（差不到一整圈 = 没被套圈），再取 `min(G)` 那条界线比时刻。
 * 为此表要**多留一圈**历史（`prevTimes`/`prevLap`）：前车刚过线时，要跟它比的界线落在它的上一圈。
 *
 * 为什么不用"进度差 × 参考圈速"那个模型：它把整车一圈的平均速度当成常数，前车已经进弯减速、
 * 后车还在直道时换算出的秒差会**假性缩小**，出弯时又假性放大（实测能差 1 秒）。分段跨线没有这个
 * 问题：比的始终是"同一个点"。
 *
 * 采样是 250ms 一次，所以段界线的跨线时刻靠**相邻两帧之间按 spline 线性插值**。250ms 窗口内
 * spline 对时间近似线性，插值误差远小于 0.1s（30 段、每段跑一两秒，不会漏段界）。
 *
 * ⚠️ 圈数：广播的 `laps` 是**绝对**已完圈数（跨车可比），但它**可能会卡住**（实测"我自己那行"
 * 常常一直是 0），所以表自己维护 `lap`：跨线时 +1，报文圈数更靠前时对齐（见 `syncSegLap`）。
 */

/** 一圈分成多少段（用户定的 30 段） */
export const GAP_SEGMENTS = 30

/**
 * 单帧内"前进"超过这么多圈就算**传送**而不是跨线（8% × Valencia 4005m ≈ 320m / 250ms ≈ 1280km/h）。
 * 用途：车辆重置、回放、严重卡顿会把 spline 一次拉前一大截，那时不该编造一串跨线时刻。
 */
const SEGMENT_JUMP = 0.08

/** 一辆车的"分段跨线表"（跟着 `state.cars` 里的实时行走） */
export interface SegTable {
  /** **本圈**第 k 条段界线的跨线时刻（ms，与传给 `advanceSegTable` 的 `now` 同源）；NaN = 本圈还没跨过 */
  times: Float64Array
  /** **上一圈**的同样一张表（进新圈时整圈搬过来）—— 前车刚过线时要跟它比上一圈的那条界线 */
  prevTimes: Float64Array
  /** `times` 属于第几圈（**自维护**：跨线时 +1，报文/共享内存圈数更靠前时对齐） */
  lap: number
  /** `prevTimes` 属于第几圈（-1 = 没有上一圈的存档） */
  prevLap: number
  /** 本圈最后一条"已记下时刻"的段界（-1 = 本圈还没跨过任何段界） */
  lastSeg: number
  /** 上一帧的 spline（-1 = 还没收到过这辆车的实时行） */
  prevSpline: number
  /** 上一帧的段号 */
  prevSeg: number
  /** 上一帧的时刻 */
  prevAt: number
}

export function createSegTable(segments = GAP_SEGMENTS): SegTable {
  return {
    // ⚠️ `new Float64Array(n)` 是**全 0**，必须显式填 NaN：全 0 会被 `Number.isFinite` 当成
    // "已跨过"（0 是个合法时刻），中途加入/刚换圈的车跟别人一比就会算出 −123 万毫秒这种垃圾秒差。
    times: new Float64Array(segments).fill(NaN),
    prevTimes: new Float64Array(segments).fill(NaN),
    lap: 0,
    prevLap: -1,
    lastSeg: -1,
    prevSpline: -1,
    prevSeg: -1,
    prevAt: 0,
  }
}

/** 进新的一圈：把本圈的时刻搬进 `prevTimes`（存档），本圈清空 */
function rollLap(s: SegTable): void {
  s.prevTimes.set(s.times)
  s.prevLap = s.lap
  s.times.fill(NaN)
  s.lastSeg = -1
}

/** 把两张表都清空（存档也丢掉） */
function clearAll(s: SegTable): void {
  s.times.fill(NaN)
  s.prevTimes.fill(NaN)
  s.lastSeg = -1
  s.prevLap = -1
}

/**
 * 作废整张表，回到"刚见到这辆车"的状态（下一帧会重新对齐基线）。
 * 用途：**换赛节/换赛道**时把所有车的表清掉 —— 那时 `laps` 会从头开始，
 * 但表里的圈数是自维护的，不清就会残留旧赛节的圈号，跨车永远算不出秒差。
 */
export function resetSegTable(s: SegTable): void {
  clearAll(s)
  s.lap = 0
  s.prevSpline = -1
  s.prevSeg = -1
  s.prevAt = 0
}

/**
 * 用"绝对圈数"把分段表**向前**对齐（圈数变了就把表作废重来）。
 * 用途：我自己的表按**共享内存**的 `completedLaps` 对齐（广播给我那行的 laps 实测可能是 0）。
 * ⚠️ 只处理"更靠前"（`lap > s.lap`）：倒退交给 `resetSegTable` 在换赛节时统一处理 ——
 * 否则一个**卡住不动**的圈数（永远是 0）会把自维护的圈数反复打回去。
 * ⚠️ 这里**不存档**（`clearAll`）：圈号是跳着改的，存档会挂在错误的圈号上，比没有更糟。
 */
export function syncSegLap(s: SegTable, lap: number | null | undefined): void {
  if (lap == null || !Number.isFinite(lap) || lap <= s.lap) return
  s.lap = lap
  clearAll(s)
}

/**
 * 用一帧实时数据推进分段表。
 *
 * @param spline 0..1 的赛道位置（NaN / 缺字段时**整帧忽略**，否则会污染表）
 * @param laps   广播给的**绝对**已完圈数（NaN / 卡住不动都能忍，见下面的自维护）
 * @param now    这一帧的时刻（ms，`Date.now()`）
 */
export function advanceSegTable(
  s: SegTable,
  spline: number,
  laps: number,
  now: number,
  segments = s.times.length,
): void {
  if (!Number.isFinite(spline) || !Number.isFinite(now)) return
  const sc = Math.min(1 - 1e-6, Math.max(0, spline))
  const seg = Math.min(segments - 1, Math.max(0, Math.floor(sc * segments)))

  // 第一次见到这辆车：只对齐基线（这一帧不算跨线）
  if (s.prevSpline < 0) {
    s.lap = Number.isFinite(laps) ? laps : 0
    s.prevSpline = sc
    s.prevSeg = seg
    s.prevAt = now
    return
  }

  // ① 圈数对齐：报文圈数**更靠前** = 已经进新的一圈（跨线那一拍 laps 常常同时 +1）。
  //    ⚠️ 报文圈数**倒退**时不动表：一个卡住的圈数（实测"我自己那行"可能一直是 0）会把
  //    自维护的圈数反复打回去 —— 换赛节由 `resetSegTable()` 统一清。
  let lapFromPacket = false
  if (Number.isFinite(laps) && laps > s.lap) {
    // 正常进一圈 → 把这一圈存档（前车刚过线时要靠它跟还没过线的车比）；一次跳 2 圈以上
    // 说明中间整圈数据都没收到，存档没意义，直接清。
    if (laps - s.lap === 1) rollLap(s)
    else clearAll(s)
    s.lap = laps
    lapFromPacket = true
  }

  const wrapped = sc < s.prevSpline - 0.5

  if (wrapped) {
    // ② 跨过起终线（spline 从 ~1 掉到 ~0）
    if (!lapFromPacket) {
      // 报文圈数没跟上（实测"我自己那行"的 laps 可能一直是 0）→ 自己 +1（同样先存档）
      rollLap(s)
      s.lap += 1
    }
    const span = 1 - s.prevSpline + sc
    const f = span > 0 ? (1 - s.prevSpline) / span : 0
    const tLine = s.prevAt + (now - s.prevAt) * f
    s.times[0] = tLine
    s.lastSeg = 0
    // 跨线那一拍通常也已越过第 1..seg 条段界（250ms 内最多一两段）→ 按进度比例摊时间
    if (seg > 0 && sc > 0) {
      const tEnd = Math.max(tLine, now)
      for (let j = 1; j <= seg; j++) {
        s.times[j] = tLine + ((j / segments) / sc) * (tEnd - tLine)
        s.lastSeg = j
      }
    }
  } else {
    const dSpan = sc - s.prevSpline
    if (dSpan > SEGMENT_JUMP) {
      /**
       * ③ **单帧内前进超过 8% 圈**（Valencia 约 320m/250ms ≈ 1280km/h）—— 物理上不可能，
       * 一定是"传送"（车辆重置/回放/严重卡顿），不是在赛道上跨线。
       * 不编造中间那些段界的时刻，只把"当前所在段界"当一个**保守**标记（时间戳取 now，
       * 在同一条界线并列时会排在真正先跨的人后面），名次与秒差因此不会被凭空拉前。
       */
      if (seg > s.lastSeg) {
        s.times[seg] = now
        s.lastSeg = seg
      }
    } else if (seg > s.prevSeg) {
      // ④ 同一圈内越过若干段界：在相邻两帧之间按 spline 线性插值出跨线时刻
      for (let j = s.prevSeg + 1; j <= seg; j++) {
        // ⚠️ 本圈**已经跨过**的段界不覆盖：维修区来回 / 倒车会把 spline 往回带，
        // 覆盖会让跨线时刻越来越晚（名次假性下滑、秒差假性变大），也会破坏"只增不减"的名次键。
        if (j <= s.lastSeg) continue
        const p = j / segments
        const f = dSpan > 0 ? (p - s.prevSpline) / dSpan : 0
        s.times[j] = s.prevAt + (now - s.prevAt) * Math.min(1, Math.max(0, f))
        s.lastSeg = Math.max(s.lastSeg, j)
      }
    }
  }

  s.prevSpline = sc
  s.prevSeg = seg
  s.prevAt = now
}

/**
 * 某车"最近一次跨过的段界线"的**绝对序号**：`圈数 × 段数 + 段号`（单调递增、跨车可比）。
 * 返回 `null` = 本圈还没跨过任何段界（发车头几秒、刚过线那一拍、刚换赛节）。
 */
export function lastCrossingIndex(s: SegTable, segments = s.times.length): number | null {
  if (s.lastSeg < 0) return null
  return s.lap * segments + s.lastSeg
}

/**
 * 取"绝对序号 = g"那条段界线的跨线时刻：落在本圈就读 `times`，落在上一圈就读 `prevTimes`。
 * 返回 `null` = 这辆车**没有**跨过那条界线（或那一圈的存档已经不在了）。
 */
function crossingTimeAt(s: SegTable, g: number, segments: number): number | null {
  const seg = g - s.lap * segments
  if (seg >= 0) {
    if (seg > s.lastSeg) return null
    const t = s.times[seg]
    return Number.isFinite(t) ? t : null
  }
  if (s.prevLap < 0) return null
  const prevSeg = g - s.prevLap * segments
  if (prevSeg < 0 || prevSeg >= segments) return null
  const t = s.prevTimes[prevSeg]
  return Number.isFinite(t) ? t : null
}

/**
 * 两车在**同一条"双方都跨过"的最近段界线**上的时刻差。
 *
 * 判"是不是同圈"用的是**绝对跨线序号之差**，不是"已完成圈数相等"：
 *   · `|G_我 − G_他| < 段数`（差不到一整圈）→ 同圈，正常算秒差。
 *     前车刚冲线、我还差一点冲线时 `G` 只差 1，秒差照样算得出来（它靠 `prevTimes` 里上一圈的界线）。
 *   · `>= 段数`（差了一整圈以上）→ 真的不是同圈（被套圈 / 套别人圈）→ `null`，界面显示 `+N Lap`。
 *
 * @returns 毫秒。**正 = other 更早跨过同一个点 = other 在前**（与排行榜"排在我前面为正"的约定一致）；
 *          还没共同跨过任何段界 / 差一整圈以上 → `null`（界面显示 `--`）。
 */
export function gapFromSegTable(me: SegTable, other: SegTable): number | null {
  const segments = me.times.length
  if (segments === 0 || other.times.length !== segments) return null
  const gMe = lastCrossingIndex(me, segments)
  const gOther = lastCrossingIndex(other, segments)
  if (gMe == null || gOther == null) return null
  if (Math.abs(gMe - gOther) >= segments) return null
  const k = Math.min(gMe, gOther)
  const mine = crossingTimeAt(me, k, segments)
  const theirs = crossingTimeAt(other, k, segments)
  if (mine == null || theirs == null) return null
  return mine - theirs
}

/**
 * 正赛名次的排序键（**按跨线顺序**，不看游戏广播的名次）：
 *   ① `lap`  —— 已完成圈数（多者前）；
 *   ② `seg`  —— 本圈**跨过的最后一条段界**（靠后者前，只增不减）；
 *   ③ `crossAt` —— 跨那条段界的**时刻**（早者前）：同一条界线上的先后就是实测的先后。
 *
 * 一辆车在本圈还没跨过任何段界时返回 `null`（发车头几秒、刚换圈那一拍、换赛节后），
 * 调用方应让它排在"有跨线记录的车"后面、并沿用广播名次的相对顺序（见 `acc-broadcast.ts`）。
 */
export interface RaceOrder {
  lap: number
  seg: number
  crossAt: number
}

export function raceOrderOf(seg: SegTable): RaceOrder | null {
  if (seg.lastSeg < 0) return null
  const crossAt = seg.times[seg.lastSeg]
  if (!Number.isFinite(crossAt)) return null
  return { lap: seg.lap, seg: seg.lastSeg, crossAt }
}

/** 名次比较：负 = a 在前 */
export function compareRaceOrder(a: RaceOrder, b: RaceOrder): number {
  if (a.lap !== b.lap) return b.lap - a.lap
  if (a.seg !== b.seg) return b.seg - a.seg
  return a.crossAt - b.crossAt
}

/**
 * **有符号圈差**：正 = other 领先我 N 圈（他套我）；负 = 我领先 other N 圈（我套他）；0 = 同一圈。
 *
 * ⚠️ **不能只看圈数计数器**（`laps`）：**前车刚冲线时它的圈数会比我多 1，但两车其实只差几秒**
 * （等我过线就追平了）。所以这里要求"计数器圈差"与"进度差"**互相印证**：把进度差跟计数器圈差
 * 一比，只有两者一致（差 < 0.5 圈）才认这个圈差，否则当成"跨线那一拍"→ 返回 0（按同圈显示秒差）。
 *
 * 顺带解决的问题：**我贴着一辆落后一圈的车**（进度差 ≈ 0.97 圈、计数器差 1）也会稳定判成
 * "我领先它一圈"（界面显示 `-1 Lap`），而不是去算一个 ≈ −(一圈时间 − 实际间隔) 的大秒差 ——
 * 那种数值虽然"数学上没错"，但看着像故障，而且会随我在哪一段（1/30 圈）来回跳。
 */
export function signedLapDelta(input: {
  meLaps: number
  meProgress: number
  otherLaps: number
  otherProgress: number
}): number {
  const counter = input.otherLaps - input.meLaps
  if (counter === 0) return 0
  const raw = input.otherProgress - input.meProgress
  return Math.abs(raw - counter) < 0.5 ? counter : 0
}
