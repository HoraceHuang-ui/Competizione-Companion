<script setup lang="ts">
import { ref, watch } from 'vue'
import { useStore } from '@/store'
import ChipSelect from '@/components/ChipSelect.vue'
import {
  getCarById,
  getCarByKey,
  getCarDisplay,
  getTrackDisplay,
} from '../../../utils/utils'
import CarSelector from '@/components/CarSelector.vue'
import TrackSelector from '@/components/TrackSelector.vue'
import ScrollWrapper from '@/components/ScrollWrapper.vue'

const show = defineModel({
  type: Boolean,
  required: true,
})

const store = useStore()

const curGroup = ref('GT3')
const curCar = ref(undefined)
const curTrack = ref(undefined)

const onSelectGroup = (group: string) => {
  curGroup.value = group
  curCar.value = undefined
}

watch(
  () => curCar.value,
  newCar => {
    if (newCar) {
      if (!store.general.favCars[curGroup.value].includes(newCar?.value)) {
        store.general.favCars[curGroup.value].push(newCar?.value)
      }
      curCar.value = undefined
    }
  },
  { deep: true },
)

watch(
  () => curTrack.value,
  newTrack => {
    if (newTrack) {
      if (!store.general.favTracks.includes(newTrack?.value)) {
        store.general.favTracks.push(newTrack?.value)
      }
      curTrack.value = undefined
    }
  },
  { deep: true },
)

const confirm = () => {
  show.value = false
}
</script>

<template>
  <mdui-dialog :open="show" @close="() => {}" class="no-drag">
    <ScrollWrapper width="500px" height="50vh">
      <div class="flex flex-row justify-between">
        <div class="text-lg title">{{ $t('settings.favCars') }}</div>
        <ChipSelect
          v-model="curGroup"
          chip-class="mx-2 mb-2"
          dropdown-placement="bottom"
          :items="['GT3', 'GT4', 'GTC', 'TCX']"
          @select="onSelectGroup"
        >
        </ChipSelect>
      </div>
      <mdui-chip
        deletable
        v-for="(car, index) in store.general.favCars[curGroup]"
        :key="car"
        class="mr-2"
        @delete="store.general.favCars[curGroup].splice(index, 1)"
      >
        {{ getCarDisplay([car, undefined]) }}
        <img
          slot="icon"
          :src="`../../src/assets/carLogos/${getCarByKey(car)?.manufacturer}.png`"
          class="w-6 h-6"
        />
      </mdui-chip>
      <CarSelector
        v-model="curCar"
        :group="curGroup"
        :excludeKeys="store.general.favCars[curGroup]"
        dropdown-placement="right"
        chip-class="m-0"
      />

      <mdui-divider class="my-4"></mdui-divider>

      <div class="text-lg title mb-4">{{ $t('settings.favTracks') }}</div>
      <mdui-chip
        deletable
        v-for="(track, index) in store.general.favTracks"
        :key="track"
        class="mr-2"
        @delete="store.general.favTracks.splice(index, 1)"
      >
        {{ getTrackDisplay(track) }}
      </mdui-chip>
      <TrackSelector
        v-model="curTrack"
        :excludeIds="store.general.favTracks"
        dropdown-placement="right"
        chip-class="m-0"
      />
    </ScrollWrapper>

    <mdui-button slot="action" @click="confirm" class="font-bold">
      {{ $t('general.confirm') }}
    </mdui-button>
  </mdui-dialog>
</template>

<style scoped lang="scss">
.no-drag {
  -webkit-app-region: no-drag;
}
</style>
