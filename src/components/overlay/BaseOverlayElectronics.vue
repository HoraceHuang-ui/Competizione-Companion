<script setup lang="ts">
import { computed, onMounted, ref, useAttrs } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'
import { useTelemetry } from '@/overlay/telemetry'

// ---------------------------------------------------------------------------
// 电控（TC / ABS）：两个横向排列的正方形圆角格子
//   每格：**上边缘**一行小字标签（TC / ABS），**正中**是当前挡位数字（加粗大字）；
//   颜色整格一致（标签 / 数字 / 描边同色）。
//   · TC  ：默认无背景 + 绿色 2px 描边 + 绿色字；**介入时**黄色描边 + 黄色背景 + 黑色字
//   · ABS ：默认无背景 + 红色 2px 描边 + 红色字；**介入时**蓝色描边 + 蓝色背景 + 黑色字
//
// 数据来源：
//   挡位（大字）：Graphic 1268 `TC` / 1280 `ABS`（0..N，实测这台车 6/6）
//   是否介入（决定配色）：Physics 204 `tc` / 252 `abs`（0/1 —— **不是**挡位！）
//   实测（2026-10）：介入标志只出现 0/1，TC 在给油时置 1、ABS 在刹车时置 1。
//   没有数据时整个组件降透明度（is-idle），不假装"没介入"。
//
// ⚠️ 尺寸自适应（只增不减）：同 BaseOverlayWeather.vue —— 实例尺寸存在 overlay.json 里，
//   改了内部尺寸后老实例的框会小于内容而被 overflow: hidden 裁掉，所以挂载后量一次内容尺寸，
//   只在装不下时把框撑开并回写（不缩小，免得跟用户手动放大打架）。
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
const props = defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()
const hasData = computed(() => tm.active)

/** 是否正在介入（Physics 204/252，实测只出现 0/1）——只决定配色 */
const tcActive = computed(() => hasData.value && tm.tc > 0)
const absActive = computed(() => hasData.value && tm.abs > 0)

/** 挡位文字（Graphic 1268/1280）；没数据时给 -- */
function levelText(value: unknown) {
  if (!hasData.value || typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return String(Math.round(value))
}
const tcLevelText = computed(() => levelText(tm.tcLevel))
const absLevelText = computed(() => levelText(tm.absLevel))

// ---------- 尺寸自适应（只增不减）----------
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

function fitToContent() {
  const el = contentRef.value
  if (!el) return
  const width = Math.ceil(el.offsetWidth)
  const height = Math.ceil(el.offsetHeight)
  if (width <= 0 || height <= 0) return
  let changed = false
  if (width > props.item.baseWidth) {
    props.item.baseWidth = width
    changed = true
  }
  if (height > props.item.baseHeight) {
    props.item.baseHeight = height
    changed = true
  }
  if (changed) requestCommit()
}

onMounted(() => {
  requestAnimationFrame(() => fitToContent())
  if (document.fonts?.ready) document.fonts.ready.then(() => fitToContent())
})
</script>

<template>
  <BaseOverlayTemplate v-bind="$attrs" :item="item">
    <div ref="contentRef" class="elec" :class="{ 'is-idle': !hasData }">
      <div class="cell is-tc" :class="{ 'is-on': tcActive }">
        <div class="tag">TC</div>
        <div class="level">{{ tcLevelText }}</div>
      </div>
      <div class="cell is-abs" :class="{ 'is-on': absActive }">
        <div class="tag">ABS</div>
        <div class="level">{{ absLevelText }}</div>
      </div>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
/* 内容层尺寸由内容决定（正方形格子不能被拉伸），并在框里居中 */
.elec {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: max-content;
  height: max-content;
  box-sizing: border-box;
  display: flex;
  gap: 6px;
  padding: 6px;
  -webkit-font-smoothing: antialiased;
}

/* 没数据：整体降透明度（不假装"没介入"） */
.elec.is-idle {
  opacity: 0.45;
}

/* 正方形圆角格子：描边与文字同色（currentColor）；标签贴在上边缘、挡位大字在正中 */
.cell {
  position: relative;
  width: 34px;
  height: 34px;
  box-sizing: border-box;
  border: 2px solid currentColor;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
}

/* 上边缘的小字标签（TC / ABS） */
.tag {
  position: absolute;
  top: 1px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.3px;
}

/* 正中的挡位数字（加粗大字）；颜色沿用格子自身的 color */
.level {
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
  /* 标签占了上边一点空间，往下让 2px 视觉更居中 */
  margin-top: 3px;
}

/* TC：默认绿；介入时黄底黑字 */
.cell.is-tc {
  color: #22c55e;
}
.cell.is-tc.is-on {
  color: #000;
  background: #f5c400;
  border-color: #f5c400;
}

/* ABS：默认红；介入时蓝底黑字 */
.cell.is-abs {
  color: #ef4444;
}
.cell.is-abs.is-on {
  color: #000;
  background: #3b82f6;
  border-color: #3b82f6;
}
</style>
