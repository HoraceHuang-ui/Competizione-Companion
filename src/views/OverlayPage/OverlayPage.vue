<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'
import { useStore } from '@/store'
import { translate } from '@/i18n'
import { getWidget, OVERLAY_WIDGETS } from '@/overlay/registry'
import { fillTelemetryPreview } from '@/overlay/telemetry'
import { clampOpacity, forcedSettingsOf } from '@/overlay/fullscreen'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import type { MainOverlayPayload, OverlayItem } from '@/overlay/types'
import himeDark from '@/assets/asseconHime/ASSECON_HIME_dark.jpg'
import himeLight from '@/assets/asseconHime/ASSECON_HIME_light.jpg'
import '@mdui/icons/layers--rounded.js'
import '@mdui/icons/arrow-upward--rounded.js'
import '@mdui/icons/arrow-downward--rounded.js'

// ---------------------------------------------------------------------------
// 遥测窗管理面板
//
// 数据源是主进程（electron/main/overlay.ts）：这里只做展示与下发，改动后会收到
// overlay:state 广播对齐。
//
// 同一组件同时只存在一个实例，所以侧边栏直接罗列「组件」，主区域就是这个组件的
// 各项参数；没有「全部」这种分组概念（每个组件的不透明度 / 缩放都是独立的）。
// 「显示」开关取代了原来的添加 / 删除：关掉只是隐藏，位置、大小、透明度都会留着。
// ---------------------------------------------------------------------------

const t = translate
const store = useStore()

// 遥测窗依赖 Windows 的窗口特性（WS_EX_NOACTIVATE / WS_EX_TRANSPARENT 等），
// 非 Windows 平台只给一行说明。用 UA 判断是同步的，不会先闪一下正常界面。
const isWindows = /Windows NT/i.test(navigator.userAgent)

const state = ref<MainOverlayPayload>({
  scope: 'main',
  enabled: true,
  items: [],
  displays: [],
})
const selectedKey = ref(OVERLAY_WIDGETS[0]?.id || '')

let unsubState: (() => void) | undefined

const widgets = computed(() =>
  OVERLAY_WIDGETS.map(w => ({
    key: w.id,
    label: t(w.nameKey),
    item: state.value.items.find(i => i.widget === w.id) || null,
  })),
)

const current = computed(
  () =>
    widgets.value.find(w => w.key === selectedKey.value) ||
    widgets.value[0] ||
    null,
)

/** 当前组件的实例；未显示 / 未创建时为 null */
const item = computed<OverlayItem | null>(() => current.value?.item ?? null)
const shown = computed(() => !!item.value && item.value.visible)

const displayOptions = computed(() =>
  state.value.displays.map(d => ({
    value: String(d.id),
    label: `${d.label}${d.primary ? ` (${t('overlay.primaryDisplay')})` : ''} · ${d.bounds.width}×${d.bounds.height}`,
  })),
)

const currentDisplayId = computed(() =>
  item.value ? String(item.value.displayId) : '',
)
const scalePercent = computed(() => Math.round((item.value?.scale ?? 1) * 100))

// ---------- 实时预览 ----------

/**
 * 预览按 100%（组件基准尺寸）绘制：预览高度固定 = 组件基准高度 + 24px padding，
 * 不随「缩放」滑块变化（缩放只影响屏幕上的真实组件）。
 */
const PREVIEW_SCALE = 1

/**
 * 强制铺满屏幕的组件（全屏刹车）：预览用一个 16:9 的图框（底图就是 ASSECON_HIME 那张图，
 * 由预览容器的 backgroundImage 画出来），红条按样例刹车数据叠加在上面。
 */
const FULLSCREEN_PREVIEW = { width: 480, height: 270 }

/** 当前预览组件是否被"强制设置"管着（全屏刹车：锁死/置顶/透明度范围） */
const previewForced = computed(() => forcedSettingsOf(previewItem.value.widget))

const dark = inject('isDark') as
  | { isDark: Ref<boolean>; setDark: (val: boolean) => void }
  | undefined
const himeBg = computed(() =>
  (dark?.isDark?.value ?? true) ? himeDark : himeLight,
)

/** 预览用的假 item：没创建实例时用注册表默认值，先让人看到长什么样。
 *  必须是响应式的：像「赛节信息」这种按内容自适应尺寸的组件会回写 baseWidth/baseHeight，
 *  普通对象写进去不会触发更新，预览框就会和内容对不上。 */
const previewItem = ref<OverlayItem>({
  id: 'preview',
  widget: '',
  displayId: 0,
  x: 0,
  y: 0,
  scale: 1,
  baseWidth: 220,
  baseHeight: 120,
  opacity: 0.6,
  z: 1,
  visible: true,
  locked: false,
  props: {},
})

watch(
  [current, item],
  () => {
    const def =
      OVERLAY_WIDGETS.find(d => d.id === current.value?.key) || OVERLAY_WIDGETS[0]
    const src = item.value
    const forced = forcedSettingsOf(def?.id)
    previewItem.value = {
      id: 'preview',
      widget: def?.id || '',
      displayId: src?.displayId ?? 0,
      x: 0,
      y: 0,
      scale: PREVIEW_SCALE,
      // 强制铺满显示器的组件（全屏刹车）不能拿实例尺寸当预览框（那会是 1920×1080），
      // 预览统一按 16:9 的图框画，见下面的 previewWidth/previewHeight
      baseWidth: forced?.fullscreen
        ? FULLSCREEN_PREVIEW.width
        : src?.baseWidth ?? def?.defaultSize.width ?? 220,
      baseHeight: forced?.fullscreen
        ? FULLSCREEN_PREVIEW.height
        : src?.baseHeight ?? def?.defaultSize.height ?? 120,
      opacity: forced ? clampOpacity(src?.opacity, forced) : src?.opacity ?? 0.6,
      z: forced?.z ?? 1,
      visible: true,
      locked: forced?.locked ?? false,
      props: src?.props ?? {},
    }
  },
  { immediate: true },
)

/**
 * 管理面板所在的窗口收不到遥测广播（只发给覆盖层窗口），预览里因此全是占位符。
 * 这里灌一份静态样例数据；放在 nextTick 里是因为曲线类组件要在挂载后才注册
 * onTelemetrySample 监听器，早灌的话曲线仍然是空的。切换组件后要重新灌一次。
 */
let previewFillToken = 0
watch(
  () => previewItem.value.widget,
  async () => {
    const token = ++previewFillToken
    await nextTick()
    if (token !== previewFillToken) return
    fillTelemetryPreview()
  },
  { immediate: true },
)

const previewWidget = computed(
  () => getWidget(previewItem.value.widget)?.component || null,
)
const previewWidth = computed(
  () => previewItem.value.baseWidth * previewItem.value.scale,
)
const previewHeight = computed(
  () => previewItem.value.baseHeight * previewItem.value.scale,
)

async function refresh() {
  const payload = await window.overlay?.getState()
  if (payload && payload.scope === 'main') state.value = payload
}

async function patch(p: Record<string, unknown>) {
  if (!item.value) return
  const payload = await window.overlay?.updateItems([
    { id: item.value.id, patch: p },
  ])
  if (payload) state.value = payload
}

/** 显示开关：打开时没有实例就创建，有实例就恢复显示；关闭只隐藏，保留全部参数 */
async function setShown(next: boolean) {
  const w = current.value
  if (!w) return
  if (!next) {
    await patch({ visible: false })
    return
  }
  if (w.item) {
    await patch({ visible: true })
    return
  }
  const def = OVERLAY_WIDGETS.find(d => d.id === w.key)
  if (!def) return
  const forced = forcedSettingsOf(def.id)
  const payload = await window.overlay?.addItem({
    widget: def.id,
    baseWidth: def.defaultSize.width,
    baseHeight: def.defaultSize.height,
    // 强制设置里带默认透明度的（全屏刹车 50%），新增时就按它来
    ...(forced ? { opacity: forced.opacity.default } : {}),
  })
  if (payload) state.value = payload
}

const setDisplay = (value: string) => patch({ displayId: Number(value) })
const setOpacity = (value: number) => patch({ opacity: value / 100 })
const setScale = (value: number) => patch({ scale: value / 100 })
const setLocked = (value: boolean) => patch({ locked: value })

/** 透明度滑杆的可用范围：普通组件 0..100%，被强制设置的组件按它的范围（全屏刹车 5..75%） */
const opacityMin = computed(() => Math.round((previewForced.value?.opacity.min ?? 0) * 100))
const opacityMax = computed(() => Math.round((previewForced.value?.opacity.max ?? 1) * 100))
/** 透明度当前值（按可用范围夹取后显示） */
const opacityPercent = computed(() => {
  const forced = previewForced.value
  const raw = item.value?.opacity ?? previewItem.value.opacity
  return Math.round((forced ? clampOpacity(raw, forced) : raw) * 100)
})
/** 置于顶层 / 底层：重排全部组件的 z（1..N），避免序号无限增长 */
async function moveZ(position: 'front' | 'back') {
  const self = item.value
  if (!self) return
  const ordered = [...state.value.items].sort((a, b) => a.z - b.z)
  const rest = ordered.filter(i => i.id !== self.id)
  const next = position === 'front' ? [...rest, self] : [self, ...rest]
  const patches = next
    .map((it, index) => ({ id: it.id, patch: { z: index + 1 } }))
    .filter(p => state.value.items.find(i => i.id === p.id)?.z !== p.patch.z)
  if (!patches.length) return
  const payload = await window.overlay?.updateItems(patches)
  if (payload) state.value = payload
}

onMounted(() => {
  // 非 Windows 不碰 overlay IPC（主进程那边也没有注册这些处理器）
  if (!isWindows) return
  unsubState = window.overlay?.onState(payload => {
    state.value = payload as MainOverlayPayload
  })
  refresh()
})

onBeforeUnmount(() => {
  unsubState?.()
})
</script>

<template>
  <div class="h-full flex flex-col justify-center items-center relative w-full">
    <mdui-card
      variant="outlined"
      class="size-full border border-[rgb(var(--mdui-color-inverse-primary-dark))] mx-4 mb-4 flex flex-col"
      :style="{
        background: `rgba(var(--mdui-color-surface-container-lowest), ${(0.65 * (store.settings.general.bgOpacity || 0.75)) / 0.75})`,
      }"
    >
      <!-- 非 Windows：只展示一行说明 -->
      <div
        v-if="!isWindows"
        class="flex-1 flex items-center justify-center text-lg opacity-80"
      >
        {{ t('overlay.windowsOnly') }}
      </div>

      <div v-else class="flex flex-row flex-1 min-h-0">
        <!-- 主区域 -->
        <div class="flex-1 min-w-0 flex flex-col p-5 gap-5">
          <div class="flex flex-row items-center justify-between">
            <div class="title text-xl font-bold">{{ current?.label }}</div>
            <div class="flex flex-row items-center gap-3">
              <div class="opacity-80">{{ t('overlay.show') }}</div>
              <mdui-switch
                :checked="shown"
                @change="setShown($event.target.checked)"
              ></mdui-switch>
            </div>
          </div>

          <ScrollWrapper class="flex-1 min-h-0 pr-2">
            <div class="flex flex-col gap-5">
              <!-- 实时预览：sticky 在控制项上方；改透明度会立刻反映在这里。
                   高度固定（组件基准高度 + padding），缩放不影响它；
                   pointer-events-none 保证预览里的组件完全不响应鼠标操作。 -->
              <div
                class="sticky top-0 z-10 rounded-xl overflow-hidden border border-[rgb(var(--mdui-color-outline-variant))] pointer-events-none"
                :style="{
                  height: `${previewHeight + 24}px`,
                  backgroundImage: `url(${himeBg})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }"
              >
                <div class="w-full h-full flex items-center justify-center">
                  <div
                    class="relative"
                    :style="{
                      width: `${previewWidth}px`,
                      height: `${previewHeight}px`,
                    }"
                  >
                    <component
                      v-if="previewWidget"
                      :is="previewWidget"
                      :item="previewItem"
                      :active="false"
                      :hint="false"
                      :controls="false"
                      :on-commit="() => {}"
                    />
                  </div>
                </div>
              </div>
              <div class="flex flex-row items-center gap-3">
                <div class="w-28 shrink-0 opacity-80">
                  {{ t('overlay.display') }}
                </div>
                <mdui-select
                  class="flex-1"
                  variant="outlined"
                  :value="currentDisplayId"
                  :disabled="!shown"
                  @change="setDisplay($event.target.value)"
                >
                  <mdui-menu-item
                    v-for="d in displayOptions"
                    :key="d.value"
                    :value="d.value"
                  >
                    {{ d.label }}
                  </mdui-menu-item>
                </mdui-select>
              </div>

              <div class="flex flex-row items-center gap-3">
                <div class="w-28 shrink-0 opacity-80">
                  {{ t('overlay.bgOpacity') }}
                </div>
                <mdui-slider
                  class="flex-1"
                  :value="opacityPercent"
                  :min="opacityMin"
                  :max="opacityMax"
                  :step="1"
                  :disabled="!shown"
                  nolabel
                  @input="setOpacity($event.target.value)"
                ></mdui-slider>
                <div class="w-14 text-right">{{ opacityPercent }}%</div>
              </div>

              <div class="flex flex-row items-center gap-3">
                <div class="w-28 shrink-0 opacity-80">
                  {{ t('overlay.scaleLabel') }}
                </div>
                <mdui-slider
                  class="flex-1"
                  :value="scalePercent"
                  :min="30"
                  :max="200"
                  :step="5"
                  :disabled="!shown || !!previewForced?.fullscreen"
                  nolabel
                  @input="setScale($event.target.value)"
                ></mdui-slider>
                <div class="w-14 text-right">{{ scalePercent }}%</div>
              </div>

              <div class="flex flex-row items-center gap-3">
                <div class="w-28 shrink-0 opacity-80">
                  {{ t('overlay.lockFeature') }}
                </div>
                <mdui-switch
                  :checked="!!item?.locked"
                  :disabled="!shown || !!previewForced?.locked"
                  @change="setLocked($event.target.checked)"
                ></mdui-switch>
                <div class="text-sm opacity-60">
                  {{ previewForced?.locked ? t('overlay.forcedLocked') : t('overlay.lockDesc') }}
                </div>
              </div>

              <div class="flex flex-row items-center gap-3">
                <div class="w-28 shrink-0 opacity-80">
                  {{ t('overlay.layer') }}
                </div>
                <mdui-button
                  variant="outlined"
                  :disabled="!shown || !!previewForced?.z"
                  @click="moveZ('front')"
                >
                  <mdui-icon-arrow-upward--rounded
                    slot="icon"
                  ></mdui-icon-arrow-upward--rounded>
                  {{ t('overlay.toFront') }}
                </mdui-button>
                <mdui-button
                  variant="outlined"
                  :disabled="!shown || !!previewForced?.z"
                  @click="moveZ('back')"
                >
                  <mdui-icon-arrow-downward--rounded
                    slot="icon"
                  ></mdui-icon-arrow-downward--rounded>
                  {{ t('overlay.toBack') }}
                </mdui-button>
                <div v-if="previewForced?.z" class="text-sm opacity-60">
                  {{ t('overlay.forcedTop') }}
                </div>
              </div>
            </div>
          </ScrollWrapper>
        </div>

        <!-- 右侧边栏 -->
        <div
          class="w-56 shrink-0 border-l border-[rgb(var(--mdui-color-outline-variant))] flex flex-col p-3"
        >
          <div class="px-3 pb-2 opacity-70 text-sm">
            {{ t('overlay.title') }}
          </div>
          <ScrollWrapper class="flex-1 min-h-0">
          <mdui-list>
            <mdui-list-item
              v-for="w in widgets"
              :key="w.key"
              rounded
              :class="{
                'bg-[rgb(var(--mdui-color-secondary-container))]':
                  selectedKey === w.key,
                'opacity-50': !w.item || !w.item.visible,
              }"
              @click="selectedKey = w.key"
            >
              <mdui-icon-layers--rounded slot="icon"></mdui-icon-layers--rounded>
              {{ w.label }}
            </mdui-list-item>
          </mdui-list>
          </ScrollWrapper>
        </div>
      </div>
    </mdui-card>
  </div>
</template>
