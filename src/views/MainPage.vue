<script setup lang="ts">
import { ref } from 'vue'

const dialogOpen = ref(false)
</script>

<template>
  <div>
    <mdui-button @click="dialogOpen = true">test Google</mdui-button>
    <mdui-dialog :open="dialogOpen">
      <div class="title">Google Sans 测试华为鸿蒙字体</div>
      <mdui-button @click="dialogOpen = false"
        >Google Sans Text close 测试</mdui-button
      >
    </mdui-dialog>
  </div>
</template>
