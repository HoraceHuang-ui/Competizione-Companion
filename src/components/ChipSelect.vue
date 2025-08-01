<script setup lang="ts">
import ScrollWrapper from '@/components/ScrollWrapper.vue'

const emit = defineEmits(['select'])

const props = defineProps({
  placeholder: {
    type: String,
    default: '请选择',
  },
  chipLabel: {
    type: Function,
    default: (item: string) => item,
  },
  items: {
    type: Array,
    default: [],
  },
  forKey: {
    type: Function,
    default: (item: string) => item,
  },
  forValue: {
    type: Function,
    default: (item: string) => item,
  },
  itemLabel: {
    type: Function,
    default: (item: string) => item,
  },
  chipClass: {
    type: String,
    default: '',
  },
  dropdownPlacement: {
    type: String,
    default: 'bottom',
  },
})

const selection = defineModel({
  type: [Object, String],
  default: null,
})

const onSelect = (item: any) => {
  selection.value = item
  emit('select', item)
}
</script>

<template>
  <mdui-dropdown :placement="props.dropdownPlacement">
    <mdui-chip slot="trigger" :class="props.chipClass">
      {{ selection ? props.chipLabel(selection) : props.placeholder }}
      <div slot="icon" class="pt-0.5">
        <slot name="icon"> </slot>
      </div>
      <mdui-icon-arrow-drop-down--rounded
        slot="end-icon"
      ></mdui-icon-arrow-drop-down--rounded>
    </mdui-chip>
    <mdui-menu>
      <ScrollWrapper :height="props.items.length > 8 ? '390px' : '100%'">
        <mdui-menu-item
          v-for="item in props.items"
          :key="props.forKey(item)"
          :value="props.forValue(item)"
          @click="onSelect(item)"
        >
          {{ props.itemLabel(item) }}
        </mdui-menu-item>
      </ScrollWrapper>
    </mdui-menu>
  </mdui-dropdown>
</template>

<style scoped></style>
