<script setup lang="ts">
import { ref } from 'vue'
import BaseOverlayTemplate from './BaseOverlayTemplate.vue'
import type { OverlayItem } from '@/overlay/types'

// 遥测窗通用写法：
//   * inheritAttrs: false + v-bind="$attrs"：displayWidth / active / hint 等由宿主注入，
//     commit / busy 事件也随 $attrs 原样冒泡，子组件不需要写任何转发代码；
//   * 唯一必填的 item 单独声明并显式传入——它不能留在 $attrs 里，否则类型检查会认为
//     基座的必填 prop 没有被满足；
//   * 内容里凡是需要真正接收点击的元素，必须标 data-overlay-interactive，
//     否则会被 BaseOverlayTemplate 当成拖动把手。
defineOptions({ inheritAttrs: false })

defineProps<{ item: OverlayItem }>()

// 点一下按钮就 +1：用来直观验证「未锁定时组件内的可交互元素能收到点击」
const clickCount = ref(0)
</script>

<template>
  <BaseOverlayTemplate v-bind="$attrs" :item="item">
    <div class="test-widget">
      <span class="test-text">test</span>
      <button
        class="test-button"
        data-overlay-interactive
        @click="clickCount++"
      >
        test
      </button>
      <span v-if="clickCount" class="test-count">+{{ clickCount }}</span>
    </div>
  </BaseOverlayTemplate>
</template>

<style scoped>
.test-widget {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 12px;
  box-sizing: border-box;
  color: #fff;
  font-size: 14px;
  /* 缩放时文字保持清晰 */
  -webkit-font-smoothing: antialiased;
}

.test-text {
  font-weight: 600;
  letter-spacing: 0.5px;
}

.test-button {
  padding: 4px 12px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.test-button:hover {
  background: rgba(255, 255, 255, 0.24);
}
.test-button:active {
  background: rgba(255, 255, 255, 0.36);
}

.test-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  font-variant-numeric: tabular-nums;
}
</style>
