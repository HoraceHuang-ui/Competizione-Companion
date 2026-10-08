<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getWidget } from './registry'
import type { OverlayItem, RenderOverlayPayload } from './types'

// ---------------------------------------------------------------------------
// 覆盖层宿主：每个有组件的显示器对应一个本组件实例（跑在一个透明置顶窗口里）。
//
// 职责：
//   * 把主进程下发的组件列表渲染成 BaseOverlayTemplate 实例；
//   * 接收主进程的悬浮判定（active / hint），拖动期间告诉主进程保持可交互。
//
// 「光标是否压住未锁定组件」由主进程轮询 screen.getCursorScreenPoint() 判定，
// 不靠渲染层收 mousemove：穿透状态下能否收到鼠标事件本身就不确定，而整层能不能
// 交互又取决于这个判定，放在渲染层会形成死循环（详见 electron/main/overlay.ts）。
// ---------------------------------------------------------------------------

const items = ref<OverlayItem[]>([])
const displayWidth = ref(0)
const displayHeight = ref(0)
/** 光标压住的未锁定组件：显示控制条并允许交互 */
const activeId = ref<string | null>(null)
/** 光标压住的任意组件（含已锁定）：仅用于给出「已锁定」的提示 */
const hintId = ref<string | null>(null)
/** 正在拖动 / 缩放的组件：期间保持可交互，否则鼠标会中途穿出去 */
const busyId = ref<string | null>(null)

let unsubRender: (() => void) | undefined
let unsubHover: (() => void) | undefined

const renderList = computed(() =>
  items.value
    .map(item => ({ item, widget: getWidget(item.widget) }))
    .filter(row => !!row.widget),
)

function apply(payload: RenderOverlayPayload) {
  // 拖动 / 缩放过程中不接受回流，避免与本地状态互相打架；
  // 交互结束时的 commit 会触发一次新的广播，届时自然对齐。
  if (busyId.value) return
  items.value = payload.items || []
  displayWidth.value = payload.displayWidth
  displayHeight.value = payload.displayHeight
}

async function load() {
  const payload = await window.overlay?.getState()
  if (payload && payload.scope === 'overlay') {
    apply(payload as RenderOverlayPayload)
  }
}

function onCommit(item: OverlayItem) {
  window.overlay?.updateItems([
    {
      id: item.id,
      patch: {
        x: item.x,
        y: item.y,
        scale: item.scale,
        opacity: item.opacity,
        locked: item.locked,
        // 自适应尺寸的组件量完内容会改基准尺寸，一起落盘（否则管理面板预览会是旧尺寸）
        baseWidth: item.baseWidth,
        baseHeight: item.baseHeight,
      },
    },
  ])
}

function onBusy(item: OverlayItem, busy: boolean) {
  busyId.value = busy ? item.id : null
  window.overlay?.setBusy(busy)
}

onMounted(() => {
  unsubRender = window.overlay?.onRender(payload => {
    apply(payload as RenderOverlayPayload)
  })
  unsubHover = window.overlay?.onHover(hover => {
    activeId.value = hover?.activeId ?? null
    hintId.value = hover?.hintId ?? null
  })
  load()
})

onBeforeUnmount(() => {
  unsubRender?.()
  unsubHover?.()
})
</script>

<template>
  <div class="cc-overlay-canvas">
    <component
      v-for="row in renderList"
      :key="row.item.id"
      :is="row.widget!.component"
      :item="row.item"
      :display-width="displayWidth"
      :display-height="displayHeight"
      :active="activeId === row.item.id"
      :hint="hintId === row.item.id"
      @commit="onCommit(row.item)"
      @busy="onBusy(row.item, $event)"
    />
  </div>
</template>

<style>
/* 覆盖层窗口必须整块透明：浅色模式下 style.css 会给 :root 铺白底。
   这些规则只在覆盖层窗口生效（主窗口不渲染本组件）。 */
:root,
html,
body,
#app {
  background: transparent !important;
  overflow: hidden;
}
body {
  margin: 0;
  cursor: default;
}

.cc-overlay-canvas {
  position: fixed;
  inset: 0;
  overflow: hidden;
}
</style>
