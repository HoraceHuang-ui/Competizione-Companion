<script setup lang="ts">
import carData from '@/utils/carData'
import ChipSelect from '@/components/ChipSelect.vue'
import { getCarDisplay } from '@/utils/utils'

const props = defineProps({
  group: {
    type: String,
    default: 'GT3',
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
    dropdown-placement="top"
    :items="Object.entries(carData[props.group])"
    chip-class="mt-2 mx-2"
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
