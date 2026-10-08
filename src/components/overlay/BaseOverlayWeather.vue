<script setup lang="ts">
import { computed, onMounted, ref, useAttrs } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import WeatherIcon from './WeatherIcon.vue'
import type { OverlayItem } from '@/overlay/types'
import { useTelemetry } from '@/overlay/telemetry'

// ---------------------------------------------------------------------------
// 天气预报（默认 168×76）：两排元素一一对应，中间一条横向分割线
//   第一排标签：0'（当前） 10'（之后 10 分钟） 30'（之后 30 分钟）
//   第二排图标：对应时刻的雨强图标（见 WeatherIcon.vue）
//   中间：占满组件整宽的灰色 2px 横线（上边距比下边距大）
//   组件内部尺寸按"默认大小放大一倍"来定（标签 18px、图标 32px、列宽 36px）。
//
// ⚠️ 尺寸自适应（只增不减）：每个遥测窗的 baseWidth/baseHeight 是**存在 overlay.json 里**的，
//   所以改了内部尺寸后，用户已经拖进覆盖层的老实例不会自动跟上 —— 框比内容小的时候
//   基座的 .cc-overlay-content 是 overflow: hidden，内容会被裁掉。
//   这里挂载后量一次自己的内容尺寸，**只在内容装不下时**把框撑大并回写（绝不缩小，
//   免得跟用户手动放大打架）。以后改这个组件的字号/图标尺寸都不用再管老实例。
//
// 数据来源（Graphic 页，1.9 实测偏移，见 ACC-遥测数据参考.md §1.2）：
//   1560 rainIntensity          当前雨强
//   1564 rainIntensityIn10min   10 分钟后的雨强预报
//   1568 rainIntensityIn30min   30 分钟后的雨强预报
//   三个字段都是 ACC_RAIN_INTENSITY 枚举：0 无雨 / 1 毛毛雨 / 2 小雨 / 3 中雨 / 4 大雨 / 5 雷暴。
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
const props = defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()
const hasData = computed(() => tm.active)

/** 雨强：0..5 取整；没数据或异常值给 null（画成灰色短横） */
function rainKind(value: unknown): number | null {
  if (!hasData.value || typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(5, Math.max(0, Math.round(value)))
}

/** 三列：标签 + 对应时刻的雨强图标 */
const slots = computed(() => [
  { label: "0'", kind: rainKind(tm.rainIntensity) },
  { label: "10'", kind: rainKind(tm.rainIntensityIn10min) },
  { label: "30'", kind: rainKind(tm.rainIntensityIn30min) },
])

// ---------- 尺寸自适应（只增不减）----------
const contentRef = ref<HTMLElement | null>(null)
const attrs = useAttrs()

/**
 * 通知宿主落盘。
 * 注意：不能声明 `commit` 这个 emit —— 一旦声明，Vue 会把它从 $attrs 摘掉，
 * 基座靠 v-bind="$attrs" 转发的拖动/缩放提交就断线（见 AGENTS.md）。
 */
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
  // 只增不减：手动放大过的实例保留用户尺寸，只有装不下时才撑开
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
    <div ref="contentRef" class="weather">
      <!-- 第一排：时间标签 -->
      <div class="row">
        <div v-for="slot in slots" :key="slot.label" class="slot">
          <div class="label">{{ slot.label }}</div>
        </div>
      </div>

      <!-- 上下两排之间的横向分割线：占满组件整宽、灰 1px -->
      <div class="divider"></div>

      <!-- 第二排：与上一排一一对应的天气图标 -->
      <div class="row">
        <div v-for="slot in slots" :key="slot.label" class="slot">
          <div class="icon"><WeatherIcon :kind="slot.kind" /></div>
        </div>
      </div>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
/* 内容层：宽度/高度都由内容决定（max-content），并在框里居中。
   基座的背景/缩放层按 item 的 baseWidth/baseHeight 铺，尺寸由脚本"只增不减"地贴合内容。 */
.weather {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: max-content;
  height: max-content;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* 上下内边距刻意留小（用户要求），左右留给两排自己去撑 */
  padding: 4px 0;
  color: #fff;
  -webkit-font-smoothing: antialiased;
}

/* 两排用完全相同的列宽与间距，保证标签与图标逐列对齐 */
.row {
  display: flex;
  justify-content: center;
  gap: 14px;
  padding: 0 14px;
}

.slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
}

.label {
  font-size: 18px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.4px;
  color: rgba(255, 255, 255, 0.62);
  font-variant-numeric: tabular-nums;
}

.icon {
  width: 32px;
  height: 32px;
}

/* 分割线：占满整宽（左右不加内边距），灰 2px；**上边距比下边距大** */
.divider {
  width: 100%;
  height: 2px;
  margin: 10px 0 4px;
  background: rgba(255, 255, 255, 0.28);
}
</style>
