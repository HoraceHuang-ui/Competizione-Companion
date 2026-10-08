<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { translate } from '@/i18n'
import type { OverlayItem } from '@/overlay/types'
import {
  CONTROL_BAR_GAP,
  CONTROL_BAR_HEIGHT,
  RESIZE_CORNERS,
  clampPosition,
  isControlBarInside,
  itemScreenSize,
  resizeItem,
  type ResizeCorner,
} from '@/overlay/geometry'

// 控制条用 mdui 组件：图标按需引入，组件本体显式注册
// （覆盖层窗口与主窗口同源，这些自定义元素注册一次即可全局使用）
import '@mdui/icons/lock--rounded.js'
import '@mdui/icons/lock-open--rounded.js'
import '@mdui/icons/opacity--rounded.js'
import 'mdui/components/button-icon.js'

// ---------------------------------------------------------------------------
// 遥测窗基座（所有遥测窗都以它为基础实现）
//
// 负责四件事：
//   1. 纯黑背景 + 可调背景不透明度（背景与内容分离，改透明度不影响文字/图标的清晰度）
//   2. 鼠标拖动改位置、四角 / 缩放按钮等比改大小
//   3. 悬浮时在组件底部显示控制条：锁定、缩放、背景透明度
//   4. 锁定后完全放弃鼠标（由宿主 OverlayApp 把整层切成穿透）
//
// 数据流：item 是宿主持有的响应式对象，这里直接就地修改——拖动过程中零事件、零 IPC，
// 只有交互结束才 emit('commit') 让宿主落盘。交互期间 emit('busy', true)，宿主据此
// 保持窗口可交互，避免拖到一半鼠标穿透出去。
//
// 用法：子组件只要 defineOptions({ inheritAttrs: false }) 再 v-bind="$attrs" 套一层，
// 具体写法见 BaseOverlayTest.vue。
// 注意：不要在本文件的注释里写字面量的 SFC 标签，解析器会把注释里的结束标签当成
// 块结束，直接报「Element is missing end tag」。
// ---------------------------------------------------------------------------

const props = withDefaults(
  defineProps<{
    item: OverlayItem
    /** 所属显示器尺寸（DIP），用于边界约束与控制条翻转 */
    displayWidth?: number
    displayHeight?: number
    /** 宿主命中检测的结果：光标正压在本组件上 */
    active?: boolean
    /** 光标压在本组件上（含已锁定）：用于给出解锁提示 */
    hint?: boolean
    /**
     * 是否显示悬浮控制条 / 缩放手柄。
     * 注意：Boolean 类型的 prop 在缺省时会被 Vue 强制转成 false，所以这里必须显式给
     * 默认值 true，否则宿主不传就永远不显示（这是踩过的坑）。
     */
    controls?: boolean
    /**
     * 是否画基座那层半透明黑背景（默认画）。
     * 「全屏刹车」这类组件自己就是画面内容（红条），基座背景会把它盖成灰的，所以传 false。
     */
    background?: boolean
  }>(),
  {
    displayWidth: 0,
    displayHeight: 0,
    active: false,
    hint: false,
    controls: true,
    background: true,
  },
)

const emit = defineEmits<{
  (e: 'commit'): void
  (e: 'busy', busy: boolean): void
}>()

const t = translate

const rootRef = ref<HTMLElement | null>(null)
const dragging = ref(false)

/** 内容区里凡是需要真正接收点击的元素，都要标 data-overlay-interactive，
 *  否则会被当成拖动把手（见 onRootPointerDown）。 */
const INTERACTIVE_SELECTOR = '[data-overlay-interactive]'
const CONTROLS_SELECTOR = '.cc-overlay-controls'

const isActive = computed(() => props.active === true)
const size = computed(() => itemScreenSize(props.item))
const barInside = computed(() =>
  isControlBarInside(props.item, props.displayHeight ?? 0),
)
const showChrome = computed(
  () => props.controls !== false && isActive.value && !props.item.locked,
)

/**
 * 锁定后本组件完全穿透，控制条不会再出现（否则会拦住本该给游戏的点击）。
 * 为了不让用户「锁上就找不回来」，光标压上来时给一条纯文字提示——它 pointer-events:
 * none，不参与任何点击，几秒后自动消失。
 */
const hintVisible = ref(false)
let hintTimer: number | undefined

watch(
  () => props.item.locked && props.hint === true,
  visible => {
    window.clearTimeout(hintTimer)
    hintVisible.value = visible
    if (visible) {
      hintTimer = window.setTimeout(() => {
        hintVisible.value = false
      }, 2500)
    }
  },
)
/**
 * 根节点只负责定位与占位，**刻意不带 transform**：
 * transform 会成为 position: fixed 后代的包含块，导致 mdui 的 tooltip 弹层（按视口
 * 坐标定位）整体偏掉、根本看不见。缩放交给内层 .cc-overlay-scaler，
 * 于是控制条 / 手柄 / 提示条都落在未缩放的根节点里，天然是恒定大小，
 * 也不再需要「反向缩放」那种 hack。
 */
const rootStyle = computed(() => ({
  left: `${props.item.x}px`,
  top: `${props.item.y}px`,
  width: `${props.item.baseWidth * props.item.scale}px`,
  height: `${props.item.baseHeight * props.item.scale}px`,
  zIndex: props.item.z,
}))

/** 内容层：按设计尺寸排版，再整体等比缩放 */
const scalerStyle = computed(() => ({
  width: `${props.item.baseWidth}px`,
  height: `${props.item.baseHeight}px`,
  transform: `scale(${props.item.scale})`,
}))

// ---------- 拖动 / 缩放 ----------

interface DragState {
  pointerId: number
  mode: 'move' | 'resize'
  corner: ResizeCorner
  startX: number
  startY: number
  baseX: number
  baseY: number
  baseScale: number
  moved: boolean
}

let drag: DragState | null = null

function applyPosition(x: number, y: number, width: number, height: number) {
  const pos = clampPosition(
    x,
    y,
    width,
    height,
    props.displayWidth ?? 0,
    props.displayHeight ?? 0,
  )
  props.item.x = pos.x
  props.item.y = pos.y
}

function beginDrag(e: PointerEvent, mode: 'move' | 'resize', corner: ResizeCorner) {
  if (props.item.locked || e.button !== 0) return
  drag = {
    pointerId: e.pointerId,
    mode,
    corner,
    startX: e.clientX,
    startY: e.clientY,
    baseX: props.item.x,
    baseY: props.item.y,
    baseScale: props.item.scale,
    moved: false,
  }
  dragging.value = true
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  emit('busy', true)
  e.preventDefault()
  e.stopPropagation()
}

function onPointerMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return
  const dx = e.clientX - drag.startX
  const dy = e.clientY - drag.startY
  // 很小的位移视为点击，不进入拖动，避免误触
  if (!drag.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return
  drag.moved = true

  if (drag.mode === 'move') {
    const { width, height } = size.value
    applyPosition(drag.baseX + dx, drag.baseY + dy, width, height)
    return
  }

  const result = resizeItem(
    { x: drag.baseX, y: drag.baseY, scale: drag.baseScale },
    props.item,
    drag.corner,
    dx,
    dy,
  )
  props.item.scale = result.scale
  applyPosition(result.x, result.y, result.width, result.height)
}

function endDrag() {
  if (!drag) return
  const moved = drag.moved
  drag = null
  dragging.value = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  emit('busy', false)
  if (moved) emit('commit')
}

function onPointerUp(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return
  endDrag()
}

/** 组件空白处按下 = 拖动；点可交互元素或控制条则不抢事件 */
function onRootPointerDown(e: PointerEvent) {
  // controls=false 是预览态（管理面板里的缩略预览），不允许拖动
  if (props.controls === false) return
  if (props.item.locked || e.button !== 0) return
  const el = e.target as HTMLElement | null
  if (el?.closest(CONTROLS_SELECTOR)) return
  if (el?.closest(INTERACTIVE_SELECTOR)) return
  beginDrag(e, 'move', 'se')
}

// ---------- 控制条 ----------

/**
 * 自绘 tooltip。
 * 为什么不用 mdui-tooltip：实测在覆盖层窗口里它永远不会打开 —— 弹层元素存在
 * （position: fixed; z-index: 2500）、content 也有值，但逐个派发 pointerenter /
 * pointerover / mouseover / mouseenter / pointermove / mousemove 之后它仍然是
 * display: none（同一时刻 Vue 自己的 mouseenter 是正常触发的，所以不是事件送达的问题）。
 * 这里用同样的观感自己实现，hover 状态由 Vue 托管，机制确定可用。
 */
const tip = ref('')
const tipText = computed(() => {
  switch (tip.value) {
    case 'lock':
      return props.item.locked ? t('overlay.unlock') : t('overlay.lock')
    case 'opacity':
      return t('overlay.bgOpacity')
    default:
      return ''
  }
})

/** 控制条贴近屏幕顶端时把气泡翻到下方，配合限宽，提示永远在屏幕内 */
const tipBelow = computed(() => {
  const itemH = props.item.baseHeight * props.item.scale
  const barTop = barInside.value
    ? props.item.y + itemH - CONTROL_BAR_HEIGHT
    : props.item.y + itemH + CONTROL_BAR_GAP
  return barTop < 80
})

function onLockClick() {
  props.item.locked = !props.item.locked
  emit('commit')
}

function onOpacityInput(e: Event) {
  const value = Number((e.target as HTMLInputElement).value)
  props.item.opacity = Math.min(Math.max(value / 100, 0), 1)
}

onBeforeUnmount(() => {
  endDrag()
})
</script>

<template>
  <div
    ref="rootRef"
    class="cc-overlay-root"
    :class="{
      'is-active': showChrome,
      'is-dragging': dragging,
      'is-locked': item.locked,
    }"
    :style="rootStyle"
    @pointerdown="onRootPointerDown"
  >
    <!-- 缩放层：背景与内容按设计尺寸排版后整体等比缩放 -->
    <div class="cc-overlay-scaler" :style="scalerStyle">
      <div
        v-if="background"
        class="cc-overlay-bg"
        :style="{ backgroundColor: `rgba(0, 0, 0, ${item.opacity})` }"
      ></div>

      <div class="cc-overlay-content">
        <slot />
      </div>
    </div>

    <!-- 锁定提示：纯提示，绝不参与点击 -->
    <Transition name="cc-bar">
      <div
        v-if="hintVisible"
        class="cc-overlay-hint"
        :class="{ 'is-inside': barInside }"
      >
        {{ t('overlay.lockedHint') }}
      </div>
    </Transition>

    <!-- 缩放手柄：四角，恒定大小 -->
    <template v-if="showChrome">
      <div
        v-for="corner in RESIZE_CORNERS"
        :key="corner"
        class="cc-overlay-handle-anchor"
        :class="'is-' + corner"
      >
        <div
          class="cc-overlay-handle"
          @pointerdown="beginDrag($event, 'resize', corner)"
        ></div>
      </div>
    </template>

    <!-- 悬浮控制条 -->
    <Transition name="cc-bar">
      <div
        v-if="showChrome"
        class="cc-overlay-controls"
        :class="barInside ? 'is-inside' : 'is-below'"
        :style="{ marginTop: barInside ? 0 : `${CONTROL_BAR_GAP}px` }"
      >
        <div
          class="cc-overlay-tip-wrap"
          @mouseenter="tip = 'lock'"
          @mouseleave="tip = ''"
        >
          <mdui-button-icon class="cc-overlay-icon-btn" @click="onLockClick">
            <!-- v-if 放在原生 span 上：直接给 mdui 自定义元素加 v-if 会让 vue-tsc
                 把它当成 Vue 组件去解析，报 "does not exist on type" -->
            <span v-if="item.locked">
              <mdui-icon-lock--rounded></mdui-icon-lock--rounded>
            </span>
            <span v-else>
              <mdui-icon-lock-open--rounded></mdui-icon-lock-open--rounded>
            </span>
          </mdui-button-icon>
        </div>

        <!-- 缩放只保留四角手柄：控制条里再放一个缩放按钮是重复的 -->
        <span class="cc-overlay-sep"></span>

        <div
          class="cc-overlay-tip-wrap"
          @mouseenter="tip = 'opacity'"
          @mouseleave="tip = ''"
        >
          <mdui-icon-opacity--rounded
            class="cc-overlay-opacity-icon"
          ></mdui-icon-opacity--rounded>
        </div>
        <div class="cc-overlay-slider">
          <input
            class="cc-overlay-range"
            type="range"
            min="0"
            max="100"
            step="1"
            :value="Math.round(item.opacity * 100)"
            :title="t('overlay.bgOpacity')"
            @input="onOpacityInput"
            @change="emit('commit')"
          />
        </div>
        <span class="cc-overlay-value">
          {{ Math.round(item.opacity * 100) }}%
        </span>

        <!-- 提示气泡：横向居中并限宽到控制条宽度（控制条本身一定在屏幕内），
             所以内容不可能跑到屏幕外；靠近屏幕顶端时翻到控制条下方 -->
        <Transition name="cc-bar">
          <span
            v-if="tipText"
            class="cc-overlay-tip"
            :class="{ 'is-below': tipBelow }"
          >
            {{ tipText }}
          </span>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.cc-overlay-root {
  position: absolute;
  /* 刻意不设 transform：见 script 里 rootStyle 的说明（transform 会毁掉 mdui 弹层的定位） */
  cursor: grab;
}

/* 内容缩放层：根节点提供屏幕尺寸与位置，这一层负责等比缩放 */
.cc-overlay-scaler {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}
.cc-overlay-root.is-dragging {
  cursor: grabbing;
}
.cc-overlay-root.is-locked {
  cursor: default;
}

.cc-overlay-bg {
  position: absolute;
  inset: 0;
  border-radius: 8px;
}

.cc-overlay-root.is-active .cc-overlay-bg {
  outline: 1px dashed rgba(255, 255, 255, 0.55);
  outline-offset: 0;
}

.cc-overlay-content {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  overflow: hidden;
}

/* ---------- 缩放手柄 ---------- */

.cc-overlay-handle-anchor {
  position: absolute;
  width: 0;
  height: 0;
}
.cc-overlay-handle-anchor.is-nw {
  left: 0;
  top: 0;
}
.cc-overlay-handle-anchor.is-ne {
  right: 0;
  top: 0;
}
.cc-overlay-handle-anchor.is-sw {
  left: 0;
  bottom: 0;
}
.cc-overlay-handle-anchor.is-se {
  right: 0;
  bottom: 0;
}

.cc-overlay-handle {
  position: absolute;
  left: -6px;
  top: -6px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.8);
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-sizing: border-box;
  cursor: nwse-resize;
  transform-origin: center;
}
.is-ne .cc-overlay-handle,
.is-sw .cc-overlay-handle {
  cursor: nesw-resize;
}

/* ---------- 控制条 ---------- */

.cc-overlay-controls {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  height: 28px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 12px;
  transform-origin: top left;
}
.cc-overlay-controls.is-below {
  top: 100%;
}
.cc-overlay-controls.is-inside {
  top: auto;
  bottom: 0;
  transform-origin: bottom left;
}

/* 控制条里的按钮 / 图标用 mdui，透明度滑条用原生 input（mdui 滑块塞不进 28px 条）。
   mdui 组件的默认尺寸（按钮 40px、图标 24px）远大于这条窄 bar，所以从外面按元素
   选择器压尺寸——外部样式对 :host 的优先级更高，改得动。 */
.cc-overlay-icon-btn {
  flex: none;
  width: 22px;
  height: 22px;
  min-width: 22px;
  min-height: 22px;
}
.cc-overlay-icon-btn mdui-icon-lock--rounded,
.cc-overlay-icon-btn mdui-icon-lock-open--rounded {
  font-size: 14px;
}

.cc-overlay-sep {
  width: 1px;
  height: 14px;
  background: rgba(255, 255, 255, 0.2);
}

/* 自绘 tooltip：横向居中在控制条里，且宽度上限就是控制条宽度 ——
   控制条本身一定在屏幕内，所以提示内容不可能跑到屏幕外。 */
.cc-overlay-tip-wrap {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
}
.cc-overlay-tip {
  position: absolute;
  left: 0;
  right: 0;
  margin: 0 auto;
  bottom: calc(100% + 6px);
  width: max-content;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(18, 18, 18, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  z-index: 2600;
  /* 提示不能拦住点击 */
  pointer-events: none;
}
.cc-overlay-tip.is-below {
  bottom: auto;
  top: calc(100% + 6px);
}

.cc-overlay-opacity-icon {
  flex: none;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
}

.cc-overlay-slider {
  flex: 1;
  min-width: 48px;
  display: flex;
  align-items: center;
}

.cc-overlay-range {
  width: 100%;
  height: 14px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}
.cc-overlay-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.28);
}
.cc-overlay-range::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4px;
  border-radius: 50%;
  background: #fff;
}

.cc-overlay-value {
  flex: none;
  width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.85);
}

.cc-bar-enter-from,
.cc-bar-leave-to {
  opacity: 0;
}
.cc-bar-enter-active,
.cc-bar-leave-active {
  transition: opacity 120ms ease;
}

/* 锁定提示 */
.cc-overlay-hint {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  margin-top: 6px;
  padding: 4px 8px;
  box-sizing: border-box;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  text-align: center;
  transform-origin: top left;
  /* 关键：提示不能拦住本该透传给游戏的点击 */
  pointer-events: none;
}
.cc-overlay-hint.is-inside {
  top: auto;
  bottom: 0;
  margin-top: 0;
  transform-origin: bottom left;
}
</style>
