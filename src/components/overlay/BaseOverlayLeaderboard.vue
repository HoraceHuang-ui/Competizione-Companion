<script setup lang="ts">
import { computed, onMounted, ref, useAttrs, watch } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'
import { useTelemetry } from '@/overlay/telemetry'
import { formatLapShort } from '@/overlay/lapFormat'
import { selectLeaderboardRows } from '@/overlay/leaderboard'
import carData from '@/utils/carData'

// ---------------------------------------------------------------------------
// 排行榜：每行一个车手，按名次排列；第一名固定置顶，其余是"用户 ±2 名"（不够往另一边补位）。
// 行内从左到右：排名(加粗) / 车号(加粗，灰底圆角矩形；**本人白底黑字**) / 车型 logo /
//              车手名(全称) / 最快圈 / 上一圈 / 秒差
//   · **所有要素同字号**（只有排名与车号加粗）
//   · 秒差：正赛 = 距前一名的估算值，其他节 = 与第一名最快圈的差；**第一名显示 --**
//   · **全场最快圈**那位车手的最快圈数字用**紫色**
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
const props = defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()
const hasData = computed(() => tm.active)

// 车型 id → 厂商（carData 每辆车都有 manufacturer）→ logo 文件名
const manufacturerById = new Map<number, string>()
for (const group of Object.values(carData as Record<string, Record<string, { id?: number; manufacturer?: string }>>)) {
  for (const car of Object.values(group)) {
    if (car?.id != null && car.manufacturer) manufacturerById.set(car.id, car.manufacturer)
  }
}
const logoModules = import.meta.glob('@/assets/carLogos/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const logoUrlByManufacturer = new Map<string, string>()
for (const [file, url] of Object.entries(logoModules)) {
  const name = file.split('/').pop()?.replace(/\.png$/i, '')
  if (name) logoUrlByManufacturer.set(name.toLowerCase(), url)
}
function logoOf(carId: number): string | null {
  const mfr = manufacturerById.get(carId)
  return mfr ? logoUrlByManufacturer.get(mfr.toLowerCase()) ?? null : null
}

const rows = computed(() => (hasData.value ? selectLeaderboardRows(tm.leaderboard ?? []) : []))

/**
 * 该车手是否在维修区。主进程 `getLeaderboard()` 每行都会给 `inPit`（广播 carLocation ≥ 2），
 * 但渲染侧那份快照类型在别处维护、不一定带上它 —— 所以这里用宽松判据，不依赖类型声明。
 */
function isInPit(row: unknown): boolean {
  return (row as { inPit?: boolean } | null)?.inPit === true
}

/** 显示出来的这些行里，最快圈最快的那位（它的最快圈数字用紫色） */
const fastestEntryId = computed(() => {
  let best: { id: number; ms: number } | null = null
  for (const row of rows.value) {
    if (row.bestLapMs == null || !Number.isFinite(row.bestLapMs) || row.bestLapMs <= 0) continue
    if (!best || row.bestLapMs < best.ms) best = { id: row.carEntryId, ms: row.bestLapMs }
  }
  return best?.id ?? null
})

function lapText(ms: number | null | undefined): string {
  return ms != null && Number.isFinite(ms) && ms > 0 ? formatLapShort(ms) : '--'
}
/**
 * 秒差（用户规则）：**以本人为基准**
 *   · 本人 → `--`（白色）
 *   · 差整圈（`lapsDelta`）→ 对方领先我 `+N L`（橙）、我领先对方 `-N L`（绿）
 *   · 同圈 → 排在我前面 `+xx.xx`（橙）、排在我后面 `-xx.xx`（绿）；给不出（起步/刚换圈）→ `--`
 */
function gapText(row: { isMe: boolean; inPit?: boolean; gapMs: number | null; lapsDelta: number }): string {
  if (row.isMe) return '--'
  if (row.lapsDelta !== 0) return `${row.lapsDelta > 0 ? '+' : '-'}${Math.abs(row.lapsDelta)} L`
  if (row.gapMs == null || !Number.isFinite(row.gapMs)) return '--'
  const sign = row.gapMs >= 0 ? '+' : '-'
  return `${sign}${(Math.abs(row.gapMs) / 1000).toFixed(2)}`
}
/**
 * 秒差的颜色：**对方在我前面 = 橙、在我后面 = 绿、本人 = 白**。
 * ⚠️ 顺序有讲究：**先判圈差、再判"有没有秒差"** —— 差整圈的车秒差一定是 `null`，
 *    先判 null 会把它们全刷成白色（跟本人一样），方向和颜色都丢了（踩过）。
 *    给不出秒差的同圈车用中性白，不冒充"前面/后面"。
 */
function gapClass(row: { isMe: boolean; gapMs: number | null; lapsDelta: number }): string {
  if (row.isMe) return 'is-me'
  if (row.lapsDelta !== 0) return row.lapsDelta > 0 ? 'is-ahead' : 'is-behind'
  if (row.gapMs == null || !Number.isFinite(row.gapMs)) return 'is-me'
  return row.gapMs >= 0 ? 'is-ahead' : 'is-behind'
}

// ---------- 尺寸自适应（挂载贴合 + 运行中只增不减） ----------
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
  () => rows.value.map(r => `${r.position}|${r.raceNumber}|${r.driverName}|${r.gapMs}|${r.bestLapMs}`).join(','),
  () => fitToContent('grow'),
  { flush: 'post' },
)
</script>

<template>
  <BaseOverlayTemplate v-bind="$attrs" :item="item">
    <!-- 整块用一个栅格：7 列由**所有行共用**，这样列才能竖向对齐、秒差也能贴住右边缘 -->
    <div ref="contentRef" class="board">
      <template v-for="row in rows" :key="row.carEntryId">
        <span class="pos">{{ row.position >= 9999 ? '--' : row.position }}</span>
        <span class="num" :class="{ 'is-me': row.isMe }">{{ row.raceNumber ?? '--' }}</span>
        <span class="logo">
          <img v-if="logoOf(row.carId)" :src="logoOf(row.carId)!" alt="" />
          <span v-else class="logo-fallback">?</span>
        </span>
        <span class="name" :class="{ 'is-me': row.isMe }">{{ row.driverName }}</span>
        <span class="best" :class="{ 'is-fastest': row.carEntryId === fastestEntryId }">{{ lapText(row.bestLapMs) }}</span>
        <span class="last">{{ lapText(row.lastLapMs) }}</span>
        <span class="gap" :class="gapClass(row)">{{ gapText(row) }}</span>
        <span class="pit-cell">
          <span v-if="isInPit(row)" class="pit-mark">P</span>
        </span>
      </template>
      <div v-if="rows.length === 0" class="empty">--</div>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
.board {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: max-content;
  height: max-content;
  box-sizing: border-box;
  /* 左侧收紧：排名离组件左边太远（用户反馈） */
  padding: 8px 12px 8px 6px;
  color: #fff;
  font-variant-numeric: tabular-nums;
  display: grid;
  /* 排名 | 车号 | logo | 车手名 | 最快圈 | 上一圈 | 秒差 —— 全部行共用同一套列 */
  grid-template-columns: max-content max-content max-content max-content max-content max-content max-content max-content;
  align-items: center;
  column-gap: 8px;
  row-gap: 3px;
  /* 所有要素同字号（用户要求），只有排名/车号加粗 */
  font-size: 15px;
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
}
.pos {
  font-weight: 700;
  text-align: right;
  justify-self: end;
  min-width: 1.6em;
}
/* 车号：灰底圆角矩形；**本人白底黑字** */
.num {
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.6em;
  padding: 1px 6px;
  box-sizing: border-box;
  border-radius: 4px;
  background: #6b7280;
  color: #fff;
}
.num.is-me {
  background: #ffffff;
  color: #111111;
}
.name.is-me {
  font-weight: 700;
}
.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 15px;
  justify-self: center;
}
.logo img {
  max-width: 22px;
  max-height: 15px;
  object-fit: contain;
}
.logo-fallback {
  opacity: 0.5;
}
.name {
  min-width: 5em;
}
.best,
.last {
  text-align: right;
  justify-self: end;
  min-width: 4.2em;
}
/* 全场最快圈：紫色 */
.best.is-fastest {
  color: #c084fc;
}
/* 秒差：贴住组件右边缘；前面橙、后面绿、本人白
   min-width 决定"上一圈"和秒差之间的空隙 —— 4.6em 太宽（用户反馈离得太远），收到 3.2em 刚够 -12.34 */
.gap {
  text-align: right;
  justify-self: end;
  min-width: 3.2em;
}
.gap.is-ahead {
  color: #f97316;
}
.gap.is-behind {
  color: #22c55e;
}
.gap.is-me {
  color: #ffffff;
}
/* 行末 P 标：白底黑字、竖向细长圆角矩形；不在站内时留同宽空位，保证各列对齐 */
.pit-cell {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 1.1em;
  justify-self: end;
}
.pit-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.1em;
  padding: 2px 0;
  background: #ffffff;
  color: #111111;
  border-radius: 4px;
  font-weight: 700;
}
.empty {
  opacity: 0.6;
}
</style>
