<script setup lang="ts">
import '@mdui/icons/cell-tower--rounded.js'
import '@mdui/icons/view-list--rounded.js'
import '@mdui/icons/display-settings--rounded.js'
import '@mdui/icons/settings--rounded.js'

import { ref } from 'vue'

const winMax = () => {}

const winMin = () => {
  window.dispatchEvent(new Event('minimize'))
}

const winClose = () => {
  window.dispatchEvent(new Event('close'))
}

const mode = ref(0) // 0: Server Status
const modes = [
  'Lobby Server Status',
  'Public Server List',
  'Setup Management, Settings',
]
</script>
<template>
  <div class="absolute right-0 top-0 z-[9999] focus">
    <div class="traffic-lights focus no-drag py-3 px-2">
      <div class="traffic-light traffic-light-maximize" @click="winMax"></div>
      <div class="traffic-light traffic-light-minimize" @click="winMin"></div>
      <div class="traffic-light traffic-light-close" @click="winClose"></div>
    </div>
  </div>
  <mdui-layout class="size-full">
    <mdui-top-app-bar
      variant="center-aligned"
      scroll-target="#mainRouterView"
      class="py-1 px-5"
    >
      <mdui-button-icon class="p-2">
        <img src="@/assets/electron.svg" />
      </mdui-button-icon>
      <mdui-top-app-bar-title class="title text-xl mt-2">
        <span>Competizione Companion</span>
        <span
          class="mx-4 opacity-60"
          style="font-family: 'Harmony OS Sans SC'; font-weight: 200"
          >|</span
        >
        <span style="color: rgb(var(--mdui-color-primary))">{{
          modes[mode]
        }}</span>
      </mdui-top-app-bar-title>
      <mdui-button-icon class="pointer-events-none"></mdui-button-icon>
    </mdui-top-app-bar>

    <mdui-navigation-rail value="status" divider class="pb-4" contained>
      <mdui-tooltip content="Lobby Server Status" placement="right">
        <mdui-button-icon
          class="mb-2"
          :style="{
            background:
              mode == 0
                ? 'rgb(var(--mdui-color-secondary-container))'
                : 'transparent',
          }"
          @click="mode = 0"
        >
          <mdui-icon-cell-tower--rounded></mdui-icon-cell-tower--rounded>
        </mdui-button-icon>
      </mdui-tooltip>

      <mdui-tooltip content="Public Server List" placement="right">
        <mdui-button-icon
          class="mb-2"
          :style="{
            background:
              mode == 1
                ? 'rgb(var(--mdui-color-secondary-container))'
                : 'transparent',
          }"
          @click="mode = 1"
        >
          <mdui-icon-view-list--rounded></mdui-icon-view-list--rounded>
        </mdui-button-icon>
      </mdui-tooltip>

      <mdui-tooltip content="Setup Management" placement="right">
        <mdui-button-icon
          class="mb-2"
          :style="{
            background:
              mode == 2
                ? 'rgb(var(--mdui-color-secondary-container))'
                : 'transparent',
          }"
          @click="mode = 2"
        >
          <mdui-icon-display-settings--rounded></mdui-icon-display-settings--rounded>
        </mdui-button-icon>
      </mdui-tooltip>

      <mdui-tooltip content="Settings" placement="right" slot="bottom">
        <mdui-button-icon
          :style="{
            background:
              mode == 3
                ? 'rgb(var(--mdui-color-secondary-container))'
                : 'transparent',
          }"
          @click="mode = 3"
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
</style>
