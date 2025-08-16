<script setup lang="ts">
import '@mdui/icons/file-upload--rounded.js'

import { computed, ref, watch } from 'vue'
import { snackbar } from 'mdui'
import carData from '@/utils/carData'
import SetupDisplay from '@/views/SetupMgmtPage/components/SetupDisplay.vue'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import '@mdui/icons/arrow-drop-down--rounded.js'
import '@mdui/icons/directions-car--rounded.js'
import '@mdui/icons/location-on--rounded.js'
import '@mdui/icons/check--rounded.js'
import ChipSelect from '@/components/ChipSelect.vue'
import { useStore } from '@/store'
import { seriesColorMap } from '@/utils/enums'
import tracks from '@/utils/trackData'
import { translate } from '@/i18n'
import SetupCode from '@/views/SetupMgmtPage/components/SetupCode.vue'

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
const onSelectCar = (side: Side, car: [string, any]) => {
  let carLabel
  if (store.settings.setup.carDisplay == 3) {
    carLabel = translate(`cars.${car?.[0]}`)
  } else {
    carLabel =
      car?.[1]?.[['name', 'shortName'][store.settings.setup.carDisplay - 1]]
  }
  curCar.value[side] = {
    value: car[0],
    label: carLabel,
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
  } else {
    snackbar({
      message: translate('setup.invalidFile'),
      autoCloseDelay: 3000,
    })
  }
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
</script>

<template>
  <div
    class="h-full flex flex-col justify-center items-center pb-8 relative"
    style="width: calc(100% - 1rem)"
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
      class="size-full border border-[rgb(var(--mdui-color-inverse-primary-dark))] bg-[rgb(var(--mdui-color-surface-container-lowest))] mx-4 mb-2 flex"
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
        <div
          v-if="!files[side as Side]"
          class="w-full flex flex-col justify-center items-center my-4 relative"
          style="height: calc(100% - 2rem)"
          :class="{
            'bg-[rgb(var(--mdui-color-primary-container))] rounded-lg':
              isDragging[side as Side],
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

              <ChipSelect
                v-model="curCar[side as Side]"
                :placeholder="$t('setup.carPlaceholder')"
                dropdown-placement="top"
                :items="Object.entries(carData[curGroup])"
                chip-class="mt-2 mx-2"
                :for-key="(car: [string, any]) => car?.[0]"
                :for-value="(car: [string, any]) => car?.[0]"
                :item-label="
                  (car: [string, any]) => {
                    if (store.settings.setup.carDisplay == 3) {
                      return $t(`cars.${car?.[0]}`)
                    }
                    return car?.[1]?.[
                      ['name', 'shortName'][store.settings.setup.carDisplay - 1]
                    ]
                  }
                "
                :chip-label="(car: any) => car?.label"
                @select="item => onSelectCar(side as Side, item)"
              >
                <template #icon>
                  <mdui-icon-directions-car--rounded
                    class="h-[1.125rem]"
                  ></mdui-icon-directions-car--rounded>
                </template>
              </ChipSelect>

              <ChipSelect
                v-model="curTrack[side as Side]"
                :placeholder="$t('setup.trackPlaceholder')"
                dropdown-placement="top"
                :items="tracks"
                chip-class="mt-2 mx-2"
                :for-key="(track: [string, string, string]) => track?.[0]"
                :for-value="(track: [string, string, string]) => track?.[0]"
                :item-label="
                  (track: [string, string, string]) => {
                    if (store.settings.setup.trackDisplay == 3) {
                      return $t(`tracks.${track?.[0]}`)
                    }
                    return track?.[
                      [2, 1][store.settings.setup.trackDisplay - 1]
                    ]
                  }
                "
                :chip-label="(track: any) => track?.label"
                @select="
                  item => {
                    let trackLabel
                    if (store.settings.setup.trackDisplay == 3) {
                      trackLabel = $t(`tracks.${item?.[0]}`)
                    } else {
                      trackLabel =
                        item?.[[2, 1][store.settings.setup.trackDisplay - 1]]
                    }
                    curTrack[side as Side] = {
                      value: item[0],
                      label: trackLabel,
                    }
                  }
                "
              >
                <template #icon>
                  <mdui-icon-location-on--rounded
                    class="h-[1.125rem]"
                  ></mdui-icon-location-on--rounded>
                </template>
              </ChipSelect>
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
        <SetupDisplay
          v-else
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
            }
          "
        />
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

    <div
      class="absolute bottom-2 left-0 right-0 text-center text-gray-400 text-sm"
    >
      {{ $t('setup.techSupport') }}
      <img
        src="@/assets/DEA_light.png"
        class="inline px-1 py-0.5 mb-0.5 rounded-full bg-[rgb(var(--mdui-color-primary-light))]"
        width="45"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
::part(container) {
  background: transparent;
}
::part(label) {
  color: rgb(var(--mdui-color-on-surface-invert));
}
::part(indicator) {
  background: rgb(var(--mdui-color-inverse-primary));
}
</style>
