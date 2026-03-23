<script setup lang="ts">
import ChipSelect from '@/components/ChipSelect.vue'
import { getCarDisplay, sortCars } from '@/utils/utils'
import '@mdui/icons/directions-car--rounded.js'
import { useStore } from '@/store'
import '@mdui/icons/search--rounded.js'
import { nextTick, ref } from 'vue'
import { translateWithLocale } from '@/i18n'

const store = useStore()

const props = defineProps({
  group: {
    type: String,
    default: 'GT3',
  },
  dropdownPlacement: {
    type: String,
    default: 'top',
  },
  chipClass: {
    type: String,
    default: 'mt-2 mx-2',
  },
  excludeKeys: {
    type: Array,
    default: [],
  },
})
const curCar = defineModel({
  type: Object,
  required: true,
})

const searchBoxRef = ref<HTMLElement | null>(null)
const sortedCars = ref(sortCars(props.group))
const updateSortedCars = () => {
  sortedCars.value = sortCars(props.group)
  nextTick(() => {
    searchBoxRef.value?.focus?.()
  })
}

const carSearch = ref('')

const searchFilter = (car: [string, any]) => {
  const searchLower = carSearch.value.toLowerCase()
  return `${car[0]} ${car[1]?.manufacturer} ${car[1]?.name} ${car[1]?.shortName} ${translateWithLocale('cars.' + car[0], 'zh_CN')}`
    .toLowerCase()
    .includes(searchLower)
}
</script>

<template>
  <ChipSelect
    v-model="curCar"
    :placeholder="$t('setup.carPlaceholder')"
    :dropdown-placement="props.dropdownPlacement"
    :items="
      sortedCars
        .filter((car: [string, any]) => !props.excludeKeys.includes(car?.[0]))
        .filter(searchFilter)
    "
    :chip-class="props.chipClass"
    :for-key="(car: [string, any]) => car?.[0]"
    :for-value="(car: [string, any]) => car?.[0]"
    :item-icon="
      (car: [string, any]) =>
        `../../src/assets/carLogos/${car?.[1]?.manufacturer}.png`
    "
    :item-label="
      (item: string) => {
        const disp = getCarDisplay(item)
        return `${store.general.favCars[props.group].includes(item[0]) ? `★ ` : ''}${disp}`
      }
    "
    :chip-label="(car: any) => car?.label"
    :max-items="7"
    :fixed-height="
      Math.min(
        sortedCars.filter(
          (car: [string, any]) => !props.excludeKeys.includes(car?.[0]),
        ).length,
        7,
      ) *
        48 +
      6
    "
    @select="
      item => {
        curCar = {
          value: item[0],
          label: getCarDisplay(item),
        }
      }
    "
    @open="updateSortedCars"
  >
    <template #icon>
      <mdui-icon-directions-car--rounded
        class="h-[1.125rem]"
      ></mdui-icon-directions-car--rounded>
    </template>
    <template #prefix>
      <mdui-text-field
        ref="searchBoxRef"
        class="cursor-text"
        variant="filled"
        :value="carSearch"
        @input="carSearch = $event.target.value"
      >
        <mdui-icon-search--rounded slot="icon"></mdui-icon-search--rounded>
      </mdui-text-field>
    </template>
  </ChipSelect>
</template>

<style scoped lang="scss"></style>
