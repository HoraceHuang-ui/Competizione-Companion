<script setup lang="ts">
import '@mdui/icons/cell-tower--rounded.js'
import '@mdui/icons/view-list--rounded.js'
import '@mdui/icons/display-settings--rounded.js'
import '@mdui/icons/settings--rounded.js'
import '@mdui/icons/send--rounded.js'
import '@mdui/icons/balance--rounded.js'
import '@mdui/icons/close--rounded.js'
import '@mdui/icons/announcement.js'
import '@mdui/icons/assistant--rounded.js'
import '@mdui/icons/format-paint--rounded.js'

import { onMounted, provide, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from '@/store'
import { setColorScheme, setTheme } from 'mdui'
import {
  asseconHimeThemeColor,
  darkModeSettings,
  themeMap,
} from '@/utils/enums'
import { translate } from '@/i18n'
import { marked } from 'marked'
import { checkUpdate, verCompare } from '@/utils/utils'
import UpdateDialog from '@/components/UpdateDialog.vue'
import FirstSetup from './components/FirstSetup.vue'
import AIDrawer from './components/AIDrawer.vue'
import HipoleLogoSvg from '@/assets/hipole/logo_svg.vue'

const router = useRouter()
const store = useStore()
setTheme(themeMap[store.settings.general.darkMode])

const platform = ref('')

const winMax = () => {
  window.win.max()
}

const winMin = () => {
  window.win.min()
}

const winClose = () => {
  if (store.settings.general.minToTray) {
    window.win.tray()
  } else {
    window.win.close()
  }
}

const mode = ref(0) // 0: Server Status
const modes = [
  'general.status',
  'general.servers',
  'general.setup',
  'general.bop',
  'general.report',
  'general.livery',
  'general.launchACC',
  'general.settings',
]
const pages = [
  'status',
  'list',
  'setup',
  'bop',
  'report',
  '',
  'livery',
  'settings',
]
const nav = (index: number) => {
  mode.value = index
  router.push({ name: pages[index] })
}

const aiDrawerOpen = ref(false)

const launching = ref(false)
const launchACC = () => {
  launching.value = true
  window.steam.launch('805550')
  setTimeout(() => {
    launching.value = false
  }, 3000)
}

const updDialogShow = ref(false)
const updInfo = ref<any>({})

const bgBase64 = ref('')
watch(
  () => store.settings.general.bgImg,
  newVal => {
    if (newVal !== '') {
      bgBase64.value = newVal
    }

    store.settings.general.bgImg = ''
  },
)

const showBulletin = ref(false)
const bulletin = ref(undefined)
const queryBulletin = async () => {
  showBulletin.value = false
  // const res = await window.axios.get('http://0.0.0.0:5005/bulletin')
  const res = await window.axios.get(
    'https://api.hh17.top/competizione/bulletin',
  )
  if (res.success && res.msgInfo.id > store.general.msgId) {
    bulletin.value = res.msgInfo
    showBulletin.value = true
    store.general.msgId = res.msgInfo.id
  }
}

const firstSetupShow = ref(false)

const startup = () => {
  queryBulletin()
  checkUpdate(
    store.general.targetVersion || import.meta.env.VITE_APP_VERSION,
  ).then(resp => {
    updInfo.value = resp
    if (resp) {
      updDialogShow.value = true
    }
  })
}

watch(
  () => store.general.firstSetupFlag,
  val => {
    if (val) {
      startup()
    }
  },
)

onMounted(() => {
  window.os.platform().then(plt => {
    platform.value = plt
  })

  for (let i = 0; i < pages.length; i++) {
    if (
      pages[i] &&
      window.location.hash.includes(pages[i] ?? 'nothing exists')
    ) {
      mode.value = i
    }
  }

  if (!store.general.firstSetupFlag) {
    firstSetupShow.value = true
  } else {
    startup()
  }

  if (
    verCompare(
      import.meta.env.VITE_APP_VERSION,
      store.general.targetVersion || '0.0.0',
    ) > 0
  ) {
    store.general.targetVersion = import.meta.env.VITE_APP_VERSION
  }

  if (store.settings.general.bgImg !== '') {
    window.img
      .base64ToImg(store.settings.general.bgImg)
      .then(async path => {
        store.settings.general.bgImgPath = path
        bgBase64.value = await window.img.getBgBase64()
        store.settings.general.bgType = 'custom'
      })
      .catch(() => {
        store.settings.general.bgImgPath = ''
      })
    store.settings.general.bgImg = ''
  } else {
    window.img.getBgBase64().then(base64 => {
      bgBase64.value = base64
    })
  }

  if (!store.settings.general.bgType) {
    store.settings.general.bgType = 'hime'
  }
})

const onHyperLinkClick = (e: Event) => {
  var anchor = (e.target as HTMLElement).closest('a')
  if (anchor) {
    var targetHref = anchor.getAttribute('href')

    if (targetHref) {
      e.preventDefault()
      var newUrl = anchor.href
      window.electron.openExtLink(newUrl)
    }
  }
}

const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)')
const isDark = ref(
  store.settings.general.darkMode === darkModeSettings.AUTO
    ? darkModePreference.matches
    : store.settings.general.darkMode !== darkModeSettings.LIGHT,
)
darkModePreference.addEventListener('change', e => {
  isDark.value =
    store.settings.general.darkMode === darkModeSettings.AUTO
      ? e.matches
      : store.settings.general.darkMode !== darkModeSettings.LIGHT
})
provide('isDark', {
  isDark,
  setDark(val: boolean) {
    isDark.value = val
  },
})
watch(
  isDark,
  newVal => {
    if (store.settings.general.bgType === 'hime') {
      const newScheme = newVal
        ? asseconHimeThemeColor.dark
        : asseconHimeThemeColor.light
      store.settings.general.themeColor = newScheme
      setColorScheme(newScheme)
    }
  },
  {
    immediate: true,
  },
)
</script>
<template>
  <Transition name="fade">
    <img
      class="w-screen h-screen absolute object-cover"
      v-if="
        store.settings.general.bgImgPath &&
        store.settings.general.bgType === 'custom'
      "
      :src="bgBase64"
    />
    <img
      class="w-screen h-screen absolute object-cover"
      v-else-if="store.settings.general.bgType === 'hime'"
      :src="`../../src/assets/asseconHime/ASSECON_HIME_${isDark ? 'dark' : 'light'}.jpg`"
    />
  </Transition>

  <mdui-layout class="size-full overflow-hidden" @click="onHyperLinkClick">
    <mdui-top-app-bar
      variant="center-aligned"
      scroll-target="#mainRouterView"
      class="py-1 pl-3 pr-4 h-14 drag bg-transparent"
    >
      <mdui-button-icon class="p-2 mr-5" v-if="platform !== 'darwin'">
        <img src="../build/icon.ico" />
      </mdui-button-icon>
      <mdui-top-app-bar-title class="text-xl mt-2">
        <div class="w-full flex flex-row items-center justify-center">
          <mdui-button-icon class="p-2 mr-2" v-if="platform === 'darwin'">
            <img src="../build/icon.ico" />
          </mdui-button-icon>
          <div class="title text-right">
            {{ translate('general.appName') }}
          </div>
          <div
            class="mx-4 opacity-60"
            style="font-family: 'Harmony OS Sans SC'; font-weight: 200"
          >
            |
          </div>
          <div style="color: rgb(var(--mdui-color-primary))">
            {{ $t(modes[mode]) }}
          </div>
        </div>
      </mdui-top-app-bar-title>
    </mdui-top-app-bar>

    <mdui-navigation-rail
      value="status"
      divider
      class="pb-4 bg-transparent w-16"
      contained
    >
      <mdui-tooltip :content="translate('general.status')" placement="right">
        <mdui-button-icon
          class="mb-2"
          :class="{
            'bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))]':
              mode == 0,
          }"
          @click="nav(0)"
        >
          <mdui-icon-cell-tower--rounded></mdui-icon-cell-tower--rounded>
        </mdui-button-icon>
      </mdui-tooltip>

      <mdui-tooltip :content="translate('general.servers')" placement="right">
        <mdui-button-icon
          class="mb-2"
          :class="{
            'bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))]':
              mode == 1,
          }"
          @click="nav(1)"
        >
          <mdui-icon-view-list--rounded></mdui-icon-view-list--rounded>
        </mdui-button-icon>
      </mdui-tooltip>

      <mdui-tooltip :content="translate('general.setup')" placement="right">
        <mdui-button-icon
          class="mb-2"
          :class="{
            'bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))]':
              mode == 2,
          }"
          @click="nav(2)"
        >
          <mdui-icon-display-settings--rounded></mdui-icon-display-settings--rounded>
        </mdui-button-icon>
      </mdui-tooltip>

      <mdui-tooltip :content="translate('general.bop')" placement="right">
        <mdui-button-icon
          class="mb-2"
          :class="{
            'bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))]':
              mode == 3,
          }"
          @click="nav(3)"
        >
          <mdui-icon-balance--rounded></mdui-icon-balance--rounded>
        </mdui-button-icon>
      </mdui-tooltip>

      <mdui-dropdown placement="right" trigger="hover">
        <mdui-menu class="ml-2">
          <mdui-menu-item
            @click="nav(4)"
            :class="{
              'bg-[rgb(var(--mdui-color-primary-container))] text-[rgb(var(--mdui-color-primary))]':
                mode == 4,
            }"
          >
            <div slot="icon" class="pt-2">
              <mdui-icon-announcement></mdui-icon-announcement>
            </div>
            {{ $t('general.report') }}
          </mdui-menu-item>
          <mdui-menu-item
            @click="nav(5)"
            :class="{
              'bg-[rgb(var(--mdui-color-primary-container))] text-[rgb(var(--mdui-color-primary))]':
                mode == 5,
            }"
          >
            <div slot="icon" class="pt-1">
              <mdui-icon-format-paint--rounded></mdui-icon-format-paint--rounded>
            </div>
            {{ $t('general.livery') }}
          </mdui-menu-item>
        </mdui-menu>

        <mdui-button-icon
          slot="trigger"
          class="mb-2"
          :class="{
            'bg-[rgb(var(--mdui-color-primary))]': mode == 4 || mode == 5,
          }"
        >
          <HipoleLogoSvg
            class="size-6"
            :fill="
              mode === 4 || mode === 5
                ? 'rgb(var(--mdui-color-on-primary))'
                : 'rgb(var(--mdui-color-on-surface-variant))'
            "
          />
        </mdui-button-icon>
      </mdui-dropdown>

      <mdui-tooltip
        :content="'AI ' + $t('general.appNickName')"
        placement="right"
        slot="bottom"
        class="relative"
      >
        <div class="relative">
          <mdui-button-icon @click="aiDrawerOpen = true">
            <mdui-icon-assistant--rounded></mdui-icon-assistant--rounded>
          </mdui-button-icon>
          <mdui-badge
            class="absolute right-0 top-0 px-1"
            v-if="store.general.msgId < 3"
            >AI</mdui-badge
          >
        </div>
      </mdui-tooltip>

      <mdui-tooltip
        :content="translate('general.launchACC')"
        placement="right"
        slot="bottom"
        v-if="mode !== 0"
      >
        <mdui-button-icon class="mb-2" @click="launchACC" :disabled="launching">
          <Transition name="fade" mode="out-in">
            <mdui-circular-progress
              v-if="launching"
              class="p-2"
            ></mdui-circular-progress>
            <mdui-icon-send--rounded v-else></mdui-icon-send--rounded>
          </Transition>
        </mdui-button-icon>
      </mdui-tooltip>

      <mdui-tooltip
        :content="translate('general.settings')"
        placement="right"
        slot="bottom"
      >
        <mdui-button-icon
          :class="{
            'bg-[rgb(var(--mdui-color-primary))] text-[rgb(var(--mdui-color-on-primary))]':
              mode == 7,
          }"
          @click="nav(7)"
        >
          <mdui-icon-settings--rounded></mdui-icon-settings--rounded>
        </mdui-button-icon>
      </mdui-tooltip>
    </mdui-navigation-rail>

    <mdui-layout-main
      class="overflow-hidden transition-all"
      :style="{
        background: `rgba(var(--mdui-color-surface), ${store.settings.general.bgOpacity || 0.75})`,
      }"
    >
      <router-view id="mainRouterView" v-slot="{ Component }">
        <transition name="swipe-up" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </mdui-layout-main>

    <UpdateDialog v-model="updDialogShow" :upd-info="updInfo" show-skip />
    <mdui-dialog :open="showBulletin">
      <div
        slot="header"
        class="flex flex-row justify-between items-center text-2xl"
      >
        <div>{{ bulletin?.title?.[store.settings.general.lang] }}</div>
        <mdui-button-icon @click="showBulletin = false">
          <mdui-icon-close--rounded></mdui-icon-close--rounded>
        </mdui-button-icon>
      </div>
      <div
        class="overflow-y-scroll max-h-[500px] w-[400px] scroll-wrapper-app-vue"
      >
        <div
          v-html="marked(bulletin?.detail?.[store.settings.general.lang] || '')"
        />
      </div>
    </mdui-dialog>

    <FirstSetup v-model="firstSetupShow" />
  </mdui-layout>

  <AIDrawer class="no-drag" v-model="aiDrawerOpen" :platform="platform" />

  <div
    class="absolute top-0 z-9999 focus no-drag"
    :class="platform === 'darwin' ? 'left-26' : 'right-0'"
  >
    <div
      class="traffic-lights focus no-drag py-4 px-2"
      :class="platform === 'darwin' ? 'flex-row-reverse' : 'flex-row'"
    >
      <div class="traffic-light traffic-light-maximize" @click="winMax"></div>
      <div class="traffic-light traffic-light-minimize" @click="winMin"></div>
      <div class="traffic-light traffic-light-close" @click="winClose"></div>
    </div>
  </div>
</template>

<style>
.swipe-up-enter-from {
  transform: translateY(12vh);
  opacity: 0;
}
.swipe-up-leave-to {
  opacity: 0;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.swipe-up-enter-active,
.fade-enter-active,
.fade-leave-active {
  transition: all 400ms var(--mdui-motion-easing-standard);
}

h1,
h2,
h3,
h4,
h5,
.title {
  font-family:
    Google Sans,
    Harmony OS Sans SC,
    sans-serif;
}
a,
div,
span {
  font-family:
    Google Sans Text,
    Harmony OS Sans SC,
    sans-serif;
}
.marked {
  h1,
  h2,
  h3,
  h4 {
    font-weight: bold;
    font-size: 1.25rem;
    line-height: 1.4;
  }

  ul {
    list-style: disc inside;
    margin: 0.5rem 0;
  }

  ol {
    list-style: decimal inside;
    margin: 0.5rem 0;
  }

  table {
    margin: 0.5rem 0;

    thead {
      border: 2px solid;
    }
    th,
    td {
      border: 1px solid;
      padding: 0.25rem 0.5rem;
    }
  }
}

.scroll-wrapper-app-vue {
  scrollbar-color: rgba(var(--mdui-color-outline-variant), 0.8) transparent;
  scrollbar-width: thin;
  scrollbar-arrow-color: transparent;
}

.drag {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}

#mainRouterView {
  padding-right: 1rem;
}
</style>
