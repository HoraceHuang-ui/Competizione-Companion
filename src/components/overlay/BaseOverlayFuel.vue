<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'
import { onTelemetrySample, useTelemetry } from '@/overlay/telemetry'
import {
  advanceFuelLaps,
  averageLapMs,
  createFuelLapState,
  estimatedLaps,
  formatFuelLiters,
  formatLaps,
  formatTargetLiters,
  fuelPerLapOf,
  targetFuelByTime,
  type FuelLapState,
} from '@/overlay/fuel'

// ---------------------------------------------------------------------------
// 燃油（四行，每行 = 加粗数值 + 不加粗小字标签）：
//   62.40L      left    ← 剩余油量（Physics 12）
//   3.15L       /lap    ← 每圈平均油耗（Graphic fuelXLap 1284）
//   19.8 Laps   est.    ← 当前油量还能跑几圈（fuel ÷ 每圈油耗）
//   55.00L      target  ← min(本节剩余, Stint 剩余) ÷ 平均圈速 × 每圈油耗，上限 120L
//
// 平均圈速共享内存里没有 → 自己累计（见 src/overlay/fuel.ts）：逐圈取 iLastTime，
// **排除有进站的圈**（这圈期间 carLocation 落在 Pitlane/PitEntry/PitExit），只留最近 10 个有效圈。
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
const props = defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()
const hasData = computed(() => tm.active)

const contentRef = ref<HTMLElement | null>(null)
const attrs = useAttrs()

/** 内容自适应（同「赛节信息」的做法）：挂载贴合一次，运行中只增不减，尺寸变了才落盘 */
function fitToContent(mode: 'snap' | 'grow' = 'grow') {
  const el = contentRef.value
  if (!el) return
  const width = Math.ceil(el.offsetWidth)
  const height = Math.ceil(el.offsetHeight)
  if (width <= 0 || height <= 0) return
  let changed = false
  const applyW = mode === 'snap' ? width !== props.item.baseWidth : width > props.item.baseWidth
  const applyH = mode === 'snap' ? height !== props.item.baseHeight : height > props.item.baseHeight
  if (applyW) {
    props.item.baseWidth = width
    changed = true
  }
  if (applyH) {
    props.item.baseHeight = height
    changed = true
  }
  if (changed) (attrs.onCommit as (() => void) | undefined)?.()
}

onMounted(() => {
  requestAnimationFrame(() => fitToContent('snap'))
  if (document.fonts?.ready) document.fonts.ready.then(() => fitToContent('snap'))
})

// ---------- 圈速累计（逐帧） ----------
const lapState = ref<FuelLapState>(createFuelLapState())
const unsubSample = onTelemetrySample(snapshot => {
  if (!snapshot.active) return
  lapState.value = advanceFuelLaps(lapState.value, {
    completedLaps: snapshot.completedLaps,
    lastLapMs: snapshot.iLastTime,
    carLocation: snapshot.carLocation,
  })
})
onBeforeUnmount(() => unsubSample?.())

// ---------- 数值 ----------
const fuel = computed(() => (hasData.value ? tm.fuel : null))
const perLap = computed(() =>
  hasData.value ? fuelPerLapOf(tm.fuelXLap, tm.usedFuel, tm.completedLaps) : null,
)
const estLaps = computed(() => estimatedLaps(fuel.value, perLap.value))
const avgLap = computed(() => averageLapMs(lapState.value))
const target = computed(() =>
  hasData.value
    ? targetFuelByTime(tm.sessionTimeLeft, tm.driverStintTimeLeft, avgLap.value, perLap.value)
    : null,
)

const fuelText = computed(() => formatFuelLiters(fuel.value))
const perLapText = computed(() => formatFuelLiters(perLap.value))
const estText = computed(() => formatLaps(estLaps.value))
const targetText = computed(() => formatTargetLiters(target.value))

watch(
  [fuelText, perLapText, estText, targetText],
  () => fitToContent('grow'),
  { flush: 'post' },
)
</script>

<template>
  <BaseOverlayTemplate v-bind="$attrs" :item="item">
    <div ref="contentRef" class="fuel">
      <span class="value">{{ fuelText }}</span>
      <span class="label">left</span>
      <span class="value">{{ perLapText }}</span>
      <span class="label">/lap</span>
      <span class="value">{{ estText }}</span>
      <span class="label">est.</span>
      <span class="value">{{ targetText }}</span>
      <span class="label">target</span>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
.fuel {
  /* 内容层按内容定尺寸：两列栅格（数值 | 标签），标签列右对齐 → 四个标签**右边缘对齐到组件右边缘** */
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: max-content;
  height: max-content;
  box-sizing: border-box;
  padding: 10px 14px;
  color: #fff;
  font-variant-numeric: tabular-nums;
  display: grid;
  grid-template-columns: max-content max-content;
  column-gap: 10px;
  row-gap: 3px;
  align-items: baseline;
}
/* 数值：加粗、左对齐（第 1 列） */
.value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  justify-self: start;
}
/* 标签：不加粗小字，**右对齐**（第 2 列）—— 四个标签右边缘齐平 */
.label {
  font-size: 12px;
  font-weight: 400;
  opacity: 0.75;
  line-height: 1.1;
  justify-self: end;
  text-align: right;
  white-space: nowrap;
}
</style>
