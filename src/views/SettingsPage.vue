<script setup lang="ts">
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import { useStore } from '@/store'
import ChipSelect from '@/components/ChipSelect.vue'
import '@mdui/icons/light-mode--rounded.js'
import '@mdui/icons/brightness-auto--rounded.js'
import '@mdui/icons/dark-mode--outlined.js'
import { computed, ref } from 'vue'
import { getTheme, setTheme } from 'mdui'
import { themeMap } from '@/utils/enums'
import {
  availableLangCodes,
  availableLangNames,
  Lang,
  switchLang,
  translate,
  translateWithLocale,
  langMap,
} from '@/i18n'

const store = useStore()

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

const langDialogOpen = ref(false)
const resetDialogOpen = ref(false)

const resetSettings = () => {
  resetDialogOpen.value = false
  store.clear()
}

const darkModeChange = (event: Event) => {
  const mode = event.target.value
  store.settings.general.darkMode = mode
  setTheme(themeMap[mode])
}

const checkUpdate = () => {
  console.log('upd')
}

const openLink = (url: string) => {
  window.electron.openExtLink(url)
}

const changeLang = () => {
  switchLang(lang.value)
  langDialogOpen.value = false
  if (lang.value === 'en_US') {
    store.settings.setup.carDisplay = 2
    store.settings.setup.trackDisplay = 2
  }
  window.win.relaunch()
}

const langChangeCancel = () => {
  langDialogOpen.value = false
  lang.value = localStorage.lang as Lang
}

const onLangSelect = (item: Lang) => {
  if (item !== localStorage.lang) {
    console.log(lang.value)
    langDialogOpen.value = true
  }
}
</script>

<template>
  <div
    class="h-full flex flex-col justify-center items-center relative"
    style="width: calc(100% - 1rem)"
  >
    <mdui-card
      variant="outlined"
      class="size-full border border-[rgb(var(--mdui-color-inverse-primary-dark))] bg-[rgb(var(--mdui-color-surface-container-lowest))] mx-4 mb-4 flex"
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
                    0.0.1 Alpha
                  </mdui-chip>
                </div>
                <div class="flex flex-row justify-end items-center">
                  <mdui-button-icon
                    class="mr-2"
                    :class="{
                      'github-icon':
                        getTheme() === 'dark' || getTheme() === 'auto',
                    }"
                    @click="
                      openLink(
                        'https://github.com/HoraceHuang-ui/Competizione-Companion',
                      )
                    "
                  >
                    <img src="@/assets/github-mark.png" class="p-1" />
                  </mdui-button-icon>
                  <mdui-button variant="tonal" @click="checkUpdate">
                    {{ $t('settings.checkUpdate') }}
                  </mdui-button>
                </div>
              </div>
            </div>
            <div class="item larger">
              <div class="item-in larger">
                <span>{{ $t('settings.credits') }}</span>
                <div class="flex flex-col items-end">
                  <div class="flex flex-row items-center">
                    <div class="mr-4">Dynamic Esports Academy</div>
                    <img
                      src="@/assets/DEA_light.png"
                      class="inline px-1 py-0.5 mb-0.5 rounded-full bg-[rgb(var(--mdui-color-primary-light))]"
                      width="70"
                    />
                  </div>
                  <div class="flex flex-row items-center mt-2">
                    <div class="mr-4">acc-status.jonatan.net</div>
                    <img
                      src="https://acc-status.jonatan.net/favicon.ico"
                      class="inline px-2 py-0.5 mb-0.5 rounded-full bg-[rgb(var(--mdui-color-primary-light))]"
                      width="44"
                    />
                  </div>
                  <div class="mt-2">lonemeow/acc-setup-diff</div>
                </div>
              </div>
            </div>
            <div class="item pointer-events-none">
              <div class="item-in">
                <div
                  class="title w-full text-center text-[rgb(var(--mdui-color-outline))]"
                >
                  Made with ❤️ by horacehuang17
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
      :open="langDialogOpen"
      :headline="$t('settings.languageChangeTitle')"
    >
      {{ langMsg }}
      <mdui-button slot="action" variant="text" @click="langChangeCancel">{{
        $t('general.cancel')
      }}</mdui-button>
      <mdui-button slot="action" @click="changeLang">{{
        $t('general.confirm')
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

@media (prefers-color-scheme: dark) {
  .github-icon {
    filter: invert(1);
  }
}
</style>
