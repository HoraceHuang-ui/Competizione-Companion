<script setup lang="ts">
import '@mdui/icons/search--rounded.js'
import '@mdui/icons/wb-sunny--outlined.js'
import '@mdui/icons/water-drop--outlined.js'
import '@mdui/icons/nightlight--outlined.js'
import '@mdui/icons/keyboard-double-arrow-right--rounded.js'
import '@mdui/icons/help-outline--rounded.js'
import '@mdui/icons/grid-view--rounded.js'
import '@mdui/icons/table-rows--rounded.js'
import { computed, onMounted, ref } from 'vue'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import { seriesColorMap } from '@/utils/enums'
import Pagination from '@/components/Pagination.vue'
import ChipSelect from '@/components/ChipSelect.vue'
import { useStore } from '@/store'
import ServerCard from '@/views/ServerListPage/components/ServerCard.vue'
import MyCarousel from '@/components/MyCarousel.vue'
import ServerListItem from '@/views/ServerListPage/components/ServerListItem.vue'
import { obj2Param } from '@/utils/utils'

const curPage = ref(1)
const servers = ref([])
const total = ref(0)
const loading = ref(false)
const groups = ['Mixed', 'GT3', 'GT4', 'GT2', 'GTC', 'TCX']
const store = useStore()
const helpDialogOpen = ref(false)
const helpPage = ref(1)
const showingHipoleOffline = ref(false)

const defaultFilters = {
  name: '',
  pageSize: 20,
  sa: { min: undefined, max: undefined },
  track: undefined,
  group: undefined,
  private: false,
}
const filters = ref(JSON.parse(JSON.stringify(defaultFilters)))

const reqData = async () => {
  showingHipoleOffline.value = false
  let offline = sessionStorage.serverDown ? undefined : false
  try {
    if (offline === undefined) {
      loading.value = true
      let resp = await fetch(
        'https://acc-status.jonatan.net/api/v2/acc/status',
        {
          method: 'GET',
        },
      )
      resp = await resp.json()
      sessionStorage.serverDown = !resp.status
      offline = resp.status === 0
    }
  } catch {
    loading.value = false
    return
  }
  loading.value = true
  const params = obj2Param({
    search: filters.value.name,
    'safety_rating[min]': filters.value.sa.min,
    'safety_rating[max]': filters.value.sa.max,
    mode: filters.value.private ? 'private' : 'public',
    offline,
    limit: filters.value.pageSize,
    skip: (curPage.value - 1) * filters.value.pageSize,
    series: filters.value.group,
    track: filters.value.track?.value,
  })
  await fetch(`https://acc-status.jonatan.net/api/v2/acc/servers?${params}`, {
    method: 'GET',
  })
    .then(resp => resp.json())
    .then(data => {
      servers.value = data.servers || []
      total.value = data.count || 0
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
const retrieveHipoleServers = () => {
  filters.value.name = 'HiPole.com |'
  filters.value.private = true
  reqData().then(() => {
    if (total.value === 0) {
      total.value = 6
      showingHipoleOffline.value = true
      servers.value = [
        {
          ip_address: '47.96.23.172',
          tcp_port: 9236,
          udp_port: 9235,
          offline: true,
          name: 'HiPole.com | RCC',
          series: 'GT3',
          hot_join: true,
          sessions: [
            {
              type: 'Practice',
              time: 0,
              elapsed_time: 240,
              active: true,
            },
          ],
          drivers: 0,
          max_drivers: 40,
          conditions: {
            night: false,
            rain: false,
            variability: 0,
          },
          requirements: {
            safety_rating: 30,
            track_medals: 2,
          },
          private: true,
          id: '68dbfb2338da84a59c44530f',
          key: '68dbfb2338da84a59c44531f',
        },
        {
          ip_address: '47.96.23.172',
          tcp_port: 9246,
          udp_port: 9245,
          offline: true,
          name: 'HiPole.com | TTC @ Porsche Cup',
          series: 'GTC',
          hot_join: true,
          sessions: [
            {
              type: 'Practice',
              time: 0,
              elapsed_time: 240,
              active: true,
            },
          ],
          drivers: 0,
          max_drivers: 60,
          conditions: {
            night: false,
            rain: false,
            variability: 0,
          },
          requirements: {
            safety_rating: 40,
            track_medals: 2,
          },
          private: true,
          id: '68dbfb2338da84a59c445312',
          key: '68dbfb2338da84a59c445320',
        },
        {
          ip_address: '47.96.23.172',
          tcp_port: 9240,
          udp_port: 9239,
          offline: true,
          name: 'HiPole.com | MCC @ GT3',
          series: 'GT3',
          hot_join: true,
          sessions: [
            {
              type: 'Practice',
              time: 0,
              elapsed_time: 240,
              active: true,
            },
          ],
          drivers: 0,
          max_drivers: 80,
          conditions: {
            night: false,
            rain: false,
            variability: 0,
          },
          requirements: {
            safety_rating: 40,
            track_medals: 2,
          },
          private: true,
          id: '68dbfb2338da84a59c445318',
          key: '68dbfb2338da84a59c445322',
        },
        {
          ip_address: '47.96.23.172',
          tcp_port: 9242,
          udp_port: 9241,
          offline: true,
          name: 'HiPole.com | MCC @ GT4',
          series: 'GT4',
          hot_join: true,
          sessions: [
            {
              type: 'Practice',
              time: 0,
              elapsed_time: 240,
              active: true,
            },
          ],
          drivers: 0,
          max_drivers: 80,
          conditions: {
            night: false,
            rain: false,
            variability: 0,
          },
          requirements: {
            safety_rating: 40,
            track_medals: 2,
          },
          private: true,
          id: '68dbfb2338da84a59c44531b',
          key: '68dbfb2338da84a59c445323',
        },
        {
          ip_address: '47.96.23.172',
          tcp_port: 9238,
          udp_port: 9237,
          offline: true,
          name: 'HiPole.com | RWC',
          series: 'GT3',
          hot_join: true,
          sessions: [
            {
              type: 'Practice',
              time: 0,
              elapsed_time: 240,
              active: true,
            },
          ],
          drivers: 0,
          max_drivers: 50,
          conditions: {
            night: false,
            rain: false,
            variability: 0,
          },
          requirements: {
            safety_rating: 50,
            track_medals: 3,
          },
          private: true,
          id: '68dbfb2338da84a59c445315',
          key: '68dbfb2338da84a59c445321',
        },
        {
          ip_address: '47.96.23.172',
          tcp_port: 9366,
          udp_port: 9365,
          offline: true,
          name: 'HiPole.com | Thrustmaster HEC 2025',
          series: 'GT3',
          hot_join: true,
          sessions: [
            {
              type: 'Practice',
              time: 0,
              elapsed_time: 240,
              active: true,
            },
          ],
          drivers: 0,
          max_drivers: 50,
          conditions: {
            night: false,
            rain: false,
            variability: 0,
          },
          requirements: {
            safety_rating: 50,
            track_medals: 3,
          },
          private: true,
          id: '68e1f27338da84a59cc40c1c',
          key: '68e1f27338da84a59cc40c24',
        },
      ]
    }
  })
}
</script>

<template>
  <div
    class="h-full pb-5 flex flex-col justify-center items-center relative w-full"
  >
    <mdui-card
      variant="outlined"
      class="size-full border border-[rgb(var(--mdui-color-inverse-primary-dark))] bg-[rgb(var(--mdui-color-surface-container-lowest))] mx-4 mb-4 flex flex-row justify-center relative"
      :style="{
        background: `rgba(var(--mdui-color-surface-container-lowest), ${(0.65 * (store.settings.general.bgOpacity || 0.85)) / 0.85})`,
      }"
    >
      <Transition name="fade" mode="out-in">
        <div
          v-if="loading || total == 0"
          class="size-full flex flex-row justify-center items-center absolute"
        >
          <Transition name="fade" mode="out-in">
            <mdui-circular-progress v-if="loading"></mdui-circular-progress>
            <div v-else-if="total == 0">
              {{ $t('servers.noData') }}
            </div>
          </Transition>
        </div>
      </Transition>

      <div class="mt-3 opacity-60" v-if="showingHipoleOffline">
        {{ $t('servers.hipoleServerDownMsg') }}
      </div>
      <ScrollWrapper
        width="98%"
        v-if="!loading && total != 0"
        class="absolute"
        :class="{ 'mt-10 pb-8': showingHipoleOffline }"
      >
        <Transition name="fade" mode="out-in">
          <!-- 列表视图 -->
          <TransitionGroup
            v-if="store.servers.listView"
            name="fade-up"
            appear
            tag="div"
            class="flex flex-col py-3 px-[9%]"
          >
            <div
              v-for="(server, index) in servers"
              :key="server.id"
              class="w-full px-2 py-0.5"
              :style="{ transitionDelay: index * 30 + 'ms' }"
            >
              <ServerListItem :server="server" />
            </div>
          </TransitionGroup>

          <!-- 卡片视图 -->
          <TransitionGroup
            v-else
            name="fade-up"
            appear
            tag="div"
            class="flex flex-row justify-center py-2 px-[9%] flex-wrap"
          >
            <div
              v-for="(server, index) in servers"
              :key="server.id"
              class="w-1/2 px-2 py-1"
              :style="{ transitionDelay: index * 30 + 'ms' }"
            >
              <ServerCard :server="server" />
            </div>
          </TransitionGroup>
        </Transition>
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
        <mdui-tooltip
          :content="$t('servers.hipoleServersList')"
          class="mb-4"
          placement="right"
        >
          <mdui-fab
            variant="surface"
            class="mb-4 hipole-fab"
            @click="retrieveHipoleServers"
          >
            <img
              src="@/assets/hipole/logo.png"
              slot="icon"
              class="w-[30px] inline translate-x-1/4"
            />
          </mdui-fab>
        </mdui-tooltip>

        <mdui-tooltip
          :content="
            store.servers.listView
              ? $t('servers.listView')
              : $t('servers.cardView')
          "
          placement="right"
        >
          <mdui-fab
            variant="surface"
            class="mb-4"
            @click="store.servers.listView = !store.servers.listView"
          >
            <Transition name="fade" mode="out-in">
              <mdui-icon-table-rows--rounded
                v-if="store.servers.listView"
                slot="icon"
              ></mdui-icon-table-rows--rounded>
              <mdui-icon-grid-view--rounded
                v-else
                slot="icon"
              ></mdui-icon-grid-view--rounded
            ></Transition>
          </mdui-fab>
        </mdui-tooltip>

        <mdui-tooltip :content="$t('servers.helpTitle')" placement="right">
          <mdui-fab
            variant="surface"
            class="mb-4"
            @click="helpDialogOpen = true"
          >
            <mdui-icon-help-outline--rounded
              slot="icon"
            ></mdui-icon-help-outline--rounded>
          </mdui-fab>
        </mdui-tooltip>

        <mdui-tooltip placement="right-end" class="filter">
          <div class="relative">
            <mdui-fab>
              <mdui-badge>{{ filtersCount }}</mdui-badge>
              <mdui-icon-search--rounded
                slot="icon"
              ></mdui-icon-search--rounded>
            </mdui-fab>
            <Transition name="fade" mode="out-in">
              <mdui-badge
                v-if="filtersCount > 0"
                class="absolute right-0 top-0 text-base font-bold w-7 h-7 translate-x-2 -translate-y-2"
                >{{ filtersCount }}</mdui-badge
              ></Transition
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
                <mdui-button @click="reqData" class="font-bold">{{
                  $t('general.confirm')
                }}</mdui-button>
              </div>
            </div>

            <div class="flex flex-col" style="width: 400px">
              <div class="form-item">
                <div>{{ $t('servers.serverName') }}</div>
                <div>
                  <mdui-text-field
                    class="cursor-text h-[40px]"
                    variant="outlined"
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
                    class="mr-2 cursor-text h-[40px]"
                    variant="outlined"
                    :placeholder="$t('servers.saMin')"
                    :value="filters.sa.min"
                    @input="filters.sa.min = parseInt($event.target.value) || 0"
                  ></mdui-text-field>
                  <div class="mr-2">-</div>
                  <mdui-text-field
                    class="cursor-text h-[40px]"
                    variant="outlined"
                    :placeholder="$t('servers.saMax')"
                    :value="filters.sa.max"
                    @input="filters.sa.max = parseInt($event.target.value) || 0"
                  ></mdui-text-field>
                </div>
              </div>

              <div class="form-item">
                <div>{{ $t('servers.track') }}</div>
                <div class="flex flex-row justify-end items-center">
                  <TrackSelector v-model="filters.track" chip-class="mt-2" />
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
        <MyCarousel
          style="width: 500px; height: 500px"
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
            <ScrollWrapper class="flex flex-col items-center" show-bar="always">
              <img src="@/assets/helpImages/2_accPath.png" class="rounded-xl" />
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
            <ScrollWrapper class="flex flex-col items-center" show-bar="always">
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
            <ScrollWrapper class="flex flex-col items-center" show-bar="always">
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
            <ScrollWrapper class="flex flex-col items-center" show-bar="always">
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
      <a href="https://acc-status.jonatan.net/servers">
        acc-status.jonatan.net
      </a>
    </div>
  </div>
</template>

<style scoped>
.hipole-fab::part(button) {
  padding: 0;
  text-align: center;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-leave-active {
  transition: all 250ms var(--mdui-motion-easing-standard);
}

.fade-up-enter-active,
.fade-up-appear-active {
  transition:
    transform 0.3s var(--mdui-motion-easing-standard),
    opacity 0.3s var(--mdui-motion-easing-standard);
}
.fade-up-leave-active {
  transition:
    transform 0.2s var(--mdui-motion-easing-standard),
    opacity 0.2s var(--mdui-motion-easing-standard);
  position: absolute; /* 防止离场时塌陷 */
}

.fade-up-enter-from,
.fade-up-appear-from {
  opacity: 0;
  transform: translateY(16px) scale(0.98);
}
.fade-up-enter-to,
.fade-up-appear-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.fade-up-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(16px) scale(0.98);
}

::part(container) {
  border-radius: 999px;
  background: rgb(var(--mdui-color-background));
}

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
