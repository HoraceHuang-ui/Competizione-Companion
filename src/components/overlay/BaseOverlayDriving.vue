<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'
import { onTelemetrySample, useTelemetry } from '@/overlay/telemetry'

// ---------------------------------------------------------------------------
// 行驶状态：油门/刹车曲线 + 刹车/油门开度槽 + 车速/挡位/转速/转向
//
// 数据来自 ACC 共享内存 Physics（官方示例 SharedFileOut.h，`#pragma pack(4)`）：
//   gas / brake ∈ [0,1]（官方 PDF："from -0 to 1.0"）
//   steerAngle ∈ [-1,1]（官方 PDF："from -1.0 to 1.0"，所以直接 ×100 就是百分比）
//   speedKmh、rpms、gear（AC 惯例：0=R、1=N、2..=1 挡..）
//   tc(204) / abs(252)：**是否正在介入** 的 0/1 标志（不是档位，档位在 Graphic 1268/1280）
// 介入色：TC 介入时油门槽与油门曲线那段由绿线性过渡到黄；ABS 介入时刹车槽与刹车曲线那段由红过渡到蓝。
// 图表横轴固定 **6 秒**（按时间映射，不是按样本数）；遥测停更时画面自动冻结在最后一帧。
// 数据通道见 src/overlay/telemetry.ts —— 组件自己订阅，宿主不需要知道。
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()

/** 图表横轴时间窗：按需求固定 6 秒（按时间而不是样本数——主进程会丢掉内容没变的帧，样本率并不恒定） */
const CHART_WINDOW_MS = 6000
/** 曲线线宽（按需求固定 4px），并且不做任何平滑 */
const CHART_LINE_WIDTH = 4

/** 一个样本：时间戳（performance.now，单调）+ 油门/刹车/转向 + 介入值 */
interface ChartSample {
  t: number
  gas: number
  brake: number
  /** 转向输入（-1..1 的比值；正 = 往左打） */
  steer: number
  tc: number
  abs: number
}

/**
 * 转向曲线的颜色（灰色）与朝向：
 * `steerAngle` 官方定义是 **-1.0..1.0 的比值**（不是角度），所以极值就用它的最大值 1.0 ——
 * 曲线向上 = 往左打、向下 = 往右打。若实车发现左右相反，把下面这个常量改成 false 即可。
 */
const STEER_COLOR = 'rgba(255, 255, 255, 0.55)'
/**
 * 方向条的方向：**往上 = 往左打**（用户实测反馈：原来写成 true 时"往右打会向上"，即反了）。
 * 判据来自实机 —— 官方 `steerAngle` 正值代表往右，而曲线要往上表示往左，所以这里取 -1 的系数。
 */
const STEER_UP_IS_LEFT = false

// 介入取色：把 tc / abs 的值当 0..1 的比例做线性过渡。
// 实测（2026-10，Physics 204/252）这两个字段在游戏里只出现过 0 与 1，
// 所以今天的效果就是"绿↔黄""红↔蓝"两态；但按比例插值能让中间值（若有）自然过渡。
type Rgb = [number, number, number]
const GAS_RGB: Rgb = [34, 197, 94]        // #22c55e
const GAS_TC_RGB: Rgb = [245, 196, 0]     // #f5c400（TC 介入）
const BRAKE_RGB: Rgb = [239, 68, 68]      // #ef4444
const BRAKE_ABS_RGB: Rgb = [59, 130, 246] // #3b82f6（ABS 介入）
/** 过渡量化档数：只用于"分段批处理"的键，避免每个样本都换一次颜色导致描边次数爆炸 */
const RAMP_STEPS = 16

function mixRgb(from: Rgb, to: Rgb, t: number) {
  const k = Math.min(1, Math.max(0, t))
  const c = from.map((v, i) => Math.round(v + (to[i] - v) * k))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

const quantize = (v: number) =>
  Math.round(Math.min(1, Math.max(0, v)) * RAMP_STEPS) / RAMP_STEPS

/** 油门：0 → 绿，1 → 黄 */
const gasColor = (tc: number) => mixRgb(GAS_RGB, GAS_TC_RGB, quantize(tc))
/** 刹车：0 → 红，1 → 蓝 */
const brakeColor = (abs: number) => mixRgb(BRAKE_RGB, BRAKE_ABS_RGB, quantize(abs))

const canvasRef = ref<HTMLCanvasElement | null>(null)
/** 只保留 6 秒窗口内的样本；右边缘用"最后一个样本的时间"，所以停更时画面自动冻结 */
const samples: ChartSample[] = []
let rafId = 0

function drawChart() {
  rafId = 0
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  // 50% 参考线
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, Math.round(h / 2) + 0.5)
  ctx.lineTo(w, Math.round(h / 2) + 0.5)
  ctx.stroke()

  const count = samples.length
  if (count < 2) return

  // 横轴 = 6 秒：最新样本贴右边缘，越旧越靠左（按时间映射，样本疏密不影响）
  const lastT = samples[count - 1].t
  const xAt = (t: number) => w - ((lastT - t) / CHART_WINDOW_MS) * w
  /**
   * 纵向绘制区内缩半个线宽：否则 v=1 时线的中心落在 y=0，4px 的线会被画布边缘裁掉一半
   * （0% 同理，只剩 2px）。内缩后 100% 也能看到完整线宽，0.5 仍正好落在中线上。
   */
  const pad = CHART_LINE_WIDTH / 2
  const plotH = h - CHART_LINE_WIDTH
  const yAt = (v: number) => pad + (1 - Math.min(1, Math.max(0, v))) * plotH
  /** 转向曲线：以中线为零点，±1（比值极值）占满上下各一半；向上 = 往左打 */
  const steerY = (steer: number) => {
    const v = Math.min(1, Math.max(-1, steer)) * (STEER_UP_IS_LEFT ? 1 : -1)
    return h / 2 - v * (plotH / 2)
  }

  /** 描边一段连续样本；yOf 决定画到哪一行（油门/刹车用开度，转向用中线±） */
  const strokeRun = (
    yOf: (s: ChartSample) => number,
    from: number,
    to: number,
    color: string,
  ) => {
    ctx.strokeStyle = color
    ctx.lineWidth = CHART_LINE_WIDTH
    // 不做平滑：折线直连
    ctx.lineJoin = 'miter'
    ctx.lineCap = 'butt'
    ctx.beginPath()
    for (let i = from; i <= to; i++) {
      const x = xAt(samples[i].t)
      const y = yOf(samples[i])
      if (i === from) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  /**
   * 逐点按"介入比例"分段描边：量化后颜色相同的连续样本合成一条路径，
   * 颜色一变就在该点收尾并从这里开一段新的（共享端点，接缝处连得上）。
   */
  const strokeTrace = (
    yOf: (s: ChartSample) => number,
    pickFlag: (s: ChartSample) => number,
    colorOf: (flag: number) => string,
  ) => {
    const colorAt = (i: number) => colorOf(pickFlag(samples[i]))
    let runStart = 0
    let runColor = colorAt(0)
    for (let i = 1; i < count; i++) {
      const color = colorAt(i)
      if (color === runColor) continue
      strokeRun(yOf, runStart, i, runColor)
      runStart = i
      runColor = color
    }
    strokeRun(yOf, runStart, count - 1, runColor)
  }

  // 转向：单色灰曲线，先画（让油门/刹车盖在上面）
  strokeRun(s => steerY(s.steer), 0, count - 1, STEER_COLOR)
  strokeTrace(s => yAt(s.brake), s => s.abs, brakeColor)
  strokeTrace(s => yAt(s.gas), s => s.tc, gasColor)
}

function scheduleDraw() {
  if (rafId) return
  rafId = window.requestAnimationFrame(drawChart)
}

let unsubSample: (() => void) | undefined

onMounted(() => {
  // 曲线要逐个样本画，不能走 Vue 的批处理（否则会丢样本）
  unsubSample = onTelemetrySample(snapshot => {
    // 停更时主进程不再推数据；万一收到 active:false 也不清空曲线，保持最后一帧
    if (!snapshot.active) return
    const t = performance.now()
    samples.push({
      t,
      gas: snapshot.gas,
      brake: snapshot.brake,
      steer: snapshot.steer,
      tc: snapshot.tc,
      abs: snapshot.abs,
    })
    // 丢掉 6 秒窗口外的样本（多留一个，保证折线接到左边缘）
    const cutoff = t - CHART_WINDOW_MS
    while (samples.length > 1 && samples[1].t < cutoff) samples.shift()
    scheduleDraw()
  })
  scheduleDraw()
})

onBeforeUnmount(() => {
  unsubSample?.()
  if (rafId) window.cancelAnimationFrame(rafId)
})

// ---------- 读数 ----------

const hasData = computed(() => tm.active)
const gasPct = computed(() => Math.round(tm.gas * 100))
const brakePct = computed(() => Math.round(tm.brake * 100))

/** TC / ABS 是否正在介入（Physics 204 / 252）——决定开度槽用不用介入色（按比例过渡） */
const tcActive = computed(() => hasData.value && tm.tc > 0)
const absActive = computed(() => hasData.value && tm.abs > 0)
/** 开度槽颜色：按介入值线性过渡（0 → 绿/红，1 → 黄/蓝） */
const gasSlotColor = computed(() => gasColor(hasData.value ? tm.tc : 0))
const brakeSlotColor = computed(() => brakeColor(hasData.value ? tm.abs : 0))

/** 限速器开启（Physics 248 = 1）：右下角转速位置改成 PIT LIMIT 提示，转速直接藏掉（用户要求） */
const pitLimiterOn = computed(() => hasData.value && tm.pitLimiterOn === 1)

const speedText = computed(() =>
  hasData.value ? String(Math.round(tm.speedKmh)) : '--',
)
const rpmText = computed(() =>
  hasData.value ? String(Math.round(tm.rpms)) : '--',
)

/** steerAngle 是 -1..1 的归一化输入 → 直接就是百分比 */
const steerPct = computed(() =>
  hasData.value
    ? Math.max(-100, Math.min(100, Math.round(tm.steer * 100)))
    : null,
)
/** 转向只留指示条，不再显示百分比文字 */
/** 竖向转向条：以中线为基准，向上（往左打）或向下（往右打）填，满量程占一半高度 */
/**
 * 右侧方向槽：从**中间**向一侧长，长度 = |转向|/2（最大 ±100% → 半格）。
 * 方向必须和图表一致（用户实测反馈：原来"往右打向上"，反了）：
 *   · 往左（steer < 0，`steerAngle` 负值）→ 从中间**往上**长
 *   · 往右（steer > 0）→ 从中间**往下**长
 */
const steerFillStyle = computed(() => {
  const pct = steerPct.value
  if (pct === null || pct === 0) return { height: '0%' }
  const half = `${Math.abs(pct) / 2}%`
  return pct > 0 ? { top: '50%', height: half } : { bottom: '50%', height: half }
})

/** gear：AC 惯例 0=R、1=N、2..=1 挡.. */
const gearText = computed(() => {
  if (!hasData.value) return '--'
  const gear = tm.gear
  if (gear === 0) return 'R'
  if (gear === 1) return 'N'
  if (gear >= 2) return String(gear - 1)
  return '--'
})
</script>

<template>
  <BaseOverlayTemplate v-bind="$attrs" :item="item">
    <div class="driving">
      <!-- 左：油门（绿，TC 介入转黄）/ 刹车（红，ABS 介入转蓝）随实时时间滚动的曲线 -->
      <canvas ref="canvasRef" class="chart"></canvas>

      <!-- 刹车开度槽（ABS 介入时按比例由红转蓝；刻度数字已去掉，曲线里的 50% 参考线保留） -->
      <div class="slot">
        <div
          class="fill"
          :style="{ height: `${brakePct}%`, backgroundColor: brakeSlotColor }"
        ></div>
      </div>

      <!-- 油门开度槽（TC 介入时按比例由绿转黄） -->
      <div class="slot">
        <div
          class="fill"
          :style="{ height: `${gasPct}%`, backgroundColor: gasSlotColor }"
        ></div>
      </div>

      <!-- 转向条：竖的（高度与两个开度槽一致），贴着开度槽右边；以中线为基准，
           向上填 = 往左打、向下填 = 往右打（曲线同理） -->
      <div class="steer-slot">
        <div class="steer-fill" :style="steerFillStyle"></div>
      </div>

      <!-- 右：纵向排列 车速 / 挡位 / 转速（整体靠左紧凑些，但保持右对齐） -->
      <div class="readouts">
        <div class="line">
          <span class="val speed">{{ speedText }}</span>
        </div>
        <div class="gear">{{ gearText }}</div>
        <div class="line">
          <span v-if="!pitLimiterOn" class="val rpm">{{ rpmText }}</span>
        <span v-else class="pit-limit">PIT<br />LIMIT</span>
        </div>
      </div>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
.driving {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  gap: 6px;
  padding: 6px 8px;
  box-sizing: border-box;
  color: #fff;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

.chart {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: block;
}

/* 0-100 刻度已按要求去掉 */

.slot {
  flex: none;
  position: relative;
  width: 18px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 3px;
  overflow: hidden;
}
/* 开度槽的底色现在由脚本按介入比例给出（绿→黄 / 红→蓝），所以这里只留形状 */
.fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
}

.readouts {
  flex: none;
  /* 把横向转向条挪走之后，读数块收窄、靠左紧凑一些（数字仍右对齐） */
  width: 62px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  text-align: right;
}
.line {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 3px;
}
.val {
  line-height: 1;
}
/* 车速：最大最醒目 */
.val.speed {
  font-size: 23px;
  font-weight: 700;
}
/* 转速：不加粗、比车速小 */
/* 限速提示：黄底黑字、两行右对齐，占的正是转速那一格 */
.pit-limit {
  display: inline-block;
  background: #facc15;
  color: #000000;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: 0.5px;
  text-align: right;
  white-space: nowrap;
}
.val.rpm {
  font-size: 14px;
  font-weight: 400;
  opacity: 0.9;
}
.gear {
  font-size: 42px;
  font-weight: 700;
  line-height: 1;
  text-align: right;
}
/* 竖向转向条：宽度沿用原来横条的粗细（4px），高度与两个开度槽一致（一起被拉伸） */
.steer-slot {
  flex: none;
  position: relative;
  width: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}
.steer-fill {
  position: absolute;
  left: 0;
  right: 0;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.85);
}
</style>
