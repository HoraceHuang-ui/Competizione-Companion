<script setup lang="ts">
import ScrollWrapper from '@/components/ScrollWrapper.vue'

const props = defineProps({
  setup: {
    type: Object,
    required: true,
  },
  scrollValue: {
    type: Number,
    default: 0,
  },
})
</script>

<template>
  <ScrollWrapper> {{ props.setup }}</ScrollWrapper>
</template>

<style scoped></style>
