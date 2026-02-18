<script setup lang="ts">
import { computed } from 'vue'
import carData from '@/utils/carData'
import { getTrackDisplay } from '@/utils/utils'

type TrackImportGroup = {
  trackKey: string
  carName: string
  items: Array<{ fileName: string; setup: any }>
}

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  groups: {
    type: Array as () => TrackImportGroup[],
    default: () => [],
  },
  saving: {
    type: Boolean,
    default: false,
  },
})

const emits = defineEmits(['close', 'confirm'])

const findCar = (carName: string) => {
  for (const series in carData) {
    if (carName in carData[series]) {
      return carData[series][carName].name
    }
  }
  return carName
}

const carNames = computed(() => {
  return Array.from(new Set(props.groups.map(group => group.carName)))
})

const trackKeys = computed(() => {
  return Array.from(new Set(props.groups.map(group => group.trackKey)))
})

const getCarLabel = (carKey: string) => {
  return findCar(carKey || '')
}

const getTrackLabel = (trackKey: string) => {
  return getTrackDisplay(trackKey) || trackKey
}

const onClose = () => {
  emits('close')
}

const onConfirm = () => {
  if (props.saving) return
  emits('confirm')
}
</script>

<template>
  <mdui-dialog
    :headline="$t('setup.trackImportConfirmTitle')"
    :open="open"
    @close="onClose"
  >
    <div class="flex flex-col w-[380px] max-w-full">
      <div class="text-sm opacity-80">
        {{ $t('setup.trackImportConfirmCar') }}
      </div>
      <div class="text-sm font-medium mt-1">
        {{
          carNames
            .map(carKey => getCarLabel(carKey))
            .join($t('general.listSeparator'))
        }}
      </div>
      <div class="text-sm opacity-80 mt-3">
        {{ $t('setup.trackImportConfirmTracks') }}
      </div>
      <div class="text-sm mt-2 max-h-[220px] overflow-auto pr-2 flex flex-wrap">
        <mdui-chip
          v-for="trackKey in trackKeys"
          :key="trackKey"
          class="mr-2 mb-2"
          style="font-family: Consolas, 'Harmony OS Sans SC', sans-serif"
        >
          {{ getTrackLabel(trackKey) }}
        </mdui-chip>
      </div>
      <div class="text-xs text-amber-500 mt-3">
        {{ $t('setup.batchImportTip') }}
      </div>

      <mdui-button
        class="mt-5 font-bold"
        variant="filled"
        :disabled="saving"
        @click="onConfirm"
      >
        {{ $t('setup.trackImportConfirmAction') }}
      </mdui-button>
      <mdui-button variant="text" class="mt-2" @click="onClose">
        {{ $t('general.cancel') }}
      </mdui-button>
    </div>
  </mdui-dialog>
</template>

<style scoped lang="scss"></style>
