<script setup lang="ts">
import ScrollWrapper from '@/components/ScrollWrapper.vue'

const props = defineProps({
  setup: {
    type: Object,
    required: true,
  },
})

const scrollValue = defineModel({
  type: Number,
  default: 0,
})
</script>

<template>
  <ScrollWrapper v-model="scrollValue"> {{ props.setup }}</ScrollWrapper>
</template>

<style scoped></style>
