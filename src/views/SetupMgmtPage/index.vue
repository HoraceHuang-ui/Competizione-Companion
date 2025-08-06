<script setup lang="ts">
import '@mdui/icons/help-outline--rounded.js'
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
const fileSearch = ref({
  left: '',
  right: '',
})

const curCar = ref({
  left: undefined,
  right: undefined,
})
const curTrack = ref({
  left: undefined,
  right: undefined,
})

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
      message: '请输入或选择调校文件名。',
      autoCloseDelay: 3000,
    })
    return
  }
  try {
    const content = await window.fs.setupFile(
      curCar.value[side]?.value,
      curTrack.value[side]?.value,
      fileName.endsWith('.json') ? fileName : `${fileName}.json`,
    )
    const jsonContent = JSON.parse(content)
    if (!jsonContent.carName) {
      snackbar({
        message: '不是有效的调校文件，请检查文件内容。',
        autoCloseDelay: 3000,
      })
      return
    }
    if (!Object.keys(carData[curGroup.value]).includes(jsonContent.carName)) {
      snackbar({
        message: `请选择${curGroup.value}组别车型。`,
        autoCloseDelay: 3000,
      })
      return
    }
    files.value[side] = jsonContent
  } catch (error) {
    snackbar({
      message: '读取调校文件失败，请检查文件名是否正确。',
      autoCloseDelay: 3000,
    })
  }
}

const onSelectGroup = (group: string) => {
  curGroup.value = group
  curCar.value = {
    left: undefined,
    right: undefined,
  }
}
const onSelectCar = (side: Side, car: [string, any]) => {
  curCar.value[side] = {
    value: car[0],
    label:
      car[1][
        ['name', 'shortName', 'localName'][store.settings.setup.carDisplay - 1]
      ],
  }
}

const files = ref({
  left: undefined,
  right: undefined,
})

const triggerFileInput = (side: 'left' | 'right') => {
  if (side === 'left') {
    leftFileInput.value?.click()
  } else {
    rightFileInput.value?.click()
  }
}

const handleFileSelect = async (side: 'left' | 'right', event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    const content = await file.text()
    const jsonContent = JSON.parse(content)
    if (!jsonContent.carName) {
      snackbar({
        message: '不是有效的调校文件，请检查文件内容。',
        autoCloseDelay: 3000,
      })
      return
    }
    if (!Object.keys(carData[curGroup.value]).includes(jsonContent.carName)) {
      snackbar({
        message: `请选择${curGroup.value}组别车型。`,
        autoCloseDelay: 3000,
      })
      return
    }
    fileSearch.value[side] = file.name
    files.value[side] = jsonContent
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
        message: '不是有效的调校文件，请检查文件内容。',
        autoCloseDelay: 3000,
      })
      return
    }
    if (!Object.keys(carData[curGroup.value]).includes(jsonContent.carName)) {
      snackbar({
        message: `请选择${curGroup.value}组别车型。`,
        autoCloseDelay: 3000,
      })
      return
    }
    fileSearch.value[side] = file.name
    files.value[side] = jsonContent
  } else {
    snackbar({
      message: '文件读取失败，请拖入JSON类型的ACC调校文件。',
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
          <mdui-button
            @click="triggerFileInput(side as Side)"
            v-if="!isDragging[side as Side]"
          >
            选择调校JSON文件
          </mdui-button>
          <mdui-icon-file-upload--rounded
            v-else
            class="pointer-events-none mb-4 text-4xl text-[rgb(var(--mdui-color-primary))]"
          ></mdui-icon-file-upload--rounded>
          <p class="text-sm text-gray-500 mt-2 pointer-events-none mb-12">
            {{
              isDragging[side as Side]
                ? '松开鼠标以读取调校'
                : '或直接拖拽到此处'
            }}
          </p>

          <div
            class="w-full absolute bottom-0 left-0 right-0 flex flex-col items-center"
            v-if="!isDragging[side as Side]"
          >
            <div class="text-sm font-light">或读取游戏文档</div>
            <div class="flex flex-row justify-center items-center flex-wrap">
              <ChipSelect
                v-model="curGroup"
                :chip-class="`mx-2 mt-2 bg-[${seriesColorMap[curGroup]}]`"
                dropdown-placement="top"
                :items="groups"
                @select="onSelectGroup"
              >
              </ChipSelect>

              <ChipSelect
                v-model="curCar[side as Side]"
                placeholder="请选择车型"
                dropdown-placement="top"
                :items="Object.entries(carData[curGroup])"
                chip-class="mt-2 mx-2"
                :for-key="(car: [string, any]) => car?.[0]"
                :for-value="(car: [string, any]) => car?.[0]"
                :item-label="
                  (car: [string, any]) =>
                    car?.[1]?.[
                      ['name', 'shortName', 'localName'][
                        store.settings.setup.carDisplay - 1
                      ]
                    ]
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
                placeholder="请选择赛道"
                dropdown-placement="top"
                :items="tracks"
                chip-class="mt-2 mx-2"
                :for-key="
                  (track: [string, string, string, string]) => track?.[0]
                "
                :for-value="
                  (track: [string, string, string, string]) => track?.[0]
                "
                :item-label="
                  (track: [string, string, string, string]) =>
                    track?.[[2, 1, 3][store.settings.setup.trackDisplay - 1]]
                "
                :chip-label="(track: any) => track?.label"
                @select="
                  item =>
                    (curTrack[side as Side] = {
                      value: item[0],
                      label:
                        item[[2, 1, 3][store.settings.setup.trackDisplay - 1]],
                    })
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
                placeholder="请输入或选择调校文件名"
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
        />
        <mdui-fab
          class="absolute bottom-4"
          :class="{
            'left-0': side === 'left',
            'left-4': side === 'right',
          }"
          v-if="files[side as Side]"
          @click="
            () => {
              files[side as Side] = undefined
              fileSearch[side as Side] = ''
            }
          "
        >
          <mdui-icon-delete--rounded slot="icon"></mdui-icon-delete--rounded>
        </mdui-fab>
      </div>
    </mdui-card>

    <div
      class="absolute bottom-2 left-0 right-0 text-center text-gray-400 text-sm"
    >
      <!--      <mdui-tooltip>-->
      <!--        <mdui-button-icon class="cursor-default">-->
      <!--          <mdui-icon-help-outline&#45;&#45;rounded></mdui-icon-help-outline&#45;&#45;rounded>-->
      <!--        </mdui-button-icon>-->

      <!--        <div slot="content" class="px-2 pb-2">-->
      <!--          <mdui-tabs value="adjust">-->
      <!--            <mdui-tab value="adjust">调节</mdui-tab>-->
      <!--            <mdui-tab value="theory">原理</mdui-tab>-->

      <!--            <mdui-tab-panel slot="panel" value="adjust" class="text-left mt-2">-->
      <!--              <div>调整冷胎时的胎压。</div>-->

      <!--              <div-->
      <!--                class="bg-[rgb(var(&#45;&#45;mdui-color-primary))] rounded-full px-2 py-1 w-max font-bold mt-2 mb-1 title"-->
      <!--              >-->
      <!--                调高-->
      <!--              </div>-->
      <!--              <div>-->
      <!--                可提供更多侧向支撑，初段反應更強，增加指向性,-->
      <!--                而且可以壓制胎溫的上升; 但接觸面會減少，容易過載產生滑移。-->
      <!--              </div>-->

      <!--              <div-->
      <!--                class="bg-[rgb(var(&#45;&#45;mdui-color-primary))] rounded-full px-2 py-1 w-max font-bold mt-2 mb-1 title"-->
      <!--              >-->
      <!--                调低-->
      <!--              </div>-->
      <!--              <div>-->
      <!--                使轮胎更容易产生形变，增加接觸面，抓地上限會增加,-->
      <!--                胎溫會上升的更快；但指向性弱，初段反應不積極，動態不線性。-->
      <!--              </div>-->

      <!--              <div-->
      <!--                class="bg-[rgb(var(&#45;&#45;mdui-color-primary))] rounded-full px-2 py-1 w-max font-bold mt-2 mb-1 title"-->
      <!--              >-->
      <!--                备注-->
      <!--              </div>-->
      <!--              <div>-->
      <!--                一般建议干胎暖胎后稳定在26.7-27.2psi,-->
      <!--                高溫的情況下建議27.1-27.3psi；雨胎稳定在29.5-31.0psi。-->
      <!--              </div>-->
      <!--            </mdui-tab-panel>-->

      <!--            <mdui-tab-panel slot="panel" value="theory">-->
      <!--              <div>ACC遥测数据的圈速记录原理：</div>-->
      <!--              <ul class="list-disc ml-6 mt-2">-->
      <!--                <li>ACC会在每次完成一圈后记录该圈的圈速。</li>-->
      <!--                <li>如果圈速超过102%，则不会记录该圈。</li>-->
      <!--                <li>如果圈速低于102%，则会记录该圈。</li>-->
      <!--                <li>ACC会自动保存最近的若干个有效圈速数据。</li>-->
      <!--              </ul>-->
      <!--            </mdui-tab-panel>-->
      <!--          </mdui-tabs>-->
      <!--        </div>-->
      <!--      </mdui-tooltip>-->
      调校技术支持来自
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
