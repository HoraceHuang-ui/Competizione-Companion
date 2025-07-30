<script setup lang="ts">
import { onMounted, ref } from 'vue'
import '@mdui/icons/check-circle--rounded.js'
import '@mdui/icons/error--rounded.js'
import '@mdui/icons/refresh--rounded.js'

const dialogOpen = ref(false)

const loading = ref(false)
const status = ref({})
const launching = ref(false)

const launchGame = () => {
  launching.value = true
  window.steam.launch('805550')
  setTimeout(() => {
    launching.value = false
  }, 3000)
}

const queryData = () => {
  loading.value = true
  fetch('https://acc-status.jonatan.net/api/v2/acc/status', {
    method: 'GET',
  })
    .then(resp => resp.json())
    .then(data => {
      console.log(data)
      status.value = data
      loading.value = false
    })
}

const accStatusExt = () => {
  window.electron.openExtLink('https://acc-status.jonatan.net')
}

onMounted(() => {
  queryData()
})
</script>

<template>
  <div
    class="size-full flex flex-col justify-center items-center pb-8 relative"
  >
    <div class="loading-spinner" v-if="loading">
      <mdui-circular-progress></mdui-circular-progress>
    </div>
    <div v-else>
      <div class="flex flex-row justify-center">
        <div
          class="rounded-full px-1 py-0.5 border border-gray-400 mb-3 flex flex-row justify-center items-center"
        >
          <mdui-icon-check-circle--rounded
            v-if="status.status === 1"
            class="text-green-500 dark:text-green-400"
          ></mdui-icon-check-circle--rounded>
          <mdui-icon-error--rounded
            v-else
            class="text-red-500 dark:text-red-400"
          ></mdui-icon-error--rounded>
          <div class="mx-2 mt-0.5">
            {{ status.status == 1 ? '悲报' : '喜报' }}
          </div>
        </div>
      </div>
      <div class="title mb-1 font-bold text-3xl relative">
        {{
          'status' in status
            ? status.status === 1
              ? '服务器没炸'
              : '服务器炸啦'
            : '查服务器炸没炸的服务器炸了'
        }}
        <mdui-button-icon
          style="color: rgb(var(--mdui-color-primary))"
          class="absolute -right-10 -top-1"
          @click="queryData"
        >
          <mdui-icon-refresh--rounded></mdui-icon-refresh--rounded>
        </mdui-button-icon>
      </div>
      <div v-if="!status.status" class="opacity-70 text-center mb-3">
        舞萌DX启动！
      </div>
    </div>

    <div
      class="absolute bottom-2 left-0 right-0 text-center text-gray-400 text-sm flex flex-col items-center"
    >
      <mdui-button
        @click="launchGame"
        :disabled="launching"
        :loading="launching"
        class="w-max mb-3"
        >启动ACC</mdui-button
      >
      <span
        >API 服务来自
        <a class="inline cursor-pointer" @click="accStatusExt"
          >acc-status.jonatan.net</a
        ></span
      >
    </div>
  </div>
</template>
