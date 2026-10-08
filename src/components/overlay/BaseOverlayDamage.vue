<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'
import { onTelemetrySample, useTelemetry } from '@/overlay/telemetry'
import {
  CollisionDetector,
  DAMAGE_FULL_SECONDS,
  NO_DAMAGE_EPS,
  bodySeconds,
  suspensionSeconds,
} from '@/overlay/damage'
import { flashProgress } from '@/overlay/flash'

// ---------------------------------------------------------------------------
// 车损（俯视图版）：上=前、下=后、左=左、右=右
//   · 每条边外侧一条 4px 粗、两端半圆的长条（上下横、左右竖），颜色按该部位修车时长
//     线性变化：0s 白 → 7.5s 黄 → 15s 及以上红；四个长条的"窄边"都留出外边距；
//   · 长条内侧是修车时长：上下为横排文字，左右为**竖排文字**，且字底都朝组件正中；
//   · 正中央上下两块：中上「Suspension」、中下「Total」（各两行：标签 + 时长）。
//     **有损伤时这两个数值显示橙色**（没损伤仍是原来的灰色细字 No Damage，样式不变）；
//     整台车都没损伤时组件只显示一句 No Damage。
//   · Total = carDamage[4]（centre，车身四处之和） + 悬挂四轮之和。
//   · 碰撞（损伤变大）时**整块组件**覆盖红色：保持 0.1s，再用 0.3s 过渡回原样 ——
//     覆盖层是 .collision-flash，铺满整个组件（背景与所有元素都在它下面）。
//
// ⚠️ 单位标定与碰撞检测都在 @/overlay/damage.ts（纯逻辑，带单测）：
//   车身 carDamage 是"损伤点"（秒 = 原始 ÷ 3.542）；悬挂是 0..1 等级（每 1 = 30 秒）。
// 字段偏移：Physics 224 carDamage[5]（前/后/左/右/中）、680 suspensionDamage[4]（FL/FR/RL/RR）。
// ---------------------------------------------------------------------------

defineOptions({ inheritAttrs: false })
defineProps<{ item: OverlayItem }>()

const tm = useTelemetry()
const hasData = computed(() => tm.active)

const NO_DAMAGE_TEXT = 'No Damage'

const damaged = computed(() => Array.isArray(tm.carDamage) && tm.carDamage.length === 5)

function partSeconds(index: number): number | null {
  if (!hasData.value || !damaged.value) return null
  return bodySeconds(tm.carDamage?.[index])
}

const front = computed(() => partSeconds(0))
const rear = computed(() => partSeconds(1))
const left = computed(() => partSeconds(2))
const right = computed(() => partSeconds(3))
/** carDamage[4] 官方名叫 centre，ACC 填的就是车身四处之和 —— 它就是要显示的车身总时长 */
const centre = computed(() => partSeconds(4))

/** 悬挂：四轮损伤等级之和 × 30 秒（每 1 单位 = 30 秒修车时间） */
const suspension = computed(() => {
  if (!hasData.value || !Array.isArray(tm.suspensionDamage)) return null
  const list = tm.suspensionDamage.filter(v => Number.isFinite(v))
  if (!list.length) return null
  return suspensionSeconds(list.reduce((a, b) => a + b, 0))
})

/** Total = centre（车身） + 悬挂 */
const total = computed(() => {
  const body = centre.value
  if (body === null) return null
  return body + (suspension.value ?? 0)
})

/** 是否"没有车损"：有数据且总量为 0 */
  /**
   * 是否“没有车损”：**按已知的值判断**，而不是只看 total。
   * 踩过的坑：某个损伤数组缺失时 total 是 null，于是走 v-else 分支、把四个部位 + 悬挂 + 总计
   * 全部渲染成 --（用户实测：明明没车损却是一屏 --）。现在：
   *   · 完全没有任何已知值 → 也算“无车损”（宁可只显示一句 No Damage，也不要一屏 --）
   *   · 只要有已知值 → 全部≈0 才算“无车损”（有车身损伤但缺悬挂数据时不会误判）
   */
  const noDamage = computed(() => {
    const known = [front.value, rear.value, left.value, right.value, centre.value, suspension.value]
      .filter((v): v is number => v !== null)
    if (known.length === 0) return true
    return known.every(v => v < NO_DAMAGE_EPS)
  })

function isNoDamage(seconds: number | null) {
  return seconds !== null && seconds < NO_DAMAGE_EPS
}

/** 时长文字：形如 1:05.12（分:秒.百分秒）；没损伤给 No Damage，没数据给 -- */
function fmt(seconds: number | null) {
  if (seconds === null) return '--'
  if (seconds < NO_DAMAGE_EPS) return NO_DAMAGE_TEXT
  // 先取整到百分秒再拆分，避免 5.999 被舍入成 100 这种脏数据
  const totalCs = Math.round(seconds * 100)
  const m = Math.floor(totalCs / 6000)
  const s = Math.floor((totalCs % 6000) / 100)
  const cs = totalCs % 100
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

// ---------- 长条颜色：0 白 → 7.5s 黄 → 15s+ 红（线性） ----------

const RAMP: Array<[number, [number, number, number]]> = [
  [0, [255, 255, 255]],
  [0.5, [245, 196, 0]],
  [1, [220, 38, 38]],
]

function rampColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t))
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [t0, c0] = RAMP[i]
    const [t1, c1] = RAMP[i + 1]
    if (clamped <= t1) {
      const k = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0)
      const rgb = c0.map((v, idx) => Math.round(v + (c1[idx] - v) * k))
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
    }
  }
  const last = RAMP[RAMP.length - 1][1]
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`
}

/** 某个部位长条的样式；没数据时给一条暗色占位条 */
function barStyle(seconds: number | null) {
  if (seconds === null) return { background: 'rgba(255, 255, 255, 0.18)' }
  return { background: rampColor(seconds / DAMAGE_FULL_SECONDS) }
}

const frontBar = computed(() => barStyle(front.value))
const rearBar = computed(() => barStyle(rear.value))
const leftBar = computed(() => barStyle(left.value))
const rightBar = computed(() => barStyle(right.value))

const frontText = computed(() => fmt(front.value))
const rearText = computed(() => fmt(rear.value))
const leftText = computed(() => fmt(left.value))
const rightText = computed(() => fmt(right.value))
const suspensionText = computed(() => fmt(suspension.value))
const totalText = computed(() => fmt(total.value))

// ---------- 碰撞：整块组件覆盖红色（保持 0.1s → 0.3s 过渡回原样）----------
// 判据：车身 + 悬挂的修车时长**变大**（ACC 里这两种损伤只会累计，变大即碰撞）。
// 检测逻辑在 @/overlay/damage.ts；两帧间隔 >1.5s 视为中间暂停过，那一段不计入
// （玩家可能重置了车辆 / 维修过，不能当成刚发生的碰撞）。
const collisionDetector = new CollisionDetector()
const COLLISION_HOLD_MS = 100
const COLLISION_FADE_MS = 300
/** 0 = 刚命中（整块纯红），1 = 已回到原样 */
const collisionProgress = ref(1)
let collisionAt = -Infinity
let collisionRaf = 0

/** 整块红色覆盖的不透明度：1 → 0 */
const collisionOpacity = computed(() => 1 - collisionProgress.value)

function stepCollisionFade() {
  collisionRaf = 0
  const p = flashProgress(
    performance.now() - collisionAt,
    COLLISION_HOLD_MS,
    COLLISION_FADE_MS,
  )
  if (collisionProgress.value !== p) collisionProgress.value = p
  if (p < 1) collisionRaf = requestAnimationFrame(stepCollisionFade)
}

let unsubSample: (() => void) | undefined

onMounted(() => {
  unsubSample = onTelemetrySample(snapshot => {
    if (!snapshot.active) return
    const hit = collisionDetector.push(
      { carDamage: snapshot.carDamage, suspensionDamage: snapshot.suspensionDamage },
      performance.now(),
    )
    if (!hit) return
    collisionAt = performance.now()
    collisionProgress.value = 0
    if (!collisionRaf) collisionRaf = requestAnimationFrame(stepCollisionFade)
  })
})

onBeforeUnmount(() => {
  unsubSample?.()
  if (collisionRaf) {
    cancelAnimationFrame(collisionRaf)
    collisionRaf = 0
  }
})
</script>

<template>
  <BaseOverlayTemplate v-bind="$attrs" :item="item">
    <div class="damage">
      <!-- 整台车都没损伤：只留一句灰字 -->
      <div v-if="noDamage" class="no-damage">{{ NO_DAMAGE_TEXT }}</div>

      <template v-else>
        <!-- 前（上）：长条在最外，文字在长条内侧 -->
        <div class="bar is-front" :style="frontBar"></div>
        <div class="part is-front" :class="{ 'is-none': isNoDamage(front) }">
          {{ frontText }}
        </div>

        <!-- 后（下） -->
        <div class="bar is-rear" :style="rearBar"></div>
        <div class="part is-rear" :class="{ 'is-none': isNoDamage(rear) }">
          {{ rearText }}
        </div>

        <!-- 左：竖排文字，字底朝正中 -->
        <div class="bar is-left" :style="leftBar"></div>
        <div class="part is-left" :class="{ 'is-none': isNoDamage(left) }">
          {{ leftText }}
        </div>

        <!-- 右：竖排文字，字底朝正中 -->
        <div class="bar is-right" :style="rightBar"></div>
        <div class="part is-right" :class="{ 'is-none': isNoDamage(right) }">
          {{ rightText }}
        </div>

        <!-- 中央：上=悬挂，下=总计（总计就是 centre） -->
        <div class="centre-block is-upper">
          <div class="label">Suspension</div>
          <div class="value" :class="{ 'is-none': isNoDamage(suspension) }">
            {{ suspensionText }}
          </div>
        </div>
        <div class="centre-block is-lower">
          <div class="label">Total</div>
          <div class="value" :class="{ 'is-none': isNoDamage(total) }">
            {{ totalText }}
          </div>
        </div>
      </template>

      <!-- 碰撞：整块组件覆盖红色（保持 0.1s → 0.3s 过渡回原样）。
           position: fixed 的包含块是最近的 transform 祖先 .cc-overlay-scaler，
           于是 inset:0 正好铺满整个组件，并跟着组件一起被缩放。 -->
      <div
        v-show="collisionOpacity > 0"
        class="collision-flash"
        :style="{ opacity: collisionOpacity }"
      ></div>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
.damage {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  color: #fff;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

/* ---- 修车时长文字（⚠️ 规则必须带 .part 前缀：否则 .is-left 之类会连带命中长条，
       把长条一起 translateY(-50%)，表现为竖条整体上移、下边缘正好落在纵向正中） ---- */
.part {
  position: absolute;
  font-size: 19px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}
/* 没有损伤：灰色细字 */
.part.is-none,
.value.is-none {
  color: rgba(255, 255, 255, 0.42);
  font-weight: 400;
}

/* 上下：横排，居中 */
.part.is-front,
.part.is-rear {
  left: 0;
  right: 0;
  text-align: center;
}
.part.is-front {
  top: 18px;
}
.part.is-rear {
  bottom: 18px;
}

/* 左右：竖排文字，字底朝组件正中（左侧逆时针 90°、右侧顺时针 90°，互为镜像）。
   ⚠️ 位移用 translate(-50%,-50%) / translate(50%,-50%)（"旋转后再把文字盒中心挪到锚点"），
   锚点写成 calc(18px + 0.5em)：旋转后文字盒的宽度正好等于 1em（line-height: 1），
   所以 +0.5em 抵消掉半宽之后，**文字盒的近条边恒定落在 18px 处**，
   即与 4px 竖条的间距恒为 6px，且不随文字长度、也不随字号（19px 数字 / 13px No Damage）变化 ——
   6px 和上下横排文字与横条之间的边距一致。
   （18px = 竖条内缘：左侧条右缘 12px + 6px；右侧 210 - 18px = 竖条左缘 198px - 6px。） */
.part.is-left,
.part.is-right {
  top: 50%;
  text-align: center;
}
.part.is-left {
  left: calc(18px + 0.5em);
  transform: translate(-50%, -50%) rotate(-90deg);
}
.part.is-right {
  right: calc(18px + 0.5em);
  transform: translate(50%, -50%) rotate(90deg);
}
/* 竖排后文字宽度会变成一行的高度，小字要放宽一点，避免被压窄换行 */
.part.is-left.is-none,
.part.is-right.is-none {
  font-size: 13px;
}

/* ---- 长条：4px 粗、两端半圆（圆角 = 厚度一半）；上下横、左右竖 ---- */
.bar {
  position: absolute;
  border-radius: 2px;
}
.bar.is-front,
.bar.is-rear {
  left: 32px;  /* 窄边（两端）外边距，按要求比竖条的更宽 */
  right: 32px;
  height: 4px;
}
.bar.is-front {
  top: 8px;
}
.bar.is-rear {
  bottom: 8px;
}
.bar.is-left,
.bar.is-right {
  top: 52px;   /* 窄边（两端）外边距，上下对称 ⇒ 竖条整体纵向居中 */
  bottom: 52px;
  width: 4px;
}
.bar.is-left {
  left: 8px;
}
.bar.is-right {
  right: 8px;
}

/* ---- 中央两块 ---- */
.centre-block {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 86px;
  text-align: center;
}
.centre-block.is-upper {
  top: 29%;
}
.centre-block.is-lower {
  top: 57%;
}
.label {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
  opacity: 0.78;
  line-height: 1.2;
}
.value {
  font-size: 19px;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 2px;
  /* 有损伤时橙色（.value.is-none 优先级更高，仍是原来的灰色细字） */
  color: #f97316;
}
.value.is-none {
  font-size: 13px;
}

/* ---- 碰撞：整块组件的红色覆盖（含背景与所有元素）----
   position: fixed 在 .cc-overlay-scaler（带 transform）内部 → 包含块就是它，
   所以 inset:0 正好等于"整个组件"；圆角与基座内容层一致，缩放跟着父层走。 */
.collision-flash {
  position: fixed;
  inset: 0;
  border-radius: 8px;
  background: #ef4444;
  pointer-events: none;
  z-index: 5;
}

/* 整台车都没损伤 */
.no-damage {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  text-align: center;
  font-size: 15px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.42);
  letter-spacing: 0.5px;
}
</style>
