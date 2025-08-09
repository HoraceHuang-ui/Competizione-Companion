<script setup lang="ts">
import '@mdui/icons/cell-tower--rounded.js'
import '@mdui/icons/view-list--rounded.js'
import '@mdui/icons/display-settings--rounded.js'
import '@mdui/icons/settings--rounded.js'
import '@mdui/icons/send--rounded.js'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from '@/store'
import { setTheme } from 'mdui'
import { themeMap } from '@/utils/enums'
import { translate } from '@/i18n'

const router = useRouter()
const store = useStore()
setTheme(themeMap[store.settings.general.darkMode])

const winMax = () => {
  window.win.max()
}

const winMin = () => {
  window.win.min()
}

const winClose = () => {
  window.win.close()
}

const mode = ref(0) // 0: Server Status
const modes = [
  'general.status',
  'general.servers',
  'general.setup',
  'general.launchACC',
  'general.settings',
]
const pages = ['status', 'list', 'setup', '', 'settings']
const nav = (index: number) => {
  mode.value = index
  router.push({ name: pages[index] })
}

const launching = ref(false)
const launchACC = () => {
  launching.value = true
  window.steam.launch('805550')
  setTimeout(() => {
    launching.value = false
  }, 3000)
}
</script>
<template>
  <mdui-layout class="size-full">
    <mdui-top-app-bar
      variant="center-aligned"
      scroll-target="#mainRouterView"
      class="py-1 pl-5 pr-4 drag"
    >
      <div class="absolute right-0 top-0 z-[9999] focus">
        <div class="traffic-lights focus no-drag py-3 px-2">
          <div
            class="traffic-light traffic-light-maximize"
            @click="winMax"
          ></div>
          <div
            class="traffic-light traffic-light-minimize"
            @click="winMin"
          ></div>
          <div
            class="traffic-light traffic-light-close"
            @click="winClose"
          ></div>
        </div>
      </div>
      <mdui-button-icon class="p-2 mr-5">
        <img src="@/assets/electron.svg" />
      </mdui-button-icon>
      <mdui-top-app-bar-title class="text-xl mt-2">
        <span class="title">{{ translate('general.appName') }}</span>
        <span
          class="mx-4 opacity-60"
          style="font-family: 'Harmony OS Sans SC'; font-weight: 200"
          >|</span
        >
        <span style="color: rgb(var(--mdui-color-primary))">{{
          $t(modes[mode])
        }}</span>
      </mdui-top-app-bar-title>
    </mdui-top-app-bar>

    <mdui-navigation-rail value="status" divider class="pb-4" contained>
      <mdui-tooltip :content="translate('general.status')" placement="right">
        <mdui-button-icon
          class="mb-2"
          :style="{
            background:
              mode == 0
                ? 'rgb(var(--mdui-color-secondary-container))'
                : 'transparent',
          }"
          @click="nav(0)"
        >
          <mdui-icon-cell-tower--rounded></mdui-icon-cell-tower--rounded>
        </mdui-button-icon>
      </mdui-tooltip>

      <mdui-tooltip :content="translate('general.servers')" placement="right">
        <mdui-button-icon
          class="mb-2"
          :style="{
            background:
              mode == 1
                ? 'rgb(var(--mdui-color-secondary-container))'
                : 'transparent',
          }"
          @click="nav(1)"
        >
          <mdui-icon-view-list--rounded></mdui-icon-view-list--rounded>
        </mdui-button-icon>
      </mdui-tooltip>

      <mdui-tooltip :content="translate('general.setup')" placement="right">
        <mdui-button-icon
          class="mb-2"
          :style="{
            background:
              mode == 2
                ? 'rgb(var(--mdui-color-secondary-container))'
                : 'transparent',
          }"
          @click="nav(2)"
        >
          <mdui-icon-display-settings--rounded></mdui-icon-display-settings--rounded>
        </mdui-button-icon>
      </mdui-tooltip>

      <mdui-tooltip
        :content="translate('general.launchACC')"
        placement="right"
        slot="bottom"
        v-if="mode !== 0"
      >
        <mdui-button-icon
          class="mb-2"
          :style="{
            background:
              mode == 3
                ? 'rgb(var(--mdui-color-secondary-container))'
                : 'transparent',
          }"
          @click="launchACC"
          :disabled="launching"
        >
          <mdui-circular-progress
            v-if="launching"
            class="p-2"
          ></mdui-circular-progress>
          <mdui-icon-send--rounded v-else></mdui-icon-send--rounded>
        </mdui-button-icon>
      </mdui-tooltip>
      <mdui-tooltip
        :content="translate('general.settings')"
        placement="right"
        slot="bottom"
      >
        <mdui-button-icon
          :style="{
            background:
              mode == 4
                ? 'rgb(var(--mdui-color-secondary-container))'
                : 'transparent',
          }"
          @click="nav(4)"
        >
          <mdui-icon-settings--rounded></mdui-icon-settings--rounded>
        </mdui-button-icon>
      </mdui-tooltip>
    </mdui-navigation-rail>

    <mdui-layout-main>
      <router-view id="mainRouterView"></router-view>
    </mdui-layout-main>
  </mdui-layout>
</template>

<style>
h1,
h2,
h3,
h4,
h5,
.title {
  font-family:
    Google Sans,
    Harmony OS Sans SC,
    sans-serif;
}
a,
div,
span {
  font-family:
    Google Sans Text,
    Harmony OS Sans SC,
    sans-serif;
}

.drag {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}
</style>
