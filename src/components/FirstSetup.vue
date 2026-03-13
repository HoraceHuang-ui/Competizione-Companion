<script setup lang="ts">
import { useStore } from '@/store'
import { getCarDisplayById, getTrackDisplay } from '@/utils/utils'
import LanguageSelector from '@/views/SettingsPage/components/LanguageSelector.vue'
import ChipSelect from './ChipSelect.vue'
import FavDialog from '@/views/SettingsPage/components/FavDialog.vue'
import { computed, ref } from 'vue'

import '@mdui/icons/help-outline--rounded.js'
import '@mdui/icons/close--rounded.js'

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
      <mdui-button-icon v-if="helpPage === 8" @click="closeDialog">
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
        <div class="mb-4 text-left w-full title">
          <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
            {{ `「${$t('general.status')}」` }}</span
          >
          {{ $t('tutorial.pageDesc') }}
        </div>
        <div>{{ $t('tutorial.page2desc') }}</div>
      </div>
      <div class="help-item">
        <div class="mb-4 text-left w-full title">
          <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
            {{ `「${$t('general.servers')}」` }}</span
          >
          {{ $t('tutorial.pageDesc') }}
        </div>
        <div>{{ $t('tutorial.page3desc') }}</div>
      </div>
      <div class="help-item">
        <div class="mb-4 text-left w-full title">
          <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
            {{ `「${$t('general.setup')}」` }}</span
          >
          {{ $t('tutorial.pageDesc') }}
        </div>
        <div class="text-left w-full">{{ $t('tutorial.page4desc') }}</div>
        <ul class="list-disc list-inside">
          <li v-for="i in [1, 2, 3, 4, 5]" :key="i">
            {{ $t(`tutorial.page4li${i}`) }}
          </li>
        </ul>
      </div>
      <div class="help-item">
        <div class="mb-4 text-left w-full title">
          <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
            {{ `「${$t('general.bop')}」` }}</span
          >
          {{ $t('tutorial.pageDesc') }}
        </div>
        <div>{{ $t('tutorial.page5desc') }}</div>
      </div>
      <div class="help-item">
        <div class="mb-4 text-left w-full title">
          <span class="text-[rgb(var(--mdui-color-primary))] font-bold">
            {{ `「${$t('general.report')}」` }}</span
          >
          {{ $t('tutorial.pageDesc') }}
        </div>
        <div>{{ $t('tutorial.page6desc') }}</div>
      </div>
      <div class="help-item">
        <div>{{ $t('tutorial.page7desc') }}</div>
      </div>
      <div class="help-item">
        <div>{{ $t('tutorial.page8desc') }}</div>
      </div>
    </MyCarousel>
    <Pagination
      type="horizontal"
      v-model="helpPage"
      :total="8"
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
