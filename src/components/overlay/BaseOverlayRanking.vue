<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'
import { onTelemetrySample, useTelemetry } from '@/overlay/telemetry'
import {
  DELTA_FULL_SECONDS,
  deltaFillRatio,
  deltaSignOf,
  driverCategoryOf,
  formatDeltaSeconds,
  formatLapShort,
  formatLapTimeMs,
  formatPlacement,
  predictLapMs,
} from '@/overlay/lapFormat'
import { flashProgress } from '@/overlay/flash'
import {
  advanceStint,
  createStintState,
  formatStintTime,
  type StintState,
} from '@/overlay/stint'

// ---------------------------------------------------------------------------
// 排名&圈速
//   第一横排：[评级+车号 圆角矩形] [当前圈计时 MM:ss.000（加粗）] [delta 圆角矩形]
//     · 评级配色：AM 红底黑字 / SILVER 灰底白字 / PRO 白底黑字
//     · delta：正（更慢）红描边 2px + 深红底 + 浅红字 + 红色进度槽；负 绿描边 + 深绿底
//       + 浅绿字 + 绿色进度槽；0.5s 为满槽（>0.5s 恒满）
//   第二横排三竖排：
//     1) 组别（小字白） / 组别内名次 4/19（前一个数字加粗）/ 多组别时下面再一行总名次 6/30
//     2) Best / Last / Pred / Stint（左侧标签不加粗，右侧圈速/时间加粗）
//     3) Total 总圈数 / Stint 当前 stint 圈数（大字加粗 + 小字标签）
//
// 数据来源：
//   共享内存：Graphic position/completedLaps/iCurrentTime/iLastTime/iBestTime/iDeltaLapTime
//            + Static carModel/numCars（组别、总车数）
//   自己累计：Stint 驾驶时长 / Stint 圈数（官方那两个 stint 字段单人模式下是 -1000 哨兵，
//            且给的是"剩余额度"不是"已驾驶"，见 src/overlay/stint.ts）
//   ⚠️ 车号 / 评级 / 组别内名次 / 组别内车数 **共享内存里没有**，只能来自 UDP 广播
//      （ENTRY_LIST_CAR），目前恒为 null → 这几处按占位/隐藏处理，接上广播即自动有值。
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
const props = defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()
const hasData = computed(() => tm.active)

// ---------- 尺寸自适应（只增不减）----------
// 字号翻倍后固定默认尺寸容易装不下，所以内容层用 max-content + 居中，
// 挂载后量一次自然尺寸，只在装不下时把框撑开并回写（见 AGENTS.md 的约定）。
const contentRef = ref<HTMLElement | null>(null)
const attrs = useAttrs()

/** 不能声明 `commit` emit，否则 onCommit 会被 Vue 从 $attrs 摘掉（见 AGENTS.md） */
function requestCommit() {
  const handler = attrs.onCommit as
    | ((...args: unknown[]) => void)
    | Array<(...args: unknown[]) => void>
    | undefined
  if (Array.isArray(handler)) handler.forEach(fn => fn())
  else if (typeof handler === 'function') handler()
}

function fitToContent(mode: 'snap' | 'grow' = 'grow') {
  const el = contentRef.value
  if (!el) return
  const width = Math.ceil(el.offsetWidth)
  const height = Math.ceil(el.offsetHeight)
  if (width <= 0 || height <= 0) return
  let changed = false
  // 'snap'：挂载时把框贴合到内容（大了就缩小，免得四周留一圈空白）
  // 'grow'：运行中只增不减（内容变宽就撑开，绝不裁切，也不会赛中来回跳）
  const applyWidth = mode === 'snap' ? width !== props.item.baseWidth : width > props.item.baseWidth
  const applyHeight = mode === 'snap' ? height !== props.item.baseHeight : height > props.item.baseHeight
  if (applyWidth) {
    props.item.baseWidth = width
    changed = true
  }
  if (applyHeight) {
    props.item.baseHeight = height
    changed = true
  }
  if (changed) requestCommit()
}

onMounted(() => {
  // 挂载先"贴一次"（缩掉多余的留白），字体加载完再贴一次
  requestAnimationFrame(() => fitToContent('snap'))
  if (document.fonts?.ready) document.fonts.ready.then(() => fitToContent('snap'))
})

// ---------- 第一横排 ----------
/**
 * 评级（AM/SILVER/PRO）：广播侧字段，暂无 → 只影响车号矩形的配色。
 * 用户要求**去掉评级字样**（矩形里只留车号），所以这里不再渲染 AM/SILVER/PRO 文字。
 */
const category = computed(() => driverCategoryOf(tm.driverCategory))
const raceNumberText = computed(() =>
  tm.raceNumber != null && Number.isFinite(tm.raceNumber) ? String(tm.raceNumber) : null,
)

/** 当前圈计时（Graphic iCurrentTime，ms） */
const currentLapText = computed(() => formatLapTimeMs(hasData.value ? tm.iCurrentTime : null))

/** delta：值 + 符号（官方可能给绝对值+符号位，也可能直接给有符号值 → 见 deltaSignOf） */
const deltaSign = computed(() => deltaSignOf(hasData.value ? tm.deltaLapTimeMs : null, tm.deltaPositive))
const deltaPositive = computed(() => (deltaSign.value.faster ? 0 : 1))
const deltaText = computed(() =>
  formatDeltaSeconds(deltaSign.value.magnitudeMs, deltaPositive.value),
)
const deltaIsPositive = computed(() => !deltaSign.value.faster)
/**
 * 三种外观状态：
 *   · `zero`（含"没数据"）：深灰底 + 灰描边 + 灰字，**不带 +/-** —— 用户要求；
 *   · `plus`（更慢）：红；`minus`（更快）：绿。
 */
const deltaState = computed(() => {
  if (deltaSign.value.zero) return 'zero'
  return deltaSign.value.faster ? 'minus' : 'plus'
})
/** 进度槽：0.5s 满槽，按比例从左向右填（正负都用同一个方向） */
const deltaFillPercent = computed(() => {
  if (deltaSign.value.zero) return 0
  return deltaFillRatio(deltaSign.value.magnitudeMs, deltaPositive.value) * 100
})

// ---------- 第二横排 第一竖排：总排名 / 总车手数量 ----------
// 用户要求：**取消组别名称、组别内名次与组别车数**，只留总排名/总车手数量，并把字号加大
/**
 * 总车数：**优先实时在赛道上的车数** `activeCars`(Graphic 252) —— 它是唯一在每次实测里都对得上
 * 的来源（1/2/3/24 辆都对）；主进程算出的 `totalCarCount`（广播报名表 / 已知条目）兜底，
 * 最后才是 Static `numCars`。
 * ⚠️ 不能取三者最大值：实测广播 `ENTRY_LIST` 的车数有时是整个服务器的报名数
 * （场上 24 辆却报 54），取最大会显示成 `12/54`。
 */
const overallTotal = computed(() => {
  if (!hasData.value) return null
  return tm.activeCars ?? tm.totalCarCount ?? tm.numCars
})
const overallPlacement = computed(() =>
  formatPlacement(hasData.value ? tm.position : null, overallTotal.value),
)

// ---------- 第二横排 第二竖排：Best / Last / Pred / Stint ----------
const bestText = computed(() => formatLapShort(hasData.value ? tm.iBestTime : null))
const lastText = computed(() => formatLapShort(hasData.value ? tm.iLastTime : null))
/** Pred = 最快圈 + delta（实时算）；符号同样走 deltaSignOf（负数 delta 也算得对） */
const predText = computed(() =>
  formatLapShort(
    predictLapMs(
      hasData.value ? tm.iBestTime : null,
      hasData.value ? deltaSign.value.magnitudeMs : null,
      deltaPositive.value,
    ),
  ),
)

// ---------- 无效圈：整块红色覆盖闪烁（保持 0.5s → 0.5s 淡出）+ 当前圈计时红字 ----------
// 触发用"边沿"：只在 **有效 → 无效** 那一刻闪一次（挂载时已经是无效圈不闪）。
// 覆盖层用 position: fixed; inset: 0 —— 最近的 transform 祖先是基座的 .cc-overlay-scaler，
// 所以它正好铺满整个组件（背景与所有元素都在它下面），并跟着缩放（同「车损」组件的做法）。
/** 红色覆盖保持时长（用户要求 0.2s）；淡出 INVALID_FADE_MS 仍是 0.5s */
const INVALID_HOLD_MS = 200
const INVALID_FADE_MS = 500

/** 当前圈是否无效（0 = 无效；null/1 = 无效标志不可用或有效） */
const lapInvalid = computed(
  () => hasData.value && tm.isValidLap != null && (tm.isValidLap === 0 || tm.currentLapInvalid === true),
)

/** 0 = 刚变无效（整块纯红），1 = 已回到原样 */
const invalidProgress = ref(1)
const lapFlashOpacity = computed(() => 1 - invalidProgress.value)
let invalidAt = -Infinity
let invalidRaf = 0
let lastLapValid: boolean | null = null

function stepInvalidFade() {
  invalidRaf = 0
  const p = flashProgress(performance.now() - invalidAt, INVALID_HOLD_MS, INVALID_FADE_MS)
  if (invalidProgress.value !== p) invalidProgress.value = p
  if (p < 1) invalidRaf = requestAnimationFrame(stepInvalidFade)
}

// ---------- Stint ----------
// 时长：**直接用官方"还允许开多久"**（Graphic 1312 `DriverStintTimeLeft`，ms）。
// 实测哨兵值（此时整行隐藏，用户要求）：-1000 = N/A；65535000 ms（= 65535 s ≈ 18.2h）= "无限制"。
// 所以只接受"大于 0 且不超过 8 小时"的值（现实里 stint 上限最多几小时），其余一律隐藏。
// 圈数：官方没有"本 stint 已跑圈数"，仍由 stint.ts 自己累计。
const STINT_MAX_VALID_MS = 8 * 60 * 60 * 1000
const stintTimeText = computed(() => {
  if (!hasData.value) return ''
  const ms = tm.driverStintTimeLeft
  if (ms == null || !Number.isFinite(ms) || ms <= 0 || ms > STINT_MAX_VALID_MS) return ''
  return formatStintTime(ms)
})

const stint = ref<StintState>(createStintState())
let lastSampleAt = 0

const unsubSample = onTelemetrySample(snapshot => {
  if (!snapshot.active) return
  const now = performance.now()

  // 无效圈：只在"有效 → 无效"那一刻起一次红色覆盖闪烁
  const valid =
      snapshot.isValidLap == null && snapshot.currentLapInvalid == null
        ? null
        : snapshot.isValidLap !== 0 && snapshot.currentLapInvalid !== true
  if (valid != null) {
    if (lastLapValid === true && valid === false) {
      invalidAt = now
      invalidProgress.value = 0
      if (!invalidRaf) invalidRaf = requestAnimationFrame(stepInvalidFade)
    }
    lastLapValid = valid
  }

  const dtMs = lastSampleAt ? now - lastSampleAt : 0
  lastSampleAt = now
  stint.value = advanceStint(stint.value, {
    laps: snapshot.completedLaps,
    dtMs,
  })
})

onMounted(() => {
  lastSampleAt = 0
})

onBeforeUnmount(() => {
  unsubSample?.()
  if (invalidRaf) {
    cancelAnimationFrame(invalidRaf)
    invalidRaf = 0
  }
})

// ---------- 第二横排 第三竖排：总圈数 / stint 圈数 ----------
const totalLapsText = computed(() =>
  hasData.value && tm.completedLaps != null ? String(tm.completedLaps) : '--',
)
const stintLapsText = computed(() => (hasData.value ? String(stint.value.laps) : '--'))

// 运行中数字变宽（例如圈数 99→100、名次 9→10）时只往后撑，不缩小 ——
// 免得赛中组件一边跑一边变尺寸；缩多余的留白只在挂载时做（见上面的 fitToContent('snap')）
watch(
  [
    currentLapText,
    deltaText,
    bestText,
    lastText,
    predText,
    stintTimeText,
    totalLapsText,
    stintLapsText,
    overallPlacement,
  ],
  () => fitToContent('grow'),
  { flush: 'post' },
)
</script>

<template>
  <BaseOverlayTemplate v-bind="$attrs" :item="item">
    <div ref="contentRef" class="ranking">
      <!-- 用栅格保证"上排三个元素"与"下排三竖排"左边缘分别对齐：
           第 1 列 ↔ 车号矩形，第 2 列 ↔ 当前圈计时，第 3 列 ↔ delta -->
      <div class="grid">
        <!-- ===== 上排 ===== -->
        <!-- 车号（圆角矩形，仅颜色区分评级：AM 红底黑字 / SILVER 灰底白字 / PRO 白底黑字） -->
        <div class="cell">
          <div
            v-if="raceNumberText"
            class="chip"
            :class="`is-${category || 'unknown'}`"
          >
            <span class="number">{{ raceNumberText }}</span>
          </div>
        </div>

        <!-- 当前圈计时：无效圈时红字（新一圈开始 isValidLap 回到 1 就自动变白） -->
        <div class="cell">
          <span class="lap-current" :class="{ 'is-invalid': lapInvalid }">{{ currentLapText }}</span>
        </div>

        <!-- delta：正红 / 负绿；0.5s 满槽 -->
        <div class="cell">
          <div class="delta" :class="`is-${deltaState}`">
            <div class="delta-fill" :style="{ width: `${deltaFillPercent}%` }"></div>
            <span class="delta-value">{{ deltaText }}</span>
          </div>
        </div>

        <!-- ===== 下排第 1 竖排：只显示 总排名 / 总车手数量 =====
             （用户要求：取消组别名称、组别内名次与组别车数；名次数字与当前圈计时同号 32px，
               `/24` 再小一号 20px 并放在数字**正下方**、水平居中） -->
        <div class="cell col-place">
          <div class="place place-stacked">
            <span class="big">{{ overallPlacement ? overallPlacement.pos : '--' }}</span>
            <span class="of">{{ overallPlacement ? overallPlacement.of : '/--' }}</span>
          </div>
        </div>

        <!-- ===== 下排第 2 竖排：Best / Last / Pred / Stint ===== -->
        <div class="cell col-times">
          <div class="line"><span class="label">Best</span><span class="value">{{ bestText }}</span></div>
          <div class="line"><span class="label">Last</span><span class="value">{{ lastText }}</span></div>
          <div class="line"><span class="label">Pred</span><span class="value">{{ predText }}</span></div>
          <div v-if="stintTimeText" class="line">
            <span class="label">Stint</span><span class="value">{{ stintTimeText }}</span>
          </div>
        </div>

        <!-- ===== 下排第 3 竖排：Total / Stint 圈数（每块横排，两块纵排） ===== -->
        <div class="cell col-laps">
          <div class="lap-block">
            <span class="big">{{ totalLapsText }}</span><span class="small">Total</span>
          </div>
          <div class="lap-block">
            <span class="big">{{ stintLapsText }}</span><span class="small">Stint</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 无效圈的整块红色覆盖：保持 0.5s → 0.5s 淡出（覆盖所有元素，含背景） -->
    <div
      v-show="lapFlashOpacity > 0"
      class="lap-invalid-flash"
      :style="{ opacity: lapFlashOpacity }"
    ></div>
  </BaseOverlayTemplate>
</template>

<style scoped>
.ranking {
  /* 尺寸由内容决定（三列 max-content 栅格），在框里居中；框由脚本"只增不减"地贴合内容 */
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: max-content;
  height: max-content;
  box-sizing: border-box;
  /* 左右各留一点（用户要求）：四边等宽 16px，两侧 22px */
  padding: 16px 22px;
  color: #fff;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

/* 栅格：两排共用三列轨道 → 上排三元素与下排三竖排的左边缘自然对齐 */
.grid {
  display: grid;
  grid-template-columns: auto auto auto;
  justify-content: start;
  align-items: start;
  column-gap: 18px;
  row-gap: 8px;
}
.cell {
  min-width: 0;
}

/* 车号的圆角矩形（背景/文字色由评级类决定；不显示评级字样，车号横向居中）
   高度与 delta 矩形**显式一致**（30px）；宽度**固定**（用户要求：1/2 位数也不要变窄），
   49px = 3 位数在这套字号下的实际宽度（20px 粗体 37px + 左右各 6px） */
.chip {
  display: inline-flex;
  width: 49px;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 30px;
  padding: 0 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}
/* AM：红底黑字 */
.chip.is-am {
  background: #ef4444;
  color: #000;
}
/* SILVER(PRO-AM)：灰底白字 */
.chip.is-silver {
  background: #9ca3af;
  color: #fff;
}
/* PRO：白底黑字 */
.chip.is-pro {
  background: #ffffff;
  color: #000;
}
/* 车号加粗（矩形 30px 高，字号加大到 20px） */
.chip .number {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}

/* 当前圈计时：加粗、MM:ss.000（用户指定 32px）；无效圈时红字 */
.lap-current {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
}
.lap-current.is-invalid {
  color: #ef4444;
}

/* 无效圈的整块红色覆盖（position: fixed 的最近 transform 祖先是基座的 .cc-overlay-scaler，
   所以它正好铺满整个组件并跟着缩放；z-index 高于内容） */
.lap-invalid-flash {
  position: fixed;
  inset: 0;
  border-radius: 8px;
  background: #ef4444;
  z-index: 6;
  pointer-events: none;
}

/* delta 圆角矩形：0.5s 满槽；**唯一不放大字号**的内容（保持 14px）
   高度显式 30px、与车号矩形一致；**宽度铺满所在栅格列** —— 也就是"自适应到与下方
   圈数块里最宽的那个一样长"（列宽 = max(本列所有内容)），这样小 delta 的槽也看得清 */
.delta {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  min-width: 78px;
  padding: 0 8px;
  border-radius: 6px;
  border: 2px solid transparent;
  overflow: hidden;
  text-align: center;
}
/* 未填充时底色更深、delta 值更浅，填充槽与描边同色（且不加透明度，保证醒目） */
.delta.is-plus {
  border-color: #ef4444;
  background: #3d0b0b;
  color: #fee2e2;
}
.delta.is-minus {
  border-color: #22c55e;
  background: #062b14;
  color: #dcfce7;
}
/* delta = 0.000（或没数据）：中性灰，不显示 +/- */
.delta.is-zero {
  border-color: #9ca3af;
  background: #262626;
  color: #d1d5db;
}
.delta-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  /* 与描边完全一致的实色（原来带 0.55 透明度，所以看着不明显） */
  background: #ef4444;
}
.delta.is-minus .delta-fill {
  background: #22c55e;
}
.delta.is-zero .delta-fill {
  background: #9ca3af;
}
.delta-value {
  position: relative;
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

/* ---------- 下排第 1 竖排：组别 + 名次 ---------- */
.col-place {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.place {
  display: flex;
  align-items: baseline;
  line-height: 1;
  color: #fff;
}
/* 总排名/总车手数量：`12` 与当前圈计时同号（32px），`/24` 小一号（20px）并放在数字正下方、居中 */
.place.place-stacked {
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.place.place-stacked .big {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
}
.place.place-stacked .of {
  font-size: 20px;
  font-weight: 400;
  line-height: 1;
}

/* ---------- 下排第 2 竖排：Best / Last / Pred / Stint ---------- */
.col-times {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  line-height: 1.15;
}
/* 标签/数值字号均 ×2（10→20 / 11→22） */
.label {
  font-size: 20px;
  font-weight: 400;
  color: #fff;
  min-width: 60px;
}
.value {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
}

/* ---------- 下排第 3 竖排：Total / Stint 圈数 ---------- */
/* 两块纵排；数字与标签各占一列栅格轨道 → **Total/Stint 字样左侧纵向对齐** */
.col-laps {
  display: grid;
  grid-template-columns: max-content max-content;
  justify-items: start;
  align-items: baseline;
  gap: 4px 8px;
}
.lap-block {
  display: contents;
}
/* 圈数（Total / Stint）：数字与标签都适当缩小（44/20 → 30/14px） */
.lap-block .big {
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
}
.lap-block .small {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.1;
  color: #fff;
}
</style>
