<script setup lang="ts">
import tracks from '@/utils/trackData'
import ChipSelect from '@/components/ChipSelect.vue'
import { getTrackDisplay } from '@/utils/utils'
import { trackIndex } from '@/utils/enums'

const curTrack = defineModel({
  type: Object,
  required: true,
})
const props = defineProps({
  dropdownPlacement: {
    type: String,
    default: 'top',
  },
  chipClass: {
    type: String,
    default: 'mt-2 mx-2',
  },
  keyIdx: {
    type: Number,
    default: trackIndex.ID,
  },
})
</script>

<template>
  <ChipSelect
    v-model="curTrack"
    :placeholder="$t('setup.trackPlaceholder')"
    :dropdown-placement="props.dropdownPlacement"
    :items="tracks"
    :chip-class="props.chipClass"
    :for-key="
      (track: [string, string, string, string]) => track?.[props.keyIdx]
    "
    :for-value="
      (track: [string, string, string, string]) => track?.[props.keyIdx]
    "
    :item-label="
      (track: [string, string, string, string]) =>
        getTrackDisplay(track[trackIndex.ID])
    "
    :chip-label="(track: any) => track?.label"
    @select="
      item => {
        curTrack = {
          value: item[props.keyIdx],
          label: getTrackDisplay(item[trackIndex.ID]),
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
</template>

<style scoped lang="scss"></style>
