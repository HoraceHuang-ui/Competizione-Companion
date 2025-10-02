<script setup lang="ts">
import ChipSelect from '@/components/ChipSelect.vue'
import { getCarDisplay, sortCars } from '@/utils/utils'
import '@mdui/icons/directions-car--rounded.js'
import { useStore } from '@/store'

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
</script>

<template>
  <ChipSelect
    v-model="curCar"
    :placeholder="$t('setup.carPlaceholder')"
    :dropdown-placement="props.dropdownPlacement"
    :items="
      sortCars(props.group).filter(
        (car: [string, any]) => !props.excludeKeys.includes(car?.[0]),
      )
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
    @select="
      item => {
        curCar = {
          value: item[0],
          label: getCarDisplay(item),
        }
      }
    "
  >
    <template #icon>
      <mdui-icon-directions-car--rounded
        class="h-[1.125rem]"
      ></mdui-icon-directions-car--rounded>
    </template>
  </ChipSelect>
</template>

<style scoped lang="scss"></style>
