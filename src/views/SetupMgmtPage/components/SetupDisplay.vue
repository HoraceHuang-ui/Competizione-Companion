<script setup lang="tsx">
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import '@mdui/icons/keyboard-arrow-down.js'
import '@mdui/icons/tire-repair--rounded.js'
import '@mdui/icons/electric-car--rounded.js'
import '@mdui/icons/construction--rounded.js'
import '@mdui/icons/compress--rounded.js'
import '@mdui/icons/air--rounded.js'
import '@mdui/icons/delete--rounded.js'

const props = defineProps({
  setup: {
    type: Object,
    required: true,
  },
  side: {
    type: String,
    default: 'left',
  },
  carData: {
    type: Object,
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
})

const scrollValue = defineModel('scroll', {
  type: Number,
  default: 0,
})

const curOpenGroups = defineModel({
  type: Array,
  default: [],
})

function displayItem(compValue, dispValue = compValue) {
  return {
    compValue: compValue,
    dispValue: dispValue,
  }
}

const tyresSetup = [
  ['轮胎种类', s => [displayItem(s?.basicSetup.tyres.tyreCompound)]],
  [
    '胎压 [psi]',
    (s, c) =>
      s?.basicSetup.tyres.tyrePressure.map(v =>
        displayItem((c.tirePressureMin + v / 10).toFixed(1)),
      ),
  ],
  [
    '束角 [°]',
    (s, c) =>
      s?.basicSetup.alignment.toe.map((v, i) =>
        displayItem((v / 100 + c.toeMins[i >> 1]).toFixed(2)),
      ),
  ],
  [
    '负外倾角 [clicks]',
    s => s?.basicSetup.alignment.camber.map(v => displayItem(v)),
  ],
  [
    '主销倾角 [°]',
    (s, c) => [
      displayItem(c?.casterFunc(s.basicSetup.alignment.casterLF).toFixed(1)),
      displayItem(c?.casterFunc(s.basicSetup.alignment.casterRF).toFixed(1)),
    ],
  ],
]

const electronicsSetup = [
  ['TC1', s => [displayItem(s?.basicSetup.electronics.tC1)]],
  ['TC2', s => [displayItem(s?.basicSetup.electronics.tC2)]],
  ['ABS', s => [displayItem(s?.basicSetup.electronics.abs)]],
  ['ECU 映射', s => [displayItem(s && s.basicSetup.electronics.eCUMap + 1)]],
]

const mechanicalSetup = [
  [
    '防倾杆',
    s => [
      displayItem(s?.advancedSetup.mechanicalBalance.aRBFront),
      displayItem(s?.advancedSetup.mechanicalBalance.aRBRear),
    ],
  ],
  [
    '差速器预载 [Nm]',
    s => [displayItem(s && s.advancedSetup.drivetrain.preload * 10 + 20)],
  ],
  [
    '刹车力度 [%]',
    s => [displayItem(s && s.advancedSetup.mechanicalBalance.brakeTorque + 80)],
  ],
  [
    '刹车比 [%]',
    (s, c) => [
      displayItem(
        s && s.advancedSetup.mechanicalBalance.brakeBias / 5 + c.brakeBiasMin,
      ),
    ],
  ],
  [
    '转向比',
    (s, c) => [
      displayItem(s && s.basicSetup.alignment.steerRatio + c.steeringRatioMin),
    ],
  ],
  [
    '悬挂刚度 [N/m]',
    (s, c) =>
      s?.advancedSetup.mechanicalBalance.wheelRate.map((v, i) =>
        displayItem(c.wheelRates[i >> 1][v] * 1000),
      ),
  ],
  [
    '减震胶块硬度 [N]',
    s =>
      s?.advancedSetup.mechanicalBalance.bumpStopRateUp.map(v =>
        displayItem(v * 100 + 300),
      ),
  ],
  [
    '减震胶块行程',
    s =>
      s?.advancedSetup.mechanicalBalance.bumpStopWindow.map(v =>
        displayItem(v),
      ),
  ],
]

const dampersSetup = [
  ['压缩阻尼', s => s?.advancedSetup.dampers.bumpSlow.map(v => displayItem(v))],
  [
    '快速压缩阻尼',
    s => s?.advancedSetup.dampers.bumpFast.map(v => displayItem(v)),
  ],
  [
    '回弹阻尼',
    s => s?.advancedSetup.dampers.reboundSlow.map(v => displayItem(v)),
  ],
  [
    '快速回弹阻尼',
    s => s?.advancedSetup.dampers.reboundFast.map(v => displayItem(v)),
  ],
]

const aeroSetup = [
  [
    '车高 [mm]',
    (s, c) => [
      displayItem(
        s && s.advancedSetup.aeroBalance.rideHeight[0] + c.rideHeightMinFront,
      ),
      displayItem(
        s && s.advancedSetup.aeroBalance.rideHeight[2] + c.rideHeightMinRear,
      ),
    ],
  ],
  [
    '刹车通风管',
    s => s?.advancedSetup.aeroBalance.brakeDuct.map(v => displayItem(v)),
  ],
  [
    '前扩散器',
    s => [displayItem(s && s.advancedSetup.aeroBalance.splitter + 1)],
  ],
  ['尾翼', s => [displayItem(s && s.advancedSetup.aeroBalance.rearWing)]],
]

const setupGroups = [
  ['轮胎', tyresSetup, 'mdui-icon-tire-repair--rounded'],
  ['电子', electronicsSetup, 'mdui-icon-electric-car--rounded'],
  ['机械', mechanicalSetup, 'mdui-icon-construction--rounded'],
  ['阻尼', dampersSetup, 'mdui-icon-compress--rounded'],
  ['空力', aeroSetup, 'mdui-icon-air--rounded'],
]
</script>

<template>
  <div class="size-full flex flex-col items-center relative">
    <div
      class="title w-5/6 text-center font-bold text-xl mt-2 mb-1 text-[rgb(var(--mdui-color-primary))] truncate"
    >
      {{ props.fileName.replace('.json', '') }}
    </div>
    <ScrollWrapper v-model="scrollValue" class="rounded-2xl">
      <mdui-collapse
        class="mb-20"
        :class="{
          'mr-4': props.side === 'left',
          'ml-4': props.side === 'right',
        }"
        :value="curOpenGroups"
        @change="curOpenGroups = $event.target.value"
      >
        <mdui-collapse-item
          v-for="group in setupGroups"
          :key="group[0]"
          :title="group[0]"
          :value="group[0]"
        >
          <mdui-list-item
            slot="header"
            class="list-header title my-2 rounded-full transition-all"
            style="
              --mdui-state-layer-hover: 0;
              --mdui-state-layer-focus: 0;
              --mdui-state-layer-pressed: 0;
            "
          >
            {{ group[0] }}
            <Component slot="icon" :is="group[2]"></Component>
            <mdui-icon-keyboard-arrow-down
              slot="end-icon"
              class="transition-all"
              :class="{
                'rotate-180': curOpenGroups.includes(group[0]),
              }"
            ></mdui-icon-keyboard-arrow-down>
          </mdui-list-item>
          <div
            class="mx-4 flex flex-row justify-between items-center"
            v-for="items in group[1]"
          >
            <div class="text-left">{{ items[0] }}</div>
            <div class="text-right">
              {{
                items[1](props.setup, props.carData[props.setup.carName])
                  .map(c => c.dispValue)
                  .join(', ')
              }}
            </div>
          </div>
        </mdui-collapse-item>
      </mdui-collapse>
    </ScrollWrapper>
  </div>
</template>

<style lang="scss" scoped>
.list-header {
  background: rgba(var(--mdui-color-secondary-container), 0.4);

  &:hover {
    background: rgb(var(--mdui-color-secondary-container));
  }

  &:active {
    background: rgb(var(--mdui-color-inverse-primary));
  }
}
</style>
