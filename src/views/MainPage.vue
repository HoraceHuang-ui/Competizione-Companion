<script setup lang="ts">
import { onMounted, ref } from 'vue'

const dialogOpen = ref(false)

const status = ref({})

onMounted(() => {
  fetch('https://acc-status.jonatan.net/api/v2/ac/status', {
    method: 'GET',
  })
    .then(resp => resp.json())
    .then(data => {
      console.log(data)
      status.value = data
    })
})
</script>

<template>
  <div class="size-full flex flex-col justify-center items-center">
    <div class="title mb-2 font-bold text-3xl">
      {{ status.status === 1 ? '服务器没炸' : '服务器炸了' }}
    </div>
    <mdui-button @click="dialogOpen = true">test dialog</mdui-button>
    <mdui-dialog :open="dialogOpen">
      <div class="title">Google Sans 测试华为鸿蒙字体</div>
      <mdui-button @click="dialogOpen = false"
        >Google Sans Text close 测试</mdui-button
      >
    </mdui-dialog>
  </div>
  <div
    class="absolute bottom-2 left-[64px] right-0 text-center text-gray-400 text-sm"
    style="width: calc(100% - 64px)"
  >
    Based on API service of
    <a class="inline" href="https://acc-status.jonatan.net"
      >acc-status.jonatan.net</a
    >
  </div>
</template>
