<script setup lang="ts">
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import '@mdui/icons/check--rounded.js'
import '@mdui/icons/arrow-drop-down--rounded.js'
import { nextTick } from 'vue'
import { translate } from '@/i18n'

const emit = defineEmits(['select', 'open'])

const props = defineProps({
  placeholder: {
    type: String,
    default: translate('general.pleaseSelect'),
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
  itemIcon: {
    type: Function,
    default: (item: string) => null,
  },
  itemLabel: {
    type: Function,
    default: (item: string) => item,
  },
  chipClass: {
    type: String,
    default: '',
  },
  chipStyle: {
    type: Object,
    default: () => ({}),
  },
  dropdownPlacement: {
    type: String,
    default: 'auto',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  maxItems: {
    type: Number,
    default: 8,
  },
  fixedHeight: {
    type: Number,
  },
})

const selection = defineModel({
  type: [Object, String, Number],
  default: null,
})

const onSelect = (item: any) => {
  selection.value = item
  nextTick(() => {
    emit('select', item)
  })
}
</script>

<template>
  <mdui-dropdown
    :placement="props.dropdownPlacement"
    :disabled="props.disabled"
    @open="emit('open')"
  >
    <mdui-chip
      slot="trigger"
      :class="props.chipClass"
      :style="props.chipStyle"
      :disabled="props.disabled"
    >
      {{ selection ? props.chipLabel(selection) : props.placeholder }}
      <div slot="icon" class="pt-0.5">
        <slot name="icon"> </slot>
      </div>
      <mdui-icon-arrow-drop-down--rounded
        slot="end-icon"
      ></mdui-icon-arrow-drop-down--rounded>
    </mdui-chip>
    <mdui-menu>
      <slot name="prefix"></slot>
      <ScrollWrapper
        :height="
          props.fixedHeight
            ? `${props.fixedHeight}px`
            : props.items.length > props.maxItems
              ? `${props.maxItems * 48 + 6}px`
              : '100%'
        "
        class="no-drag"
      >
        <mdui-menu-item
          v-for="item in props.items"
          :key="props.forKey(item)"
          :value="props.forValue(item)"
          :class="{
            'bg-[rgb(var(--mdui-color-primary-container))] text-[rgb(var(--mdui-color-primary))]':
              props.chipLabel(selection) ===
              props.itemLabel(item).replace('★ ', ''),
          }"
          @click="onSelect(item)"
        >
          {{ props.itemLabel(item) }}
          <img
            v-if="props.itemIcon(item)"
            slot="icon"
            :src="props.itemIcon(item)"
            class="w-7 h-7"
          />
          <mdui-icon-check--rounded
            slot="end-icon"
            v-if="
              props.chipLabel(selection) ===
              props.itemLabel(item).replace('★ ', '')
            "
          ></mdui-icon-check--rounded>
        </mdui-menu-item>
      </ScrollWrapper>
    </mdui-menu>
  </mdui-dropdown>
</template>

<style scoped></style>
