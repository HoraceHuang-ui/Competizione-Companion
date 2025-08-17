<script setup lang="ts">
import '@mdui/icons/keyboard-arrow-up--rounded.js'
import '@mdui/icons/keyboard-double-arrow-up--rounded.js'
import '@mdui/icons/keyboard-arrow-down--rounded.js'
import '@mdui/icons/keyboard-double-arrow-down--rounded.js'
import '@mdui/icons/keyboard-arrow-left--rounded.js'
import '@mdui/icons/keyboard-arrow-right--rounded.js'
import { computed } from 'vue'

const props = defineProps({
  type: {
    type: String,
    default: 'vertical',
  },
  total: {
    type: Number,
    default: 1,
  },
  pageSize: {
    type: Number,
    default: 20,
  },
})

const emit = defineEmits(['change'])

const curPage = defineModel({
  type: Number,
  default: 1,
})

const totalPages = computed(() => {
  return Math.ceil(props.total / props.pageSize)
})

const pageButtons = computed(() =>
  [
    curPage.value - 2,
    curPage.value - 1,
    curPage.value,
    curPage.value + 1,
    curPage.value + 2,
  ].filter(page => page > 0 && page <= totalPages.value),
)

const changePage = (page: number) => {
  if (page < 1 || page > totalPages.value) return
  curPage.value = page
  emit('change', page)
}
</script>

<template>
  <div
    class="flex flex-col items-center justify-center wrapper"
    v-if="props.type === 'vertical'"
  >
    <mdui-button-icon :disabled="curPage <= 1" @click="changePage(1)">
      <mdui-icon-keyboard-double-arrow-up--rounded></mdui-icon-keyboard-double-arrow-up--rounded>
    </mdui-button-icon>
    <mdui-button-icon :disabled="curPage <= 1" @click="changePage(curPage - 1)">
      <mdui-icon-keyboard-arrow-up--rounded></mdui-icon-keyboard-arrow-up--rounded>
    </mdui-button-icon>

    <div
      class="flex flex-col justify-center items-center rounded-full border border-[rgb(var(--mdui-color-outline-variant))]"
    >
      <mdui-button-icon
        class="text-lg"
        v-for="btn in pageButtons"
        :key="btn"
        @click="changePage(btn)"
        :class="{
          'title font-bold': curPage == btn,
          'mb-2': btn != pageButtons[pageButtons.length - 1],
        }"
        :variant="curPage == btn ? 'filled' : 'text'"
      >
        {{ btn }}
      </mdui-button-icon>
    </div>

    <mdui-button-icon
      :disabled="curPage >= totalPages"
      @click="changePage(curPage + 1)"
    >
      <mdui-icon-keyboard-arrow-down--rounded></mdui-icon-keyboard-arrow-down--rounded>
    </mdui-button-icon>
    <mdui-button-icon
      :disabled="curPage >= totalPages"
      @click="changePage(totalPages)"
    >
      <mdui-icon-keyboard-double-arrow-down--rounded></mdui-icon-keyboard-double-arrow-down--rounded>
    </mdui-button-icon>
  </div>
  <div v-else class="flex flex-row items-center justify-center wrapper">
    <mdui-button-icon
      class="bg-[rgb(var(--mdui-color-secondary-container))]"
      :disabled="curPage <= 1"
      @click="changePage(curPage - 1)"
    >
      <mdui-icon-keyboard-arrow-left--rounded></mdui-icon-keyboard-arrow-left--rounded>
    </mdui-button-icon>

    <div class="w-10 text-center font-bold">{{ curPage }}</div>
    <div>/</div>
    <div class="w-10 text-center">{{ props.total }}</div>

    <mdui-button-icon
      class="bg-[rgb(var(--mdui-color-secondary-container))]"
      :disabled="curPage >= totalPages"
      @click="changePage(curPage + 1)"
    >
      <mdui-icon-keyboard-arrow-right--rounded></mdui-icon-keyboard-arrow-right--rounded>
    </mdui-button-icon>
  </div>
</template>

<style scoped lang="scss">
.wrapper > * {
  margin: 0.25rem 0;
}
</style>
