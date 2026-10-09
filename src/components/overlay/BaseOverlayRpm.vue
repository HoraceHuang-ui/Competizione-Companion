<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'
import { useTelemetry } from '@/overlay/telemetry'
import {
  DEFAULT_REDLINE,
  RPM_BLINK_MS,
  RPM_LAMP_COUNT,
  RPM_PIT_BLINK_MS,
  atRedline,
  lampStates,
  pitLimitStates,
  type LampState,
} from '@/overlay/rpmLamps'

// ---------------------------------------------------------------------------
// 转速：14 盏 16×16 圆形灯（**左右镜像对称**：绿 1-3/12-14、黄 4-6/9-11、红 7-8），灯灭为灰。
// 每盏对应红线前 200rpm（红线 − 3000 第 1 盏亮），到红线时全部变蓝并以 0.1s 闪烁（蓝 0.1s / 灭 0.1s）。
// 点亮时带发光（灭灯不发光）。红线转速按**车辆**设置（组件设置页里配），
// 存在 item.props.redlineByCar[车型]；没有配置就用默认 8000。
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
const props = defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()

/** 当前车的红线：props.redlineByCar[车型] → props.rpmRedline（兜底）→ 默认 8000 */
const redline = computed(() => {
  const bag = props.item?.props as
    | { redlineByCar?: Record<string, number>; rpmRedline?: number }
    | undefined
  const car = tm.carModel
  const perCar = car && bag?.redlineByCar ? Number(bag.redlineByCar[car]) : NaN
  if (Number.isFinite(perCar) && perCar > 0) return perCar
  const flat = Number(bag?.rpmRedline)
  if (Number.isFinite(flat) && flat > 0) return flat
  return DEFAULT_REDLINE
})

const rpm = computed(() => (tm.active && Number.isFinite(tm.rpms) ? tm.rpms : 0))

// ---------- 到红线时的闪烁（0.3s 一拍，只在需要时跑计时器） ----------
const blinkOn = ref(true)
let blinkTimer: number | undefined
const redlineNow = computed(() => tm.active && atRedline(rpm.value, redline.value))
/** 维修区限速优先（用户要求）：此时显示 3-12 的奇偶交替，不看转速 */
const pitLimit = computed(() => tm.active && tm.pitLimiterOn === 1)
const blinkMode = computed<'none' | 'redline' | 'pit'>(() =>
  pitLimit.value ? 'pit' : redlineNow.value ? 'redline' : 'none',
)
/** 节拍：限速 0.5s，到红线 0.1s */
const blinkPeriod = computed(() => (blinkMode.value === 'pit' ? RPM_PIT_BLINK_MS : RPM_BLINK_MS))

function stopBlink() {
  if (blinkTimer != null) {
    window.clearInterval(blinkTimer)
    blinkTimer = undefined
  }
  blinkOn.value = true
}
watch(
  blinkMode,
  () => {
    stopBlink()
    if (blinkMode.value === 'none') return
    blinkTimer = window.setInterval(() => {
      blinkOn.value = !blinkOn.value
    }, blinkPeriod.value)
  },
  { immediate: true },
)
onBeforeUnmount(stopBlink)

const states = computed<LampState[]>(() => {
  if (!tm.active) return new Array(RPM_LAMP_COUNT).fill('off')
  // 维修区限速：固定的奇偶交替模式
  if (pitLimit.value) return pitLimitStates(blinkOn.value)
  return lampStates(rpm.value, redline.value, blinkOn.value)
})

/** 灯的底色（灭 = 灰） */
const COLOR: Record<LampState, string> = {
  off: '#3f3f46',
  green: '#22c55e',
  yellow: '#facc15',
  red: '#ef4444',
  blue: '#3b82f6',
}

/** 点亮时的发光：灭灯不发光 */
const GLOW: Record<LampState, string> = {
  off: 'none',
  green: '0 0 8px 2px rgba(34, 197, 94, 0.75)',
  yellow: '0 0 8px 2px rgba(250, 204, 21, 0.75)',
  red: '0 0 8px 2px rgba(239, 68, 68, 0.8)',
  blue: '0 0 9px 3px rgba(59, 130, 246, 0.85)',
}
</script>

<template>
  <BaseOverlayTemplate v-bind="$attrs" :item="item">
    <div class="rpm-lamps">
      <span
        v-for="(state, i) in states"
        :key="i"
        class="lamp"
        :style="{ backgroundColor: COLOR[state], boxShadow: GLOW[state] }"
      ></span>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
.rpm-lamps {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: max-content;
  height: max-content;
  box-sizing: border-box;
  padding: 2px 6px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

/* 16px × 16px 的圆形灯 */
.lamp {
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: inline-block;
  transition: background-color 60ms linear, box-shadow 60ms linear;
}

/* 整个组件的圆角 = 999px（胶囊形）。背景层由基座画（.cc-overlay-bg）；
   基座根元素带的是本组件的 scope id，所以根元素直接写类名即可命中，内部元素用 :deep()。 */
.cc-overlay-root {
  border-radius: 999px;
}
:deep(.cc-overlay-bg),
:deep(.cc-overlay-content) {
  border-radius: 999px;
}
</style>
