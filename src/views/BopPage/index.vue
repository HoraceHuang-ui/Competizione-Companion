<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import tracks from '@/utils/trackData'
import ChipSelect from '@/components/ChipSelect.vue'
import '@mdui/icons/location-on--rounded.js'
import { useStore } from '@/store'
import { setTheme } from 'mdui'

const store = useStore()

const bopData = ref<any>(null)
const curTrack = ref<any>(null)
const curSeries = ref('GT3')
const loading = ref(true)
const error = ref(false)

const queryData = () => {
  loading.value = true
  error.value = false
  fetch('https://api3.lowfuelmotorsport.com/api/hotlaps/getAccBop')
    .then(resp => resp.json())
    .then(data => {
      bopData.value = data
    })
    .catch(() => {
      error.value = true
    })
    .finally(() => {
      loading.value = false
    })
}

onMounted(() => {
  queryData()
})
</script>

<template>
  <div class="h-full flex flex-col justify-center items-center relative w-full">
    <mdui-card
      variant="outlined"
      class="size-full border border-[rgb(var(--mdui-color-inverse-primary-dark))] mx-4 mb-4"
      style="background: rgba(var(--mdui-color-surface-container-lowest), 0.65)"
    >
      <div class="flex flex-row justify-between items-center mx-6 mt-6 mb-4">
        <div class="flex flex-row justify-end items-center">
          <ChipSelect
            v-model="curTrack"
            :placeholder="$t('servers.trackPlaceholder')"
            dropdown-placement="bottom"
            :items="tracks"
            chip-class="mt-2"
            :for-key="(track: [string, string, string, string]) => track?.[3]"
            :for-value="(track: [string, string, string, string]) => track?.[3]"
            :item-label="
              (track: [string, string, string, string]) => {
                if (store.settings.setup.trackDisplay == 3) {
                  return $t(`tracks.${track?.[0]}`)
                }
                return track?.[[2, 1][store.settings.setup.trackDisplay - 1]]
              }
            "
            :chip-label="(track: any) => track?.label"
            @select="
              item => {
                let trackLabel
                if (store.settings.setup.trackDisplay == 3) {
                  trackLabel = $t(`tracks.${item?.[0]}`)
                } else {
                  trackLabel =
                    item?.[[2, 1][store.settings.setup.trackDisplay - 1]]
                }
                curTrack = {
                  value: item[3],
                  label: trackLabel,
                }
              }
            "
          >
            <template #icon>
              <mdui-icon-location-on--rounded
                class="h-[1.125rem]"
              ></mdui-icon-location-on--rounded>
            </template>
          </ChipSelect>
        </div>
        <mdui-segmented-button-group
          :value="curSeries"
          class="rounded-full"
          selects="single"
          @change="curSeries = $event.target.value"
        >
          <mdui-segmented-button
            value="GT3"
            class="border border-[rgb(var(--mdui-color-outline-variant))]"
            >GT3</mdui-segmented-button
          >
          <mdui-segmented-button
            value="GT4"
            class="border border-[rgb(var(--mdui-color-outline-variant))]"
          >
            GT4
          </mdui-segmented-button>
        </mdui-segmented-button-group>
      </div>

      <div
        class="flex flex-row justify-between mx-10 mt-4 title text-lg font-bold text-[rgb(var(--mdui-color-primary))]"
      >
        <div class="w-[50%]">车型</div>
        <div class="w-[20%]">年份</div>
        <div class="w-[15%]">限气</div>
        <div class="w-[10%] text-right">增减重</div>
      </div>
      <mdui-divider class="mt-4 mx-6"></mdui-divider>

      <ScrollWrapper>
        <div class="pb-6">
          <div
            class="flex flex-row justify-between mx-4 my-2 px-6 py-3 rounded-full"
            v-for="(bop, index) in bopData
              ?.find(it => it.track_name === curTrack?.value)
              ?.bop[curSeries].sort((a, b) => a.ballast - b.ballast)"
            :key="bop.car_model"
            :style="{
              background:
                index & (1 == 1)
                  ? 'rgba(var(--mdui-color-secondary-container), 0.4)'
                  : 'none',
            }"
          >
            <div class="w-[50%]">{{ bop.car_name }}</div>
            <div class="w-[20%]">{{ bop.car_year }}</div>
            <div
              class="w-[15%]"
              :class="{
                'text-orange-800 dark:text-orange-300': bop.restrictor > 0,
              }"
            >
              {{ bop.restrictor ? `${bop.restrictor}%` : '-' }}
            </div>
            <div
              class="w-[10%] text-right"
              :class="{
                'text-red-600 dark:text-red-400': bop.ballast > 0,
                'text-green-800 dark:text-green-400': bop.ballast < 0,
              }"
            >
              {{ bop.ballast ? `${bop.ballast} kg` : '0' }}
            </div>
          </div>
        </div>
      </ScrollWrapper>
    </mdui-card>
  </div>
</template>

<style scoped lang="scss"></style>
