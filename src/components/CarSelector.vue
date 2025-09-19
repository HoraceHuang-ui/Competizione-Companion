<script setup lang="ts">
import carData from '@/utils/carData'
import ChipSelect from '@/components/ChipSelect.vue'
import { getCarDisplay } from '@/utils/utils'
import '@mdui/icons/directions-car--rounded.js'

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
    :items="Object.entries(carData[props.group])"
    :chip-class="props.chipClass"
    :for-key="(car: [string, any]) => car?.[0]"
    :for-value="(car: [string, any]) => car?.[0]"
    :item-label="getCarDisplay"
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
