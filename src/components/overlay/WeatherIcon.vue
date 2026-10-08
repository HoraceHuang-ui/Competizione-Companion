<script setup lang="ts">
// ---------------------------------------------------------------------------
// 雨强图标（ACC_RAIN_INTENSITY 0..5），给「天气预报」遥测窗用。
// 统一 24×24 viewBox、纯白矢量，尺寸交给外层 CSS（组件很小，图标也就十几 px）。
//   0 放晴        ：太阳（圆 + 八条光芒），刻意画小一号
//   1 毛毛雨      ：**空心云** + 1 根短斜线
//   2 小雨        ：空心云 + 2 根短斜线
//   3 中雨        ：空心云 + 3 根短斜线
//   4 大雨        ：空心云 + 3 根**长虚线**（断口留得大，一眼能看出是虚线）
//   5 雷暴       ：空心云 + 两侧各一根**朝左的虚线** + 中间**空心闪电**（比雨线更长、向下更突出）
// kind 为 null（没数据）时画一条灰色短横。
//
// 云朵是描边（fill: none）而不是实心色块，且横向比雨线更宽（雨线只在云朵中间那段）。
// 斜线一律"右上 → 左下"（统一朝左），避免同一个图标里方向不一致。
// ---------------------------------------------------------------------------

defineProps<{ kind: number | null }>()

/**
 * 空心云：三个外凸圆弧 + 一条水平底边，闭合成一条描边路径。
 * 半径都比"弦长一半"大一点，保证 SVG 不需要自动放大半径（否则形状会被扭）。
 * 云横向 5.4→19.0（13.6 宽），雨线最宽时只有 8.2±0.6 → 15.8±0.6（约 9.4 宽），所以云比雨线宽。
 */
const CLOUD_PATH = 'M 5.4 13.6 A 3.1 3.1 0 0 1 8 8.4 A 3.7 3.7 0 0 1 14.6 6.6 A 4.4 4.4 0 0 1 19 13.6 Z'

/** 短实线雨滴（1~3 根的横向中心）—— 统一"右上 → 左下"的短斜线 */
const SOLID_CENTERS: Record<number, number[]> = {
  1: [12],
  2: [9.6, 14.4],
  3: [8.2, 12, 15.8],
}
/** 大雨用的长虚线（横向中心与 3 根实线一致） */
const DASHED_CENTERS = [8.2, 12, 15.8]
</script>

<template>
  <svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true">
    <!-- 没数据：灰色短横 -->
    <template v-if="kind === null">
      <rect x="8.5" y="11.2" width="7" height="1.6" rx="0.8" fill="rgba(255,255,255,0.35)" />
    </template>

    <!-- 0 放晴（比原来小一号） -->
    <template v-else-if="kind === 0">
      <circle cx="12" cy="12" r="3" fill="#fff" />
      <g stroke="#fff" stroke-width="1.4" stroke-linecap="round">
        <line x1="12" y1="7.6" x2="12" y2="5.4" />
        <line x1="12" y1="16.4" x2="12" y2="18.6" />
        <line x1="7.6" y1="12" x2="5.4" y2="12" />
        <line x1="16.4" y1="12" x2="18.6" y2="12" />
        <line x1="8.89" y1="8.89" x2="7.33" y2="7.33" />
        <line x1="15.11" y1="15.11" x2="16.67" y2="16.67" />
        <line x1="15.11" y1="8.89" x2="16.67" y2="7.33" />
        <line x1="8.89" y1="15.11" x2="7.33" y2="16.67" />
      </g>
    </template>

    <!-- 1~3 毛毛雨/小雨/中雨：空心云 + N 根短实线 -->
    <template v-else-if="kind === 1 || kind === 2 || kind === 3">
      <path :d="CLOUD_PATH" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" />
      <g stroke="#fff" stroke-width="1.4" stroke-linecap="round">
        <line
          v-for="cx in SOLID_CENTERS[kind]"
          :key="cx"
          :x1="cx + 0.6"
          y1="15.6"
          :x2="cx - 0.6"
          y2="19"
        />
      </g>
    </template>

    <!-- 4 大雨：空心云 + 3 根长虚线（断口留得大） -->
    <template v-else-if="kind === 4">
      <path :d="CLOUD_PATH" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" />
      <g
        stroke="#fff"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-dasharray="2 3"
      >
        <line
          v-for="cx in DASHED_CENTERS"
          :key="cx"
          :x1="cx + 0.95"
          y1="14.8"
          :x2="cx - 0.95"
          y2="20.8"
        />
      </g>
    </template>

    <!-- 5 雷暴：空心云 + 两侧朝左的虚线 + 中间空心闪电（更长、向下突出雨线） -->
    <template v-else-if="kind >= 5">
      <path :d="CLOUD_PATH" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" />
      <g
        stroke="#fff"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-dasharray="1.6 2.2"
      >
        <!-- 两条都朝左（右上 → 左下） -->
        <line x1="7" y1="15" x2="5.7" y2="19.6" />
        <line x1="18" y1="15" x2="16.7" y2="19.6" />
      </g>
      <!-- 空心闪电：顶端伸进云朵里（11.4，云底边 13.6），下端 22.9 比两侧雨线（19.6）明显更低 -->
      <path
        d="M 13.6 11.4 L 9.8 18.4 L 11.8 18.4 L 10.7 22.9 L 14.8 16.6 L 12.6 16.6 Z"
        fill="none"
        stroke="#fff"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
    </template>
  </svg>
</template>

<style scoped>
.wx-icon {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
