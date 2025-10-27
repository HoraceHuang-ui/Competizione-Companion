<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import { darkModeSettings, trackIndex } from '@/utils/enums'
import {
  getCarById,
  getCarDisplay,
  getCarDisplayById,
  getTrack,
  getTrackDisplay,
} from '@/utils/utils'
import { useStore } from '@/store'
import CarSelector from '@/components/CarSelector.vue'
import carData from '@/utils/carData'
import '@mdui/icons/save--rounded.js'
import PresetDialog from '@/views/BopPage/components/PresetDialog.vue'

const store = useStore()

const bopData = ref<any>(null)
const curCategoryMethod = ref('byTrack')
const curTrack = ref<any>({
  value: 'Circuit de Catalunya',
  label: getTrackDisplay('barcelona'),
})
const curCar = ref<any>(null)
const curSeries = ref('GT3')
const loading = ref(true)
const error = ref(false)
const saveDialogShow = ref(false)

const defaultGT3 = {
  value: 'amr_v8_vantage_gt3',
  label: getCarDisplayById(20),
}
const defaultGT4 = {
  value: 'alpine_a110_gt4',
  label: getCarDisplayById(50),
}

const curGT3 = ref(defaultGT3)
const curGT4 = ref(defaultGT4)

watch(
  curSeries,
  newVal => {
    if (newVal === 'GT3') {
      curGT4.value = curCar.value || defaultGT4
      curCar.value = curGT3.value
    } else {
      curGT3.value = curCar.value || defaultGT3
      curCar.value = curGT4.value
    }
  },
  { immediate: true },
)

const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)')
const isDark = ref(
  store.settings.general.darkMode === darkModeSettings.AUTO
    ? darkModePreference.matches
    : store.settings.general.darkMode !== darkModeSettings.LIGHT,
)
darkModePreference.addEventListener('change', e => {
  isDark.value =
    store.settings.general.darkMode === darkModeSettings.AUTO
      ? e.matches
      : store.settings.general.darkMode !== darkModeSettings.LIGHT
})

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
      class="size-full border border-[rgb(var(--mdui-color-inverse-primary-dark))] mx-4 mb-4 flex flex-col"
      :style="{
        background: `rgba(var(--mdui-color-surface-container-lowest), ${(0.65 * (store.settings.general.bgOpacity || 0.85)) / 0.85})`,
      }"
    >
      <div class="flex flex-row justify-between items-center mx-6 mt-4 mb-4">
        <div class="flex flex-row items-center">
          <TrackSelector
            v-if="curCategoryMethod === 'byTrack'"
            v-model="curTrack"
            dropdown-placement="bottom"
            chip-class="border border-[rgb(var(--mdui-color-outline-variant))] mr-2"
            :key-idx="trackIndex.LFM"
          />
          <CarSelector
            v-else
            v-model="curCar"
            :group="curSeries"
            dropdown-placement="bottom"
            chip-class="border border-[rgb(var(--mdui-color-outline-variant))] mr-2"
          />
          <mdui-radio-group
            :value="curCategoryMethod"
            class="h-[40px]"
            @change="curCategoryMethod = $event.target.value"
          >
            <mdui-radio value="byTrack">{{ $t('bop.byTrack') }}</mdui-radio>
            <mdui-radio value="byCar">{{ $t('bop.byCar') }}</mdui-radio>
          </mdui-radio-group>
        </div>
        <div class="flex flex-row items-center">
          <mdui-tooltip
            :content="$t('bop.saveToGUI')"
            placement="bottom"
            :disabled="loading"
          >
            <mdui-button-icon
              class="mr-2"
              :disabled="loading"
              @click="saveDialogShow = true"
            >
              <mdui-icon-save--rounded></mdui-icon-save--rounded>
            </mdui-button-icon>
          </mdui-tooltip>

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
      </div>

      <div
        class="flex flex-row justify-between mx-10 mt-2 title text-lg font-bold text-[rgb(var(--mdui-color-primary))]"
      >
        <div class="w-[50%]">
          {{
            curCategoryMethod === 'byTrack' ? $t('bop.car') : $t('bop.track')
          }}
        </div>
        <div class="w-[20%]">
          {{ curCategoryMethod === 'byTrack' ? $t('bop.year') : '' }}
        </div>
        <div class="w-[15%]">{{ $t('bop.restrictor') }}</div>
        <div class="w-[10%] text-right">{{ $t('bop.ballast') }}</div>
      </div>
      <mdui-divider class="mt-4 mx-6"></mdui-divider>

      <Transition name="fade" mode="out-in">
        <div
          v-if="loading || !bopData || error"
          class="size-full flex flex-row justify-center items-center absolute pt-[120px]"
        >
          <Transition name="fade" mode="out-in">
            <mdui-circular-progress v-if="loading"></mdui-circular-progress>
            <div v-else-if="!bopData || error">
              {{ $t('servers.noData') }}
            </div>
          </Transition>
        </div>
      </Transition>
      <Transition name="fade-up">
        <ScrollWrapper v-if="!loading && bopData && !error">
          <div class="pb-6" v-if="curCategoryMethod === 'byTrack'">
            <div
              class="flex flex-row justify-between mx-4 my-2 px-6 py-3 rounded-full"
              v-for="(bop, index) in bopData
                ?.find(it => it.track_name === curTrack?.value)
                ?.bop[curSeries].sort((a, b) => {
                  const carA = getCarById(a.car_model)
                  const carB = getCarById(b.car_model)

                  const favCars = store.general.favCars[curSeries]
                  const aFav = favCars.includes(carA?.[0]) ? 0 : 1
                  const bFav = favCars.includes(carB?.[0]) ? 0 : 1
                  if (aFav !== bFav) {
                    return aFav - bFav
                  }

                  const aComp = carA?.[1]?.competitive ? 0 : 1
                  const bComp = carB?.[1]?.competitive ? 0 : 1
                  if (aComp !== bComp) {
                    return aComp - bComp
                  }

                  return a.ballast - b.ballast
                })"
              :key="bop.car_model"
              :style="{
                background:
                  index & 1
                    ? 'rgba(var(--mdui-color-secondary-container), 0.4)'
                    : 'none',
              }"
            >
              <div class="w-[50%] flex flex-row items-center">
                <img
                  :src="`../../src/assets/carLogos/${getCarById(bop.car_model)?.[1]?.manufacturer}.png`"
                  class="w-6 h-6 mr-3"
                />
                <div>
                  {{
                    `${store.general.favCars[curSeries].includes(getCarById(bop.car_model)?.[0]) ? `★ ` : ''}${getCarDisplayById(bop.car_model) || bop.car_name}`
                  }}
                </div>
              </div>
              <div class="w-[20%]">{{ bop.car_year }}</div>
              <div
                class="w-[15%]"
                :class="{
                  'text-orange-300': bop.restrictor > 0 && isDark,
                  'text-orange-500': bop.restrictor > 0 && !isDark,
                }"
              >
                {{ bop.restrictor ? `${bop.restrictor}%` : '-' }}
              </div>
              <div
                class="w-[10%] text-right"
                :class="{
                  'text-red-400': bop.ballast > 0 && isDark,
                  'text-red-500': bop.ballast > 0 && !isDark,
                  'text-green-400': bop.ballast < 0 && isDark,
                  'text-green-600': bop.ballast < 0 && !isDark,
                }"
              >
                {{ bop.ballast ? `${bop.ballast} kg` : '0' }}
              </div>
            </div>
          </div>
          <div class="pb-6" v-else>
            <div
              class="flex flex-row justify-between mx-4 my-2 px-6 py-3 rounded-full"
              v-for="(track, index) in bopData
                ?.map(it => {
                  const bopInfo = it.bop[curSeries].find(
                    bop =>
                      bop.car_model === carData[curSeries][curCar?.value]?.id,
                  )
                  return {
                    name: it.track_name,
                    restrictor: bopInfo?.restrictor,
                    ballast: bopInfo?.ballast,
                  }
                })
                ?.sort((a, b) => {
                  const favTracks = store.general.favTracks
                  const aFav = favTracks.includes(
                    getTrack(a.name, trackIndex.LFM)?.[trackIndex.ID],
                  )
                    ? 0
                    : 1
                  const bFav = favTracks.includes(
                    getTrack(b.name, trackIndex.LFM)?.[trackIndex.ID],
                  )
                    ? 0
                    : 1
                  if (aFav !== bFav) {
                    return aFav - bFav
                  }
                  return a.ballast - b.ballast
                })"
              :key="track.name"
              :style="{
                background:
                  index & 1
                    ? 'rgba(var(--mdui-color-secondary-container), 0.4)'
                    : 'none',
              }"
            >
              <div class="w-[50%]">
                {{
                  `${store.general.favTracks.includes(getTrack(track.name, trackIndex.LFM)?.[trackIndex.ID]) ? `★ ` : ''}${getTrackDisplay(track.name, trackIndex.LFM)}`
                }}
              </div>
              <div class="w-[20%]"></div>
              <div
                class="w-[15%]"
                :class="{
                  'text-orange-300': track.restrictor > 0 && isDark,
                  'text-orange-500': track.restrictor > 0 && !isDark,
                }"
              >
                {{ track.restrictor ? `${track.restrictor}%` : '-' }}
              </div>
              <div
                class="w-[10%] text-right"
                :class="{
                  'text-red-400': track.ballast > 0 && isDark,
                  'text-red-500': track.ballast > 0 && !isDark,
                  'text-green-400': track.ballast < 0 && isDark,
                  'text-green-600': track.ballast < 0 && !isDark,
                }"
              >
                {{ track.ballast ? `${track.ballast} kg` : '0' }}
              </div>
            </div>
          </div>
        </ScrollWrapper>
      </Transition>
    </mdui-card>

    <PresetDialog v-model="saveDialogShow" :bop="bopData" />
  </div>
</template>

<style scoped lang="scss">
.fade-up-enter-active,
.fade-up-appear-active {
  transition:
    transform 0.5s var(--mdui-motion-easing-standard),
    opacity 0.5s var(--mdui-motion-easing-standard);
}
.fade-up-leave-active {
  transition:
    transform 0.2s var(--mdui-motion-easing-standard),
    opacity 0.2s var(--mdui-motion-easing-standard);
  position: absolute; /* 防止离场时塌陷 */
  width: 100%;
  transition-delay: 0ms;
}

.fade-up-enter-from,
.fade-up-appear-from {
  opacity: 0;
  transform: translateY(16px) scale(0.98);
}
.fade-up-enter-to,
.fade-up-appear-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.fade-up-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.98);
}
</style>
