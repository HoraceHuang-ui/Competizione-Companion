<script setup>
import { onMounted, ref } from 'vue'

const props = defineProps({
  fill: String,
})
</script>

<template>
  <div>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path
        fill-rule="evenodd"
        :fill="props.fill || '#C82227'"
        d="
    M 22 0 L 78 0 A 22 22 0 0 1 100 22 L 100 78 A 22 22 0 0 1 78 100 L 22 100 A 22 22 0 0 1 0 78 L 0 22 A 22 22 0 0 1 22 0 Z 
    M 22 10 A 12 12 0 0 0 10 22 L 10 78 A 12 12 0 0 0 22 90 L 78 90 A 12 12 0 0 0 90 78 L 90 22 A 12 12 0 0 0 78 10 Z 
    M 22 25 A 5 5 0 0 1 32 25 L 32 75 A 5 5 0 0 1 22 75 Z 
    M 47 25 A 5 5 0 0 1 57 25 L 57 75 A 5 5 0 0 1 47 75 L 47 55 L 41 55 A 5 5 0 0 1 41 45 L 47 45 Z 
    M 68 25 A 5 5 0 1 1 78 25 A 5 5 0 1 1 68 25 Z 
    M 68 40 A 5 5 0 0 1 78 40 L 78 55 L 66 55 A 5 5 0 0 1 66 45 L 68 45 Z
  "
      />
    </svg>
  </div>
</template>
