<script setup lang="ts">
import { computed, onMounted, ref, useAttrs, watch } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'
import { useTelemetry } from '@/overlay/telemetry'

// ---------------------------------------------------------------------------
// 赛节信息（横向长条，一行平铺）：从左到右依次是
//   1. 气温/赛道温度   “23/30°”（Physics airTemp 288 / roadTemp 292）
//   2. 抓地条件        FLO/WET/DMP/GSY/GRN/FAS/OPT（Graphic trackGripStatus 1556）
//   3. 旗帜（小竖条）  绿/黄/红/蓝，见下面的 flagColor
//   4. 当前赛节        自由练习/排位/正赛 → PRACTICE/QUALIFY/RACE…（Graphic session 8）
//                      进站窗口开启时整块反白（白底黑字）显示「进站窗口开启」
//   5. 旗帜（与 3 对称，同一面旗）
//   6. 当前游戏内时间  HH:MM 24 小时制（Graphic Clock 1488）
//
// **尺寸规则：组件不限定宽度** —— 每个元素都是自然宽度（没有 flex:1、没有定宽），
// 内容多宽，组件就多宽（外加上下很少的 padding），高度同理。
// 之所以要把量到的尺寸写回 `item.baseWidth/baseHeight`：基座
// （BaseOverlayTemplate）是按 item 的尺寸铺背景与缩放层的，只让内部元素 max-content
// 的话背景会跟内容对不上。量到尺寸有变化时会走一次 commit 把尺寸落盘，
// 否则管理面板里的预览还用旧尺寸（onCommit/applyPatch 已支持 baseWidth/baseHeight）。
//
// 旗帜取色规则（用户定义）：红 > 黄 > 蓝 > 绿，来源是「全局旗 + 个人旗」两处信号：
//   红 = globalRed(1528)
//   黄 = globalYellow(1500) / globalYellow1..3(1504..1512) / flag(1224)==ACC_YELLOW_FLAG
//   蓝 = flag(1224)==ACC_BLUE_FLAG
//   绿 = globalGreen(1520) / flag(1224)==ACC_GREEN_FLAG
//   都没有 → 画一条暗色占位条（不留空）
// 进站窗口：Static 的 PitWindowStart(676)/PitWindowEnd(680) 是圈号区间，
//   当前圈 = completedLaps + 1 落在区间内即视为窗口开启（练习赛是 0/负哨兵 → 永不开启）。
// 字段偏移与实测依据见仓库根目录 ACC-遥测数据参考.md §1.2.1 / §1.2.2 / §1.3 / §1.4。
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
const props = defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()
const hasData = computed(() => tm.active)

/** ACC_TRACK_GRIP_STATUS → 三字母缩写（用户指定的写法与顺序：flooded→FLO … optimum→OPT） */
const GRIP_ABBR: Record<number, string> = {
  6: 'FLO',
  5: 'WET',
  4: 'DMP',
  3: 'GSY',
  0: 'GRN',
  1: 'FAS',
  2: 'OPT',
}

/** ACC_SESSION_TYPE → 展示名 */
const SESSION_LABELS: Record<number, string> = {
  0: 'PRACTICE',
  1: 'QUALIFY',
  2: 'RACE',
  3: 'HOTLAP',
  4: 'TIME ATTACK',
  5: 'DRIFT',
  6: 'DRAG',
  7: 'HOTSTINT',
  8: 'SUPERPOLE',
}

/** 气温/赛道温度：整数摄氏度，形如 23/30° */
const tempText = computed(() => {
  if (!hasData.value) return '--/--°'
  const air = tm.airTemp
  const road = tm.roadTemp
  if (!Number.isFinite(air) || !Number.isFinite(road)) return '--/--°'
  if (air <= -50 || air >= 100 || road <= -50 || road >= 100) return '--/--°'
  return `${Math.round(air)}/${Math.round(road)}°`
})

const gripText = computed(() => {
  if (!hasData.value || tm.trackGripStatus == null) return '---'
  return GRIP_ABBR[tm.trackGripStatus] ?? '---'
})

/** 旗帜颜色：红 > 黄 > 蓝 > 绿 */
type FlagColor = 'red' | 'yellow' | 'blue' | 'green' | null

const YELLOW_FLAG = 2
const BLUE_FLAG = 1
const GREEN_FLAG = 7

const flagColor = computed<FlagColor>(() => {
  if (!hasData.value) return null
  const anyYellow =
    tm.globalYellow !== 0 ||
    tm.globalYellow1 !== 0 ||
    tm.globalYellow2 !== 0 ||
    tm.globalYellow3 !== 0 ||
    tm.flag === YELLOW_FLAG
  if (tm.globalRed !== 0) return 'red'
  if (anyYellow) return 'yellow'
  if (tm.flag === BLUE_FLAG) return 'blue'
  if (tm.globalGreen !== 0 || tm.flag === GREEN_FLAG) return 'green'
  return null
})

/** 进站窗口：当前圈在 [start, end] 内即开启 */
const pitWindowOpen = computed(() => {
  if (!hasData.value) return false
  const start = tm.pitWindowStart
  const end = tm.pitWindowEnd
  if (start == null || end == null) return false
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false
  if (start <= 0 || end < start) return false
  const currentLap = tm.completedLaps + 1
  return currentLap >= start && currentLap <= end
})

/** 赛节名：进站窗口开启时整体换成「进站窗口开启」且反白 */
const sessionText = computed(() => {
  if (pitWindowOpen.value) return 'PIT WINDOW'
  if (!hasData.value) return '--'
  return SESSION_LABELS[tm.session] ?? '--'
})

/** 一天中的时间 → HH:MM（游戏内时钟，不做时区换算） */
/** 当前节倒计时（节剩余时间）：> 1 小时显示 hh:MM:SS，否则 MM:SS */
const sessionCountdownText = computed(() => {
  if (!hasData.value || tm.sessionTimeLeft == null) return '--:--'
  const ms = tm.sessionTimeLeft
  if (!Number.isFinite(ms) || ms <= 0) return '--:--'
  const total = Math.floor(ms / 1000)
  const pad = (v: number) => String(v).padStart(2, '0')
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
})

const clockText = computed(() => {
  if (!hasData.value || tm.timeOfDay == null) return '--:--'
  const seconds = tm.timeOfDay
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= 2 * 86400) return '--:--'
  const total = Math.floor(seconds) % 86400
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}`
})

// ---------- 自适应尺寸（内容多宽，组件就多宽） ----------

const barRef = ref<HTMLElement | null>(null)

/**
 * 量内容并写回基准尺寸。
 * 注意：这里不能声明 `commit` 这个 emit —— 一旦声明，Vue 就会把它从 $attrs 里摘掉，
 * 基座（BaseOverlayTemplate）靠 v-bind="$attrs" 转发的拖动提交就断线了。
 * 所以直接取转发过来的 onCommit 监听器来用。
 */
const attrs = useAttrs()

function requestCommit() {
  const handler = attrs.onCommit as
    | ((...args: unknown[]) => void)
    | Array<(...args: unknown[]) => void>
    | undefined
  if (Array.isArray(handler)) handler.forEach(fn => fn())
  else if (typeof handler === 'function') handler()
}

function fitToContent() {
  const el = barRef.value
  if (!el) return
  const width = Math.ceil(el.offsetWidth)
  const height = Math.ceil(el.offsetHeight)
  if (width <= 0 || height <= 0) return
  let changed = false
  if (width !== props.item.baseWidth) {
    props.item.baseWidth = width
    changed = true
  }
  if (height !== props.item.baseHeight) {
    props.item.baseHeight = height
    changed = true
  }
  // 尺寸真变了才回写一次（内容换行/赛节切换时才会发生，不会每帧都提交）
  if (changed) requestCommit()
}

// 这几段文字就是内容宽度，它们一变就重新贴合；flush: 'post' 保证在 DOM 更新之后量
watch(
  [tempText, gripText, sessionText, clockText, flagColor, sessionCountdownText],
  () => fitToContent(),
  { immediate: true, flush: 'post' },
)

onMounted(() => {
  // 字体加载完再量一次，避免首帧用兜底字体量出偏差
  requestAnimationFrame(() => fitToContent())
  if (document.fonts?.ready) document.fonts.ready.then(() => fitToContent())
})
</script>

<template>
  <BaseOverlayTemplate v-bind="$attrs" :item="item">
    <div ref="barRef" class="bar" :class="{ 'is-idle': !hasData }">
      <span class="cell">{{ tempText }}</span>
      <span class="cell">{{ gripText }}</span>

      <!-- 旗帜：小的竖向细长方形，左右各一（对称） -->
      <span class="flag" :class="flagColor ? 'is-' + flagColor : ''"></span>

      <span class="cell session" :class="{ 'is-pit': pitWindowOpen }">{{ sessionText }}</span>
      <span class="cell">{{ sessionCountdownText }}</span>

      <span class="flag" :class="flagColor ? 'is-' + flagColor : ''"></span>

      <span class="cell">{{ clockText }}</span>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
/* 关键：max-content —— 宽度由内容决定，不占满 item；item 尺寸由脚本按量到的值写回 */
.bar {
  display: inline-flex;
  width: max-content;
  align-items: center;
  gap: 12px;
  padding: 3px 12px;
  box-sizing: border-box;
  color: #fff;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

.cell {
  flex: none;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

/* 进站窗口开启：白底黑字（内边距属于这个色块本身的造型，不是宽度限制） */
.session.is-pit {
  background: #ffffff;
  color: #000000;
  padding: 0 8px;
  border-radius: 3px;
}

/* 旗帜：竖向细长方形 */
.flag {
  flex: none;
  width: 7px;
  height: 24px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.16);
}
.flag.is-green {
  background: #22c55e;
}
.flag.is-yellow {
  background: #f5c400;
}
.flag.is-red {
  background: #dc2626;
}
.flag.is-blue {
  background: #2563eb;
}

.bar.is-idle .cell {
  opacity: 0.45;
}
</style>
