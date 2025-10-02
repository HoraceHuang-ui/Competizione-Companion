<script setup lang="ts">
import {
  hipoleEventColors,
  hipoleEventMap,
  seriesColorMap,
} from '@/utils/enums'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import '@mdui/icons/person-add-disabled--rounded.js'
import '@mdui/icons/directions-car-filled--rounded.js'
import { getTrackDisplay, isHipole, connectServer } from '@/utils/utils'
import { computed } from 'vue'

const props = defineProps({
  server: {
    type: Object,
    required: true,
  },
})

const hipoleEvent = computed(() => isHipole(props.server.name))
const hipoleTier = computed(() => hipoleEventMap[hipoleEvent.value])
</script>

<template>
  <mdui-card
    class="w-full pl-2 pr-1 py-1 border border-[rgb(var(--mdui-color-outline-variant))]"
  >
    <div class="flex flex-row justify-between items-end pr-2">
      <mdui-tooltip :content="props.server.name" placement="bottom-start">
        <div class="title truncate text-xl flex flex-row items-center">
          <img
            v-if="hipoleEvent"
            src="@/assets/hipole/logo.png"
            width="26"
            class="mr-1"
          />
          <div
            v-if="hipoleEvent"
            class="font-bold text-sm rounded-md px-2 mr-2 text-nowrap pt-0.5"
            :style="{
              background: hipoleEventColors[hipoleTier][0],
              color: hipoleEventColors[hipoleTier][1],
            }"
          >
            {{ $t(`servers.hipole${hipoleTier}`).toUpperCase() }}
          </div>
          <div class="truncate w-full">{{ props.server.name }}</div>
        </div>
      </mdui-tooltip>
      <div class="text-sm opacity-70 mb-1 w-[20.5rem] text-right text-nowrap">
        <span
          v-if="props.server.offline"
          style="font-family: Consolas, monospace"
        >
          {{ `${props.server.ip_address}:${props.server.tcp_port}` }}
        </span>
        <span v-else>{{ getTrackDisplay(props.server.track.id) }}</span>
      </div>
    </div>
    <div class="flex flex-row justify-between items-center w-full">
      <div class="flex flex-row flex-1 justify-between items-center">
        <div class="flex flex-row items-center">
          <mdui-chip
            class="cursor-default mr-2 w-[4.5rem] text-center"
            :class="seriesColorMap[props.server.series]"
            style="--mdui-state-layer-hover: 0; --mdui-state-layer-pressed: 0"
          >
            {{ props.server.series }}
          </mdui-chip>

          <ScrollWrapper style="max-width: calc(100vw - 52rem)">
            <div class="flex flex-row">
              <mdui-chip
                v-for="session in props.server.sessions"
                class="mr-2 pointer-events-none"
                :class="
                  session.active
                    ? 'bg-[rgb(var(--mdui-color-primary-container))]'
                    : 'border border-[rgb(var(--mdui-color-outline-variant))]'
                "
                style="
                  --mdui-state-layer-hover: 0;
                  --mdui-state-layer-pressed: 0;
                "
              >
                <div class="font-bold text-base" slot="icon">
                  {{ session.type[0] }}
                </div>
                <div>{{ session.elapsed_time }} min</div>
              </mdui-chip>
            </div>
          </ScrollWrapper>
        </div>

        <div class="flex flex-row items-center">
          <mdui-chip
            class="mr-2 pointer-events-none"
            :class="{
              'bg-[rgb(var(--mdui-color-error-container))]':
                props.server.drivers == props.server.max_drivers,
            }"
            style="--mdui-state-layer-hover: 0; --mdui-state-layer-pressed: 0"
          >
            {{ props.server.drivers }} / {{ props.server.max_drivers }}
            <mdui-icon-directions-car-filled--rounded
              slot="icon"
            ></mdui-icon-directions-car-filled--rounded>
          </mdui-chip>
          <mdui-chip
            class="mr-2 pointer-events-none"
            style="--mdui-state-layer-hover: 0; --mdui-state-layer-pressed: 0"
          >
            {{ props.server.requirements.safety_rating }}
            <div slot="icon" class="font-bold text-base pt-0.5">SA</div>
          </mdui-chip>
          <mdui-chip
            class="pointer-events-none"
            style="--mdui-state-layer-hover: 0; --mdui-state-layer-pressed: 0"
          >
            {{ props.server.requirements.track_medals }}
            <div slot="icon" class="font-bold text-base pt-0.5">TM</div>
          </mdui-chip>
        </div>
      </div>

      <div class="flex flex-row justify-end items-center w-[10rem]">
        <mdui-tooltip
          :content="$t('servers.noHotJoin')"
          placement="bottom"
          v-if="!props.server.hot_join"
        >
          <mdui-icon-person-add-disabled--rounded
            class="text-lg ml-2 mb-1"
          ></mdui-icon-person-add-disabled--rounded>
        </mdui-tooltip>
        <mdui-icon-water-drop--outlined
          class="ml-2 text-lg mb-0.5"
          v-if="props.server.conditions.rain"
        ></mdui-icon-water-drop--outlined>
        <mdui-icon-wb-sunny--outlined
          class="ml-2 text-lg mb-0.5"
          v-if="!props.server.conditions.rain && !props.server.conditions.night"
        ></mdui-icon-wb-sunny--outlined>

        <mdui-icon-nightlight--outlined
          class="ml-2 text-lg mb-0.5"
          v-if="props.server.conditions.night"
        ></mdui-icon-nightlight--outlined>

        <mdui-button
          class="ml-3"
          variant="tonal"
          @click="
            connectServer(
              props.server.ip_address,
              props.server.tcp_port,
              props.server.name,
            )
          "
        >
          <mdui-icon-keyboard-double-arrow-right--rounded></mdui-icon-keyboard-double-arrow-right--rounded>
        </mdui-button>
      </div>
    </div>
  </mdui-card>
</template>

<style scoped lang="scss">
::part(popup) {
  border-radius: var(--mdui-shape-corner-small);
}
</style>
