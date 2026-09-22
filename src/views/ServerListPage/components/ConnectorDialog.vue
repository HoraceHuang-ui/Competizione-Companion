<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useStore } from '@/store'
import { translate } from '@/i18n'
import { snackbar } from 'mdui'
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import '@mdui/icons/history--rounded.js'
import '@mdui/icons/delete--rounded.js'
import '@mdui/icons/link--rounded.js'
import '@mdui/icons/link-off--rounded.js'
import '@mdui/icons/folder-open--rounded.js'
import '@mdui/icons/refresh--rounded.js'
import '@mdui/icons/check-circle--rounded.js'

const open = defineModel<boolean>('open', { default: false })

const store = useStore()
const status = ref<any>(null)
const busy = ref(false)
const findingPath = ref(false)

let unsubscribe: (() => void) | undefined

const refreshStatus = async () => {
  try {
    status.value = await window.accConnector?.getStatus()
  } catch {
    status.value = null
  }
}

const quickInject = (item: { name: string; hostname: string; port: number }) => {
  store.addServerHistory(item)
  snackbar({
    message: translate('servers.quickInject', { name: item.name }),
    autoCloseDelay: 3000,
  })
}

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

const toggleHook = async () => {
  if (busy.value) return
  busy.value = true
  try {
    // 已安装且是我们自己的 DLL 才执行取消注入；若检测到第三方 hid.dll 则执行覆盖注入
    if (status.value?.hookInstalled && status.value?.hookMatches) {
      status.value = await window.accConnector?.removeHook()
      snackbar({
        message: translate('servers.removeSuccess'),
        autoCloseDelay: 3000,
      })
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

const discoverPath = async () => {
  if (findingPath.value) return
  findingPath.value = true
  try {
    await window.accConnector?.discoverAccPath()
    await refreshStatus()
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

watch(open, newVal => {
  if (newVal) {
    refreshStatus()
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
    <div class="flex flex-col" style="width: 420px">
      <!-- 不支持平台 -->
      <div
        v-if="status && !status.supported"
        class="text-sm opacity-70 mb-2"
      >
        {{ $t('servers.connectWindowsOnly') }}
      </div>

      <template v-else>
        <!-- 注入状态与操作 -->
        <div class="flex flex-col p-3 rounded-xl mb-2 bg-[rgb(var(--mdui-color-surface-container-low))]">
          <div class="flex flex-row justify-between items-center">
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
              <div class="font-bold">
                {{
                  status?.hookActive
                    ? $t('servers.hookActive')
                    : status?.hookInstalled && status?.hookMatches
                      ? $t('servers.hookInstalled')
                      : $t('servers.notInjected')
                }}
              </div>
            </div>
            <mdui-button
              :variant="
                status?.hookInstalled && status?.hookMatches
                  ? 'tonal'
                  : 'filled'
              "
              :disabled="busy || !status?.accPathValid || !status?.dllAvailable"
              @click="toggleHook"
            >
              {{
                status?.hookInstalled && status?.hookMatches
                  ? $t('servers.cancelInject')
                  : $t('servers.inject')
              }}
            </mdui-button>
          </div>

          <div class="flex flex-row flex-wrap gap-2 mt-2">
            <mdui-chip
              class="pointer-events-none"
              :class="{
                'bg-[rgb(var(--mdui-color-primary-container))]': status?.accRunning,
              }"
              style="--mdui-state-layer-hover: 0; --mdui-state-layer-pressed: 0"
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
              style="--mdui-state-layer-hover: 0; --mdui-state-layer-pressed: 0"
            >
              {{ $t('servers.hookConflict') }}
            </mdui-chip>
            <mdui-chip
              v-if="status && !status.dllAvailable"
              class="pointer-events-none bg-[rgb(var(--mdui-color-error-container))]"
              style="--mdui-state-layer-hover: 0; --mdui-state-layer-pressed: 0"
            >
              {{ $t('servers.dllMissing') }}
            </mdui-chip>
          </div>
          <div
            v-if="status?.hookInstalled && !status?.hookActive && status?.accRunning"
            class="text-sm opacity-70 mt-2"
          >
            {{ $t('servers.injectNeedRestart') }}
          </div>
        </div>

        <!-- ACC 安装目录 -->
        <div class="flex flex-col p-3 rounded-xl mb-2 bg-[rgb(var(--mdui-color-surface-container-low))]">
          <div class="text-sm font-bold mb-1">
            {{ $t('servers.accPathLabel') }}
          </div>
          <div class="text-xs opacity-70 break-all mb-2">
            {{ status?.accPath || $t('servers.accPathEmpty') }}
          </div>
          <div class="flex flex-row gap-2">
            <mdui-button
              variant="outlined"
              :disabled="findingPath"
              @click="discoverPath"
            >
              <mdui-icon-refresh--rounded slot="icon"></mdui-icon-refresh--rounded>
              {{ $t('servers.autoFindAccPath') }}
            </mdui-button>
            <mdui-button
              variant="outlined"
              :disabled="findingPath"
              @click="selectPath"
            >
              <mdui-icon-folder-open--rounded slot="icon"></mdui-icon-folder-open--rounded>
              {{ $t('servers.selectAccPath') }}
            </mdui-button>
          </div>
        </div>

        <!-- 连接历史 -->
        <div class="text-sm font-bold mb-1">{{ $t('servers.connectHistory') }}</div>
        <ScrollWrapper height="200px">
          <div
            v-if="!store.serverHistory.length"
            class="text-sm opacity-60 py-6 text-center"
          >
            {{ $t('servers.historyEmpty') }}
          </div>
          <mdui-menu-item
            v-for="item in store.serverHistory"
            :key="item.hostname + ':' + item.port"
            @click="quickInject(item)"
          >
            <div class="flex flex-row items-center w-full">
              <mdui-icon-link--rounded
                class="mr-2 text-[rgb(var(--mdui-color-primary))]"
              ></mdui-icon-link--rounded>
              <div class="flex-1 min-w-0">
                <div class="truncate">{{ item.name }}</div>
                <div class="text-xs opacity-60">{{ item.hostname }}:{{ item.port }}</div>
              </div>
              <mdui-button-icon
                class="ml-2 opacity-60"
                @click.stop="removeHistory(item)"
              >
                <mdui-icon-delete--rounded></mdui-icon-delete--rounded>
              </mdui-button-icon>
            </div>
          </mdui-menu-item>
        </ScrollWrapper>

        <div
          v-if="status?.hookInstalled"
          class="text-xs opacity-60 mt-2"
        >
          {{ $t('servers.keepAppRunning') }}
        </div>
      </template>
    </div>
  </mdui-dialog>
</template>
