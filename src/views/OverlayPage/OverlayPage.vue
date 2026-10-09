<script setup lang="ts">
import '@mdui/icons/help-outline--rounded.js'
import CarSelector from '@/components/CarSelector.vue'
import ChipSelect from '@/components/ChipSelect.vue'
import carData from '@/utils/carData'
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

/** preload 是否暴露了 setAllLocked（见 electron 侧）；没有就走逐组件 patch */
const hasSetAllLocked = true
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

// ---------------- 「转速」组件的红线转速（用户要求：按车辆单独设置，默认 8000） ----------------
/** 组别：直接用项目自带的车型库键（GT3 / GT4 / GTC / TCX） */
const rpmGroups = Object.keys(carData as Record<string, unknown>)
const rpmGroup = ref(rpmGroups[0] ?? 'GT3')
/** CarSelector 的 v-model 是对象（车型键在 .value 里，BOP 页就是 curCar?.value），这里保持原样 */
const rpmCar = ref<{ value?: string } | string | null>(null)
watch(rpmGroup, () => { rpmCar.value = null }, { immediate: true })
/** 已保存的按车红线表（来自该组件实例的 props） */
/** 当前选中的车型键（CarSelector 给的是对象，键在 .value；也容忍直接给字符串） */
const rpmCarKey = computed(() => {
  const c = rpmCar.value
  if (c == null) return ''
  return typeof c === 'string' ? c : String((c as { value?: string }).value ?? '')
})
const rpmRedlineByCar = computed<Record<string, number>>(
  () => ((previewItem.value.props as { redlineByCar?: Record<string, number> } | undefined)?.redlineByCar ?? {}),
)
/** 当前选中车的红线（没配过 = 8000） */
const rpmRedline = computed(() => {
  const v = Number(rpmRedlineByCar.value[rpmCarKey.value])
  return Number.isFinite(v) && v > 0 ? v : 8000
})
/** 写回：合并进 props.redlineByCar 后下发（主进程 applyPatch 会做浅合并） */
// ---------------- 「Delta 条」的显示数据（整圈 / Sector） ----------------
/** ChipSelect 的选项值；标签走 i18n */
const deltaModes = ['lap', 'sector']
const deltaMode = computed<string>({
  get: () => ((previewItem.value.props as { deltaMode?: string } | undefined)?.deltaMode === 'sector' ? 'sector' : 'lap'),
  set: value => void applyWidgetProp('deltaMode', value),
})

/** 通用：把一项设置写进该组件实例的 props（主进程 applyPatch 会做浅合并） */
async function applyWidgetProp(key: string, value: unknown) {
  const self = item.value
  const next = { ...(previewItem.value.props as Record<string, unknown>), [key]: value }
  // 预览立即反映
  ;(previewItem.value.props as Record<string, unknown>) = next
  if (!self) return
  const payload = await window.overlay?.updateItems([{ id: self.id, patch: { props: { [key]: value } } }])
  if (payload) state.value = payload
}

/**
 * 红线输入框：**失焦（change）后**才校验（用户要求），失败就还原成原转速值、不写回。
 * 合法范围 1000..20000 rpm；空值 / 非数字 / 越界都算失败。
 * （原来挂在 @input 上是边输边写、边钳位，用户要求改掉。）
 */
function onRedlineChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  if (!input) return
  const parsed = Number(input.value)
  const valid = Number.isFinite(parsed) && parsed >= 1000 && parsed <= 20000
  if (!valid) {
    input.value = String(rpmRedline.value) // 校验失败：回到原值
    return
  }
  void applyRedline(parsed)
}

async function applyRedline(next: number) {
  const self = item.value
  const value = Math.round(next)
  if (!rpmCarKey.value || !Number.isFinite(value)) return
  const bag = { ...rpmRedlineByCar.value, [rpmCarKey.value]: value }
  // 预览立即反映
  ;(previewItem.value.props as Record<string, unknown>) = {
    ...(previewItem.value.props as Record<string, unknown>),
    redlineByCar: bag,
  }
  if (!self) return
  const payload = await window.overlay?.updateItems([{ id: self.id, patch: { props: { redlineByCar: bag } } }])
  if (payload) state.value = payload
}

/** 全局锁定：面板里已知的每个组件（来自主进程 state 广播） */
const overlayItems = ref<Array<{ id: string; locked?: boolean }>>([])
const allLocked = computed(
  () => overlayItems.value.length > 0 && overlayItems.value.every(i => !!i.locked),
)
async function onToggleAllLocked(value: boolean) {
  if (hasSetAllLocked) {
    await window.overlay?.setAllLocked?.(value)
    return
  }
  // preload 没暴露时：对每个已知组件逐个下发
  const patches = overlayItems.value.map(i => ({ id: i.id, patch: { locked: value } }))
  if (patches.length) await window.overlay?.updateItems(patches)
}

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
      overlayItems.value = ((payload as { items?: Array<{ id: string; locked?: boolean }> })?.items ?? [])
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

              <!-- 单个组件的锁定开关已移除（用户要求）：锁定统一由侧边栏底部的全局开关 / Ctrl+Alt+L 控制 -->

              <!-- 「转速」组件：红线转速（左标题 + 右横排：组别 / 车型 / 输入框） -->
              <div
                v-if="previewItem.widget === 'rpm'"
                class="flex flex-row items-center gap-3"
              >
                <div class="w-28 shrink-0 opacity-80">
                  {{ t('overlay.rpmRedline') }}
                </div>
                <ChipSelect
                  v-model="rpmGroup"
                  chip-class="rounded-full"
                  :items="rpmGroups"
                  :item-label="(g: unknown) => String(g)"
                  :chip-label="(g: unknown) => String(g)"
                />
                <CarSelector
                  v-model="rpmCar"
                  :group="rpmGroup"
                  dropdown-placement="right"
                  chip-class="border border-[rgb(var(--mdui-color-outline-variant))]"
                />
                <mdui-text-field
                  class="rpm-input w-28 shrink-0 cursor-text h-[46px]"
                  type="number"
                  :value="String(rpmRedline)"
                  :disabled="!rpmCarKey"
                  :key="rpmCarKey || 'none'"
                  @change="onRedlineChange($event)"
                  variant="outlined"
                ></mdui-text-field>
                <div class="text-sm opacity-60">rpm</div>
              </div>

              <!-- 「Delta 条」：显示数据（整圈 / Sector） -->
              <div
                v-if="previewItem.widget === 'deltaBar'"
                class="flex flex-row items-center gap-3"
              >
                <div class="w-28 shrink-0 opacity-80">
                  {{ t('overlay.displayData') }}
                </div>
                <ChipSelect
                  v-model="deltaMode"
                  chip-class="rounded-full"
                  :items="deltaModes"
                  :item-label="(m: unknown) => t('overlay.' + (m === 'sector' ? 'deltaModeSector' : 'deltaModeLap'))"
                  :chip-label="(m: unknown) => t('overlay.' + (m === 'sector' ? 'deltaModeSector' : 'deltaModeLap'))"
                />
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
          <!-- 全局锁定（用户要求）：所有组件一起锁定/解锁；锁定后鼠标穿透到游戏，Ctrl+Alt+L 同效 -->
          <div
            class="mt-2 pt-3 border-t border-[rgb(var(--mdui-color-outline-variant))] flex flex-row items-center justify-between gap-2"
          >
            <!-- 左：锁定 + ?（tooltip 里有完整说明） -->
            <div class="flex flex-row items-center gap-1">
              <!-- 只显示「锁定」两个字；括号里的说明在 ? 的 tooltip 里 -->
              <span class="opacity-80">{{ t('overlay.lockFeature') }}</span>
              <mdui-tooltip placement="left">
                <div slot="content">
                  {{ t('overlay.lockGlobalTip') }}
                </div>
                <mdui-button-icon>
                  <mdui-icon-help-outline--rounded></mdui-icon-help-outline--rounded>
                </mdui-button-icon>
              </mdui-tooltip>
            </div>
            <!-- 右：锁定开关 -->
            <mdui-switch
              :checked="allLocked"
              @change="onToggleAllLocked($event.target.checked)"
            ></mdui-switch>
          </div>
        </div>
      </div>
    </mdui-card>
  </div>
</template>

<style scoped>
/* 红线输入框：照抄「设置 → 偏好 → 炸服时提示」那套 CSS Part 自定义（胶囊形 + 底色） */
.rpm-input::part(container) {
  border-radius: 999px;
  background: rgb(var(--mdui-color-on-secondary));
}
</style>
