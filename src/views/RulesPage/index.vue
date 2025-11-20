<script setup lang="ts">
import OnlineRules from '@/views/RulesPage/components/OnlineRules.vue'
import { onlineRules } from '@/utils/onlineRules'
import { useStore } from '@/store'
import ScrollWrapper from '@/components/ScrollWrapper.vue'

const store = useStore()
</script>

<template>
  <div class="h-full flex flex-col justify-center items-center relative w-full">
    <mdui-card
      variant="outlined"
      class="size-full transition-all border border-[rgb(var(--mdui-color-inverse-primary-dark))] mx-4 mb-4 flex"
      :style="{
        background: `rgba(var(--mdui-color-surface-container-lowest), ${(0.65 * (store.settings.general.bgOpacity || 0.85)) / 0.85})`,
      }"
    >
      <ScrollWrapper class="size-full">
        <OnlineRules :online-rules="onlineRules" />
      </ScrollWrapper>
    </mdui-card>
  </div>
</template>

<style scoped lang="scss"></style>
