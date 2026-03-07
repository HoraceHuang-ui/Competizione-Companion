<script setup lang="ts">
import { availableLangCodes, langMap, switchLang, translate } from '@/i18n'
import { useStore } from '@/store'
import { trackCarDispSettings } from '@/utils/enums'
import { onMounted } from 'vue'
import ChipSelect from '@/components/ChipSelect.vue'

const lang = defineModel({
  type: String,
  default: localStorage.lang || 'en_US',
})

const store = useStore()

const onLangSelect = () => {
  switchLang(lang.value)
  if (
    ['舞萌DX启动！', 'Time for maimai DX!'].includes(
      store.settings.status.serverDownMsg,
    )
  ) {
    store.settings.status.serverDownMsg = translate(
      'settings.serverDownMsgDefault',
    )
  }

  if (lang.value === 'en_US') {
    store.settings.setup.carDisplay = trackCarDispSettings.EN_SHORT
    store.settings.setup.trackDisplay = trackCarDispSettings.EN_SHORT
  }
}
</script>

<template>
  <ChipSelect
    v-model="lang"
    :items="availableLangCodes"
    chip-class="rounded-full"
    :chip-label="item => langMap[item]"
    :item-label="item => langMap[item]"
    @select="onLangSelect"
  />
</template>
