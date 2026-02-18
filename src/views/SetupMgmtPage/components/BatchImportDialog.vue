<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TrackSelector from '@/components/TrackSelector.vue'
import carData from '@/utils/carData'

type BatchImportItem = {
  fileName: string
  setup: any
  track: any
}

const open = defineModel<boolean>('open', { default: false })
const items = defineModel<BatchImportItem[]>('items', { default: [] })

const props = defineProps({
  saving: {
    type: Boolean,
    default: false,
  },
})

const emits = defineEmits(['save', 'close'])

const allTrack = ref(undefined)

const canSave = computed(() => {
  return items.value.length > 0 && items.value.every(item => item.track)
})

const applyAllTrack = (track: any) => {
  if (!track) return
  items.value = items.value.map(item => ({
    ...item,
    track: {
      value: track.value,
      label: track.label,
    },
  }))
}

const findCar = (carName: string) => {
  for (const series in carData) {
    if (carName in carData[series]) {
      return carData[series][carName].name
    }
  }
  return carName
}

const getCarLabel = (setup: any) => {
  return findCar(setup?.carName || '')
}

watch(allTrack, applyAllTrack)
watch(open, val => {
  if (!val) {
    allTrack.value = undefined
  }
})

const onSave = () => {
  if (!canSave.value || props.saving) return
  emits('save')
}

const onClose = () => {
  emits('close')
}
</script>

<template>
  <mdui-dialog
    :headline="$t('setup.batchImportTitle')"
    :open="open"
    @close="onClose"
  >
    <div class="flex flex-col w-[520px] max-w-full">
      <div class="flex flex-row items-center">
        <div class="text-sm opacity-70 mr-2">
          {{ $t('setup.batchImportAllTrack') }}
        </div>
        <TrackSelector
          v-model="allTrack"
          dropdown-placement="right"
          chip-class="mt-1 w-max"
        />
      </div>
      <div class="text-xs text-amber-500 mt-2">
        {{ $t('setup.batchImportTip') }}
      </div>

      <div class="mt-4 max-h-[360px] overflow-auto pr-2">
        <div
          v-for="(item, idx) in items"
          :key="`${item.fileName}-${idx}`"
          class="flex flex-row items-center justify-between py-2 border-b border-[rgb(var(--mdui-color-surface-container-highest))]"
        >
          <div class="flex flex-col min-w-0 pr-4">
            <div class="text-sm font-medium truncate">
              {{ item.fileName }}
            </div>
            <div class="text-xs opacity-70 truncate">
              {{ getCarLabel(item.setup) }}
            </div>
            <mdui-chip
              v-if="item.track"
              class="mt-2"
              style="font-family: Consolas, 'Harmony OS Sans SC', sans-serif"
            >
              {{ item.track.label }}
            </mdui-chip>
          </div>
          <TrackSelector
            v-model="item.track"
            dropdown-placement="right"
            chip-class="mt-1 w-max"
          />
        </div>
      </div>

      <mdui-button
        variant="filled"
        class="mt-5 font-bold"
        :disabled="!canSave || props.saving"
        @click="onSave"
      >
        {{ $t('setup.batchImportSave') }}
      </mdui-button>
      <mdui-button variant="text" class="mt-2" @click="onClose">
        {{ $t('general.cancel') }}
      </mdui-button>
    </div>
  </mdui-dialog>
</template>

<style scoped lang="scss"></style>
