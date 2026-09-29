<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useStore } from '@/store'
import { translate } from '@/i18n'
import { snackbar } from 'mdui'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import { useConnectorDialog } from '@/composables/useConnectorDialog'
import '@mdui/icons/history--rounded.js'
import '@mdui/icons/delete--rounded.js'
import '@mdui/icons/link--rounded.js'
import '@mdui/icons/link-off--rounded.js'
import '@mdui/icons/folder-open--rounded.js'
import '@mdui/icons/refresh--rounded.js'
import '@mdui/icons/check-circle--rounded.js'
import '@mdui/icons/close--rounded.js'
import '@mdui/icons/star--rounded.js'
import '@mdui/icons/star-outline--rounded.js'
import '@mdui/icons/add--rounded.js'

const open = defineModel<boolean>('open', { default: false })

// “手动添加服务器”弹窗由本组件触发，但渲染在页面层的兄弟节点上（原因见该 composable 的注释）
const { openAddServerDialog } = useConnectorDialog()

const store = useStore()
const status = ref<any>(null)
const busy = ref(false)
const findingPath = ref(false)

let unsubscribe: (() => void) | undefined

// 未检测到有效的 ACC 安装目录（或缺少注入组件）时，禁止注入/取消注入
const canToggleHook = computed(
  () =>
    !busy.value && !!status.value?.accPathValid && !!status.value?.dllAvailable,
)

const refreshStatus = async () => {
  try {
    status.value = await window.accConnector?.getStatus()
  } catch {
    status.value = null
  }
}

// 列表项的“添加时间”展示：五分钟内显示“刚刚添加”，否则显示“添加于 MM/DD HH:mm”
const JUST_ADDED_MS = 5 * 60 * 1000
const NOW_TICK_MS = 30 * 1000

const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | undefined

const stopNowTimer = () => {
  if (nowTimer !== undefined) {
    clearInterval(nowTimer)
    nowTimer = undefined
  }
}

// 弹窗停留期间定时刷新 now，让“刚刚添加”能在超过五分钟时自动变为绝对时间
const startNowTimer = () => {
  stopNowTimer()
  now.value = Date.now()
  nowTimer = setInterval(() => {
    now.value = Date.now()
  }, NOW_TICK_MS)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// 旧记录（持久化时还没有 addedAt 字段）返回空串，界面据此不展示时间
const formatAddedAt = (addedAt?: number) => {
  if (!addedAt) return ''
  if (now.value - addedAt < JUST_ADDED_MS) {
    return translate('servers.addedJustNow')
  }
  const d = new Date(addedAt)
  const time = `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return translate('servers.addedAt', { time })
}

const historyView = computed(() =>
  store.serverHistory.map(item => ({
    ...item,
    addedLabel: formatAddedAt(item.addedAt),
  })),
)

const removeHistory = (item: {
  name: string
  hostname: string
  port: number
}) => {
  store.removeServerHistory(item.hostname, item.port)
  snackbar({
    message: translate('servers.historyRemoved'),
    autoCloseDelay: 3000,
  })
}

const toggleFavorite = (item: { hostname: string; port: number }) => {
  store.toggleServerFavorite(item.hostname, item.port)
}

// 未收藏数量：为 0 时“清除未收藏”按钮无意义，直接禁用
const unfavoritedCount = computed(
  () => store.serverHistory.filter(s => !s.favorite).length,
)

const clearUnfavorited = () => {
  const count = store.clearUnfavoritedServers()
  if (count > 0) {
    snackbar({
      message: translate('servers.clearUnfavoritedDone', { count }),
      autoCloseDelay: 3000,
    })
  }
}

const toggleHook = async () => {
  if (busy.value) return
  // 双重保险：按钮本身已 disabled，这里再拦一次，确保任何情况下都不会在
  // 未检测到 ACC 安装目录时误触发注入/取消注入
  if (!status.value?.accPathValid) {
    snackbar({
      message: translate('servers.accPathRequired'),
      autoCloseDelay: 4000,
    })
    return
  }
  if (!status.value?.dllAvailable) {
    snackbar({
      message: translate('servers.dllMissing'),
      autoCloseDelay: 4000,
    })
    return
  }
  busy.value = true
  try {
    // 已安装且是我们自己的 DLL 才执行取消注入；若检测到第三方 hid.dll 则执行覆盖注入
    if (status.value?.hookInstalled && status.value?.hookMatches) {
      status.value = await window.accConnector?.removeHook()
    } else {
      status.value = await window.accConnector?.installHook()
      if (status.value?.hookInstalled) {
        snackbar({
          message: translate(
            status.value?.accRunning
              ? 'servers.injectSuccessNeedRestart'
              : 'servers.injectSuccess',
          ),
          autoCloseDelay: 4000,
        })
      } else {
        snackbar({
          message: translate('servers.injectFail'),
          autoCloseDelay: 4000,
        })
      }
    }
  } catch {
    snackbar({
      message: translate('servers.injectFail'),
      autoCloseDelay: 4000,
    })
  } finally {
    busy.value = false
  }
}

// silent=true 时不弹失败提示（用于打开弹窗时的自动检测，避免每次都弹一次；
// 失败信息由 ACC 安装目录区域的占位文案承担）
const discoverPath = async (silent = false) => {
  if (findingPath.value) return
  findingPath.value = true
  try {
    await window.accConnector?.discoverAccPath()
    await refreshStatus()
    if (!silent && !status.value?.accPathValid) {
      snackbar({
        message: translate('servers.accPathNotFound'),
        autoCloseDelay: 4000,
      })
    }
  } finally {
    findingPath.value = false
  }
}

const selectPath = async () => {
  if (findingPath.value) return
  findingPath.value = true
  try {
    status.value = await window.accConnector?.selectAccPath()
    if (!status.value?.accPathValid) {
      snackbar({
        message: translate('servers.accPathNotFound'),
        autoCloseDelay: 4000,
      })
    }
  } finally {
    findingPath.value = false
  }
}

watch(open, async newVal => {
  if (!newVal) {
    stopNowTimer()
    return
  }
  startNowTimer()
  await refreshStatus()
  // 未检测到有效 ACC 安装目录时，打开弹窗先自动查找一次
  if (!status.value?.accPathValid) {
    await discoverPath(true)
  }
})

onMounted(() => {
  refreshStatus()
  unsubscribe = window.accConnector?.onStatus(s => {
    status.value = s
  })
})

onUnmounted(() => {
  unsubscribe?.()
  stopNowTimer()
})
</script>

<template>
  <mdui-dialog
    :open="open"
    @close="open = false"
    close-on-esc
    close-on-overlay-click
    :headline="$t('servers.history')"
  >
    <!-- 标题栏：左侧标题，右侧注入/取消注入按钮 + 关闭弹窗 -->
    <div
      slot="header"
      class="flex flex-row items-center justify-between w-full gap-3"
    >
      <div class="title text-lg truncate min-w-0">
        {{ $t('servers.history') }}
      </div>
      <div class="flex flex-row items-center gap-2 shrink-0">
        <mdui-button
          v-if="status?.supported !== false"
          :variant="
            status?.hookInstalled && status?.hookMatches ? 'tonal' : 'filled'
          "
          :disabled="!canToggleHook"
          @click="toggleHook"
        >
          {{
            status?.hookInstalled && status?.hookMatches
              ? $t('servers.cancelInject')
              : $t('servers.inject')
          }}
        </mdui-button>
        <mdui-button-icon @click="open = false">
          <mdui-icon-close--rounded></mdui-icon-close--rounded>
        </mdui-button-icon>
      </div>
    </div>

    <div class="flex flex-col" style="width: 420px">
      <!-- 不支持平台 -->
      <div v-if="status && !status.supported" class="text-sm opacity-70 mb-2">
        {{ $t('servers.connectWindowsOnly') }}
      </div>

      <template v-else>
        <!-- 注入状态（注入/取消注入按钮已移到标题栏） -->
        <div
          class="flex flex-col p-3 rounded-xl mb-2 bg-[rgb(var(--mdui-color-surface-container-low))]"
        >
          <div class="flex flex-row items-center justify-between">
            <div class="flex flex-row items-center">
              <mdui-icon-check-circle--rounded
                v-if="status?.hookActive"
                class="text-[rgb(var(--mdui-color-primary))] mr-2"
              ></mdui-icon-check-circle--rounded>
              <mdui-icon-link--rounded
                v-else-if="status?.hookInstalled"
                class="opacity-70 mr-2"
              ></mdui-icon-link--rounded>
              <mdui-icon-link-off--rounded
                v-else
                class="opacity-70 mr-2"
              ></mdui-icon-link-off--rounded>
              <div class="font-bold text-sm">
                {{
                  status?.hookInstalled && status?.hookMatches
                    ? $t('servers.hookInstalled')
                    : $t('servers.notInjected')
                }}
              </div>
            </div>
            <div class="flex flex-row flex-wrap gap-2">
              <mdui-chip
                class="pointer-events-none"
                :class="{
                  'bg-[rgb(var(--mdui-color-primary-container))]':
                    status?.accRunning,
                }"
                style="
                  --mdui-state-layer-hover: 0;
                  --mdui-state-layer-pressed: 0;
                "
              >
                {{
                  status?.accRunning
                    ? $t('servers.accRunning')
                    : $t('servers.accNotRunning')
                }}
              </mdui-chip>
              <mdui-chip
                v-if="status?.hookConflict"
                class="pointer-events-none bg-[rgb(var(--mdui-color-error-container))]"
                style="
                  --mdui-state-layer-hover: 0;
                  --mdui-state-layer-pressed: 0;
                "
              >
                {{ $t('servers.hookConflict') }}
              </mdui-chip>
              <mdui-chip
                v-if="status && !status.dllAvailable"
                class="pointer-events-none bg-[rgb(var(--mdui-color-error-container))]"
                style="
                  --mdui-state-layer-hover: 0;
                  --mdui-state-layer-pressed: 0;
                "
              >
                {{ $t('servers.dllMissing') }}
              </mdui-chip>
            </div>
          </div>

          <div
            v-if="status && !status.accPathValid"
            class="text-xs opacity-60 mt-2"
          >
            {{ $t('servers.accPathRequired') }}
          </div>
          <!-- ACC 运行时，注入/取消注入与增删直连服务器都要重启 ACC 才生效 -->
          <div v-if="status?.accRunning" class="text-xs opacity-60 mt-2">
            {{ $t('servers.accRunningRestartHint') }}
          </div>
          <div v-if="status?.hookInstalled" class="text-xs opacity-60">
            {{ $t('servers.keepAppRunning') }}
          </div>
        </div>

        <!-- ACC 安装目录 -->
        <div
          class="flex flex-row items-stretch p-3 rounded-xl mb-2 bg-[rgb(var(--mdui-color-surface-container-low))]"
        >
          <div class="flex flex-col justify-center flex-1 min-w-0 mr-3">
            <div class="text-sm font-bold mb-1 truncate">
              {{ $t('servers.accPathLabel') }}
            </div>
            <!-- 路径过长时截断，悬浮可查看完整路径 -->
            <mdui-tooltip
              :content="status?.accPath || $t('servers.accPathEmpty')"
              placement="top"
              @close.stop
            >
              <div class="text-xs opacity-70 truncate">
                {{ status?.accPath || $t('servers.accPathEmpty') }}
              </div>
            </mdui-tooltip>
          </div>
          <!-- 仅图标按钮，文案移到 tooltip；占满区块高度横向排在右侧 -->
          <div class="flex flex-row items-stretch gap-2 shrink-0">
            <mdui-tooltip
              :content="$t('servers.autoFindAccPath')"
              placement="top"
              @close.stop
            >
              <mdui-button-icon
                variant="outlined"
                class="h-full min-h-10"
                :disabled="findingPath"
                @click="discoverPath()"
              >
                <mdui-icon-refresh--rounded></mdui-icon-refresh--rounded>
              </mdui-button-icon>
            </mdui-tooltip>
            <mdui-tooltip
              :content="$t('servers.selectAccPath')"
              placement="top"
              @close.stop
            >
              <mdui-button-icon
                variant="outlined"
                class="h-full min-h-10"
                :disabled="findingPath"
                @click="selectPath"
              >
                <mdui-icon-folder-open--rounded></mdui-icon-folder-open--rounded>
              </mdui-button-icon>
            </mdui-tooltip>
          </div>
        </div>

        <!-- 直连列表 -->
        <div
          class="flex flex-row justify-between items-center text-sm mb-1 mt-2"
        >
          <div class="font-bold">{{ $t('servers.connectHistory') }}</div>
          <div class="flex flex-row items-center">
            <mdui-button
              variant="text"
              class="mr-1"
              :disabled="unfavoritedCount === 0"
              @click="clearUnfavorited"
            >
              {{ $t('servers.clearUnfavorited') }}
            </mdui-button>
            <mdui-button-icon @click="openAddServerDialog">
              <mdui-icon-add--rounded></mdui-icon-add--rounded>
            </mdui-button-icon>
          </div>
        </div>
        <ScrollWrapper height="340px" show-bar="always">
          <div
            v-if="!store.serverHistory.length"
            class="text-sm opacity-60 py-6 text-center"
          >
            {{ $t('servers.historyEmpty') }}
          </div>
          <!-- 列表项本身不可点击，仅收藏/删除两个图标按钮可交互 -->
          <div
            v-for="item in historyView"
            :key="item.hostname + ':' + item.port"
            class="flex flex-row items-center w-full h-12 px-3"
          >
            <mdui-icon-link--rounded
              class="mr-2 text-[rgb(var(--mdui-color-primary))]"
            ></mdui-icon-link--rounded>
            <div class="flex-1 min-w-0">
              <div class="truncate">{{ item.name }}</div>
              <div
                class="text-xs opacity-60 flex flex-row items-center min-w-0"
              >
                <span class="truncate min-w-0"
                  >{{ item.hostname }}:{{ item.port }}</span
                >
                <span v-if="item.addedLabel" class="ml-2 shrink-0">
                  {{ item.addedLabel }}
                </span>
              </div>
            </div>
            <!-- 收藏（实心=已收藏），在删除按钮左侧 -->
            <mdui-button-icon
              class="ml-2"
              :class="
                item.favorite
                  ? 'text-[rgb(var(--mdui-color-primary))]'
                  : 'opacity-60'
              "
              @click.stop="toggleFavorite(item)"
            >
              <mdui-icon-star--rounded
                v-if="item.favorite"
              ></mdui-icon-star--rounded>
              <mdui-icon-star-outline--rounded
                v-else
              ></mdui-icon-star-outline--rounded>
            </mdui-button-icon>
            <mdui-button-icon
              class="ml-2 opacity-60"
              @click.stop="removeHistory(item)"
            >
              <mdui-icon-delete--rounded></mdui-icon-delete--rounded>
            </mdui-button-icon>
          </div>
        </ScrollWrapper>
      </template>
    </div>
  </mdui-dialog>
</template>
