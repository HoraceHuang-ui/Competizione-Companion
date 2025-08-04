<script setup lang="ts">
import '@mdui/icons/search--rounded.js'
import '@mdui/icons/person-add-disabled--rounded.js'
import '@mdui/icons/directions-car-filled--rounded.js'
import '@mdui/icons/wb-sunny--outlined.js'
import '@mdui/icons/water-drop--outlined.js'
import '@mdui/icons/nightlight--outlined.js'
import { onMounted, ref } from 'vue'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import { seriesColorMap } from '@/utils/enums'

const searchDialogShow = ref(false)

const curPage = ref(1)
const servers = ref([])
const loading = ref(false)

const reqData = () => {
  loading.value = true
  fetch(
    `https://acc-status.jonatan.net/api/v2/acc/servers?limit=20&skip=${curPage.value * 20}&mode=public`,
    {
      method: 'GET',
    },
  )
    .then(resp => resp.json())
    .then(data => {
      console.log(data)
      servers.value = data.servers
    })
    .finally(() => {
      loading.value = false
    })
}

onMounted(() => {
  reqData()
})
</script>

<template>
  <div
    class="h-full pb-5 flex flex-col justify-center items-center relative"
    style="width: calc(100% - 1rem)"
  >
    <mdui-card
      variant="outlined"
      class="size-full border border-[rgb(var(--mdui-color-inverse-primary-dark))] bg-[rgb(var(--mdui-color-surface-container-lowest))] mx-4 mb-4 flex flex-row justify-center relative"
    >
      <div v-if="loading" class="size-full">
        <mdui-circular-progress></mdui-circular-progress>
      </div>
      <ScrollWrapper width="98%" v-else>
        <div
          class="flex flex-row justify-center py-2 px-[9%]"
          style="flex-wrap: wrap"
        >
          <div
            class="w-1/2 px-2 py-1"
            v-for="server in servers"
            :key="server.id"
          >
            <mdui-card class="w-full p-3">
              <mdui-tooltip :content="server.name" placement="bottom">
                <div class="flex flex-row justify-between items-center">
                  <div class="title truncate w-5/6 font-bold text-xl">
                    {{ server.name }}
                  </div>
                  <mdui-chip
                    :style="{ background: seriesColorMap[server.series] }"
                  >
                    {{ server.series }}
                  </mdui-chip>
                </div>
              </mdui-tooltip>

              <div class="flex flex-row justify-between items-center mt-2">
                <div class="flex flex-row">
                  <mdui-chip
                    v-for="session in server.sessions"
                    class="mr-2"
                    :class="
                      session.active
                        ? 'bg-[rgb(var(--mdui-color-primary-container))]'
                        : 'border border-[rgb(var(--mdui-color-outline-variant))]'
                    "
                  >
                    <div class="font-bold text-base" slot="icon">
                      {{ session.type[0] }}
                    </div>
                    <div>{{ session.elapsed_time }} min</div>
                  </mdui-chip>
                </div>
                <mdui-tooltip
                  content="正赛期间不可加入"
                  placement="bottom"
                  v-if="!server.hot_join"
                >
                  <mdui-icon-person-add-disabled--rounded
                    class="text-lg ml-2"
                  ></mdui-icon-person-add-disabled--rounded>
                </mdui-tooltip>
              </div>

              <div class="flex flex-row justify-between items-center mt-2">
                <div class="flex flex-row items-center">
                  <mdui-chip
                    class="mr-2"
                    :class="{
                      'bg-[rgb(var(--mdui-color-error-container))]':
                        server.drivers == server.max_drivers,
                    }"
                  >
                    {{ server.drivers }} / {{ server.max_drivers }}
                    <mdui-icon-directions-car-filled--rounded
                      slot="icon"
                    ></mdui-icon-directions-car-filled--rounded>
                  </mdui-chip>
                  <mdui-chip
                    v-for="req in Object.entries(server.requirements)"
                    class="mr-2"
                  >
                    {{ req[1] }}
                    <div slot="icon" class="font-bold text-base">
                      {{
                        req[0]
                          .split('_')
                          .map(it => it[0].toUpperCase())
                          .join('')
                      }}
                    </div>
                  </mdui-chip>
                </div>

                <div class="flex flex-row items-center">
                  <mdui-icon-water-drop--outlined
                    class="ml-2 text-lg"
                    v-if="server.conditions.rain"
                  ></mdui-icon-water-drop--outlined>
                  <mdui-icon-wb-sunny--outlined
                    class="ml-2 text-lg"
                    v-if="!server.conditions.rain && !server.conditions.night"
                  ></mdui-icon-wb-sunny--outlined>

                  <mdui-icon-nightlight--outlined
                    class="ml-2 text-lg"
                    v-if="server.conditions.night"
                  ></mdui-icon-nightlight--outlined>
                </div>
              </div>
            </mdui-card>
          </div>
        </div>
      </ScrollWrapper>

      <mdui-fab
        class="absolute bottom-4 left-4"
        @click="searchDialogShow = true"
      >
        <mdui-icon-search--rounded slot="icon"></mdui-icon-search--rounded>
      </mdui-fab>
    </mdui-card>

    <div
      class="absolute bottom-2 left-0 right-0 text-center text-gray-400 text-sm"
    >
      API 服务来自
      <a href="https://acc-status.jonatan.net/servers"
        >acc-status.jonatan.net</a
      >
    </div>
  </div>
</template>

<style scoped></style>
