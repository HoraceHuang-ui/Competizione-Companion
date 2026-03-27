<script setup lang="ts">
import { useStore } from '@/store'
import { getCarDisplayById, getTrackDisplay } from '@/utils/utils'
import LanguageSelector from '@/views/SettingsPage/components/LanguageSelector.vue'
import ChipSelect from './ChipSelect.vue'
import FavDialog from '@/views/SettingsPage/components/FavDialog.vue'
import { computed, ref } from 'vue'

import '@mdui/icons/help-outline--rounded.js'

import '@mdui/icons/cell-tower--rounded.js'
import '@mdui/icons/view-list--rounded.js'
import '@mdui/icons/display-settings--rounded.js'
import '@mdui/icons/settings--rounded.js'
import '@mdui/icons/send--rounded.js'
import '@mdui/icons/balance--rounded.js'
import '@mdui/icons/close--rounded.js'
import '@mdui/icons/announcement.js'
import '@mdui/icons/assistant--rounded.js'
import '@mdui/icons/format-paint--rounded.js'
import '@mdui/icons/chevron-right--rounded.js'

import HipoleLogoSvg from '@/assets/hipole/logo_svg.vue'

const helpPage = ref(1)
const helpDialogOpen = defineModel({ type: Boolean, default: false })
const showFavDialog = ref(false)

const lang = ref(localStorage.lang || 'en_US')
const dispMap = ['dispEnFull', 'dispEnShort', 'dispLocalShort']
const dispItems = computed(() => {
  if (lang.value === 'en_US') {
    return [1, 2]
  } else {
    return [1, 2, 3]
  }
})

const store = useStore()

const closeDialog = () => {
  helpDialogOpen.value = false
  store.general.firstSetupFlag = true
}
</script>

<template>
  <mdui-dialog class="help-dialog" :open="helpDialogOpen">
    <div
      slot="headline"
      class="w-full flex flex-row justify-between items-center"
    >
      <div>{{ $t('tutorial.title') }}</div>
      <mdui-button-icon v-if="helpPage === 9" @click="closeDialog">
        <mdui-icon-close--rounded></mdui-icon-close--rounded>
      </mdui-button-icon>
    </div>
    <MyCarousel
      style="width: 500px; height: 280px"
      show-arrow="never"
      show-indicator="never"
      v-model="helpPage"
      :autoplay="false"
    >
      <div class="help-item">
        <div class="mb-4 text-left w-full">{{ $t('tutorial.page1text') }}</div>
        <div class="item">
          <div class="item-in">
            <div>{{ $t('settings.language') }}</div>
            <LanguageSelector v-model="lang" />
          </div>
        </div>

        <div class="item mt-4">
          <div class="item-in">
            <div>{{ $t('settings.carDisp') }}</div>
            <ChipSelect
              v-model="store.settings.setup.carDisplay"
              chip-class="rounded-full"
              :items="dispItems"
              :item-label="item => $t(`settings.${dispMap[item - 1]}`)"
              :chip-label="item => $t(`settings.${dispMap[item - 1]}`)"
            >
            </ChipSelect>
          </div>
        </div>
        <div class="text-left w-4/5 opacity-60 italic">
          {{ getCarDisplayById(33) }}
        </div>

        <div class="item mt-4">
          <div class="item-in">
            <div>{{ $t('settings.trackDisp') }}</div>
            <ChipSelect
              v-model="store.settings.setup.trackDisplay"
              chip-class="rounded-full"
              :items="dispItems"
              :item-label="item => $t(`settings.${dispMap[item - 1]}`)"
              :chip-label="item => $t(`settings.${dispMap[item - 1]}`)"
            >
            </ChipSelect>
          </div>
        </div>
        <div class="text-left w-4/5 opacity-60 italic">
          {{ getTrackDisplay('imola') }}
        </div>

        <div class="item mt-4">
          <div class="item-in">
            <div class="flex flex-row items-center">
              <div>{{ $t('settings.favCarsTracks') }}</div>
              <mdui-tooltip :content="$t('settings.favCarsTracksTooltip')">
                <mdui-button-icon>
                  <mdui-icon-help-outline--rounded></mdui-icon-help-outline--rounded> </mdui-button-icon
              ></mdui-tooltip>
            </div>
            <mdui-button variant="tonal" @click="showFavDialog = true">
              {{ $t('general.clickToSet') }}
            </mdui-button>
          </div>
        </div>
      </div>
      <div class="help-item">
        <div class="mb-2 text-left w-full title flex flex-row items-center">
          <mdui-icon-cell-tower--rounded
            class="bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))] rounded-full size-8 p-1"
          ></mdui-icon-cell-tower--rounded>
          <div>
            <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
              {{ `「${$t('general.status')}」` }}</span
            >
            {{ $t('tutorial.pageDesc') }}
          </div>
        </div>
        <div class="ml-10">{{ $t('tutorial.page2desc') }}</div>
      </div>
      <div class="help-item">
        <div class="mb-2 text-left w-full title flex flex-row items-center">
          <mdui-icon-view-list--rounded
            class="bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))] rounded-full size-8 p-1"
          ></mdui-icon-view-list--rounded>
          <div>
            <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
              {{ `「${$t('general.servers')}」` }}</span
            >
            {{ $t('tutorial.pageDesc') }}
          </div>
        </div>
        <div class="ml-10">{{ $t('tutorial.page3desc') }}</div>
      </div>
      <div class="help-item">
        <div class="mb-2 text-left w-full title flex flex-row items-center">
          <mdui-icon-display-settings--rounded
            class="bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))] rounded-full size-8 p-1"
          ></mdui-icon-display-settings--rounded>
          <div>
            <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
              {{ `「${$t('general.setup')}」` }}</span
            >
            {{ $t('tutorial.pageDesc') }}
          </div>
        </div>
        <div class="w-full text-left ml-18">{{ $t('tutorial.page4desc') }}</div>
        <ul class="list-disc list-inside ml-10">
          <li v-for="i in [1, 2, 3, 4, 5]" :key="i">
            {{ $t(`tutorial.page4li${i}`) }}
          </li>
        </ul>
      </div>
      <div class="help-item">
        <div class="mb-2 text-left w-full title flex flex-row items-center">
          <mdui-icon-balance--rounded
            class="bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))] rounded-full size-8 p-1"
          ></mdui-icon-balance--rounded>
          <div>
            <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
              {{ `「${$t('general.bop')}」` }}</span
            >
            {{ $t('tutorial.pageDesc') }}
          </div>
        </div>
        <div class="ml-10">{{ $t('tutorial.page5desc') }}</div>
      </div>
      <div class="help-item">
        <div class="mb-2 text-left w-full title flex flex-row items-center">
          <div
            class="flex flex-row bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))] rounded-full"
          >
            <HipoleLogoSvg
              class="size-7 py-1.5 pl-2 mr-2"
              fill="rgb(var(--mdui-color-on-primary))"
            />
            <mdui-icon-announcement
              class="size-8 py-1 pr-2"
            ></mdui-icon-announcement>
          </div>
          <div>
            <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
              {{ `「${$t('general.report')}」` }}</span
            >
            {{ $t('tutorial.pageDesc') }}
          </div>
        </div>
        <div class="ml-10">{{ $t('tutorial.page6desc') }}</div>
      </div>
      <div class="help-item">
        <div class="mb-2 text-left w-full title flex flex-row items-center">
          <div
            class="flex flex-row bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))] rounded-full"
          >
            <HipoleLogoSvg
              class="size-7 py-1.5 pl-2"
              fill="rgb(var(--mdui-color-on-primary))"
            />
            <mdui-icon-format-paint--rounded
              class="size-8 p-1"
            ></mdui-icon-format-paint--rounded>
          </div>
          <div>
            <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
              {{ `「${$t('general.livery')}」` }}</span
            >
            {{ $t('tutorial.pageDesc') }}
          </div>
        </div>
        <div class="ml-10">{{ $t('tutorial.page7desc') }}</div>
      </div>
      <div class="help-item">
        <div class="mb-2 text-left w-full title flex flex-row items-center">
          <mdui-icon-assistant--rounded
            class="bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))] rounded-full size-8 p-1"
          ></mdui-icon-assistant--rounded>
          <div>
            <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
              {{ `「AI ${$t('general.appNickName')}」` }}</span
            >
            {{ $t('tutorial.pageDesc') }}
          </div>
        </div>
        <div class="ml-10">{{ $t('tutorial.page8desc') }}</div>
      </div>
      <div class="help-item">
        <div>{{ $t('tutorial.page9desc') }}</div>
      </div>
    </MyCarousel>
    <Pagination
      type="horizontal"
      v-model="helpPage"
      :total="9"
      :page-size="1"
    ></Pagination>
  </mdui-dialog>

  <FavDialog v-model="showFavDialog" />
</template>

<style lang="scss" scoped>
.help-item {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  .item {
    cursor: default;
    justify-content: space-between;
    width: 80%;
  }

  .item-in {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;

    &.larger {
      align-items: baseline;
    }
  }
}
</style>
