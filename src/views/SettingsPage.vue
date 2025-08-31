<script setup lang="ts">
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import { useStore } from '@/store'
import ChipSelect from '@/components/ChipSelect.vue'
import '@mdui/icons/light-mode--rounded.js'
import '@mdui/icons/brightness-auto--rounded.js'
import '@mdui/icons/dark-mode--outlined.js'
import '@mdui/icons/update--rounded.js'
import '@mdui/icons/image--rounded.js'
import '@mdui/icons/undo--rounded.js'
import { computed, onMounted, ref, watch } from 'vue'
import {
  getColorFromImage,
  getTheme,
  setColorScheme,
  setTheme,
  snackbar,
} from 'mdui'
import { themeMap } from '@/utils/enums'
import { marked } from 'marked'
import {
  availableLangCodes,
  availableLangNames,
  Lang,
  switchLang,
  translate,
  translateWithLocale,
  langMap,
} from '@/i18n'
import { ChromePicker } from 'vue-color'

const store = useStore()
const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)')
const isDark = ref(
  store.settings.general.darkMode === '2'
    ? darkModePreference.matches
    : store.settings.general.darkMode !== '1',
)
darkModePreference.addEventListener('change', e => {
  isDark.value =
    store.settings.general.darkMode === '2'
      ? e.matches
      : store.settings.general.darkMode !== '1'
})

const donationOpen1 = ref(false)
const donationOpen2 = ref(false)

if (!localStorage.lang) {
  localStorage.lang = 'en_US'
}
const lang = ref(localStorage.lang || 'en_US')
const langMsg = computed(() => {
  console.log(translateWithLocale('settings.languageChangeMsg', lang.value))
  return translateWithLocale('settings.languageChangeMsg', lang.value)
})
const dispMap = ['dispEnFull', 'dispEnShort', 'dispLocalShort']
const dispItems = computed(() => {
  if (lang.value === 'en_US') {
    return [1, 2]
  } else {
    return [1, 2, 3]
  }
})

const resetDialogOpen = ref(false)

const resetSettings = () => {
  resetDialogOpen.value = false
  store.clear()
  if (
    ['舞萌DX启动！', 'Time for maimai DX!'].includes(
      store.settings.status.serverDownMsg,
    )
  ) {
    store.settings.status.serverDownMsg = translate(
      'settings.serverDownMsgDefault',
    )
  }
}

const darkModeChange = (event: Event) => {
  const mode = event.target.value
  store.settings.general.darkMode = mode
  setTheme(themeMap[mode])
  isDark.value =
    store.settings.general.darkMode === '2'
      ? darkModePreference.matches
      : store.settings.general.darkMode !== '1'
}
const openLink = (url: string) => {
  window.electron.openExtLink(url)
}

const onLangSelect = (item: Lang) => {
  switchLang(lang.value)
  if (
    ['舞萌DX启动！', 'Time for maimai DX!'].includes(
      store.settings.status.serverDownMsg,
    )
  ) {
    store.settings.status.serverDownMsg = translate(
      'settings.serverDownMsgDefault',
    )
  }

  if (lang.value === 'en_US') {
    store.settings.setup.carDisplay = 2
    store.settings.setup.trackDisplay = 2
  }
}

const changeTray = (checked: boolean) => {
  store.settings.general.minToTray = checked
  // window.electron.storeSet('tray', checked)
}

const verCompare = (a: string, b: string) => {
  const arr1 = a.split('.')
  const arr2 = b.split('.')

  if (arr1.length != arr2.length) {
    return 114
  }

  for (let i = 0; i < arr1.length; i++) {
    if (parseInt(arr1[i]) > parseInt(arr2[i])) {
      return 1
    } else if (parseInt(arr1[i]) < parseInt(arr2[i])) {
      return -1
    }
  }
  return 0
}

const appVer = ref('')
// BUILD: '../../app.asar/package.json'
// DEV: '../../package.json'
fetch('../../app.asar/package.json')
  .then(response => response.json())
  .then(resp => {
    appVer.value = resp.version
  })

const needsUpdate = (latestStr: string) => {
  return verCompare(latestStr.split(' ')[0], appVer.value.split(' ')[0]) > 0
}

const updChecking = ref(false)
const latest = ref(false)
const updDialogShow = ref(false)
const updInfo = ref<any>({})
const checkUpdate = () => {
  updChecking.value = true
  window.axios
    // .get('http://0.0.0.0:5005/competizione')
    .get('http://120.55.52.240:5005/competizione')
    .then((res: any) => {
      console.log(res)
      if (res.success) {
        const resp = res.updInfo
        if (needsUpdate(resp.version)) {
          updInfo.value = resp
          updDialogShow.value = true
        } else {
          latest.value = true
          snackbar({
            message: translate('settings.upToDate'),
            autoCloseDelay: 3000,
          })
        }
      }
      updChecking.value = false
    })
    .catch((err: Error) => {
      snackbar({
        message: translate('general.checkUpdFail'),
        autoCloseDelay: 3000,
      })
      updChecking.value = false
      console.error(err)
    })
}
const confirmUpd = () => {
  updDialogShow.value = false
  window.electron.openExtLink(updInfo.value.dlUrl)
  window.win.close()
}

let throttleTimeout: ReturnType<typeof setTimeout> | null = null
let lastThemeColor: string | null = null

watch(
  () => store.settings.general.themeColor,
  newColor => {
    if (throttleTimeout) {
      clearTimeout(throttleTimeout)
    }
    throttleTimeout = setTimeout(() => {
      if (lastThemeColor !== newColor) {
        setColorScheme(newColor)
        lastThemeColor = newColor
      }
    }, 100)
  },
)

const bgButtonLoading = ref(false)
const setBgImage = () => {
  window.dialog
    .showAndCopy({
      title: translate('settings.bgSelectTitle'),
      properties: ['openFile'],
      filters: [
        {
          name: translate('settings.bgSelectFileType'),
          extensions: ['jpg', 'png', 'webp'],
        },
      ],
    })
    .then(resp => {
      if (resp) {
        bgButtonLoading.value = true
        store.settings.general.bgImg = resp
        const img = new Image()
        img.src = resp
        getColorFromImage(img).then(color => {
          if (color) {
            store.settings.general.themeColor = color
            setColorScheme(color)
          }
          bgButtonLoading.value = false
        })
      }
    })
    .catch(error => {
      console.error('Error in showing dialog:', error)
    })
}
</script>

<template>
  <div class="h-full flex flex-col justify-center items-center relative w-full">
    <mdui-card
      variant="outlined"
      class="size-full border border-[rgb(var(--mdui-color-inverse-primary-dark))] mx-4 mb-4 flex"
      style="background: rgba(var(--mdui-color-surface-container-lowest), 0.65)"
    >
      <ScrollWrapper class="pl-2 pr-1">
        <div class="pl-6 pt-6 pr-5">
          <div class="category">
            <div class="title header">{{ $t('settings.general') }}</div>
            <div class="item">
              <div class="item-in">
                <div>{{ $t('settings.language') }}</div>
                <ChipSelect
                  v-model="lang"
                  :items="availableLangCodes"
                  chip-class="rounded-full"
                  :chip-label="item => langMap[item]"
                  :item-label="item => langMap[item]"
                  @select="onLangSelect"
                >
                </ChipSelect>
              </div>
            </div>
            <div class="item">
              <div class="item-in">
                <div>{{ $t('settings.darkMode') }}</div>
                <mdui-segmented-button-group
                  class="rounded-full"
                  selects="single"
                  :value="store.settings.general.darkMode"
                  @change="darkModeChange"
                >
                  <mdui-segmented-button
                    class="border border-[rgb(var(--mdui-color-outline-variant))]"
                    value="1"
                  >
                    <mdui-icon-light-mode--rounded></mdui-icon-light-mode--rounded>
                  </mdui-segmented-button>
                  <mdui-segmented-button
                    class="border border-[rgb(var(--mdui-color-outline-variant))]"
                    value="2"
                  >
                    <mdui-icon-brightness-auto--rounded></mdui-icon-brightness-auto--rounded>
                  </mdui-segmented-button>
                  <mdui-segmented-button
                    class="border border-[rgb(var(--mdui-color-outline-variant))]"
                    value="3"
                  >
                    <mdui-icon-dark-mode--outlined></mdui-icon-dark-mode--outlined>
                  </mdui-segmented-button>
                </mdui-segmented-button-group>
              </div>
            </div>
            <div class="item">
              <div class="item-in">
                <div>{{ $t('settings.colorScheme') }}</div>
                <div class="flex flex-row items-center">
                  <div v-if="bgButtonLoading">
                    {{ $t('settings.extracting') }}
                  </div>
                  <mdui-tooltip
                    :content="$t('settings.deleteBg')"
                    placement="bottom"
                    v-if="!bgButtonLoading && store.settings.general.bgImg"
                  >
                    <mdui-button-icon
                      class="mr-2"
                      @click="
                        () => {
                          store.settings.general.bgImg = ''
                        }
                      "
                    >
                      <mdui-icon-undo--rounded></mdui-icon-undo--rounded>
                    </mdui-button-icon>
                  </mdui-tooltip>
                  <mdui-tooltip
                    :content="$t('settings.setBg')"
                    placement="bottom"
                  >
                    <mdui-button-icon class="mr-2" @click="setBgImage">
                      <mdui-icon-image--rounded></mdui-icon-image--rounded>
                    </mdui-button-icon>
                  </mdui-tooltip>

                  <mdui-tooltip placement="bottom-end" class="picker">
                    <ChromePicker
                      slot="content"
                      v-model="store.settings.general.themeColor"
                    />
                    <div
                      class="flex flex-row items-center rounded-full h-10 p-1 bg-[rgb(var(--mdui-color-inverse-on-surface))]"
                    >
                      <div
                        class="rounded-full w-8 h-8"
                        :style="{
                          background: store.settings.general.themeColor,
                        }"
                      />
                      <div class="p-3" style="font-family: Consolas">
                        {{ store.settings.general.themeColor.toUpperCase() }}
                      </div>
                    </div>
                  </mdui-tooltip>
                </div>
              </div>
            </div>
            <div class="item">
              <div class="item-in">
                <div>{{ $t('settings.minToTray') }}</div>
                <mdui-switch
                  :checked="store.settings.general.minToTray"
                  @change="
                    e => {
                      changeTray(e.target.checked)
                    }
                  "
                ></mdui-switch>
              </div>
            </div>
            <mdui-button
              class="ml-6"
              variant="text"
              @click="resetDialogOpen = true"
              >{{ $t('settings.reset') }}</mdui-button
            >
          </div>
          <div class="category">
            <div class="title header">{{ $t('general.status') }}</div>
            <div class="item">
              <div class="item-in">
                <div>{{ $t('settings.serverDownMsg') }}</div>
                <mdui-text-field
                  class="w-60 bg-[rgb(var(--mdui-color-on-secondary))] cursor-text"
                  :placeholder="$t('settings.serverDownMsgPlaceholder')"
                  variant="outlined"
                  :value="store.settings.status.serverDownMsg"
                  @input="
                    store.settings.status.serverDownMsg = $event.target.value
                  "
                ></mdui-text-field>
              </div>
            </div>
          </div>
          <div class="category">
            <div class="title header">{{ $t('general.setup') }}</div>
            <div class="item">
              <div class="item-in">
                <div>{{ $t('settings.carDisp') }}</div>
                <ChipSelect
                  v-model="store.settings.setup.carDisplay"
                  chip-class="rounded-full"
                  :items="dispItems"
                  :item-label="item => $t(`settings.${dispMap[item - 1]}`)"
                  :chip-label="item => $t(`settings.${dispMap[item - 1]}`)"
                >
                </ChipSelect>
              </div>
            </div>
            <div class="item">
              <div class="item-in">
                <div>{{ $t('settings.trackDisp') }}</div>
                <ChipSelect
                  v-model="store.settings.setup.trackDisplay"
                  chip-class="rounded-full"
                  :items="dispItems"
                  :item-label="item => $t(`settings.${dispMap[item - 1]}`)"
                  :chip-label="item => $t(`settings.${dispMap[item - 1]}`)"
                >
                </ChipSelect>
              </div>
            </div>
            <div class="item" v-if="lang !== 'en_US'">
              <div class="item-in">
                <div>{{ $t('settings.paramsEn') }}</div>
                <mdui-switch
                  :checked="store.settings.setup.setupLabelEn"
                  @change="
                    store.settings.setup.setupLabelEn = $event.target.checked
                  "
                ></mdui-switch>
              </div>
            </div>
            <div class="item">
              <div class="item-in">
                <div>{{ $t('settings.alwaysViewOnly') }}</div>
                <mdui-switch
                  :checked="store.settings.setup.alwaysViewOnly"
                  @change="
                    store.settings.setup.alwaysViewOnly = $event.target.checked
                  "
                ></mdui-switch>
              </div>
            </div>
          </div>
          <div class="category">
            <div class="title header">{{ $t('settings.about') }}</div>
            <div class="item">
              <div class="item-in">
                <div class="flex flex-row items-center">
                  <div>{{ $t('settings.version') }}</div>
                  <mdui-chip
                    class="ml-2 rounded-full"
                    style="
                      font-family: Consolas, 'Harmony OS Sans SC', sans-serif;
                    "
                  >
                    {{ appVer }}
                  </mdui-chip>
                </div>
                <div class="flex flex-row justify-end items-center">
                  <mdui-button-icon
                    class="mr-2"
                    :class="{ invert: isDark }"
                    @click="
                      openLink(
                        'https://github.com/HoraceHuang-ui/Competizione-Companion',
                      )
                    "
                  >
                    <img src="@/assets/github-mark.png" class="p-1" />
                  </mdui-button-icon>
                  <mdui-button
                    variant="tonal"
                    @click="checkUpdate"
                    :disabled="updChecking || latest"
                    :loading="updChecking"
                  >
                    {{ $t('settings.checkUpdate') }}
                  </mdui-button>
                </div>
              </div>
            </div>
            <div class="item">
              <div class="item-in">
                <div>{{ $t('settings.donate') }}</div>
                <mdui-button variant="tonal" @click="donationOpen1 = true">
                  {{ $t('settings.donateButton') }}
                </mdui-button>

                <mdui-dialog
                  :headline="$t('settings.donation1Title')"
                  :open="donationOpen1"
                  @close="donationOpen1 = false"
                >
                  <div>{{ $t('settings.donation1Msg') }}</div>
                  <div class="flex flex-row mt-2">
                    <img
                      src="@/assets/wechat.jpg"
                      width="250"
                      class="mr-2 donation-pic"
                    />
                    <img
                      src="@/assets/alipay.jpg"
                      width="250"
                      class="donation-pic"
                    />
                  </div>
                  <mdui-button
                    slot="action"
                    variant="text"
                    @click="donationOpen1 = false"
                    >{{ $t('settings.donation1Cancel') }}</mdui-button
                  >
                  <mdui-button
                    slot="action"
                    @click="
                      () => {
                        donationOpen1 = false
                        donationOpen2 = true
                      }
                    "
                    >{{ $t('settings.donation1Confirm') }}</mdui-button
                  >
                </mdui-dialog>

                <mdui-dialog
                  :headline="$t('settings.donation2Title')"
                  :open="donationOpen2"
                  @close="donationOpen2 = false"
                >
                  <div>
                    {{ $t('settings.donation2Msg') }}
                  </div>
                  <mdui-button
                    slot="action"
                    @click="donationOpen2 = false"
                    class="title font-bold"
                    >{{ $t('settings.donation2Confirm') }}</mdui-button
                  >
                </mdui-dialog>
              </div>
            </div>
            <div class="larger mt-4">
              <div
                class="w-full text-center text-[rgb(var(--mdui-color-outline))] flex flex-row justify-center items-center"
              >
                <mdui-tooltip placement="top" class="credits">
                  <div slot="content">Dynamic Esports Academy</div>
                  <img
                    src="@/assets/DEA_light.png"
                    class="mx-4 transition-all inline px-1 py-0.5 mb-0.5 rounded-full bg-[rgb(var(--mdui-color-primary-light))] opacity-55 hover:opacity-100"
                    width="80"
                  />
                </mdui-tooltip>

                <mdui-tooltip placement="top" class="credits">
                  <div slot="content" class="select-text cursor-text">
                    <a
                      class="cursor-pointer"
                      @click="openLink('https://www.hipole.com/')"
                      style="
                        color: rgb(var(--mdui-color-inverse-primary));
                        text-decoration: underline;
                      "
                      >HiPole</a
                    >{{ $t('settings.hipoleTooltip') }}
                  </div>
                  <img
                    :src="`../../src/assets/hipole/${$t('langCode')}_${isDark ? 'dark' : 'light'}.png`"
                    class="inline mx-4 opacity-55 hover:opacity-100 transition-all"
                    width="130"
                  />
                </mdui-tooltip>

                <mdui-tooltip placement="top" class="credits">
                  <div slot="content" class="select-text cursor-text">
                    {{ $t('settings.hmrTooltip') }}
                  </div>
                  <div
                    class="flex flex-row items-center mx-4 opacity-55 hover:opacity-100"
                  >
                    <img src="@/assets/HerMess.png" width="40" />
                    <img src="@/assets/HerMess_text.png" width="90" />
                  </div>
                </mdui-tooltip>

                <mdui-tooltip placement="top" class="credits">
                  <div slot="content">
                    <a
                      class="cursor-pointer"
                      @click="openLink('https://acc-status.jonatan.net/')"
                      style="
                        color: rgb(var(--mdui-color-inverse-primary));
                        text-decoration: underline;
                      "
                      >acc-status.jonatan.net</a
                    >
                  </div>
                  <img
                    src="https://acc-status.jonatan.net/favicon.ico"
                    class="transition-all mx-4 inline px-2 py-1.5 mb-0.5 rounded-full opacity-55 hover:opacity-100 bg-[rgb(var(--mdui-color-primary-dark))]"
                    width="40"
                  />
                </mdui-tooltip>

                <mdui-tooltip placement="top" class="credits">
                  <div slot="content">
                    <a
                      class="cursor-pointer"
                      @click="
                        openLink('https://lonemeow.github.io/acc-setup-diff/')
                      "
                      style="
                        color: rgb(var(--mdui-color-inverse-primary));
                        text-decoration: underline;
                      "
                      >acc-setup-diff</a
                    >
                    |
                    <a
                      @click="
                        openLink('https://github.com/lonemeow/acc-connector')
                      "
                      class="cursor-pointer"
                      style="
                        color: rgb(var(--mdui-color-inverse-primary));
                        text-decoration: underline;
                      "
                      >acc-connector</a
                    >
                  </div>
                  <div
                    class="flex flex-row items-center mx-4 opacity-55 hover:opacity-100"
                  >
                    <img
                      src="@/assets/lonemeow.png"
                      class="inline mr-1 rounded-full transition-all"
                      width="30"
                    />
                    <div class="ml-1 text-[rgb(var(--mdui-color-on-surface))]">
                      lonemeow
                    </div>
                  </div>
                </mdui-tooltip>
              </div>
              <mdui-divider class="my-4 opacity-60"></mdui-divider>
              <div class="item-in">
                <div
                  class="w-full text-center text-[rgb(var(--mdui-color-outline))]"
                >
                  <p class="title">Made with ❤️ by horacehuang17</p>
                  <p class="text-sm mb-1">
                    {{ $t('settings.thanksMsg') }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollWrapper>
    </mdui-card>

    <mdui-dialog
      :open="resetDialogOpen"
      close-on-overlay-click
      close-on-esc
      :headline="$t('settings.resetConfirm')"
    >
      <mdui-button
        slot="action"
        variant="text"
        @click="resetDialogOpen = false"
        >{{ $t('general.cancel') }}</mdui-button
      >
      <mdui-button slot="action" @click="resetSettings">{{
        $t('general.confirm')
      }}</mdui-button>
    </mdui-dialog>
    <mdui-dialog
      :open="updDialogShow"
      close-on-overlay-click
      close-on-esc
      :headline="$t('general.newVerDetected')"
      @close="updDialogShow = false"
    >
      <mdui-icon-update--rounded slot="icon"></mdui-icon-update--rounded>
      <div class="overflow-y-scroll max-h-[300px] w-[400px] scroll-wrapper">
        <div
          class="marked"
          v-html="marked(updInfo?.desc?.[$t('langCode')] || '')"
        />
      </div>
      <div class="text-red-600 dark:text-red-400" style="margin-top: 10px">
        {{ $t('general.updVer') }}{{ appVer }} 👉
        {{ updInfo.version }}
      </div>
      <div class="text-red-600 dark:text-red-400">
        {{ $t('general.updSize')
        }}{{ (updInfo.size / 1024 / 1024).toFixed(1) }}MB
      </div>
      <mdui-button
        slot="action"
        variant="text"
        @click="updDialogShow = false"
        >{{ $t('general.cancel') }}</mdui-button
      >
      <mdui-button slot="action" @click="confirmUpd">{{
        $t('general.update')
      }}</mdui-button>
    </mdui-dialog>
  </div>
</template>

<style lang="scss" scoped>
.category {
  width: 100%;
  margin-bottom: 1rem;

  .header {
    font-size: 1.875rem;
    line-height: 1.2;
    font-weight: bold;
    margin-bottom: 0.5rem;
  }

  .item {
    height: 60px;
    cursor: default;
    padding: 0 1rem;
    margin: 0.125rem 0 0.125rem 1.5rem;
    justify-content: space-between;
    border-radius: 30px;
    transition: all var(--mdui-motion-duration-short4)
      var(--mdui-motion-easing-standard);

    &.larger {
      height: max-content;
      min-height: 60px;
      padding: 0.75rem 1rem;
    }

    &:hover {
      background: rgb(var(--mdui-color-surface-container-low));
    }
  }

  .item-in {
    height: 100%;
    padding-left: 0.5rem;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;

    &.larger {
      align-items: baseline;
    }
  }
}

.scroll-wrapper {
  scrollbar-color: rgba(var(--mdui-color-outline-variant), 0.8) transparent;
  scrollbar-width: thin;
  scrollbar-arrow-color: transparent;
}

.donation-pic {
  border-radius: var(--mdui-shape-corner-large);
}

.credits::part(popup) {
  border-radius: 999px;
  padding: 0.5rem 1rem;
}
.credits::part(content) {
  font-size: 1rem;
  line-height: 1.2;
}
.picker::part(popup) {
  padding: 1rem;
  background: none;
}
</style>
