<script setup lang="ts">
import { marked } from 'marked'
import { ref } from 'vue'
import { useStore } from '@/store'

const store = useStore()

const props = defineProps({
  updInfo: {
    type: Object,
    default: undefined,
  },
  showSkip: {
    type: Boolean,
    default: false,
  },
})
const show = defineModel({
  type: Boolean,
  required: true,
})

const appVer = import.meta.env.VITE_APP_VERSION

const skipVersion = ref(false)

const confirmUpd = () => {
  show.value = false
  window.electron.openExtLink(props.updInfo?.dlUrl)
  window.win.close()
}
const onCancelUpd = () => {
  show.value = false
  if (skipVersion.value) {
    store.general.targetVersion = props.updInfo?.version
  }
}
</script>

<template>
  <mdui-dialog
    :open="show"
    close-on-overlay-click
    close-on-esc
    :headline="$t('general.newVerDetected')"
    @close="show = false"
  >
    <mdui-icon-update--rounded slot="icon"></mdui-icon-update--rounded>
    <div
      class="overflow-y-scroll max-h-[300px] w-[400px] scroll-wrapper-app-vue"
    >
      <div
        class="marked"
        v-html="marked(props.updInfo?.desc?.[$t('langCode')] || '')"
      />
    </div>
    <div class="text-red-600 dark:text-red-400" style="margin-top: 10px">
      {{ $t('general.updVer') }}{{ appVer }} 👉
      {{ props.updInfo?.version }}
    </div>
    <div class="text-red-600 dark:text-red-400">
      {{ $t('general.updSize')
      }}{{ (props.updInfo?.size / 1024 / 1024).toFixed(1) }}MB
    </div>
    <div
      class="w-full flex flex-row justify-between items-center"
      slot="action"
    >
      <mdui-checkbox
        v-if="props.showSkip"
        :checked="skipVersion"
        @change="skipVersion = !skipVersion"
        >{{ $t('general.skipCurVersion') }}</mdui-checkbox
      >
      <div v-else />
      <div class="flex flex-row">
        <mdui-button slot="action" variant="text" @click="onCancelUpd">{{
          $t('general.cancel')
        }}</mdui-button>
        <mdui-button
          slot="action"
          @click="confirmUpd"
          :disabled="skipVersion"
          >{{ $t('general.update') }}</mdui-button
        >
      </div>
    </div>
  </mdui-dialog>
</template>

<style scoped lang="scss"></style>
