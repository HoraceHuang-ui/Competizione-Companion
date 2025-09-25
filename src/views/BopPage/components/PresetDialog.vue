<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import '@mdui/icons/attach-file--rounded.js'
import '@mdui/icons/keyboard-arrow-down--rounded.js'
import { useStore } from '@/store'
import presetTemplate from './presetTemplate'
import { snackbar } from 'mdui'
import { formatBopData, json2Preset, parsePreset } from '@/utils/utils'
import { translate } from '@/i18n'

const store = useStore()

const show = defineModel({
  type: Boolean,
  default: false,
})
const props = defineProps({
  bop: {
    type: Array,
    required: true,
  },
})

const createFile = ref(false)
const fileName = ref('')
const presetContent = ref('')
const loading = ref(false)

const openLink = (url: string) => {
  window.electron.openExtLink(url)
}

const selectExe = async () => {
  window.dialog
    .show({
      title: translate('bop.fileSelectTitle'),
      properties: ['openFile'],
      filters: [{ name: 'EXE', extensions: ['exe'] }],
    })
    .then(resp => {
      if (resp.length > 0) {
        store.presets.serverExePath = resp[0]
        getPresetList()
      }
    })
}

const presetList = ref<string[]>([])
const getPresetList = () => {
  loading.value = true
  window.fs
    .presetList(store.presets.serverExePath)
    .then((list: string[]) => {
      presetList.value = list
    })
    .finally(() => {
      loading.value = false
    })
}
const getPreset = () => {
  loading.value = true
  window.fs
    .presetFile(store.presets.serverExePath, fileName.value)
    .then((content: string) => {
      presetContent.value = content
    })
    .finally(() => {
      loading.value = false
    })
}
const writePreset = () => {
  loading.value = true
  if (!fileName.value.endsWith('.pre')) {
    fileName.value += '.pre'
  }
  let content = presetContent.value
  let parsed = parsePreset(content)
  if (createFile.value) {
    parsed = presetTemplate
  }
  parsed.BOP = formatBopData(props.bop)
  content = json2Preset(parsed)
  window.fs
    .presetFile(store.presets.serverExePath, fileName.value, content, true)
    .then(() => {
      getPresetList()
      snackbar({
        message: translate('bop.presetSaved'),
        autoCloseDelay: 3000,
      })
      show.value = false
    })
    .finally(() => {
      loading.value = false
    })
}
const close = () => {
  show.value = false
}

const confirm = () => {
  writePreset()
}

watch(show, () => {
  getPresetList()
})

onMounted(() => {
  getPresetList()
})
</script>

<template>
  <mdui-dialog :open="show" :headline="$t('bop.dialogTitle')" @close="() => {}">
    <div slot="description">
      <p>
        * {{ $t('bop.dialogDesc1Pref') }}
        <a
          class="cursor-pointer"
          style="
            color: rgb(var(--mdui-color-primary));
            text-decoration: underline;
          "
          @click="openLink('steam://launch/1430110')"
        >
          ACC Dedicated Server (Steam)
        </a>
        、
        <a
          class="cursor-pointer"
          style="
            color: rgb(var(--mdui-color-primary));
            text-decoration: underline;
          "
          @click="
            openLink(
              'https://www.overtake.gg/downloads/acc-dedicated-server-gui.32034/',
            )
          "
        >
          ACC Dedicated Server GUI (Overtake.gg)
        </a>
        &nbsp;{{ $t('bop.dialogDesc1Suff') }}
      </p>
      <p class="mt-1">* {{ $t('bop.dialogDesc2') }}</p>
    </div>

    <div class="flex flex-col">
      <mdui-divider class="mb-2"></mdui-divider>
      <div class="flex flex-row items-center justify-between">
        <div>{{ $t('bop.pathToExe') }}</div>
        <mdui-tooltip
          class="tooltip"
          placement="bottom"
          variant="rich"
          :headline="
            store.presets.serverExePath
              ? $t('bop.currentSelect')
              : $t('bop.clickToSelect')
          "
          :content="store.presets.serverExePath"
        >
          <mdui-button variant="elevated" @click="selectExe">
            <mdui-icon-attach-file--rounded slot="icon">
            </mdui-icon-attach-file--rounded>
            {{
              store.presets.serverExePath
                ? $t('bop.reselect')
                : $t('bop.select')
            }}
          </mdui-button>
        </mdui-tooltip>
      </div>
      <div class="flex flex-row justify-between items-center mt-2">
        <div>{{ $t('bop.presetName') }}</div>
        <div class="flex flex-row items-center">
          <mdui-checkbox
            :checked="createFile"
            class="mr-4"
            @input="
              () => {
                createFile = !createFile
                fileName = ''
              }
            "
            :disabled="!store.presets.serverExePath"
          >
            {{ $t('bop.newPreset') }}
          </mdui-checkbox>
          <mdui-text-field
            v-if="createFile"
            :placeholder="$t('bop.fileInputPlaceholder')"
            variant="outlined"
            class="h-[40px] w-[260px] cursor-text input"
            :value="fileName"
            @input="fileName = $event.target.value"
            :disabled="!store.presets.serverExePath"
          ></mdui-text-field>
          <mdui-select
            v-else
            class="select w-[260px]"
            :placeholder="$t('bop.fileSelectPlaceholder')"
            variant="outlined"
            :value="fileName"
            :disabled="!store.presets.serverExePath"
          >
            <mdui-icon-keyboard-arrow-down--rounded
              slot="end-icon"
            ></mdui-icon-keyboard-arrow-down--rounded>

            <mdui-menu-item
              v-for="item in presetList"
              :key="item"
              :value="item"
              @click="
                () => {
                  fileName = item
                  getPreset()
                }
              "
            >
              {{ item }}
            </mdui-menu-item>
          </mdui-select>
        </div>
      </div>
    </div>

    <mdui-button slot="action" variant="text" @click="close" class="mr-2">
      {{ $t('general.cancel') }}
    </mdui-button>
    <mdui-button
      slot="action"
      @click="confirm"
      :loading="loading"
      :disabled="!store.presets.serverExePath || !fileName || loading"
    >
      {{ $t('general.confirm') }}
    </mdui-button>
  </mdui-dialog>
</template>

<style scoped lang="scss">
.tooltip::part(content) {
  max-width: 300px;
  word-break: break-all;
}
.input::part(container) {
  border-radius: 999px;
}
.select::part(text-field) {
  height: 40px;
  width: 260px;
}
.select::part(text-field__container) {
  border-radius: 999px;
}
</style>
