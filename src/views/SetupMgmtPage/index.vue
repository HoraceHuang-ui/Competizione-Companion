<script setup lang="ts">
import '@mdui/icons/file-upload--rounded.js'
import '@mdui/icons/insert-drive-file--rounded.js'

import { computed, ref, watch } from 'vue'
import { snackbar } from 'mdui'
import carData from '@/utils/carData'
import SetupDisplay from '@/views/SetupMgmtPage/components/SetupDisplay.vue'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import '@mdui/icons/arrow-drop-down--rounded.js'
import '@mdui/icons/check--rounded.js'
import ChipSelect from '@/components/ChipSelect.vue'
import { useStore } from '@/store'
import { seriesColorMap } from '@/utils/enums'
import { translate } from '@/i18n'
import SetupCode from '@/views/SetupMgmtPage/components/SetupCode.vue'
import CarSelector from '@/components/CarSelector.vue'
import TrackSelector from '@/components/TrackSelector.vue'
import { getCarByKey } from '../../utils/utils'

const store = useStore()

const leftFileInput = ref<HTMLInputElement | null>(null)
const rightFileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref({ left: false, right: false })
const setupScroll = ref(0)
const setupOpenGroups = ref([])
type Side = 'left' | 'right'

const counterSide = (side: Side) => {
  return side === 'left' ? 'right' : 'left'
}

const groups = ['GT3', 'GT4', 'GTC', 'TCX']
const curGroup = ref('GT3')
const setupList = ref({
  left: [],
  right: [],
})
const fileSearch = ref(
  sessionStorage.setupFileNames
    ? JSON.parse(sessionStorage.setupFileNames)
    : {
        left: '',
        right: '',
      },
)

const curCar = ref({
  left: undefined,
  right: undefined,
})
const curTrack = ref({
  left: undefined,
  right: undefined,
})
const files = ref(
  sessionStorage.setupFiles
    ? JSON.parse(sessionStorage.setupFiles)
    : {
        left: undefined,
        right: undefined,
      },
)

const enableSearch = computed(() => {
  return {
    left: curTrack.value.left !== undefined && curCar.value.left !== undefined,
    right:
      curTrack.value.right !== undefined && curCar.value.right !== undefined,
  }
})

watch(
  [curCar, curTrack],
  async () => {
    if (enableSearch.value.left) {
      setupList.value.left = await window.fs.setupList(
        curCar.value.left?.value,
        curTrack.value.left?.value,
      )
    }
    if (enableSearch.value.right) {
      setupList.value.right = await window.fs.setupList(
        curCar.value.right?.value,
        curTrack.value.right?.value,
      )
    }
  },
  { immediate: false, deep: true },
)

watch(
  files,
  () => {
    sessionStorage.setupFiles = JSON.stringify(files.value)
    sessionStorage.setupFileNames = JSON.stringify(fileSearch.value)
  },
  { deep: true },
)

const filteredSetupList = computed(() => {
  return {
    left: setupList.value.left.filter((file: string) =>
      file.toLowerCase().includes(fileSearch.value.left.toLowerCase()),
    ),
    right: setupList.value.right.filter((file: string) =>
      file.toLowerCase().includes(fileSearch.value.right.toLowerCase()),
    ),
  }
})

const readOrCreateFile = async (side: Side) => {
  if (files.value[side] !== undefined) {
    // 如果已经有文件了，直接显示
    return
  }
  const fileName = fileSearch.value[side]
  if (fileName === '') {
    snackbar({
      message: translate('setup.emptyFileName'),
      autoCloseDelay: 3000,
    })
    return
  }
  const content = await window.fs.setupFile(
    curCar.value[side]?.value,
    curTrack.value[side]?.value,
    fileName.endsWith('.json') ? fileName : `${fileName}.json`,
  )
  const jsonContent = JSON.parse(content)
  if (!jsonContent.carName) {
    snackbar({
      message: translate('setup.invalidJSON'),
      autoCloseDelay: 3000,
    })
    return
  }
  if (!Object.keys(carData[curGroup.value]).includes(jsonContent.carName)) {
    snackbar({
      message: translate('setup.invalidSeries', { series: curGroup.value }),
      autoCloseDelay: 3000,
    })
    return
  }
  files.value[side] = jsonContent
}

const onSelectGroup = (group: string) => {
  curGroup.value = group
  curCar.value = {
    left: undefined,
    right: undefined,
  }
}

const triggerFileInput = (side: 'left' | 'right') => {
  if (side === 'left') {
    leftFileInput.value?.click()
  } else {
    rightFileInput.value?.click()
  }
}

const getCarSeries = (carName: string) => {
  for (const group of groups) {
    if (Object.keys(carData[group]).includes(carName)) {
      return group
    }
  }
  return undefined
}

const fileImportOpen = ref<String | undefined>(undefined)
const curSaveTrack = ref(undefined)
const handleFileSelect = async (side: 'left' | 'right', event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    const content = await file.text()
    const jsonContent = JSON.parse(content)
    if (!jsonContent.carName) {
      snackbar({
        message: translate('setup.invalidJSON'),
        autoCloseDelay: 3000,
      })
      return
    }
    if (!files.value[counterSide(side)]) {
      const carSeries = getCarSeries(jsonContent.carName)
      if (carSeries) {
        curGroup.value = carSeries
        curCar.value[side] = {
          value: jsonContent.carName,
          label:
            jsonContent.carName in carData[curGroup.value]
              ? carData[curGroup.value][jsonContent.carName].name
              : jsonContent.carName,
        }
        fileSearch.value[side] = file.name
        files.value[side] = jsonContent
        if (!store.settings.setup.alwaysViewOnly) {
          fileImportOpen.value = side
        }
      }
    } else if (
      !Object.keys(carData[curGroup.value]).includes(jsonContent.carName)
    ) {
      snackbar({
        message: translate('setup.invalidSeries', {
          series: curGroup.value,
        }),
        autoCloseDelay: 3000,
      })
    } else {
      fileSearch.value[side] = file.name
      files.value[side] = jsonContent
      if (!store.settings.setup.alwaysViewOnly) {
        fileImportOpen.value = side
      }
    }
  }
}

const handleDrop = async (side: 'left' | 'right', event: DragEvent) => {
  event.preventDefault()
  isDragging.value[side] = false
  const file = event.dataTransfer?.files?.[0]
  if (file && file.type === 'application/json') {
    const content = await file.text()
    const jsonContent = JSON.parse(content)
    if (!jsonContent.carName) {
      snackbar({
        message: translate('setup.invalidJSON'),
        autoCloseDelay: 3000,
      })
      return
    }
    if (!files.value[counterSide(side)]) {
      const carSeries = getCarSeries(jsonContent.carName)
      if (carSeries) {
        curGroup.value = carSeries
        curCar.value[side] = {
          value: jsonContent.carName,
          label:
            jsonContent.carName in carData[curGroup.value]
              ? carData[curGroup.value][jsonContent.carName].name
              : jsonContent.carName,
        }
        fileSearch.value[side] = file.name
        files.value[side] = jsonContent
        if (!store.settings.setup.alwaysViewOnly) {
          fileImportOpen.value = side
        }
      }
    } else if (
      !Object.keys(carData[curGroup.value]).includes(jsonContent.carName)
    ) {
      snackbar({
        message: translate('setup.invalidSeries', { series: curGroup.value }),
        autoCloseDelay: 3000,
      })
      return
    }
    fileSearch.value[side] = file.name
    files.value[side] = jsonContent
    if (!store.settings.setup.alwaysViewOnly) {
      fileImportOpen.value = side
    }
  } else {
    snackbar({
      message: translate('setup.invalidFile'),
      autoCloseDelay: 3000,
    })
  }
}

const closeFileSaveDialog = () => {
  fileImportOpen.value = undefined
  curSaveTrack.value = undefined
}

const saveSetup = async () => {
  console.log(files.value[fileImportOpen.value]?.carName)
  await window.fs.setupFile(
    files.value[fileImportOpen.value]?.carName,
    curSaveTrack.value?.value,
    fileSearch.value[fileImportOpen.value],
    JSON.stringify(files.value[fileImportOpen.value]),
  )
  closeFileSaveDialog()
}

const handleDragEnter = (side: 'left' | 'right') => {
  isDragging.value[side] = true
}

const handleDragLeave = (side: 'left' | 'right') => {
  isDragging.value[side] = false
}

const codeShareOpen = ref<String | undefined>(undefined)
const importSetup = (setup: any, fileName: string) => {
  if (codeShareOpen.value) {
    if (!getCarSeries(setup.carName)) {
      snackbar({
        message: translate('setup.invalidJSON'),
        autoCloseDelay: 3000,
      })
      return
    }
    if (!files.value[counterSide(codeShareOpen.value)]) {
      const carSeries = getCarSeries(setup.carName)
      if (carSeries) {
        curGroup.value = carSeries
      }
    }
    files.value[codeShareOpen.value] = setup
    fileSearch.value[codeShareOpen.value] = fileName
  }
  codeShareOpen.value = undefined
}

const openExtUrl = (url: string) => {
  window.electron.openExtLink(url)
}
</script>

<template>
  <div
    class="h-full flex flex-col justify-center items-center pb-8 relative w-full"
  >
    <input
      type="file"
      accept=".json"
      class="hidden"
      ref="leftFileInput"
      @change="handleFileSelect('left', $event)"
    />
    <input
      type="file"
      accept=".json"
      class="hidden"
      ref="rightFileInput"
      @change="handleFileSelect('right', $event)"
    />
    <mdui-card
      variant="outlined"
      class="size-full border border-[rgb(var(--mdui-color-inverse-primary-dark))] mx-4 mb-2 flex"
      :style="{
        background: `rgba(var(--mdui-color-surface-container-lowest), ${(0.65 * (store.settings.general.bgOpacity || 0.85)) / 0.85})`,
      }"
    >
      <div
        v-for="side in ['left', 'right']"
        :key="side"
        class="w-1/2 h-full relative"
        :class="{
          'ml-4 border-r border-[rgb(var(--mdui-color-surface-container-highest))]':
            side === 'left',
          'mr-4 border-l border-[rgb(var(--mdui-color-surface-container-highest))]':
            side === 'right',
          'border-none': isDragging['left'] || isDragging['right'],
        }"
      >
        <Transition name="scale">
          <div
            v-if="!files[side as Side]"
            class="w-full flex flex-col justify-center items-center my-4 absolute"
            style="height: calc(100% - 2rem)"
            :class="{
              'bg-[rgb(var(--mdui-color-primary-container))] rounded-lg':
                isDragging[side as Side],
            }"
            :style="{
              background: isDragging[side as Side]
                ? 'rgba(var(--mdui-color-primary-container), 0.5)'
                : 'transparent',
              borderRadius: isDragging[side as Side] ? '0.5rem' : '0',
            }"
            @dragenter.prevent="handleDragEnter(side as Side)"
            @dragleave.prevent="handleDragLeave(side as Side)"
            @dragover.prevent
            @drop.prevent="handleDrop(side as Side, $event)"
          >
            <div v-if="!isDragging[side as Side]" class="flex flex-col w-max">
              <mdui-button @click="triggerFileInput(side as Side)">
                {{ $t('setup.chooseFile') }}
              </mdui-button>
              <mdui-button
                @click="codeShareOpen = side"
                class="mt-3"
                variant="elevated"
              >
                {{ $t('setup.importFromCode') }}
              </mdui-button>
            </div>
            <mdui-icon-file-upload--rounded
              v-else
              class="pointer-events-none mb-4 text-4xl text-[rgb(var(--mdui-color-primary))]"
            ></mdui-icon-file-upload--rounded>
            <p class="text-sm text-gray-500 mt-2 pointer-events-none mb-14">
              {{
                isDragging[side as Side]
                  ? $t('setup.releaseToLoad')
                  : $t('setup.dragFile')
              }}
            </p>

            <div
              class="w-full absolute bottom-0 left-0 right-0 flex flex-col items-center"
              v-if="!isDragging[side as Side]"
            >
              <div class="text-sm font-light">{{ $t('setup.loadDocs') }}</div>
              <div class="flex flex-row justify-center items-center flex-wrap">
                <ChipSelect
                  v-model="curGroup"
                  :chip-class="`mx-2 mt-2 bg-[${seriesColorMap[curGroup]}]`"
                  dropdown-placement="top"
                  :items="groups"
                  @select="onSelectGroup"
                  :disabled="
                    files['left'] !== undefined || files['right'] !== undefined
                  "
                >
                </ChipSelect>

                <CarSelector v-model="curCar[side as Side]" :group="curGroup" />
                <TrackSelector v-model="curTrack[side as Side]" />
              </div>
              <mdui-dropdown
                :disabled="
                  !enableSearch[side as Side] ||
                  setupList[side as Side].length == 0
                "
                placement="top"
              >
                <mdui-text-field
                  slot="trigger"
                  variant="outlined"
                  :disabled="!enableSearch[side as Side]"
                  :value="fileSearch[side as Side]"
                  @input="fileSearch[side as Side] = $event.target.value"
                  :placeholder="$t('setup.inputPlaceholder')"
                  style="
                    transition: all var(--mdui-motion-duration-short4)
                      var(--mdui-motion-easing-standard);
                  "
                  class="mt-2 cursor-text"
                  :class="{
                    'pl-4 pr-6': side === 'left',
                    'pl-6 pr-4': side === 'right',
                    'opacity-30': !enableSearch[side as Side],
                  }"
                >
                  <mdui-button-icon
                    slot="end-icon"
                    class="text-[rgb(var(--mdui-color-primary))]"
                    :disabled="fileSearch[side as Side] == ''"
                    @click="readOrCreateFile(side as Side)"
                  >
                    <mdui-icon-check--rounded></mdui-icon-check--rounded>
                  </mdui-button-icon>
                </mdui-text-field>

                <mdui-menu>
                  <ScrollWrapper
                    :height="
                      setupList[side as Side].length > 8 ? '390px' : '100%'
                    "
                  >
                    <mdui-menu-item
                      v-for="file in fileSearch[side as Side].length == 0
                        ? setupList[side as Side]
                        : filteredSetupList[side as Side]"
                      :key="file"
                      @click="fileSearch[side as Side] = file"
                    >
                      {{ file }}
                    </mdui-menu-item>
                  </ScrollWrapper>
                </mdui-menu>
              </mdui-dropdown>
            </div>
          </div>
        </Transition>
        <Transition name="swipe">
          <SetupDisplay
            class="absolute"
            v-if="files[side as Side]"
            :setup="files[side as Side]"
            :side="side"
            v-model:scroll="setupScroll"
            v-model="setupOpenGroups"
            :carData="carData[curGroup]"
            :fileName="fileSearch[side as Side]"
            :compareSetup="files[counterSide(side) as Side]"
            @closeSetup="
              () => {
                files[side as Side] = undefined
                fileSearch[side as Side] = ''
                if (side === 'left') {
                  if (leftFileInput) {
                    leftFileInput.value = ''
                  }
                } else {
                  if (rightFileInput) {
                    rightFileInput.value = ''
                  }
                }
              }
            "
          />
        </Transition>
      </div>
    </mdui-card>

    <mdui-dialog
      :headline="$t('setup.importSetup')"
      :open="codeShareOpen"
      @close="() => {}"
    >
      <SetupCode
        :isOut="false"
        @importSetup="importSetup"
        class="w-[350px]"
        @closeDialog="codeShareOpen = undefined"
      />
    </mdui-dialog>

    <mdui-dialog
      :headline="$t('setup.importSetup')"
      :open="fileImportOpen"
      @close="() => {}"
    >
      <div class="flex flex-col w-[300px]">
        <div class="flex flex-row">
          <mdui-icon-insert-drive-file--rounded
            class="h-[1.125rem] ml-2 text-[rgb(var(--mdui-color-primary))]"
          ></mdui-icon-insert-drive-file--rounded>
          <div class="ml-1 wrap-anywhere">
            {{ fileSearch[fileImportOpen] }}
          </div>
        </div>
        <div class="flex flex-row mt-2">
          <mdui-icon-directions-car--rounded
            class="h-[1.125rem] ml-2 text-[rgb(var(--mdui-color-primary))]"
          ></mdui-icon-directions-car--rounded>
          <div class="ml-1 truncate">
            {{ getCarByKey(files[fileImportOpen]?.carName)?.name }}
          </div>
        </div>
        <TrackSelector
          v-model="curSaveTrack"
          dropdown-placement="right"
          chip-class="mt-2 w-max"
        />

        <mdui-button
          variant="filled"
          class="mt-6 mb-2 font-bold"
          :disabled="!curSaveTrack"
          @click="saveSetup"
          >{{ $t('setup.saveAndView') }}</mdui-button
        >
        <mdui-button variant="text" @click="closeFileSaveDialog">{{
          $t('setup.viewOnly')
        }}</mdui-button>
      </div>
    </mdui-dialog>

    <div
      class="absolute bottom-2 left-0 right-0 text-center text-gray-400 text-sm"
    >
      {{ $t('setup.techSupport') }}
      <img
        src="@/assets/DEA_light.png"
        class="inline px-1 py-0.5 mr-2 mb-0.5 rounded-full bg-[rgb(var(--mdui-color-primary-light))]"
        width="45"
      />
      |
      <mdui-tooltip>
        <ul slot="content" class="list-disc list-outside text-left pl-4">
          <li class="mb-2">{{ $t('setup.generalTip1') }}</li>
          <li class="mb-2">{{ $t('setup.generalTip2') }}</li>
          <li class="mb-2">{{ $t('setup.generalTip3') }}</li>
          <li class="mb-2">{{ $t('setup.generalTip4') }}</li>
          <li>
            {{ $t('setup.generalTip5')
            }}<a
              style="text-decoration: underline"
              :href="$t('setup.generalTipLink')"
              >{{ $t('setup.generalTipLink') }}</a
            >
          </li>
        </ul>
        <div
          class="general-tip inline transition-all ml-2 py-1 px-2 border rounded-full text-xs"
        >
          {{ $t('setup.hoverForGeneralTip') }}
        </div>
      </mdui-tooltip>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.scale-enter-from,
.scale-leave-to {
  transform: scale(0.9);
  opacity: 0;
}
.swipe-enter-from,
.swipe-leave-to {
  transform: translateY(15vh);
  opacity: 0;
}

.scale-enter-active {
  transition: all 200ms var(--mdui-motion-easing-standard);
  transition-delay: 200ms;
}
.scale-leave-active {
  transition: all 200ms var(--mdui-motion-easing-standard);
}

.swipe-enter-active {
  transition: all 400ms var(--mdui-motion-easing-standard);
}
.swipe-leave-active {
  transition: all 300ms var(--mdui-motion-easing-standard);
}

::part(container) {
  background: transparent;
  border-radius: 999px;
  height: 50px;
}
::part(label) {
  color: rgb(var(--mdui-color-on-surface-invert));
}
::part(indicator) {
  background: rgb(var(--mdui-color-inverse-primary));
}
::part(content) {
  font-size: 0.9rem;
  line-height: 1.2;
}

.general-tip:hover {
  background: rgba(var(--mdui-color-secondary), 0.2);
}
</style>
