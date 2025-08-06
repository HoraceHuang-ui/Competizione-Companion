<script setup lang="ts">
import ScrollWrapper from '@/components/ScrollWrapper.vue'
import { useStore } from '@/store'
import ChipSelect from '@/components/ChipSelect.vue'
import '@mdui/icons/light-mode--rounded.js'
import '@mdui/icons/brightness-auto--rounded.js'
import '@mdui/icons/dark-mode--outlined.js'
import { ref } from 'vue'
import { getTheme, setTheme } from 'mdui'
import { themeMap } from '@/utils/enums'

const store = useStore()
const langs = ['en_US', 'zh_CN']

const langMap = {
  en_US: 'English',
  zh_CN: '简体中文',
}
const dispMap = ['英文全写', '英文简写', '中文简写']

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
            <div class="title header">通用</div>
            <div class="item">
              <div class="item-in">
                <div>语言（先占个位，暂不支持）</div>
                <ChipSelect
                  v-model="store.settings.general.lang"
                  :items="langs"
                  chip-class="rounded-full"
                  :chip-label="item => langMap[item]"
                  :item-label="item => langMap[item]"
                  @select="item => (store.settings.general.lang = item)"
                >
                </ChipSelect>
              </div>
            </div>
            <div class="item">
              <div class="item-in">
                <div>亮暗色模式</div>
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
              >重置所有设置</mdui-button
            >
          </div>
          <div class="category">
            <div class="title header">Lobby服务器状态页</div>
            <div class="item">
              <div class="item-in">
                <div>炸服时提示</div>
                <mdui-text-field
                  class="w-60 bg-[rgb(var(--mdui-color-on-secondary))] cursor-text"
                  placeholder="请输入文字"
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
            <div class="title header">调校管理页</div>
            <div class="item">
              <div class="item-in">
                <div>车型显示</div>
                <ChipSelect
                  v-model="store.settings.setup.carDisplay"
                  chip-class="rounded-full"
                  :items="[1, 2, 3]"
                  :item-label="item => dispMap[item - 1]"
                  :chip-label="item => dispMap[item - 1]"
                >
                </ChipSelect>
              </div>
            </div>
            <div class="item">
              <div class="item-in">
                <div>赛道显示</div>
                <ChipSelect
                  v-model="store.settings.setup.trackDisplay"
                  chip-class="rounded-full"
                  :items="[1, 2, 3]"
                  :item-label="item => dispMap[item - 1]"
                  :chip-label="item => dispMap[item - 1]"
                >
                </ChipSelect>
              </div>
            </div>
            <div class="item">
              <div class="item-in">
                <div>参数显示英文</div>
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
            <div class="title header">关于</div>
            <div class="item">
              <div class="item-in">
                <div class="flex flex-row items-center">
                  <div>版本</div>
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
                    检查更新
                  </mdui-button>
                </div>
              </div>
            </div>
            <div class="item larger">
              <div class="item-in larger">
                <span>鸣谢</span>
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
      headline="确认重置所有设置？"
    >
      <mdui-button slot="action" variant="text" @click="resetDialogOpen = false"
        >取消</mdui-button
      >
      <mdui-button slot="action" @click="resetSettings">确认</mdui-button>
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
