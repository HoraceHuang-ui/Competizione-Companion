<script setup lang="ts">
import { ref, watch } from 'vue'
import '@mdui/icons/check--rounded.js'
import { snackbar } from 'mdui'
import { translate } from '@/i18n'
import { getCarByKey } from '../../../utils/utils'
import TrackSelector from '@/components/TrackSelector.vue'

const props = defineProps({
  extractedSetup: {
    type: String,
    default: '',
  },
  isOut: {
    type: Boolean,
    default: false,
  },
  alias: {
    type: String,
    default: '',
  },
  car: {
    type: String,
    default: '',
  },
})
const emits = defineEmits(['closeDialog', 'importSetup'])

const name = ref(props.alias.replace('.json', ''))

const copyCode = async () => {
  const code = await window.brotli
    .compress(`${props.car},${props.extractedSetup}`)
    .catch(e => {
      console.error(e)
      snackbar({
        message: translate('general.unknownFail'),
        autoCloseDelay: 6000,
      })
      return ''
    })
  if (name.value !== '' && code) {
    navigator.clipboard
      .writeText(`${name.value}\n#${translate('setup.codeCopyMsg')}\n#${code}`)
      .then(() => {
        snackbar({
          message: translate('setup.codeCopySuccess'),
          autoCloseDelay: 3000,
        })
        emits('closeDialog')
      })
  }
}

const track = ref(undefined)
const code = ref('')
const car = ref('')
const setupParts = ref<String[]>([])
const parseCode = async () => {
  const parts = code.value.split('#')
  if (parts.length > 1) {
    name.value = parts[0].trim()
  }
  const decompressed = await window.brotli.decompress(
    parts[parts.length - 1].trim(),
  )
  setupParts.value = decompressed.split(',')
  car.value = setupParts.value[0].trim()
}
watch(code, parseCode)

const viewSetup = async (save: boolean) => {
  const s = setupParts.value.map(x => parseInt(x))
  const res = {
    carName: car.value,
    basicSetup: {
      tyres: {
        tyreCompound: s[1],
        tyrePressure: [s[2], s[3], s[4], s[5]],
      },
      alignment: {
        camber: [s[6], s[7], s[8], s[9]],
        toe: [s[10], s[11], s[12], s[13]],
        staticCamber: [s[14], s[15], s[16], s[17]],
        toeOutLinear: [s[18], s[19], s[20], s[21]],
        casterLF: s[22],
        casterRF: s[23],
        steerRatio: s[24],
      },
      electronics: {
        tC1: s[25],
        tC2: s[26],
        abs: s[27],
        eCUMap: s[28],
        fuelMix: s[29],
        telemetryLaps: s[30],
      },
      strategy: {
        fuel: s[31],
        nPitStops: s[32],
        tyreSet: s[33],
        frontBrakePadCompound: s[34],
        rearBrakePadCompound: s[35],
        pitStrategy: [
          {
            fuelToAdd: s[36],
            tyres: {
              tyreCompound: s[37],
              tyrePressure: [s[38], s[39], s[40], s[41]],
            },
            tyreSet: s[42],
            frontBrakePadCompound: s[43],
            rearBrakePadCompound: s[44],
          },
        ],
        fuelPerLap: s[45],
      },
    },
    advancedSetup: {
      mechanicalBalance: {
        aRBFront: s[46],
        aRBRear: s[47],
        wheelRate: [s[48], s[49], s[50], s[51]],
        bumpStopRateUp: [s[52], s[53], s[54], s[55]],
        bumpStopRateDn: [s[56], s[57], s[58], s[59]],
        bumpStopWindow: [s[60], s[61], s[62], s[63]],
        brakeTorque: s[64],
        brakeBias: s[65],
      },
      dampers: {
        bumpSlow: [s[66], s[67], s[68], s[69]],
        bumpFast: [s[70], s[71], s[72], s[73]],
        reboundSlow: [s[74], s[75], s[76], s[77]],
        reboundFast: [s[78], s[79], s[80], s[81]],
      },
      aeroBalance: {
        rideHeight: [s[82], s[83], s[84], s[85]],
        rodLength: [s[86], s[87], s[88], s[89]],
        splitter: s[90],
        rearWing: s[91],
        brakeDuct: [s[92], s[93]],
      },
      drivetrain: {
        preload: s[94],
      },
    },
    trackBopType: s[95],
  }

  if (save) {
    await window.fs.setupFile(
      car.value,
      track.value?.value,
      name.value + '.json',
      JSON.stringify(res),
    )
  }
  emits('importSetup', res, name.value)
  closeDialog()
}

const closeDialog = () => {
  name.value = ''
  code.value = ''
  track.value = undefined
  emits('closeDialog')
}
</script>

<template>
  <div>
    <div v-if="isOut" class="flex flex-col">
      <mdui-text-field
        slot="trigger"
        variant="outlined"
        :value="name"
        @input="name = $event.target.value"
        :placeholder="$t('setup.setupNamePlaceholder')"
        class="mt-2 cursor-text"
        @keyup.native.enter="copyCode"
        :label="$t('setup.setupNameLabel')"
      >
      </mdui-text-field>
      <mdui-button class="mt-10 font-bold" @click="copyCode">{{
        $t('setup.copyCode')
      }}</mdui-button>
      <mdui-button class="mt-2" variant="text" @click="$emit('closeDialog')">
        {{ $t('general.cancel') }}
      </mdui-button>
    </div>
    <div v-else class="flex flex-col">
      <mdui-text-field
        slot="trigger"
        variant="outlined"
        :value="code"
        @input="code = $event.target.value"
        :placeholder="$t('setup.codePlaceholder')"
        class="mt-2 cursor-text"
        :label="$t('setup.codeLabel')"
      >
      </mdui-text-field>
      <mdui-text-field
        slot="trigger"
        variant="outlined"
        :value="name"
        @input="name = $event.target.value"
        :placeholder="$t('setup.setupNamePlaceholder')"
        class="mt-4 cursor-text"
        @keyup.native.enter="copyCode"
        :label="$t('setup.setupNameLabel')"
      >
      </mdui-text-field>
      <div class="mt-2 opacity-80">
        {{ $t('setup.carFromCode') + (getCarByKey(car)?.name || '') }}
      </div>
      <TrackSelector
        v-model="track"
        dropdown-placement="right"
        chip-class="mt-2 w-max"
      />
      <mdui-button
        class="mt-10 font-bold"
        :disabled="!code || !name || !track"
        @click="() => viewSetup(true)"
        >{{ $t('setup.saveAndView') }}</mdui-button
      >
      <mdui-button
        variant="elevated"
        class="mt-2"
        :disabled="!code || !name"
        @click="() => viewSetup(false)"
        >{{ $t('setup.viewOnly') }}</mdui-button
      >
      <mdui-button variant="text" class="mt-2" @click="closeDialog">{{
        $t('general.cancel')
      }}</mdui-button>
    </div>
  </div>
</template>

<style scoped lang="scss"></style>
