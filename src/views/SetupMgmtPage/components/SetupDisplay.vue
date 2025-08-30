<script setup lang="ts">
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import '@mdui/icons/keyboard-arrow-down.js'
import '@mdui/icons/tire-repair--rounded.js'
import '@mdui/icons/electric-car--rounded.js'
import '@mdui/icons/construction--rounded.js'
import '@mdui/icons/compress--rounded.js'
import '@mdui/icons/air--rounded.js'
import '@mdui/icons/delete--rounded.js'
import '@mdui/icons/share--rounded.js'
import '@mdui/icons/settings-suggest--rounded.js'
import {
  tyreCompound,
  values4,
  values2,
  values2alt,
  tyreCompoundEn,
  values2altEn,
  values2En,
} from '@/utils/enums'
import { useStore } from '@/store'
import { translate } from '@/i18n'
import HelpTooltip from '@/views/SetupMgmtPage/components/HelpTooltip.vue'
import { ref } from 'vue'
import SetupCode from '@/views/SetupMgmtPage/components/SetupCode.vue'
import carData from '@/utils/carData'

const store = useStore()
const enLabel = store.settings.setup.setupLabelEn

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

const codeShareOpen = ref(false)

function displayItem(compValue, dispValue = compValue) {
  return {
    compValue: compValue,
    dispValue: dispValue,
  }
}

const tyresSetup = [
  [
    'tyreCompound',
    'Compound',
    s => [displayItem(s?.basicSetup.tyres.tyreCompound)],
  ],
  [
    'tyrePressure',
    'Pressure',
    (s, c) =>
      s?.basicSetup.tyres.tyrePressure.map(v =>
        displayItem((c.tirePressureMin + v / 10).toFixed(1)),
      ),
    'psi',
    enLabel ? values4 : values4.map(it => translate(`setup.${it}`)),
  ],
  [
    'toe',
    'Toe',
    (s, c) =>
      s?.basicSetup.alignment.toe.map((v, i) =>
        displayItem((v / 100 + c.toeMins[i >> 1]).toFixed(2)),
      ),
    '°',
    enLabel ? values4 : values4.map(it => translate(`setup.${it}`)),
  ],
  [
    'camber',
    'Camber',
    s => s?.basicSetup.alignment.camber.map(v => displayItem(v)),
    'clicks',
    enLabel ? values4 : values4.map(it => translate(`setup.${it}`)),
  ],
  [
    'caster',
    'Caster',
    (s, c) => [
      displayItem(c?.casterFunc(s.basicSetup.alignment.casterLF).toFixed(1)),
      displayItem(c?.casterFunc(s.basicSetup.alignment.casterRF).toFixed(1)),
    ],
    '°',
    enLabel ? values2altEn : values2alt.map(it => translate(`setup.${it}`)),
  ],
]

const electronicsSetup = [
  ['tC1', 'TC1', s => [displayItem(s?.basicSetup.electronics.tC1)]],
  ['tC2', 'TC2', s => [displayItem(s?.basicSetup.electronics.tC2)]],
  ['abs', 'ABS', s => [displayItem(s?.basicSetup.electronics.abs)]],
  [
    'eCUMap',
    'ECU Map',
    s => [displayItem(s && s.basicSetup.electronics.eCUMap + 1)],
  ],
  [
    'telemetryLaps',
    'Telemetry Laps',
    s => [displayItem(s?.basicSetup.electronics.telemetryLaps)],
  ],
]

const strategySetup = [
  ['fuel', 'Fuel', s => [displayItem(s?.basicSetup.strategy.fuel + 1)], 'L'],
  [
    'brakePadCompound',
    'Brake Pad Compound',
    s => [
      displayItem(s?.basicSetup.strategy.frontBrakePadCompound + 1),
      displayItem(s?.basicSetup.strategy.rearBrakePadCompound + 1),
    ],
    undefined,
    enLabel ? values2En : values2.map(it => translate(`setup.${it}`)),
  ],
]

const mechanicalSetup = [
  [
    'aRB',
    'Anti-roll Bar',
    s => [
      displayItem(s?.advancedSetup.mechanicalBalance.aRBFront),
      displayItem(s?.advancedSetup.mechanicalBalance.aRBRear),
    ],
    undefined,
    enLabel ? values2En : values2.map(it => translate(`setup.${it}`)),
  ],
  [
    'preload',
    'Differential Preload',
    s => [displayItem(s && s.advancedSetup.drivetrain.preload * 10 + 20)],
    'Nm',
  ],
  [
    'brakeTorque',
    'Brake Torque',
    s => [displayItem(s && s.advancedSetup.mechanicalBalance.brakeTorque + 80)],
    '%',
  ],
  [
    'brakeBias',
    'Brake Bias',
    (s, c) => [
      displayItem(
        s && s.advancedSetup.mechanicalBalance.brakeBias / 5 + c.brakeBiasMin,
      ),
    ],
    '%',
  ],
  [
    'steerRatio',
    'Steer Ratio',
    (s, c) => [
      displayItem(s && s.basicSetup.alignment.steerRatio + c.steeringRatioMin),
    ],
  ],
  [
    'wheelRate',
    'Wheel Rate',
    (s, c) =>
      s?.advancedSetup.mechanicalBalance.wheelRate.map((v, i) =>
        displayItem(c.wheelRates[i >> 1][v] * 1000),
      ),
    'N/m',
    enLabel ? values4 : values4.map(it => translate(`setup.${it}`)),
  ],
  [
    'bumpStopRateUp',
    'Bump Stop Rate',
    s =>
      s?.advancedSetup.mechanicalBalance.bumpStopRateUp.map(v =>
        displayItem(v * 100 + 300),
      ),
    'N',
    enLabel ? values4 : values4.map(it => translate(`setup.${it}`)),
  ],
  [
    'bumpStopWindow',
    'Bump Stop Range',
    s =>
      s?.advancedSetup.mechanicalBalance.bumpStopWindow.map(v =>
        displayItem(v),
      ),
    undefined,
    enLabel ? values4 : values4.map(it => translate(`setup.${it}`)),
  ],
]

const dampersSetup = [
  [
    'bumpSlow',
    'Bump',
    s => s?.advancedSetup.dampers.bumpSlow.map(v => displayItem(v)),
    undefined,
    enLabel ? values4 : values4.map(it => translate(`setup.${it}`)),
  ],
  [
    'bumpFast',
    'Fast Bump',
    s => s?.advancedSetup.dampers.bumpFast.map(v => displayItem(v)),
    undefined,
    enLabel ? values4 : values4.map(it => translate(`setup.${it}`)),
  ],
  [
    'reboundSlow',
    'Rebound',
    s => s?.advancedSetup.dampers.reboundSlow.map(v => displayItem(v)),
    undefined,
    enLabel ? values4 : values4.map(it => translate(`setup.${it}`)),
  ],
  [
    'reboundFast',
    'Fast Rebound',
    s => s?.advancedSetup.dampers.reboundFast.map(v => displayItem(v)),
    undefined,
    enLabel ? values4 : values4.map(it => translate(`setup.${it}`)),
  ],
]

const aeroSetup = [
  [
    'rideHeight',
    'Ride Height',
    (s, c) => [
      displayItem(
        s && s.advancedSetup.aeroBalance.rideHeight[0] + c.rideHeightMinFront,
      ),
      displayItem(
        s && s.advancedSetup.aeroBalance.rideHeight[2] + c.rideHeightMinRear,
      ),
    ],
    'mm',
    enLabel ? values2En : values2.map(it => translate(`setup.${it}`)),
  ],
  [
    'brakeDuct',
    'Brake Duct',
    s => s?.advancedSetup.aeroBalance.brakeDuct.map(v => displayItem(v)),
    undefined,
    enLabel ? values2En : values2.map(it => translate(`setup.${it}`)),
  ],
  [
    'splitter',
    'Front Splitter',
    s => [displayItem(s && s.advancedSetup.aeroBalance.splitter + 1)],
  ],
  [
    'wing',
    'Rear Wing',
    s => [displayItem(s && s.advancedSetup.aeroBalance.rearWing)],
  ],
]

const setupGroups = [
  ['tyres', 'Tyres', tyresSetup, 'mdui-icon-tire-repair--rounded'],
  [
    'electronics',
    'Electronics',
    electronicsSetup,
    'mdui-icon-electric-car--rounded',
  ],
  [
    'strategy',
    'Strategy',
    strategySetup,
    'mdui-icon-settings-suggest--rounded',
  ],
  [
    'mechanical',
    'Mechanical',
    mechanicalSetup,
    'mdui-icon-construction--rounded',
  ],
  ['dampers', 'Dampers', dampersSetup, 'mdui-icon-compress--rounded'],
  ['air', 'Aero', aeroSetup, 'mdui-icon-air--rounded'],
]

const extractNumbers = (obj: any, inPitStrategy = false) => {
  let nums: number[] = []
  if (Array.isArray(obj)) {
    if (inPitStrategy) {
      // pitStrategy 特殊处理：只取第一个元素
      if (obj.length > 0) {
        nums.push(...extractNumbers(obj[0]))
      }
    } else {
      for (let val of obj) {
        nums.push(...extractNumbers(val))
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (let key in obj) {
      if (key === 'pitStrategy' && Array.isArray(obj[key])) {
        nums.push(...extractNumbers(obj[key], true))
      } else {
        nums.push(...extractNumbers(obj[key]))
      }
    }
  } else if (typeof obj === 'number') {
    nums.push(obj)
  }
  return nums
}

const findCar = (carName: string) => {
  for (const series in carData) {
    if (carName in carData[series]) {
      return carData[series][carName].name
    }
  }
  return carName
}
</script>

<template>
  <div class="size-full flex flex-col items-center relative">
    <div
      class="title w-full font-bold text-xl mt-2 mb-1 text-[rgb(var(--mdui-color-primary))] flex flex-row justify-between items-center"
      :class="{
        'pl-1 pr-3': props.side === 'left',
        'pl-5': props.side === 'right',
      }"
    >
      <div class="truncate" style="flex: 1">
        {{ props.fileName.replace('.json', '') }}
      </div>
      <div class="flex flex-row">
        <mdui-tooltip :content="$t('general.close')" placement="bottom">
          <mdui-button-icon
            class="text-lg"
            @click="$emit('closeSetup')"
            style="color: rgb(var(--mdui-color-on-surface))"
          >
            <mdui-icon-delete--rounded></mdui-icon-delete--rounded>
          </mdui-button-icon>
        </mdui-tooltip>
        <mdui-tooltip
          :content="$t('general.share')"
          placement="bottom"
          @click="codeShareOpen = true"
        >
          <mdui-button-icon
            class="text-lg"
            style="color: rgb(var(--mdui-color-on-surface))"
          >
            <mdui-icon-share--rounded></mdui-icon-share--rounded>
          </mdui-button-icon>
        </mdui-tooltip>
      </div>
    </div>
    <ScrollWrapper v-model="scrollValue" class="rounded-2xl">
      <mdui-collapse
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
          :value="group[0]"
        >
          <mdui-list-item
            slot="header"
            class="list-header title my-2 rounded-full"
            style="background: rgba(var(--mdui-color-secondary-container), 0.4)"
            rounded
          >
            {{ enLabel ? group[1] : $t(`setup.categories.${group[0]}`) }}
            <Component slot="icon" :is="group[3]"></Component>
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
            v-for="items in group[2]"
          >
            <div class="text-left flex flex-row">
              <div class="font-bold">
                {{ enLabel ? items[1] : $t(`setup.params.${items[0]}.name`) }}
              </div>
              <div class="opacity-70">
                {{ items.length >= 4 && items[3] ? `&nbsp;[${items[3]}]` : '' }}
              </div>
              <HelpTooltip :param-key="items[0]" class="ml-2" />
            </div>
            <div
              class="flex-1 h-[1px] mx-2 bg-[rgb(var(--mdui-color-outline))] mt-[1ch] opacity-40"
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
                {{
                  (enLabel
                    ? tyreCompoundEn
                    : tyreCompound.map(it => translate(`setup.${it}`)))[
                    props.setup.basicSetup.tyres.tyreCompound
                  ]
                }}
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
    <div class="w-full text-center text-sm py-2 opacity-60">
      {{ findCar(props.setup.carName) }}
    </div>

    <mdui-dialog
      :headline="$t('setup.shareCode')"
      :open="codeShareOpen"
      close-on-overlay-click
      close-on-esc
      @close="codeShareOpen = false"
    >
      <SetupCode
        class="w-[350px]"
        :extractedSetup="extractNumbers(props.setup).join(',')"
        :alias="props.fileName"
        :car="props.setup.carName"
        isOut
        @closeDialog="codeShareOpen = false"
      />
    </mdui-dialog>
  </div>
</template>

<style lang="scss" scoped></style>
