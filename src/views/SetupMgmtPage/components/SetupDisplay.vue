<script setup lang="ts">
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import '@mdui/icons/keyboard-arrow-down.js'
import '@mdui/icons/tire-repair--rounded.js'
import '@mdui/icons/electric-car--rounded.js'
import '@mdui/icons/construction--rounded.js'
import '@mdui/icons/compress--rounded.js'
import '@mdui/icons/air--rounded.js'
import '@mdui/icons/delete--rounded.js'
import '@mdui/icons/settings-suggest--rounded.js'
import { tyreCompound, values4, values2, values2alt } from '@/utils/enums'

const props = defineProps({
  setup: {
    type: Object,
    required: true,
  },
  compareSetup: {
    type: Object,
    default: null,
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
  [
    'tyreCompound',
    '轮胎种类',
    s => [displayItem(s?.basicSetup.tyres.tyreCompound)],
  ],
  [
    'tyrePressure',
    '胎压',
    (s, c) =>
      s?.basicSetup.tyres.tyrePressure.map(v =>
        displayItem((c.tirePressureMin + v / 10).toFixed(1)),
      ),
    'psi',
    values4,
  ],
  [
    'toe',
    '束角',
    (s, c) =>
      s?.basicSetup.alignment.toe.map((v, i) =>
        displayItem((v / 100 + c.toeMins[i >> 1]).toFixed(2)),
      ),
    '°',
    values4,
  ],
  [
    'camber',
    '负外倾角',
    s => s?.basicSetup.alignment.camber.map(v => displayItem(v)),
    'clicks',
    values4,
  ],
  [
    'caster',
    '主销倾角',
    (s, c) => [
      displayItem(c?.casterFunc(s.basicSetup.alignment.casterLF).toFixed(1)),
      displayItem(c?.casterFunc(s.basicSetup.alignment.casterRF).toFixed(1)),
    ],
    '°',
    values2alt,
  ],
]

const electronicsSetup = [
  ['tC1', 'TC1', s => [displayItem(s?.basicSetup.electronics.tC1)]],
  ['tC2', 'TC2', s => [displayItem(s?.basicSetup.electronics.tC2)]],
  ['abs', 'ABS', s => [displayItem(s?.basicSetup.electronics.abs)]],
  [
    'eCUMap',
    'ECU 映射',
    s => [displayItem(s && s.basicSetup.electronics.eCUMap + 1)],
  ],
  [
    'telemetryLaps',
    '遥测圈数',
    s => [displayItem(s?.basicSetup.electronics.telemetryLaps)],
  ],
]

const strategySetup = [
  ['fuel', '油量', s => [displayItem(s?.basicSetup.strategy.fuel + 1)], 'L'],
  [
    'brakePadCompound',
    '刹车皮',
    s => [
      displayItem(s?.basicSetup.strategy.frontBrakePadCompound + 1),
      displayItem(s?.basicSetup.strategy.rearBrakePadCompound + 1),
    ],
    undefined,
    values2,
  ],
]

const mechanicalSetup = [
  [
    'aRB',
    '防倾杆',
    s => [
      displayItem(s?.advancedSetup.mechanicalBalance.aRBFront),
      displayItem(s?.advancedSetup.mechanicalBalance.aRBRear),
    ],
    undefined,
    values2,
  ],
  [
    'preload',
    '差速器预载',
    s => [displayItem(s && s.advancedSetup.drivetrain.preload * 10 + 20)],
    'Nm',
  ],
  [
    'brakeTorque',
    '刹车力度',
    s => [displayItem(s && s.advancedSetup.mechanicalBalance.brakeTorque + 80)],
    '%',
  ],
  [
    'brakeBias',
    '刹车比',
    (s, c) => [
      displayItem(
        s && s.advancedSetup.mechanicalBalance.brakeBias / 5 + c.brakeBiasMin,
      ),
    ],
    '%',
  ],
  [
    'steerRatio',
    '转向比',
    (s, c) => [
      displayItem(s && s.basicSetup.alignment.steerRatio + c.steeringRatioMin),
    ],
  ],
  [
    'wheelRate',
    '悬挂刚度',
    (s, c) =>
      s?.advancedSetup.mechanicalBalance.wheelRate.map((v, i) =>
        displayItem(c.wheelRates[i >> 1][v] * 1000),
      ),
    'N/m',
    values4,
  ],
  [
    'bumpStopRateUp',
    '减震胶块硬度',
    s =>
      s?.advancedSetup.mechanicalBalance.bumpStopRateUp.map(v =>
        displayItem(v * 100 + 300),
      ),
    'N',
    values4,
  ],
  [
    'bumpStopWindow',
    '减震胶块行程',
    s =>
      s?.advancedSetup.mechanicalBalance.bumpStopWindow.map(v =>
        displayItem(v),
      ),
    undefined,
    values4,
  ],
]

const dampersSetup = [
  [
    'bumpSlow',
    '压缩阻尼',
    s => s?.advancedSetup.dampers.bumpSlow.map(v => displayItem(v)),
    undefined,
    values4,
  ],
  [
    'bumpFast',
    '快速压缩阻尼',
    s => s?.advancedSetup.dampers.bumpFast.map(v => displayItem(v)),
    undefined,
    values4,
  ],
  [
    'reboundSlow',
    '回弹阻尼',
    s => s?.advancedSetup.dampers.reboundSlow.map(v => displayItem(v)),
    undefined,
    values4,
  ],
  [
    'reboundFast',
    '快速回弹阻尼',
    s => s?.advancedSetup.dampers.reboundFast.map(v => displayItem(v)),
    undefined,
    values4,
  ],
]

const aeroSetup = [
  [
    'rideHeight',
    '车高',
    (s, c) => [
      displayItem(
        s && s.advancedSetup.aeroBalance.rideHeight[0] + c.rideHeightMinFront,
      ),
      displayItem(
        s && s.advancedSetup.aeroBalance.rideHeight[2] + c.rideHeightMinRear,
      ),
    ],
    'mm',
    values2,
  ],
  [
    'brakeDuct',
    '刹车通风管',
    s => s?.advancedSetup.aeroBalance.brakeDuct.map(v => displayItem(v)),
    undefined,
    values2,
  ],
  [
    'splitter',
    '前扩散器',
    s => [displayItem(s && s.advancedSetup.aeroBalance.splitter + 1)],
  ],
  [
    'wing',
    '尾翼',
    s => [displayItem(s && s.advancedSetup.aeroBalance.rearWing)],
  ],
]

const setupGroups = [
  ['轮胎', tyresSetup, 'mdui-icon-tire-repair--rounded'],
  ['电子', electronicsSetup, 'mdui-icon-electric-car--rounded'],
  ['策略', strategySetup, 'mdui-icon-settings-suggest--rounded'],
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
        class="pb-20"
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
            class="list-header title my-2 rounded-full"
            style="background: rgba(var(--mdui-color-secondary-container), 0.4)"
            rounded
          >
            {{ group[0] }}
            <Component slot="icon" :is="group[2]"></Component>
            <mdui-icon-keyboard-arrow-down
              slot="end-icon"
              style="
                transition: all var(--mdui-motion-duration-short4)
                  var(--mdui-motion-easing-standard);
              "
              :class="{
                'rotate-180': curOpenGroups.includes(group[0]),
              }"
            ></mdui-icon-keyboard-arrow-down>
          </mdui-list-item>
          <div
            class="mx-4 my-2 flex flex-row justify-between"
            v-for="items in group[1]"
          >
            <div class="text-left">
              <span class="font-bold">{{ items[1] }}</span>
              <span class="opacity-70">{{
                items.length >= 4 && items[3] ? ` [${items[3]}]` : ''
              }}</span>
            </div>
            <div
              class="flex-1 h-[1px] mx-2 bg-[rgb(var(--mdui-color-on-secondary))] mt-[1ch]"
            ></div>
            <div class="text-right">
              <mdui-chip
                v-if="items[0] === 'tyreCompound'"
                style="font-family: Consolas, 'Harmony OS Sans SC', sans-serif"
                :class="
                  props.compareSetup
                    ? {
                        'bg-red-700 text-white':
                          props.compareSetup.basicSetup.tyres.tyreCompound >
                          props.setup.basicSetup.tyres.tyreCompound,
                        'bg-green-700 text-white':
                          props.compareSetup.basicSetup.tyres.tyreCompound <
                          props.setup.basicSetup.tyres.tyreCompound,
                      }
                    : {}
                "
              >
                {{ tyreCompound[props.setup.basicSetup.tyres.tyreCompound] }}
              </mdui-chip>
              <mdui-chip
                v-else-if="items.length < 5"
                style="font-family: Consolas, 'Harmony OS Sans SC', sans-serif"
                :class="
                  props.compareSetup
                    ? {
                        'bg-red-700 text-white':
                          items[2](
                            props.compareSetup,
                            props.carData[props.compareSetup.carName],
                          )[0].dispValue >
                          items[2](
                            props.setup,
                            props.carData[props.setup.carName],
                          )[0].dispValue,
                        'bg-green-700 text-white':
                          items[2](
                            props.compareSetup,
                            props.carData[props.compareSetup.carName],
                          )[0].dispValue <
                          items[2](
                            props.setup,
                            props.carData[props.setup.carName],
                          )[0].dispValue,
                      }
                    : {}
                "
              >
                {{
                  items[2](props.setup, props.carData[props.setup.carName])[0]
                    .dispValue
                }}
              </mdui-chip>
              <div v-if="items.length >= 5" class="flex flex-col items-end">
                <div
                  v-for="(c, idx) in items[2](
                    props.setup,
                    props.carData[props.setup.carName],
                  )"
                  :key="idx"
                  class="flex flex-row justify-end items-center"
                >
                  <div class="opacity-70 font-italic font-light">
                    {{ items[4][idx] }}
                  </div>
                  <mdui-chip
                    class="ml-2 my-0.5"
                    style="
                      font-family: Consolas, 'Harmony OS Sans SC', sans-serif;
                    "
                    :class="
                      props.compareSetup
                        ? {
                            'bg-red-700 text-white':
                              items[2](
                                props.compareSetup,
                                props.carData[props.compareSetup.carName],
                              )[idx].dispValue > c.dispValue,
                            'bg-green-700 text-white':
                              items[2](
                                props.compareSetup,
                                props.carData[props.compareSetup?.carName],
                              )[idx].dispValue < c.dispValue,
                          }
                        : {}
                    "
                  >
                    {{ c.dispValue }}
                  </mdui-chip>
                </div>
              </div>
            </div>
          </div>
        </mdui-collapse-item>
      </mdui-collapse>
    </ScrollWrapper>
  </div>
</template>

<style lang="scss" scoped></style>
