<script setup lang="ts">
import '@mdui/icons/help-outline--rounded.js'
import '@mdui/icons/file-upload--rounded.js'

import { ref } from 'vue'
import { snackbar } from 'mdui'
import carData from '@/utils/carData'
import SetupDisplay from '@/views/SetupMgmtPage/components/SetupDisplay.vue'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import '@mdui/icons/arrow-drop-down--rounded.js'
import '@mdui/icons/directions-car--rounded.js'
import '@mdui/icons/location-on--rounded.js'

const leftFileInput = ref<HTMLInputElement | null>(null)
const rightFileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref({ left: false, right: false })
const setupScroll = ref(0)
type Side = 'left' | 'right'

const groups = ['GT3', 'GT4', 'Cup', 'TCX']
const curGroup = ref('GT3')
const tracks = [
  // 文件夹名，英文简写，英文全写，中文
  ['barcelona', 'Barcelona', 'Circuit de Barcelona-Catalunya', '巴塞罗那'],
  ['brands_hatch', 'Brands Hatch', 'Brands Hatch Circuit', '布兰兹哈奇'],
  ['hungaroring', 'Hungaroring', 'Hungaroring', '亨格罗宁'],
  ['misano', 'Misano', 'Misano World Circuit', '米萨诺'],
  ['monza', 'Monza', 'Monza Circuit', '蒙扎'],
  ['nurburgring', 'Nürburgring', 'Nürburgring', '纽博格林南环'],
  ['paul_ricard', 'Paul Ricard', 'Circuit Paul Ricard', '保罗·里卡德'],
  ['silverstone', 'Silverstone', 'Silverstone', '银石'],
  ['spa', 'Spa-Francorchamps', 'Circuit de Spa-Francorchamps', '斯帕'],
  ['valencia', 'Valencia', 'Circuit Ricardo Tormo Valencia', '瓦伦西亚'],
  ['zandvoort', 'Zandvoort', 'Circuit Zandvoort', '赞德沃特'],
  ['zolder', 'Zolder', 'Circuit Zolder', '佐尔德'],
  ['nurburgring_24h', '24h Nürb', ' 24h Nürburgring', '纽博格林24小时全环'],
  ['imola', 'Imola', 'Autodromo Enzo e Dino Ferrari', '伊莫拉'],
  ['red_bull_ring', 'Red Bull Ring', 'Red Bull Ring', '红牛环'],
  ['oulton_park', 'Oulton Park', 'Oulton Park Circuit', '奥顿公园'],
  ['snetterton', 'Snetterton', 'Snetterton Circuit', '斯内特顿'],
  ['donington', 'Donington Park', 'Donington Park', '多宁顿公园'],
  ['cota', 'COTA', 'Circuit of the Americas', '美国之路'],
  [
    'indianapolis',
    'Indianapolis',
    'Indianapolis Motor Speedway',
    '印第安纳波利斯',
  ],
  ['watkins_glen', 'Watkins Glen', 'Watkins Glen International', '华金谷'],
  ['mount_panorama', 'Mount Panorama', 'Mount Panorama Circuit', '澳山'],
  [
    'Laguna Seca',
    'Laguna Seca',
    'WeatherTech Raceway Laguna Seca',
    '拉古纳塞卡',
  ],
  ['suzuka', 'Suzuka', 'Suzuka Circuit', '铃鹿'],
  ['Kyalami', 'Kyalami', 'Kyalami Grand Prix Circuit', '卡拉米'],
]
const curCar = ref({
  left: undefined,
  right: undefined,
})
const curTrack = ref({
  left: undefined,
  right: undefined,
})
const onSelectGroup = (group: string) => {
  curGroup.value = group
  curCar.value = {
    left: undefined,
    right: undefined,
  }
}
const onSelectCar = (side: Side, car: [string, any]) => {
  curCar.value[side] = { value: car[0], label: car[1].name }
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
    files.value[side] = content
  }
}

const handleDrop = async (side: 'left' | 'right', event: DragEvent) => {
  event.preventDefault()
  isDragging.value[side] = false
  const file = event.dataTransfer?.files?.[0]
  if (file && file.type === 'application/json') {
    const content = await file.text()
    files.value[side] = content
    console.log(`${side} file dropped:`, file.name)
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
        class="w-1/2 h-full"
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
          >
            <mdui-divider></mdui-divider>
            <div class="text-sm font-light">或读取游戏文档</div>
            <div class="flex flex-row justify-center items-center flex-wrap">
              <mdui-dropdown placement="top">
                <mdui-chip
                  slot="trigger"
                  class="bg-[rgb(var(--mdui-color-on-primary))] mx-2 mt-2"
                >
                  {{ curGroup }}
                  <mdui-icon-arrow-drop-down--rounded
                    slot="end-icon"
                  ></mdui-icon-arrow-drop-down--rounded>
                </mdui-chip>
                <mdui-menu>
                  <mdui-menu-item
                    v-for="group in groups"
                    :key="group"
                    :value="group"
                    @click="onSelectGroup(group)"
                  >
                    {{ group }}
                  </mdui-menu-item>
                </mdui-menu>
              </mdui-dropdown>

              <mdui-dropdown placement="top">
                <mdui-chip slot="trigger" class="mt-2">
                  {{ curCar[side as Side]?.label || '请选择车型' }}
                  <mdui-icon-directions-car--rounded
                    slot="icon"
                  ></mdui-icon-directions-car--rounded>
                  <mdui-icon-arrow-drop-down--rounded
                    slot="end-icon"
                  ></mdui-icon-arrow-drop-down--rounded>
                </mdui-chip>
                <mdui-menu>
                  <ScrollWrapper
                    :height="
                      Object.keys(carData[curGroup]).length > 8
                        ? '390px'
                        : '100%'
                    "
                  >
                    <mdui-menu-item
                      v-for="car in Object.entries(carData[curGroup])"
                      :key="car[0]"
                      :value="car[0]"
                      @click="onSelectCar(side as Side, car)"
                    >
                      {{ car[1].name }}
                    </mdui-menu-item>
                  </ScrollWrapper>
                </mdui-menu>
              </mdui-dropdown>

              <mdui-dropdown placement="top">
                <mdui-chip slot="trigger" class="mt-2 mx-2">
                  {{ curTrack[side as Side]?.label || '请选择赛道' }}
                  <mdui-icon-location-on--rounded
                    slot="icon"
                  ></mdui-icon-location-on--rounded>
                  <mdui-icon-arrow-drop-down--rounded
                    slot="end-icon"
                  ></mdui-icon-arrow-drop-down--rounded>
                </mdui-chip>
                <mdui-menu>
                  <ScrollWrapper height="390px">
                    <mdui-menu-item
                      v-for="track in tracks"
                      :key="track[0]"
                      :value="track[0]"
                      @click="
                        curTrack[side as Side] = {
                          value: track[0],
                          label: track[2],
                        }
                      "
                    >
                      {{ track[2] }}
                    </mdui-menu-item>
                  </ScrollWrapper>
                </mdui-menu>
              </mdui-dropdown>
            </div>
          </div>
        </div>
        <SetupDisplay
          v-else
          :setup="files[side as Side]"
          v-model="setupScroll"
        />
      </div>
    </mdui-card>

    <!--    <mdui-tooltip>-->
    <!--      <mdui-button-icon class="cursor-default">-->
    <!--        <mdui-icon-help-outline&#45;&#45;rounded></mdui-icon-help-outline&#45;&#45;rounded>-->
    <!--      </mdui-button-icon>-->

    <!--      <div slot="content" class="p-2">-->
    <!--        <div>调整驾驶时自动保存遥测数据的圈数，数据可放入MoTeC中对比分析。</div>-->

    <!--        <div-->
    <!--          class="bg-[rgb(var(&#45;&#45;mdui-color-primary))] rounded-full px-2 py-1 w-max font-bold mt-2 mb-1 title"-->
    <!--        >-->
    <!--          调高-->
    <!--        </div>-->
    <!--        <div>-->
    <!--          存储更多圈数，更不容易丢失你的神之一圈；但遥测文件较大，会占用显著更多的存储空间。-->
    <!--        </div>-->

    <!--        <div-->
    <!--          class="bg-[rgb(var(&#45;&#45;mdui-color-primary))] rounded-full px-2 py-1 w-max font-bold mt-2 mb-1 title"-->
    <!--        >-->
    <!--          调低-->
    <!--        </div>-->
    <!--        <div>存储更少圈数，节约存储空间。</div>-->

    <!--        <div-->
    <!--          class="bg-[rgb(var(&#45;&#45;mdui-color-primary))] rounded-full px-2 py-1 w-max font-bold mt-2 mb-1 title"-->
    <!--        >-->
    <!--          备注-->
    <!--        </div>-->
    <!--        <div>-->
    <!--          圈速没到记录的102%建议直接关了，走好理解好线路比片面地抠一些细节更重要。-->
    <!--        </div>-->
    <!--      </div>-->
    <!--    </mdui-tooltip>-->

    <div
      class="absolute bottom-2 left-0 right-0 text-center text-gray-400 text-sm"
    >
      调校技术支持来自
      <img
        src="@/assets/DEA_light.png"
        class="inline px-1 py-0.5 mb-0.5 rounded-full bg-[rgb(var(--mdui-color-primary-light))]"
        width="45"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
