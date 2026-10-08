<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'
import { onTelemetrySample, useTelemetry } from '@/overlay/telemetry'
import { TyreImpactDetector } from '@/overlay/tyreImpact'
import { flashProgress } from '@/overlay/flash'

// ---------------------------------------------------------------------------
// 轮胎（竖版）：左右两条竖着的圆角矩形 = 左右轮胎
//   · 矩形底色 = 胎温色带（50 蓝 → 88 绿 → 99 黄 → 110 红），压暗一点让白字可读
//   · 胎温白字叠在矩形上方；前轮胎压显示在矩形上方、后轮在下方（无单位）
//   · 前后轴各自的横向中间：两个细长方块 = 两条刹车片温度（各自按自身温度上色），
//     组平均温度显示在一侧、padLife 百分比显示在另一侧（定标：实测新车 29 = 100%）
//   · 正中间一行：胎种 + 轮胎编号（DRY 3）
//   · 每个轮胎外侧一条 6px 滑移槽（满槽 2.00 / ≥1.60 转红）
//   · 受冲击掉胎压：命中瞬间该轮胎叠一层红色圆角覆盖（连胎温一起盖住），
//     先保持完整红色 0.5s，再用 1s 渐隐回原色，同时胎压数字由红渐变回白色；
//     前轮矩形下方 / 后轮矩形上方用黄色显示该轮胎累计掉掉的胎压（初始 0.00）
// 数据来源与字节偏移见仓库根目录 ACC-遥测数据参考.md：
//   Physics 88/152/348（胎压 / 胎心温度 / 刹车温度）
//   Graphic 176 tyreCompound、1572 currentTyreSet（1.9 追加区，实测确认）
//   Physics 740 padLife[4]（1.9 追加区，实测确认）
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()
const hasData = computed(() => tm.active)

type Rgb = [number, number, number]
type Stop = [number, Rgb]

// 色带调色板（四个基准色，胎温与刹车温度共用）
const BLUE: Rgb = [37, 99, 235]
const GREEN: Rgb = [22, 163, 74]
const YELLOW: Rgb = [202, 138, 4]
const RED: Rgb = [220, 38, 38]

/**
 * 胎温色带（用户定）：≤50℃ 蓝 → 88℃ 绿 → 99℃ 黄 → ≥110℃ 红。
 * 50→88 蓝→绿、88→110 绿→黄→红，段内都是线性插值（rampRgb 逐段线性）。
 */
const TYRE_STOPS: Stop[] = [
  [50, BLUE],
  [88, GREEN],
  [99, YELLOW],
  [110, RED],
]
/**
 * 刹车片温度色带（用户定）：≤100℃ 蓝 → 400℃ 绿 → 650℃ 黄 → ≥950℃ 红。
 * 100→400 蓝→绿、400→650 绿→黄、650→950 黄→红，段内线性。
 */
const BRAKE_STOPS: Stop[] = [
  [100, BLUE],
  [400, GREEN],
  [650, YELLOW],
  [950, RED],
]

const NO_DATA = 'rgba(255, 255, 255, 0.10)'

function rampRgb(stops: Stop[], value: unknown): Rgb | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (value <= first[0]) return first[1]
  if (value >= last[0]) return last[1]
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i]
    const [v1, c1] = stops[i + 1]
    if (value <= v1) {
      const k = (value - v0) / (v1 - v0)
      return [
        c0[0] + (c1[0] - c0[0]) * k,
        c0[1] + (c1[1] - c0[1]) * k,
        c0[2] + (c1[2] - c0[2]) * k,
      ]
    }
  }
  return last[1]
}

const cssRgb = (c: Rgb) => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`

/** 胎温矩形：色带取色后压暗到 72%，保证上面的白字清晰 */
function tyreFillStyle(index: number) {
  if (!hasData.value) return { backgroundColor: NO_DATA }
  const rgb = rampRgb(TYRE_STOPS, tm.tyreCoreTemp?.[index])
  if (!rgb) return { backgroundColor: NO_DATA }
  return { backgroundColor: cssRgb(rgb.map(v => v * 0.72) as Rgb) }
}

function brakeBlockStyle(index: number) {
  if (!hasData.value) return { backgroundColor: NO_DATA }
  const rgb = rampRgb(BRAKE_STOPS, tm.brakeTemp?.[index])
  return { backgroundColor: rgb ? cssRgb(rgb) : NO_DATA }
}

const FRONT = [0, 1]
const REAR = [2, 3]

function fmt(value: unknown, digits: number, suffix = '') {
  if (!hasData.value || typeof value !== 'number' || !Number.isFinite(value)) {
    return `--${suffix}`
  }
  return value.toFixed(digits) + suffix
}

/** 胎压：无单位，一位小数 */
const pressures = computed(() => [0, 1, 2, 3].map(i => fmt(tm.tyrePressure?.[i], 1)))
/** 胎温：叠在矩形上，形如 80° */
const tyreTemps = computed(() => [0, 1, 2, 3].map(i => fmt(tm.tyreCoreTemp?.[i], 0, '°')))

function pick(values: number[] | null | undefined, indexes: number[]) {
  if (!hasData.value || !Array.isArray(values)) return []
  return indexes
    .map(i => values[i])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
}

/** 组平均刹车温度，形如 800° */
function groupBrakeTemp(indexes: number[]) {
  const values = pick(tm.brakeTemp, indexes)
  if (!values.length) return '--°'
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length) + '°'
}

/**
 * 刹车片剩余寿命：实车实测 padLife 是「厚度」量级，游戏内按百分比展示
 * （新车四轮 29.000002 ≈ 100%，同车 discLife = 32.0 而游戏内盘寿命显示 99%）。
 * 按用户定的口径定标：**29 = 100%**，见参考文档 §1.2.2。
 */
const PAD_LIFE_FULL = 29

function groupPadLife(indexes: number[]) {
  const values = pick(tm.padLife, indexes)
  if (!values.length) return '--%'
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  if (!Number.isFinite(avg) || avg < 0 || avg > 200) return '--%'
  const pct = Math.round((avg / PAD_LIFE_FULL) * 100)
  return Math.min(100, Math.max(0, pct)) + '%'
}

/** 组平均刹车寿命文字（无数据为 --%） */
const frontPad = computed(() => groupPadLife(FRONT))
const rearPad = computed(() => groupPadLife(REAR))

/** DRY / WET：看胎种名里有没有 wet（Graphic tyreCompound，偏移 176） */
const isWet = computed(() => (tm.compound || '').toLowerCase().includes('wet'))

/**
 * 胎种 + 胎套编号：形如 `DRY 3`。
 * ⚠️ 雨胎时游戏里 `currentTyreSet` 恒为 0（雨胎没有编号可言），所以只显示 `WET`、不带数字。
 */
const compoundText = computed(() => {
  if (!hasData.value || !tm.compound) return '--'
  if (isWet.value) return 'WET'
  return `DRY ${tm.tyreSet != null ? tm.tyreSet : '--'}`
})

// ---------- 滑移槽（Physics 56 wheelSlip[FL,FR,RL,RR]）----------
// 刻度由用户指定：**满槽 2.00、达到 1.60 整条填充转红**。
// 参考实测（2026-10，见 ACC-遥测数据参考.md §1.2.2）：
//   · 静止/慢速 0.005~0.035，p90 ≤0.05 —— 平路巡航时槽几乎是空的；
//   · 重刹锁死峰值 FR 12.783 / FL 12.290，出弯空转峰值 RR 6.694 / RL 6.553
//     —— 都远超 2.00，所以真打滑时会直接顶满并变红。
const SLIP_FULL = 2
const SLIP_RED = 1.6
const SLIP_COLOR = '#ffffff'
const SLIP_RED_COLOR = '#ef4444'

/** 滑移填充：高度 = 滑移量 / SLIP_FULL，超过阈值整条转红 */
function slipFillStyle(index: number) {
  const slip = tm.wheelSlip?.[index]
  if (!hasData.value || typeof slip !== 'number' || !Number.isFinite(slip)) {
    return { height: '0%' }
  }
  const pct = Math.min(1, Math.max(0, slip / SLIP_FULL))
  return {
    height: `${pct * 100}%`,
    backgroundColor: slip >= SLIP_RED ? SLIP_RED_COLOR : SLIP_COLOR,
  }
}

/**
 * 刹车片型号：Physics 732/736（frontBrakeCompound / rearBrakeCompound），形如 BRAKE 3/1。
 * ⚠️ 共享内存里是 **0 起编号**，而游戏 MFD 显示的是 **1 起**（实测：MFD 显示 2/2 时原始值是 1/1；
 * MFD 显示 3/1 时原始值是 2/0），所以这里要 +1 才能和游戏里看到的一致。
 */
const brakeCompoundText = computed(() => {
  if (!hasData.value) return 'BRAKE -/-'
  const front = tm.brakeCompoundFront
  const rear = tm.brakeCompoundRear
  if (front == null || rear == null) return 'BRAKE -/-'
  return `BRAKE ${front + 1}/${rear + 1}`
})

// ---------- 受冲击掉胎压（Physics 88 wheelsPressure 的变化）----------
// ACC 没有"轮胎损伤/漏气"字段（tyreWear 120 / tyreDirtyLevel 136 都是官方标注
// 不使用、实测恒 0），所以按用户口径盯胎压本身：瞬时掉 ≥0.01 psi 记一次冲击，
// 累计值展示在轮胎矩形旁；暂停（数据断流）后的跳变不计入，任一轮胎变化 >1.00 psi
// 就整体清零。检测逻辑在 @/overlay/tyreImpact.ts（纯逻辑，带单测）。
const impactDetector = new TyreImpactDetector()
/** 每个轮胎累计掉掉的胎压（psi），黄色两位小数展示 */
const impactLost = ref<number[]>([0, 0, 0, 0])
/** 渐变进度：0 = 刚命中（全红），1 = 已回到原色 */
const impactProgress = ref<number[]>([1, 1, 1, 1])
/** 每个轮胎最近一次冲击的时刻（performance.now 口径） */
const impactFlashAt = [-Infinity, -Infinity, -Infinity, -Infinity]
/** 渐变时长：命中后先保持"完整红色"0.8s，再用 1.3s 渐隐回原色（用户要求） */
const IMPACT_HOLD_MS = 800
const IMPACT_FADE_MS = 1300
const IMPACT_COLOR: Rgb = [239, 68, 68]
const PRESSURE_COLOR: Rgb = [255, 255, 255]
let impactRaf = 0

function mixRgb(from: Rgb, to: Rgb, t: number) {
  const k = Math.min(1, Math.max(0, t))
  return `rgb(${Math.round(from[0] + (to[0] - from[0]) * k)}, ${Math.round(
    from[1] + (to[1] - from[1]) * k,
  )}, ${Math.round(from[2] + (to[2] - from[2]) * k)})`
}

/** 命中瞬间的红色覆盖（圆角矩形，盖住胎温数值）不透明度：1 → 0 */
const impactOpacity = (index: number) => 1 - impactProgress.value[index]
/** 胎压数字颜色：红 → 原色（白色），只改文字颜色，不遮挡 */
const pressureColor = (index: number) =>
  mixRgb(IMPACT_COLOR, PRESSURE_COLOR, impactProgress.value[index])
/** 累计掉压：形如 0.05（初始 0.00） */
const impactText = computed(() => impactLost.value.map(v => v.toFixed(2)))

function stepImpactFade() {
  impactRaf = 0
  const now = performance.now()
  let active = false
  for (let i = 0; i < 4; i++) {
    // 前 0.8s 保持完整红色（progress = 0），之后 1.3s 线性回到原色（progress → 1）。
    // 没被冲击过的轮胎 impactFlashAt 是 -Infinity，flashProgress 对非有限时间返回 1
    // （已复原）—— 绝不能返回 0，否则判据一响，四个轮胎会一起变红并卡住。
    const p = flashProgress(now - impactFlashAt[i], IMPACT_HOLD_MS, IMPACT_FADE_MS)
    if (impactProgress.value[i] !== p) impactProgress.value[i] = p
    if (p < 1) active = true
  }
  // 全部回到原色就停掉 rAF，不空转
  if (active) impactRaf = requestAnimationFrame(stepImpactFade)
}

let unsubSample: (() => void) | undefined

onMounted(() => {
  // 逐样本（~60Hz）盯胎压：曲线那套 reactive 只保留最新值，抓不到瞬时跌落
  unsubSample = onTelemetrySample(snapshot => {
    if (!snapshot.active) return
    const now = performance.now()
    const fired = impactDetector.push(snapshot.tyrePressure, now)
    const lost = impactDetector.lost
    for (let i = 0; i < 4; i++) {
      if (impactLost.value[i] !== lost[i]) impactLost.value[i] = lost[i]
    }
    if (!fired.length) return
    for (const i of fired) {
      impactFlashAt[i] = now
      impactProgress.value[i] = 0
    }
    if (!impactRaf) impactRaf = requestAnimationFrame(stepImpactFade)
  })
})

onBeforeUnmount(() => {
  unsubSample?.()
  if (impactRaf) {
    cancelAnimationFrame(impactRaf)
    impactRaf = 0
  }
})
</script>

<template>
  <BaseOverlayTemplate v-bind="$attrs" :item="item">
    <div class="tyres">
      <!-- 前轴：胎压在矩形上方（受冲击时数字由红渐变回白色） -->
      <div class="pressure is-fl" :style="{ color: pressureColor(0) }">
        {{ pressures[0] }}
      </div>
      <div class="pressure is-fr" :style="{ color: pressureColor(1) }">
        {{ pressures[1] }}
      </div>

      <!-- 前轴：每个轮胎外侧（远离车身中线）是一条 6px 滑移槽 -->
      <div class="tyre-cell is-fl">
        <div class="slip"><div class="slip-fill" :style="slipFillStyle(0)"></div></div>
        <div class="tyre" :style="tyreFillStyle(0)">
          <span class="temp">{{ tyreTemps[0] }}</span>
          <!-- 冲击掉压：红色圆角覆盖（连胎温一起盖住），先满红 0.5s 再用 1s 渐隐 -->
          <div class="impact" :style="{ opacity: impactOpacity(0) }"></div>
        </div>
        <!-- 累计因冲击掉掉的胎压（黄色，前轮矩形下方） -->
        <div class="loss is-front">{{ impactText[0] }}</div>
      </div>
      <div class="tyre-cell is-fr">
        <div class="slip"><div class="slip-fill" :style="slipFillStyle(1)"></div></div>
        <div class="tyre" :style="tyreFillStyle(1)">
          <span class="temp">{{ tyreTemps[1] }}</span>
          <div class="impact" :style="{ opacity: impactOpacity(1) }"></div>
        </div>
        <div class="loss is-front">{{ impactText[1] }}</div>
      </div>

      <!-- 前刹车组：组平均温度 / 两个方块 / padLife -->
      <div class="brakes is-front">
        <div class="group-temp">{{ groupBrakeTemp(FRONT) }}</div>
        <div class="blocks">
          <div
            v-for="i in FRONT"
            :key="i"
            class="block"
            :style="brakeBlockStyle(i)"
          ></div>
        </div>
        <div class="pad">{{ frontPad }}</div>
      </div>

      <!-- 正中间：胎种 + 胎套编号（雨胎只显示 WET），下面一行灰色小字是刹车片型号（前/后） -->
      <div class="center">
        <div class="compound">{{ compoundText }}</div>
        <div class="brake-compound">{{ brakeCompoundText }}</div>
      </div>

      <!-- 后轴 -->
      <div class="tyre-cell is-rl">
        <div class="slip"><div class="slip-fill" :style="slipFillStyle(2)"></div></div>
        <div class="tyre" :style="tyreFillStyle(2)">
          <span class="temp">{{ tyreTemps[2] }}</span>
          <div class="impact" :style="{ opacity: impactOpacity(2) }"></div>
        </div>
        <!-- 累计掉压（后轮矩形上方） -->
        <div class="loss is-rear">{{ impactText[2] }}</div>
      </div>
      <div class="tyre-cell is-rr">
        <div class="slip"><div class="slip-fill" :style="slipFillStyle(3)"></div></div>
        <div class="tyre" :style="tyreFillStyle(3)">
          <span class="temp">{{ tyreTemps[3] }}</span>
          <div class="impact" :style="{ opacity: impactOpacity(3) }"></div>
        </div>
        <div class="loss is-rear">{{ impactText[3] }}</div>
      </div>

      <!-- 后刹车组：padLife / 两个方块 / 组平均温度（整组与后轴镜像） -->
      <div class="brakes is-rear">
        <div class="pad">{{ rearPad }}</div>
        <div class="blocks">
          <div
            v-for="i in REAR"
            :key="i"
            class="block"
            :style="brakeBlockStyle(i)"
          ></div>
        </div>
        <div class="group-temp">{{ groupBrakeTemp(REAR) }}</div>
      </div>

      <div class="pressure is-rl" :style="{ color: pressureColor(2) }">
        {{ pressures[2] }}
      </div>
      <div class="pressure is-rr" :style="{ color: pressureColor(3) }">
        {{ pressures[3] }}
      </div>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
.tyres {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  grid-template-rows: auto 74px auto 74px auto;
  /* 左右轮列与中间刹车列的间距：用户要求"轮胎矩形离中间的刹车近一点"（原来 10px 太远） */
  column-gap: 4px;
  row-gap: 3px;
  padding: 8px;
  box-sizing: border-box;
  color: #fff;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

/* ---- 网格定位：左右车轮列 + 中间刹车列 ---- */
.is-fl {
  grid-column: 1;
}
.is-fr {
  grid-column: 3;
}
.pressure.is-fl,
.pressure.is-fr {
  grid-row: 1;
}
.tyre-cell.is-fl,
.tyre-cell.is-fr {
  grid-row: 2;
}
.brakes.is-front {
  grid-column: 2;
  grid-row: 1 / 3;
}
.center {
  grid-column: 1 / 4;
  grid-row: 3;
}
.tyre-cell.is-rl,
.tyre-cell.is-rr {
  grid-row: 4;
}
.brakes.is-rear {
  grid-column: 2;
  grid-row: 4 / 6;
}
.pressure.is-rl,
.pressure.is-rr {
  grid-row: 5;
}

/* ---- 轮胎格：外侧一条 6px 滑移槽 + 轮胎矩形 ---- */
.tyre-cell {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 2px;
  /* 整体比栅格列略窄一点：与 column-gap 一起决定"矩形 ↔ 中间刹车"的间距（现在 2+4=6px） */
  margin: 0 2px;
}
/* 槽永远在"车外侧"：左侧两个轮子槽在左，右侧两个轮子槽在右 */
.tyre-cell.is-fl,
.tyre-cell.is-rl {
  flex-direction: row;
}
.tyre-cell.is-fr,
.tyre-cell.is-rr {
  flex-direction: row-reverse;
}

/* 滑移槽：灰色底（不深），填充白色，超阈值转红 */
.slip {
  flex: none;
  width: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.22);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  position: relative;
  overflow: hidden;
}
.slip-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}

/* ---- 轮胎 ---- */
.tyre {
  position: relative;
  flex: 1;
  min-width: 0;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}
.temp {
  position: absolute;
  top: 5px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 19px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.pressure {
  text-align: center;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.2;
  opacity: 0.92;
}

/* 冲击掉压命中瞬间的红色圆角覆盖：盖住整块矩形（含胎温数字），0.6s 渐隐 */
.impact {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: #ef4444;
  pointer-events: none;
}

/* 累计因冲击掉掉的胎压：黄色、比胎压小一号且不加粗
   （前轮矩形下方 / 后轮矩形上方）
   位置贴各自轮胎格的**外沿**：中间那行还可能显示两位数胎套编号（DRY 50 / WET 12），
   累计值贴在格子里居中会跟它撞上，所以左边两个靠左、右边两个靠右 */
.loss {
  position: absolute;
  width: 40px;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.2;
  color: #f5c400;
  white-space: nowrap;
  pointer-events: none;
}
.tyre-cell.is-fl .loss,
.tyre-cell.is-rl .loss {
  left: 0;
  text-align: left;
}
.tyre-cell.is-fr .loss,
.tyre-cell.is-rr .loss {
  right: 0;
  text-align: right;
}
.loss.is-front {
  top: calc(100% + 1px);
}
.loss.is-rear {
  bottom: calc(100% + 1px);
}

/* ---- 刹车片组 ---- */
.brakes {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.blocks {
  display: flex;
  gap: 4px;
}
.block {
  width: 9px;
  height: 34px;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}
.group-temp {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.1;
}
.pad {
  font-size: 14px;
  line-height: 1.1;
  opacity: 0.78;
  white-space: nowrap;
}

/* ---- 中间一行 ---- */
.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.compound {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
  line-height: 1.15;
}
/* 刹车片型号：灰色小字（颜色与字重保持不变，只放大字号） */
.brake-compound {
  font-size: 13px;
  font-weight: 400;
  line-height: 1.2;
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
}
</style>
