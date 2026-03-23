<script setup lang="ts">
import ChipSelect from '@/components/ChipSelect.vue'
import { getTrackDisplay, sortTracks } from '@/utils/utils'
import { trackIndex } from '@/utils/enums'
import { useStore } from '@/store'
import '@mdui/icons/location-on--rounded.js'
import { nextTick, ref } from 'vue'
import '@mdui/icons/search--rounded.js'
import { translateWithLocale } from '@/i18n'

const store = useStore()

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
  excludeIds: {
    type: Array,
    default: [],
  },
})

const searchBoxRef = ref<HTMLElement | null>(null)
const sortedTracks = ref(sortTracks())
const updateSortedTracks = () => {
  sortedTracks.value = sortTracks()
  nextTick(() => {
    searchBoxRef.value?.focus?.()
  })
}

const trackSearch = ref('')

const searchFilter = (track: [string, string, string, string]) => {
  const searchLower = trackSearch.value.toLowerCase()
  return `${track[0]} ${track[1]} ${track[2]} ${track[3]} ${translateWithLocale('tracks.' + track[trackIndex.ID], 'zh_CN')}`
    .toLowerCase()
    .includes(searchLower)
}
</script>

<template>
  <ChipSelect
    v-model="curTrack"
    :placeholder="$t('setup.trackPlaceholder')"
    :dropdown-placement="props.dropdownPlacement"
    :items="
      sortedTracks
        .filter(
          (track: [string, string, string, string]) =>
            !props.excludeIds.includes(track?.[trackIndex.ID]),
        )
        .filter(searchFilter)
    "
    :max-items="7"
    :chip-class="props.chipClass"
    :for-key="
      (track: [string, string, string, string]) => track?.[props.keyIdx]
    "
    :for-value="
      (track: [string, string, string, string]) => track?.[props.keyIdx]
    "
    :item-label="
      (track: [string, string, string, string]) => {
        const disp = getTrackDisplay(track[trackIndex.ID])
        return `${store.general.favTracks.includes(track[trackIndex.ID]) ? `★ ` : ''}${disp}`
      }
    "
    :chip-label="(track: any) => track?.label"
    :fixed-height="
      Math.min(
        sortedTracks.filter(
          (track: [string, string, string, string]) =>
            !props.excludeIds.includes(track?.[trackIndex.ID]),
        ).length,
        7,
      ) *
        48 +
      6
    "
    @select="
      item => {
        curTrack = {
          value: item[props.keyIdx],
          label: getTrackDisplay(item[trackIndex.ID]),
        }
      }
    "
    @open="updateSortedTracks"
  >
    <template #icon>
      <mdui-icon-location-on--rounded
        class="h-4.5"
      ></mdui-icon-location-on--rounded>
    </template>
    <template #prefix>
      <mdui-text-field
        ref="searchBoxRef"
        class="cursor-text"
        variant="filled"
        :value="trackSearch"
        @input="trackSearch = $event.target.value"
      >
        <mdui-icon-search--rounded slot="icon"></mdui-icon-search--rounded>
      </mdui-text-field>
    </template>
  </ChipSelect>
</template>

<style scoped lang="scss"></style>
