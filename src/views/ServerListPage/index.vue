<script setup lang="ts">
import '@mdui/icons/search--rounded.js'
import '@mdui/icons/wb-sunny--outlined.js'
import '@mdui/icons/water-drop--outlined.js'
import '@mdui/icons/nightlight--outlined.js'
import '@mdui/icons/keyboard-double-arrow-right--rounded.js'
import '@mdui/icons/help-outline--rounded.js'
import '@mdui/icons/location-on--rounded.js'
import { computed, onMounted, ref } from 'vue'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import { seriesColorMap } from '@/utils/enums'
import Pagination from '@/components/Pagination.vue'
import ChipSelect from '@/components/ChipSelect.vue'
import tracks from '@/utils/trackData'
import { useStore } from '@/store'
import ServerCard from '@/views/ServerListPage/components/ServerCard.vue'
import MyCarousel from '@/components/MyCarousel.vue'

const curPage = ref(1)
const servers = ref([])
const total = ref(0)
const loading = ref(false)
const groups = ['Mixed', 'GT3', 'GT4', 'GT2', 'GTC', 'TCX']
const store = useStore()
const helpDialogOpen = ref(false)
const helpPage = ref(1)

const defaultFilters = {
  name: '',
  pageSize: 20,
  sa: { min: undefined, max: undefined },
  track: undefined,
  group: undefined,
  private: false,
}
const filters = ref(JSON.parse(JSON.stringify(defaultFilters)))

const obj2Param = (obj: Record<string, any>) => {
  return Object.entries(obj)
    .map(([key, value]) => {
      if (value === undefined || value === null) return ''
      if (typeof value === 'object') {
        return `${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`
      }
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    })
    .filter(Boolean)
    .join('&')
}

const reqData = () => {
  const params = obj2Param({
    search: filters.value.name,
    'safety_rating[min]': filters.value.sa.min,
    'safety_rating[max]': filters.value.sa.max,
    mode: filters.value.private ? 'private' : 'public',
    limit: filters.value.pageSize,
    skip: (curPage.value - 1) * filters.value.pageSize,
    series: filters.value.group,
    track: filters.value.track?.value,
  })
  loading.value = true
  fetch(`https://acc-status.jonatan.net/api/v2/acc/servers?${params}`, {
    method: 'GET',
  })
    .then(resp => resp.json())
    .then(data => {
      servers.value = data.servers
      total.value = data.count
    })
    .finally(() => {
      loading.value = false
    })
}

const filtersCount = computed(() => {
  let res = 0
  if (filters.value.name?.length) res++
  if (filters.value.sa.min || 0 > 0 || filters.value.sa.max || 100 < 100) res++
  if (filters.value.track) res++
  if (filters.value.group) res++
  if (filters.value.private) res++
  return res
})

onMounted(() => {
  reqData()
})

const openExtUrl = (url: string) => {
  window.electron.openExtLink(url)
}
</script>

<template>
  <div
    class="h-full pb-5 flex flex-col justify-center items-center relative w-full"
  >
    <mdui-card
      variant="outlined"
      class="size-full border border-[rgb(var(--mdui-color-inverse-primary-dark))] bg-[rgb(var(--mdui-color-surface-container-lowest))] mx-4 mb-4 flex flex-row justify-center relative"
      style="background: rgba(var(--mdui-color-surface-container-lowest), 0.65)"
    >
      <div
        v-if="loading || total == 0"
        class="size-full flex flex-row justify-center items-center"
      >
        <mdui-circular-progress v-if="loading"></mdui-circular-progress>
        <div v-else-if="total == 0">{{ $t('servers.noData') }}</div>
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
            <ServerCard :server="server" />
          </div>
        </div>
      </ScrollWrapper>

      <div class="absolute top-4 left-4">
        <div class="text-sm opacity-70">{{ $t('servers.total') }}</div>
        <div class="title text-lg font-bold opacity-85">{{ total }}</div>
      </div>

      <Pagination
        class="absolute right-8 top-1/2 -translate-y-1/2"
        :total="total"
        v-model="curPage"
        @change="reqData"
      ></Pagination>

      <div class="absolute bottom-2 left-4 flex flex-col">
        <mdui-fab variant="surface" class="mb-4" @click="helpDialogOpen = true">
          <mdui-icon-help-outline--rounded
            slot="icon"
          ></mdui-icon-help-outline--rounded>
        </mdui-fab>

        <mdui-tooltip placement="right-end" class="filter">
          <div class="relative">
            <mdui-fab>
              <mdui-badge>{{ filtersCount }}</mdui-badge>
              <mdui-icon-search--rounded
                slot="icon"
              ></mdui-icon-search--rounded>
            </mdui-fab>
            <mdui-badge
              v-if="filtersCount > 0"
              class="absolute right-0 top-0 text-base font-bold w-7 h-7 translate-x-2 -translate-y-2"
              >{{ filtersCount }}</mdui-badge
            >
          </div>
          <div
            slot="content"
            class="bg-[rgb(var(--mdui-color-on-secondary))] text-[rgb(var(--mdui-color-on-surface))] text-base border shadow-lg p-4 rounded-2xl"
          >
            <div class="w-full flex flex-row justify-between items-center mb-2">
              <div class="text-2xl title">{{ $t('servers.filter') }}</div>
              <div class="flex flex-row">
                <mdui-button
                  variant="text"
                  @click="filters = JSON.parse(JSON.stringify(defaultFilters))"
                  >{{ $t('servers.resetFilter') }}</mdui-button
                >
                <mdui-button @click="reqData">{{
                  $t('general.confirm')
                }}</mdui-button>
              </div>
            </div>

            <div class="flex flex-col" style="width: 400px">
              <div class="form-item">
                <div>{{ $t('servers.serverName') }}</div>
                <div>
                  <mdui-text-field
                    class="cursor-text"
                    :placeholder="$t('servers.serverNamePlaceholder')"
                    :value="filters.name"
                    @input="filters.name = $event.target.value"
                  ></mdui-text-field>
                </div>
              </div>
              <div class="form-item">
                <div>SA</div>
                <div class="flex flex-row items-center">
                  <mdui-text-field
                    class="mr-2 cursor-text"
                    :placeholder="$t('servers.saMin')"
                    :value="filters.sa.min"
                    @input="filters.sa.min = parseInt($event.target.value) || 0"
                  ></mdui-text-field>
                  <div class="mr-2">-</div>
                  <mdui-text-field
                    class="cursor-text"
                    :placeholder="$t('servers.saMax')"
                    :value="filters.sa.max"
                    @input="filters.sa.max = parseInt($event.target.value) || 0"
                  ></mdui-text-field>
                </div>
              </div>

              <div class="form-item">
                <div>{{ $t('servers.track') }}</div>
                <div class="flex flex-row justify-end items-center">
                  <ChipSelect
                    v-model="filters.track"
                    :placeholder="$t('servers.trackPlaceholder')"
                    dropdown-placement="top"
                    :items="tracks"
                    chip-class="mt-2"
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
                            item?.[
                              [2, 1][store.settings.setup.trackDisplay - 1]
                            ]
                        }
                        filters.track = {
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
              </div>

              <div class="form-item">
                <div>{{ $t('servers.series') }}</div>
                <ChipSelect
                  v-model="filters.group"
                  :chip-class="`mt-2 bg-[${seriesColorMap[filters.group]}]`"
                  dropdown-placement="top"
                  :items="groups"
                  :placeholder="$t('servers.seriesPlaceholder')"
                >
                </ChipSelect>
              </div>

              <div class="form-item">
                <div>{{ $t('servers.private') }}</div>
                <div class="flex flex-row justify-end">
                  <mdui-switch
                    :checked="filters.private"
                    @change="filters.private = $event.target.checked"
                  ></mdui-switch>
                </div>
              </div>
            </div>
          </div>
        </mdui-tooltip>
      </div>

      <mdui-dialog
        class="help-dialog"
        :open="helpDialogOpen"
        @close="
          () => {
            helpDialogOpen = false
            helpPage = 1
          }
        "
        close-on-esc
        close-on-overlay-click
        :headline="$t('servers.helpTitle')"
      >
        <div style="width: 500px; height: 500px">
          <MyCarousel
            class="size-full"
            show-arrow="never"
            show-indicator="never"
            v-model="helpPage"
            :autoplay="false"
          >
            <div class="help-item">
              {{ $t('servers.help.1_1') }}
              <mdui-button
                class="mt-4 font-bold"
                @click="
                  openExtUrl(
                    'https://github.com/lonemeow/acc-connector/releases/download/v0.9.13/ACC-Connector-Setup-0.9.13.exe',
                  )
                "
                >{{ $t('servers.help.1_2') }}</mdui-button
              >
            </div>
            <div class="help-item">
              <ScrollWrapper
                class="flex flex-col items-center"
                show-bar="always"
              >
                <img
                  src="@/assets/helpImages/2_accPath.png"
                  class="rounded-xl"
                />
                <ul class="list-disc list-outside pl-4 mt-2">
                  <li>{{ $t('servers.help.2_1') }}</li>
                  <li>{{ $t('servers.help.2_2') }}</li>
                  <li>
                    {{ $t('servers.help.2_3') }}
                  </li>
                  <li>{{ $t('servers.help.2_4') }}</li>
                  <li>{{ $t('servers.help.2_5') }}</li>
                </ul>
              </ScrollWrapper>
            </div>

            <div class="help-item">
              <ScrollWrapper
                class="flex flex-col items-center"
                show-bar="always"
              >
                <img
                  src="@/assets/helpImages/3_installHook.png"
                  class="rounded-xl"
                />
                <ul class="list-disc list-outside pl-4 mt-2">
                  <li>
                    {{ $t('servers.help.3_1') }}
                  </li>
                  <li>{{ $t('servers.help.3_2') }}</li>
                  <li>
                    {{ $t('servers.help.3_3') }}
                  </li>
                </ul>
              </ScrollWrapper>
            </div>

            <div class="help-item">
              <ScrollWrapper
                class="flex flex-col items-center"
                show-bar="always"
              >
                <img
                  src="@/assets/helpImages/4_LANServer.png"
                  class="rounded-xl"
                />
                <ul class="list-disc list-outside pl-4 mt-2">
                  <li>{{ $t('servers.help.4_1') }}</li>
                  <li>
                    {{ $t('servers.help.4_2') }}
                  </li>
                  <li>
                    {{ $t('servers.help.4_3') }}
                  </li>
                  <li>{{ $t('servers.help.4_4') }}</li>
                </ul>
              </ScrollWrapper>
            </div>

            <div class="help-item">
              <ScrollWrapper
                class="flex flex-col items-center"
                show-bar="always"
              >
                <img
                  src="@/assets/helpImages/5_removeHook.png"
                  class="rounded-xl"
                />
                <ul class="list-disc list-outside pl-4 mt-2">
                  <li>{{ $t('servers.help.5_1') }}</li>
                  <li>{{ $t('servers.help.5_2') }}</li>
                  <li>{{ $t('servers.help.5_3') }}</li>
                </ul>
              </ScrollWrapper>
            </div>
          </MyCarousel>
        </div>
        <Pagination
          type="horizontal"
          v-model="helpPage"
          :total="5"
          :page-size="1"
        ></Pagination>
      </mdui-dialog>
    </mdui-card>

    <div
      class="absolute bottom-2 left-0 right-0 text-center text-gray-400 text-sm"
    >
      {{ $t('status.apiFrom') }}
      <a href="https://acc-status.jonatan.net/servers"
        >acc-status.jonatan.net</a
      >
    </div>
  </div>
</template>

<style scoped>
::part(header) {
  font-family:
    Google Sans,
    Harmony OS Sans SC,
    sans-serif;
}

.filter::part(popup) {
  background: none;
}

.form-item {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin: 0.25rem 0;
  width: 100%;

  & > :first-child {
    margin-right: 0.25rem;
    width: 16%;
  }
  & > :last-child {
    flex: 1;
  }
}

.help-item {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>
