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
import '@mdui/icons/help-outline--rounded.js'
import 'mdui/components/collapse.js'
import 'mdui/components/collapse-item.js'
import { computed, inject, Ref, ref, watch, onMounted } from 'vue'
import { getColorFromImage, setColorScheme, setTheme, snackbar } from 'mdui'
import {
  themeMap,
  darkModeSettings,
  asseconHimeThemeColor,
} from '@/utils/enums'
import { translate } from '@/i18n'
import { ChromePicker } from 'vue-color'
import UpdateDialog from '@/components/UpdateDialog.vue'
import { checkUpdate } from '@/utils/utils'
import FavDialog from '@/views/SettingsPage/components/FavDialog.vue'
import LanguageSelector from './components/LanguageSelector.vue'
import {
  CUSTOM_AI_API_TYPES,
  CUSTOM_AI_API_TYPE_LABELS,
} from '@/utils/customAi'

const showFavDialog = ref(false)

const store = useStore()

// 自定义 AI 提供商：填写阶段只做非空校验
const aiFieldEmpty = (field: 'baseUrl' | 'apiKey' | 'model') =>
  !store.settings.ai[field].trim()

const customAiIncomplete = computed(
  () =>
    store.settings.ai.enabled &&
    (aiFieldEmpty('baseUrl') ||
      aiFieldEmpty('apiKey') ||
      aiFieldEmpty('model')),
)

const apiTypeLabel = (item: keyof typeof CUSTOM_AI_API_TYPE_LABELS) =>
  CUSTOM_AI_API_TYPE_LABELS[item]

const donationOpen1 = ref(false)
const donationOpen2 = ref(false)

const contactOpen = ref(false)
const friendshipOpen = ref(false)

if (!localStorage.lang) {
  localStorage.lang = 'en_US'
}
const lang = ref(localStorage.lang || 'en_US')
const dispMap = ['dispEnFull', 'dispEnShort', 'dispLocalShort']
const dispItems = computed(() => {
  if (lang.value === 'en_US') {
    return [1, 2]
  } else {
    return [1, 2, 3]
  }
})

const dark = inject('isDark') as {
  isDark: Ref<boolean>
  setDark: (val: boolean) => void
}

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

const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)')
const darkModeChange = (event: Event) => {
  const mode = event.target.value
  store.settings.general.darkMode = mode
  setTheme(themeMap[mode])

  dark.setDark(
    store.settings.general.darkMode === darkModeSettings.AUTO
      ? darkModePreference.matches
      : store.settings.general.darkMode !== darkModeSettings.LIGHT,
  )
}

const openLink = (url: string) => {
  window.electron.openExtLink(url)
}

const changeTray = (checked: boolean) => {
  store.settings.general.minToTray = checked
  // window.electron.storeSet('tray', checked)
}

// 「游戏暂停时隐藏遥测窗」：状态存在主进程的覆盖层配置里（overlay.json），
// 这里只做读写 + 展示，避免两处各存一份导致不同步。
const hideOverlayWhenPaused = ref(true)
const loadHideOverlayWhenPaused = async () => {
  const state = await window.overlay?.getState()
  if (state && state.scope === 'main') {
    hideOverlayWhenPaused.value = state.hideWhenPaused !== false
  }
}
const changeHideOverlayWhenPaused = async (event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  hideOverlayWhenPaused.value = checked
  const state = await window.overlay?.setHideWhenPaused(checked)
  if (state && state.scope === 'main') {
    hideOverlayWhenPaused.value = state.hideWhenPaused !== false
  }
}
onMounted(() => {
  void loadHideOverlayWhenPaused()
})

const appVer = import.meta.env.VITE_APP_VERSION
const updChecking = ref(false)
const updDialogShow = ref(false)
const updInfo = ref<any>({})
const latest = ref(false)
const invokeUpdateCheck = () => {
  updChecking.value = true
  checkUpdate()
    .then((info: any) => {
      if (info) {
        updInfo.value = info
        updDialogShow.value = true
        latest.value = false
      } else {
        snackbar({
          message: translate('settings.upToDate'),
          autoCloseDelay: 3000,
        })
        latest.value = true
      }
    })
    .finally(() => {
      updChecking.value = false
    })
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
        if (store.settings.general.bgType === 'custom') {
          store.settings.general.customBgThemeColor = newColor
        }
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
    .then(async resp => {
      if (resp) {
        bgButtonLoading.value = true
        store.settings.general.bgImgPath = resp
        const img = new Image()
        img.src = await window.img.getBgBase64()
        getColorFromImage(img).then(color => {
          if (color) {
            store.settings.general.themeColor = color
            store.settings.general.customBgThemeColor = color
            setColorScheme(color)
          }
          bgButtonLoading.value = false
          store.settings.general.bgImg = img.src
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
    <mdui-card variant="filled" class="size-full mb-4 mt-2 flex bg-transparent">
      <ScrollWrapper>
        <div>
          <div class="grid grid-cols-2 gap-4 items-start">
            <div class="flex flex-col gap-4">
              <mdui-card
                variant="filled"
                class="settings-block"
                :style="{
                  background: `rgba(var(--mdui-color-surface-container-lowest), ${(0.65 * (store.settings.general.bgOpacity || 0.75)) / 0.75})`,
                }"
              >
                <div class="pl-6 pt-6 pr-5">
                  <div class="category">
                    <div class="title header">{{ $t('settings.general') }}</div>
                    <div class="item">
                      <div class="item-in">
                        <div>{{ $t('settings.language') }}</div>
                        <LanguageSelector v-model="lang" />
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
                    <div class="item">
                      <div class="item-in">
                        <div>{{ $t('settings.customAi') }}</div>
                        <mdui-switch
                          :checked="store.settings.ai.enabled"
                          @change="
                            store.settings.ai.enabled = $event.target.checked
                          "
                        ></mdui-switch>
                      </div>
                    </div>
                    <mdui-collapse
                      accordion
                      :value="store.settings.ai.enabled ? 'custom-ai' : ''"
                    >
                      <mdui-collapse-item value="custom-ai">
                        <div
                          class="ml-[3rem] mr-4 mb-1 text-xs flex flex-row items-center"
                        >
                          <span class="opacity-50">{{
                            $t('settings.customAiScope')
                          }}</span>
                          <span
                            v-if="customAiIncomplete"
                            class="ml-2 text-[rgb(var(--mdui-color-error))]"
                            >{{ $t('settings.customAiRequired') }}</span
                          >
                        </div>
                        <div class="item">
                          <div class="item-in">
                            <div>{{ $t('settings.customAiApiType') }}</div>
                            <ChipSelect
                              v-model="store.settings.ai.apiType"
                              chip-class="rounded-full"
                              :items="CUSTOM_AI_API_TYPES"
                              :item-label="apiTypeLabel"
                              :chip-label="apiTypeLabel"
                            />
                          </div>
                        </div>
                        <div class="item">
                          <div class="item-in">
                            <div>{{ $t('settings.customAiBaseUrl') }}</div>
                            <mdui-text-field
                              class="msg-input w-60 cursor-text h-[46px]"
                              :class="{
                                'ai-field-empty': aiFieldEmpty('baseUrl'),
                              }"
                              variant="outlined"
                              :value="store.settings.ai.baseUrl"
                              @input="
                                store.settings.ai.baseUrl = $event.target.value
                              "
                            ></mdui-text-field>
                          </div>
                        </div>
                        <div class="item">
                          <div class="item-in">
                            <div>{{ $t('settings.customAiApiKey') }}</div>
                            <mdui-text-field
                              class="msg-input w-60 cursor-text h-[46px]"
                              :class="{
                                'ai-field-empty': aiFieldEmpty('apiKey'),
                              }"
                              variant="outlined"
                              type="password"
                              toggle-password
                              :value="store.settings.ai.apiKey"
                              @input="
                                store.settings.ai.apiKey = $event.target.value
                              "
                            ></mdui-text-field>
                          </div>
                        </div>
                        <div class="item">
                          <div class="item-in">
                            <div>{{ $t('settings.customAiModel') }}</div>
                            <mdui-text-field
                              class="msg-input w-60 cursor-text h-[46px]"
                              :class="{
                                'ai-field-empty': aiFieldEmpty('model'),
                              }"
                              variant="outlined"
                              :value="store.settings.ai.model"
                              @input="
                                store.settings.ai.model = $event.target.value
                              "
                            ></mdui-text-field>
                          </div>
                        </div>
                      </mdui-collapse-item>
                    </mdui-collapse>
                    <mdui-button
                      class="ml-6"
                      variant="text"
                      @click="resetDialogOpen = true"
                      >{{ $t('settings.reset') }}</mdui-button
                    >
                  </div>
                </div>
              </mdui-card>
              <mdui-card
                variant="filled"
                class="settings-block"
                :style="{
                  background: `rgba(var(--mdui-color-surface-container-lowest), ${(0.65 * (store.settings.general.bgOpacity || 0.75)) / 0.75})`,
                }"
              >
                <div class="pl-6 pt-6 pr-5">
                  <div class="category">
                    <div class="title header">{{ $t('settings.about') }}</div>
                    <div class="item">
                      <div class="item-in">
                        <div class="flex flex-row items-center">
                          <div>{{ $t('settings.version') }}</div>
                          <mdui-chip
                            class="ml-2 rounded-full"
                            style="
                              font-family:
                                Consolas, 'Harmony OS Sans SC', sans-serif;
                            "
                          >
                            {{ appVer }}
                          </mdui-chip>
                        </div>
                        <div class="flex flex-row justify-end items-center">
                          <mdui-button-icon
                            class="mr-2"
                            :class="{ invert: dark.isDark.value }"
                            @click="
                              openLink(
                                'https://github.com/HoraceHuang-ui/Competizione-Companion',
                              )
                            "
                          >
                            <img
                              src="../../assets/github-mark.png"
                              class="p-1"
                            />
                          </mdui-button-icon>
                          <mdui-button
                            variant="tonal"
                            @click="invokeUpdateCheck"
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
                        <mdui-button
                          variant="tonal"
                          @click="donationOpen1 = true"
                        >
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
                              src="../../assets/wechat.jpg"
                              width="250"
                              class="mr-2 donation-pic"
                            />
                            <img
                              src="../../assets/alipay.jpg"
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
                            class="font-bold"
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
                    <div class="item">
                      <div class="item-in">
                        <div>{{ $t('general.contact') }}</div>
                        <mdui-button
                          variant="tonal"
                          @click="contactOpen = true"
                        >
                          {{ $t('bop.clickToView') }}
                        </mdui-button>
                      </div>
                    </div>
                    <div class="item">
                      <div class="item-in">
                        <div>{{ $t('general.friendshipLink') }}</div>
                        <mdui-button
                          variant="tonal"
                          @click="friendshipOpen = true"
                        >
                          {{ $t('bop.clickToView') }}
                        </mdui-button>
                      </div>
                    </div>
                  </div>
                </div>
              </mdui-card>
            </div>
            <div class="flex flex-col gap-4">
              <mdui-card
                variant="filled"
                class="settings-block"
                :style="{
                  background: `rgba(var(--mdui-color-surface-container-lowest), ${(0.65 * (store.settings.general.bgOpacity || 0.75)) / 0.75})`,
                }"
              >
                <div class="pl-6 pt-6 pr-5">
                  <div class="category">
                    <div class="title header">{{ $t('settings.display') }}</div>
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
                        <div>{{ $t('settings.bgType') }}</div>
                        <div class="flex flex-row items-center">
                          <div v-if="bgButtonLoading">
                            {{ $t('settings.extracting') }}
                          </div>
                          <mdui-tooltip
                            :content="$t('settings.setBg')"
                            placement="bottom"
                            v-if="store.settings.general.bgType === 'custom'"
                          >
                            <mdui-button-icon class="mr-1" @click="setBgImage">
                              <mdui-icon-image--rounded></mdui-icon-image--rounded>
                            </mdui-button-icon>
                          </mdui-tooltip>
                          <div
                            class="flex flex-row rounded-full border border-[rgb(var(--mdui-color-outline-variant))]"
                          >
                            <mdui-avatar
                              v-if="store.settings.general.bgType === 'hime'"
                              class="mr-2"
                              :src="`../../src/assets/asseconHime/ASSECON_HIME_${dark.isDark.value ? 'dark' : 'light'}_profile.png`"
                            ></mdui-avatar>
                            <chip-select
                              v-model="store.settings.general.bgType"
                              :items="['hime', 'custom', 'none']"
                              chip-class="rounded-full h-[40px]"
                              :chip-style="{
                                background:
                                  'rgba(var(--mdui-color-inverse-on-surface), 0.6)',
                              }"
                              :item-label="
                                item => $t(`settings.bgType_${item}`)
                              "
                              :chip-label="
                                item => $t(`settings.bgType_${item}`)
                              "
                              @select="
                                item => {
                                  if (item === 'custom') {
                                    store.settings.general.themeColor =
                                      store.settings.general
                                        .customBgThemeColor || '#785abf'
                                  } else if (item === 'hime') {
                                    store.settings.general.themeColor = dark
                                      .isDark.value
                                      ? asseconHimeThemeColor.dark
                                      : asseconHimeThemeColor.light
                                  }
                                  setColorScheme(
                                    store.settings.general.themeColor,
                                  )
                                }
                              "
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="item">
                      <div class="item-in">
                        <div>{{ $t('settings.colorScheme') }}</div>
                        <div class="flex flex-row items-center">
                          <mdui-tooltip
                            placement="bottom"
                            variant="rich"
                            :headline="$t('settings.bgOpacity')"
                          >
                            <div slot="content" class="w-[300px]">
                              <mdui-slider
                                class="px-4"
                                :value="
                                  store.settings.general.bgOpacity || 0.75
                                "
                                :min="0.5"
                                :step="0.05"
                                :max="1"
                                @input="
                                  store.settings.general.bgOpacity =
                                    $event.target.value
                                "
                                nolabel
                              ></mdui-slider>
                            </div>
                            <div
                              class="mr-2 px-4 py-2 rounded-full"
                              style="
                                background: rgba(
                                  var(--mdui-color-inverse-on-surface),
                                  0.6
                                );
                              "
                            >
                              {{
                                (
                                  (store.settings.general.bgOpacity || 0.75) *
                                  100
                                ).toFixed(0)
                              }}%
                            </div>
                          </mdui-tooltip>

                          <mdui-tooltip placement="bottom-end" class="picker">
                            <ChromePicker
                              slot="content"
                              v-model="store.settings.general.themeColor"
                              disable-alpha
                              :formats="['hex', 'rgb']"
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
                                {{
                                  store.settings.general.themeColor.toUpperCase()
                                }}
                              </div>
                            </div>
                          </mdui-tooltip>
                        </div>
                      </div>
                    </div>
                    <div class="item">
                      <div class="item-in">
                        <div>{{ $t('settings.carDisp') }}</div>
                        <ChipSelect
                          v-model="store.settings.setup.carDisplay"
                          chip-class="rounded-full"
                          :items="dispItems"
                          :item-label="
                            item => $t(`settings.${dispMap[item - 1]}`)
                          "
                          :chip-label="
                            item => $t(`settings.${dispMap[item - 1]}`)
                          "
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
                          :item-label="
                            item => $t(`settings.${dispMap[item - 1]}`)
                          "
                          :chip-label="
                            item => $t(`settings.${dispMap[item - 1]}`)
                          "
                        >
                        </ChipSelect>
                      </div>
                    </div>
                    <!-- 游戏暂停 / 无数据时整体隐藏遥测窗（各自显隐与方位会被保留，下场时原样恢复） -->
                    <div class="item">
                      <div class="item-in">
                        <div>{{ $t('settings.hideOverlayWhenPaused') }}</div>
                        <mdui-switch
                          :checked="hideOverlayWhenPaused"
                          @change="changeHideOverlayWhenPaused"
                        ></mdui-switch>
                      </div>
                    </div>
                    <div class="item" v-if="lang !== 'en_US'">
                      <div class="item-in">
                        <div>{{ $t('settings.paramsEn') }}</div>
                        <mdui-switch
                          :checked="store.settings.setup.setupLabelEn"
                          @change="
                            store.settings.setup.setupLabelEn =
                              $event.target.checked
                          "
                        ></mdui-switch>
                      </div>
                    </div>
                  </div>
                </div>
              </mdui-card>
              <mdui-card
                variant="filled"
                class="settings-block"
                :style="{
                  background: `rgba(var(--mdui-color-surface-container-lowest), ${(0.65 * (store.settings.general.bgOpacity || 0.75)) / 0.75})`,
                }"
              >
                <div class="pl-6 pt-6 pr-5">
                  <div class="category">
                    <div class="title header">
                      {{ $t('settings.preference') }}
                    </div>
                    <div class="item">
                      <div class="item-in">
                        <div>{{ $t('settings.serverDownMsg') }}</div>
                        <mdui-text-field
                          class="msg-input w-60 cursor-text h-[46px]"
                          :placeholder="$t('settings.serverDownMsgPlaceholder')"
                          variant="outlined"
                          :value="store.settings.status.serverDownMsg"
                          @input="
                            store.settings.status.serverDownMsg =
                              $event.target.value
                          "
                        ></mdui-text-field>
                      </div>
                    </div>
                    <div class="item">
                      <div class="item-in">
                        <div class="flex flex-row items-center">
                          <div>{{ $t('settings.favCarsTracks') }}</div>
                          <mdui-tooltip
                            :content="$t('settings.favCarsTracksTooltip')"
                          >
                            <mdui-button-icon>
                              <mdui-icon-help-outline--rounded></mdui-icon-help-outline--rounded> </mdui-button-icon
                          ></mdui-tooltip>
                        </div>
                        <mdui-button
                          variant="tonal"
                          @click="showFavDialog = true"
                        >
                          {{ $t('general.clickToSet') }}
                        </mdui-button>
                      </div>
                    </div>
                    <div class="item">
                      <div class="item-in">
                        <div>{{ $t('settings.alwaysViewOnly') }}</div>
                        <mdui-switch
                          :checked="store.settings.setup.alwaysViewOnly"
                          @change="
                            store.settings.setup.alwaysViewOnly =
                              $event.target.checked
                          "
                        ></mdui-switch>
                      </div>
                    </div>
                  </div>
                </div>
              </mdui-card>
            </div>
          </div>
          <!-- 冠名赞助 / 特别鸣谢 / Made with love：独立于所有区块，位于最底部 -->
          <div class="category w-full mt-6">
            <div class="w-full text-center opacity-80 text-sm">
              {{ $t('settings.sponsor') }}
            </div>
            <div
              class="w-full text-center flex flex-row justify-center flex-wrap gap-3 items-center mb-6"
            >
              <mdui-tooltip placement="top" class="credits">
                <div slot="content" class="select-text cursor-text">
                  {{ $t('settings.pxnTooltip') }}
                </div>
                <img
                  :src="`../../src/assets/pxn/trans6${dark.isDark.value ? 'dark' : 'light'}.png`"
                  class="inline opacity-55 hover:opacity-100 transition-all"
                  width="200"
                />
              </mdui-tooltip>
            </div>

            <div class="w-full text-center opacity-80 text-sm">
              {{ $t('settings.thanks') }}
            </div>
            <div
              class="w-full text-center text-[rgb(var(--mdui-color-outline))] flex flex-row justify-center items-center"
            >
              <mdui-tooltip placement="top" class="credits">
                <div slot="content">Dynamic Esports Academy</div>
                <img
                  src="../../assets/DEA_light.png"
                  class="mx-4 transition-all inline px-1 py-0.5 mb-0.5 rounded-full bg-[rgb(var(--mdui-color-primary-light))] opacity-55 hover:opacity-100"
                  width="80"
                />
              </mdui-tooltip>

              <mdui-tooltip placement="top" class="credits">
                <div slot="content" class="select-text cursor-text">
                  <a
                    class="cursor-pointer"
                    href="https://www.hipole.com/"
                    style="
                      color: rgb(var(--mdui-color-inverse-primary));
                      text-decoration: underline;
                    "
                    >HiPole</a
                  >{{ $t('settings.hipoleTooltip') }}
                </div>
                <img
                  :src="`../../src/assets/hipole/${$t('langCode')}_${dark.isDark.value ? 'dark' : 'light'}.png`"
                  class="inline mx-4 opacity-55 hover:opacity-100 transition-all"
                  width="130"
                />
              </mdui-tooltip>

              <mdui-tooltip placement="top" class="credits">
                <div slot="content" class="select-text cursor-text">
                  {{ $t('settings.hmrTooltip') }}
                </div>
                <div
                  class="flex flex-row items-center mx-4 opacity-55 transition-all hover:opacity-100"
                >
                  <img src="../../assets/HerMess.png" width="40" />
                  <img src="../../assets/HerMess_text.png" width="90" />
                </div>
              </mdui-tooltip>

              <mdui-tooltip placement="top" class="credits">
                <div slot="content">
                  <div>{{ $t('settings.illust') }}</div>
                  <div>
                    {{ $t('settings.xhs') }}
                    <a
                      href="https://xhslink.com/m/32eQI42uSqq"
                      class="cursor-pointer"
                      style="
                        color: rgb(var(--mdui-color-inverse-primary));
                        text-decoration: underline;
                      "
                      >@灵均子美
                    </a>
                    &nbsp;| Pixiv
                    <a
                      href="https://www.pixiv.net/users/121727636"
                      class="cursor-pointer"
                      style="
                        color: rgb(var(--mdui-color-inverse-primary));
                        text-decoration: underline;
                      "
                    >
                      @霊均</a
                    >
                  </div>
                </div>
                <div
                  class="flex flex-row items-center mx-4 opacity-55 transition-all hover:opacity-100"
                >
                  <img
                    src="../../assets/asseconHime/LJZM_profile.png"
                    width="36"
                    class="rounded-full mr-2"
                  />
                  <img
                    src="../../assets/asseconHime/LJZM.png"
                    width="70"
                    :class="{ invert: dark.isDark.value }"
                  />
                </div>
              </mdui-tooltip>

              <mdui-tooltip placement="top" class="credits">
                <div slot="content">
                  <a
                    class="cursor-pointer"
                    href="https://acc-status.jonatan.net/"
                    style="
                      color: rgb(var(--mdui-color-inverse-primary));
                      text-decoration: underline;
                    "
                    >acc-status.jonatan.net</a
                  >
                </div>
                <img
                  src="../../assets/acc-status.ico"
                  class="transition-all mx-4 inline px-2 py-1.5 mb-0.5 rounded-full opacity-55 hover:opacity-100 bg-[rgb(var(--mdui-color-primary-dark))]"
                  width="40"
                />
              </mdui-tooltip>

              <mdui-tooltip placement="top" class="credits">
                <div slot="content">
                  <a
                    class="cursor-pointer"
                    href="https://lonemeow.github.io/acc-setup-diff/"
                    style="
                      color: rgb(var(--mdui-color-inverse-primary));
                      text-decoration: underline;
                    "
                    >acc-setup-diff</a
                  >
                  |
                  <a
                    href="https://github.com/lonemeow/acc-connector"
                    class="cursor-pointer"
                    style="
                      color: rgb(var(--mdui-color-inverse-primary));
                      text-decoration: underline;
                    "
                    >acc-connector</a
                  >
                </div>
                <div
                  class="flex flex-row items-center mx-4 opacity-55 transition-all hover:opacity-100"
                >
                  <img
                    src="../../assets/lonemeow.png"
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
                <p class="text-sm">
                  {{ $t('settings.thanksMsg') }}
                </p>
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
      <mdui-button slot="action" @click="resetSettings" class="font-bold">{{
        $t('general.confirm')
      }}</mdui-button>
    </mdui-dialog>

    <UpdateDialog v-model="updDialogShow" :upd-info="updInfo" />

    <FavDialog v-model="showFavDialog" />

    <mdui-dialog
      :headline="$t('general.friendshipLink')"
      :open="friendshipOpen"
      @close="friendshipOpen = false"
      close-on-esc
      close-on-overlay-click
      :description="$t('general.friendshipLinkMsg')"
    >
      <ul class="mt-3 list-disc list-inside">
        <li>
          <a href="https://www.fullpush.cn" target="_blank">FULLPUSH</a>
          - ACC 个人开服管理与数据统计工具
        </li>
        <li>
          <a href="https://docs.qq.com/doc/DZUxEdEh0YXFUSkRW" target="_blank"
            >ACC 新手指南</a
          >
          - 嗨跑群友们共同维护的 ACC 游戏新手常见 Q&A
        </li>
      </ul>
      <mdui-button
        slot="action"
        class="font-bold"
        @click="friendshipOpen = false"
        variant="tonal"
        >{{ $t('general.close') }}</mdui-button
      >
    </mdui-dialog>

    <mdui-dialog
      :headline="$t('general.contact')"
      :open="contactOpen"
      :description="$t('general.contactMsg')"
      @close="contactOpen = false"
      close-on-esc
      close-on-overlay-click
    >
      <ul class="mt-3 list-disc list-inside select-text cursor-text">
        <li>QQ: 3214442497</li>
        <li>{{ $t('general.wechat') }}: HoraceHYY</li>
        <li>
          {{ $t('general.email') }}:
          <a href="mailto:horacehuang17@gmail.com">horacehuang17@gmail.com</a>
        </li>
        <li>
          {{ $t('general.hipoleId') }}: horacehuang17
          <div class="opacity-70 mt-1">
            {{ $t('general.hipoleIdMsg') }}
          </div>
        </li>
      </ul>
      <mdui-button
        slot="action"
        class="font-bold"
        @click="contactOpen = false"
        variant="tonal"
        >{{ $t('general.close') }}</mdui-button
      >
    </mdui-dialog>
  </div>
</template>

<style lang="scss" scoped>
.msg-input::part(container) {
  border-radius: 999px;
  background: rgb(var(--mdui-color-on-secondary));
}

// 自定义 AI 提供商：未填写的输入框标红提示（不改变行高，避免展开动画抖动）
.ai-field-empty::part(container) {
  outline: 0.0625rem solid rgb(var(--mdui-color-error));
}

// 每个区块（通用 / 显示 / 偏好 / 关于）只承载一个分类，底部留白由区块自身的
// padding 决定，不需要分类再额外撑开
.settings-block .category {
  margin-bottom: 0;
  padding-bottom: 0.5rem;
}

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
      background: rgba(var(--mdui-color-secondary-container), 0.3);
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
