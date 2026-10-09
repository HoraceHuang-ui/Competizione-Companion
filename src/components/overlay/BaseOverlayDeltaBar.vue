<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'
import { onTelemetrySample, useTelemetry } from '@/overlay/telemetry'
import { deltaSignOf, deltaTextHidden } from '@/overlay/lapFormat'

// ---------------------------------------------------------------------------
// Delta 条：圆角 999px 的长条，宽高比 20:1（400×20），中间对半分成左右半边
//   · 默认：黑色背景（透明度跟随组件设置）+ 浅灰 2px 描边
//   · delta 为 +（比上一圈慢）：**左半边从中间往左**填红色，满槽 0.5s（超过也是满槽），
//     左半边描边变红；delta 为 −（更快）：**右半边从中间往右**填绿色，右半边描边变绿
//   · 槽外下方一个胶囊显示数值（两位小数），中心跟随填充边缘移动；+ 红字 / − 绿字
//
// 显示数据（组件设置页 · 「显示数据」）：
//   · 整圈（默认）：直接显示整圈 delta
//   · Sector：只显示**当前 sector** 的 delta —— 跨过 sector 分界时把"上一段结束瞬间的整圈 delta"
//     记成基准，之后显示 `当前整圈 delta − 基准`（这样每进入新 sector 都从 0 重新算）。
//     sector 分界不是均分的，所以用共享内存 Graphic `currentSectorIndex`(164，读取器已在读) 判断换段。
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
const props = defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()
const hasData = computed(() => tm.active)

/** 符号判定（deltaSignOf 兼容官方"有符号值"与"绝对值+符号位"两种形式） */
const sign = computed(() => deltaSignOf(hasData.value ? tm.deltaLapTimeMs : null, tm.deltaPositive))
/** 整圈 delta 的有符号毫秒（+ = 慢 = 红，− = 快 = 绿） */
const signedMs = computed(() => {
  if (sign.value.zero) return 0
  return sign.value.faster ? -sign.value.magnitudeMs : sign.value.magnitudeMs
})

// ---------- Sector 模式的基准 ----------
const mode = computed(() =>
  (props.item?.props as { deltaMode?: string } | undefined)?.deltaMode === 'sector' ? 'sector' : 'lap',
)
/** 上一段 sector 结束瞬间的整圈 delta */
const baselineMs = ref(0)
let lastSector: number | null = null
let prevSigned = 0
const unsub = onTelemetrySample(s => {
  if (!s.active) return
  const raw = s.deltaLapTimeMs
  const signed =
    raw == null || !Number.isFinite(raw)
      ? 0
      : deltaSignOf(raw, s.deltaPositive).faster
        ? -Math.abs(raw)
        : Math.abs(raw)
  const sec = s.sectorIndex ?? null
  if (lastSector === null) {
    // 首个样本：只对齐基准
    lastSector = sec
    baselineMs.value = signed
  } else if (sec !== lastSector) {
    // 跨过 sector 分界：基准 = **上一帧**（上一段结束瞬间）的整圈 delta
    baselineMs.value = prevSigned
    lastSector = sec
  }
  prevSigned = signed
})
onBeforeUnmount(() => unsub?.())

/** 实际显示用的 delta（毫秒，有符号） */
const effectiveMs = computed(() =>
  mode.value === 'sector' ? signedMs.value - baselineMs.value : signedMs.value,
)
const zero = computed(() => Math.abs(effectiveMs.value) / 1000 < 0.0005)
const positive = computed(() => !zero.value && effectiveMs.value > 0)
const negative = computed(() => !zero.value && effectiveMs.value < 0)
const ratio = computed(() =>
  zero.value ? 0 : Math.min(1, Math.abs(effectiveMs.value) / FULL_SCALE_MS),
)

/** 显示文本：两位小数；0 不带正负号 */
const text = computed(() => {
  if (!hasData.value) return '--'
  // 超过 10s：槽与颜色照旧，数值只显示 --
  if (deltaTextHidden(effectiveMs.value)) return '--'
  if (zero.value) return '0.00'
  return `${effectiveMs.value > 0 ? '+' : '-'}${(Math.abs(effectiveMs.value) / 1000).toFixed(2)}`
})

// ---------- 尺寸自适应：内容（长条 + 下方胶囊）装不下就把框撑开（只增不减） ----------
const contentRef = ref<HTMLElement | null>(null)
const attrs = useAttrs()
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
watch(
  () => text.value,
  () => fitToContent('grow'),
  { flush: 'post' },
)

const RED = '#ef4444'
const GREEN = '#22c55e'
const GREY = 'rgba(203, 213, 225, 0.75)'
const ZERO_TEXT = '#9ca3af'

const bg = computed(() => `rgba(0, 0, 0, ${props.item.opacity})`)
const leftBorder = computed(() => (positive.value ? RED : GREY))
const rightBorder = computed(() => (negative.value ? GREEN : GREY))
const capsuleShift = computed(() => (positive.value ? -ratio.value : negative.value ? ratio.value : 0))
const capsuleStyle = computed(() => ({
  backgroundColor: bg.value,
  color: positive.value ? RED : negative.value ? GREEN : ZERO_TEXT,
  left: `calc(50% + ${capsuleShift.value * 50}%)`,
}))

/** 本组件的满槽 = **1 秒**（用户要求）；注意 lapFormat 里的 DELTA_FULL_SECONDS=0.5 是排行榜那套，别动它 */
const FULL_SCALE_MS = 1000
</script>

<template>
  <BaseOverlayTemplate v-bind="$attrs" :item="item" :background="false">
    <div ref="contentRef" class="delta-bar">
      <div class="track">
        <!-- 左半边：+ 时从内侧（中间）往左填红 -->
        <div class="half is-left" :style="{ backgroundColor: bg, borderColor: leftBorder }">
          <div
            v-if="positive"
            class="fill"
            :style="{ width: `${ratio * 100}%`, backgroundColor: RED }"
          ></div>
        </div>
        <!-- 右半边：− 时从内侧（中间）往右填绿 -->
        <div class="half is-right" :style="{ backgroundColor: bg, borderColor: rightBorder }">
          <div
            v-if="negative"
            class="fill"
            :style="{ width: `${ratio * 100}%`, backgroundColor: GREEN }"
          ></div>
        </div>
        <!-- 数值胶囊：放在 .track 里，left 的百分比基准才是 400px 的长条（否则算到边距上会错位） -->
        <div class="capsule" :style="capsuleStyle">{{ text }}</div>
      </div>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
/* padding-bottom 就是给下方胶囊留的高度：不写的话 .delta-bar 只有长条的 20px，
   居中放进框里会把胶囊顶出可视区（预览里看到的就是"胶囊没显示完整"）。 */
.delta-bar {
  /* 左右各 34px：胶囊在满槽时有一半溢出长条，这里给它落脚（组件圆角也才看得见）；
     下方 28px：长条 20px + 更大的胶囊（top:24 + 高约 23）刚好放下 */
  padding: 0 34px 28px;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: max-content;
  height: max-content;
}
/* 长条：400×20（20:1），两半在中点相接 */
.track {
  position: relative;
  width: 400px;
  height: 20px;
}
.half {
  position: absolute;
  top: 0;
  width: 50%;
  height: 100%;
  box-sizing: border-box;
  border: 2px solid;
  display: flex;
  overflow: hidden;
  transition: border-color 80ms linear;
}
/* 左半边：左圆角 999、右 0；填充贴内侧（中间）生长 → 从右往左 */
.half.is-left {
  left: 0;
  border-radius: 999px 0 0 999px;
  justify-content: flex-end;
}
/* 右半边：右圆角 999、左 0；填充贴内侧生长 → 从左往右 */
.half.is-right {
  right: 0;
  border-radius: 0 999px 999px 0;
  justify-content: flex-start;
}
/* 填充槽：线性、不参与伸缩 */
.fill {
  flex: none;
  height: 100%;
  transition: width 80ms linear;
}
/* 槽外下方的数值胶囊：中心跟随填充边缘（left 由内联样式给） */
.capsule {
  position: absolute;
  top: 24px;
  transform: translateX(-50%);
  box-sizing: border-box;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
