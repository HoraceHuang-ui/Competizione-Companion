<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useAttrs, watch } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'
import { useTelemetry } from '@/overlay/telemetry'
import { penaltyChips } from '@/overlay/penalty'

// ---------------------------------------------------------------------------
// 判罚：**一行横向排列的红色圆角矩形**（DT / SG10 / SG20 / SG30 / DSQ / NO BEST / +xx s）
//
//   · **没有判罚 → 整块都不显示，连背景也不画**（用户要求）：
//     `:background="chips.length > 0"` —— 无 chip 时基座不画那层黑底，内容层也 `v-if` 掉 → 屏幕上什么都没有。
//     ⚠️ 此时只剩基座自己的**控制条**（解锁后会出现，用来拖动/锁定）—— 所以"看不见"时也找得到它。
//   · **有判罚 → 显示黑底 + chip**（黑底就是基座那层 `rgba(0,0,0,item.opacity)`，深浅由面板的透明度控制）。
//   · 多个（将来扩展）横向排列。
//
// 数据：Graphic `penalty`(1228 枚举) + `penaltyTime`(1220, 秒)，翻译规则在 `src/overlay/penalty.ts`。
// ⚠️ **cut 警告次数不显示**（游戏没暴露这个字段；广播里也没有 —— 见参考文档 §1.6）。
//
// ⚠️ 尺寸：这个组件**精确贴合内容**（不是项目里常见的"只增不减"）—— 因为黑底就是基座的背景层，
//    框比内容大，chip 到黑底四边的距离就不一样（上下小、左右大）。用户手动缩放改的是 `item.scale`
//    （基座控制条），不是 baseWidth/baseHeight，所以精确贴合不会跟用户的手动尺寸打架。
//    内容层是 `v-if` 的 → **挂载时通常什么都量不到**，所以要在"chip 出现"时再量（watch + nextTick）。
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
const props = defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()

const chips = computed(() => penaltyChips({ penalty: tm.penalty, penaltyTime: tm.penaltyTime }))

// ---------- 尺寸：精确贴合内容（保证 chip 到黑底四边的内边距一样）----------
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

/**
 * 量 `.pen` 的 `offsetWidth/offsetHeight`（**已含它自己的 `padding`**），把框设成同样大小 → 四边内边距都是 `padding`。
 * 无判罚时 `v-if` 把内容层拿掉了，`el` 为 null → 直接返回，保留上一次的框（反正这时候整块不显示）。
 */
function fitToContent() {
  const el = contentRef.value
  if (!el) return
  const width = Math.ceil(el.offsetWidth)
  const height = Math.ceil(el.offsetHeight)
  if (width <= 0 || height <= 0) return
  if (width === props.item.baseWidth && height === props.item.baseHeight) return
  props.item.baseWidth = width
  props.item.baseHeight = height
  requestCommit()
}

// chip 出现/换文字时才量（挂载时无判罚 → 内容是 v-if 掉的，量不到东西）
watch(
  chips,
  () => {
    nextTick(() => fitToContent())
  },
  { immediate: true },
)

onMounted(() => {
  requestAnimationFrame(() => fitToContent())
  if (document.fonts?.ready) document.fonts.ready.then(() => fitToContent())
})
</script>

<template>
  <!-- 没有判罚时连背景都不画（`:background` 跟 chip 有无绑定）；有判罚时是基座的黑底 + 红色 chip -->
  <BaseOverlayTemplate v-bind="$attrs" :item="item" :background="chips.length > 0">
    <div v-if="chips.length > 0" ref="contentRef" class="pen">
      <div v-for="chip in chips" :key="chip.key" class="chip" :title="chip.title">
        {{ chip.text }}
      </div>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
/* 内容层尺寸由内容决定（一行 chip，横排），并在框里居中 */
.pen {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: max-content;
  height: max-content;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  /* 四边一致：框是按"内容 + 这圈 padding"精确贴合的（见 fitToContent），所以它就是 chip 到黑底的距离 */
  padding: 4px;
  -webkit-font-smoothing: antialiased;
}

/* 圆角矩形：红底白字（与项目里"慢/危险"同色） */
.chip {
  border-radius: 6px;
  /* 内边距这里**故意左右大于上下**（让圆角块是横向的胶囊形）；你说的"内边距统一"指 chip 到黑底那圈，见上面 .pen */
  padding: 3px 9px;
  background: #ef4444;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
</style>
