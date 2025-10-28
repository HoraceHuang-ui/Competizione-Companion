import { defineStore } from 'pinia'

export const useStore = defineStore('userStore', {
  state: () => ({
    general: {
      targetVersion: undefined as string | undefined,
      windowSize: {
        width: 1200,
        height: 700,
        isMax: false,
      },
      favTracks: [] as string[],
      favCars: {
        GT3: [] as string[],
        GT4: [] as string[],
        GTC: [] as string[],
        TCX: [] as string[],
      },
      msgId: 0,
    },
    servers: {
      listView: false,
    },
    presets: {
      serverExePath: '',
    },
    settings: {
      general: {
        lang: 'zh_CN',
        darkMode: '2',
        minToTray: false,
        themeColor: '#785abf',
        bgImg: '',
        bgImgPath: '',
        bgOpacity: 0.85,
      },
      status: {
        serverDownMsg: 'Time for maimai DX!',
      },
      setup: {
        carDisplay: 2, // 1: 英文全写, 2: 英文缩写, 3: 中文缩写
        trackDisplay: 2, // 1: 英文全写, 2: 英文缩写, 3: 中文缩写
        setupLabelEn: false,
        alwaysViewOnly: false,
      },
    },
  }),
  actions: {
    clear() {
      // this.$state = { ...initState }
      this.$reset()
    },
  },
  persist: true,
})
