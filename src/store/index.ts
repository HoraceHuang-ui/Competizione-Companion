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
    },
    servers: {
      listView: false,
    },
    settings: {
      general: {
        lang: 'zh_CN',
        darkMode: '2',
        minToTray: false,
        themeColor: '#785abf',
        bgImg: '',
      },
      status: {
        serverDownMsg: '舞萌DX启动！',
      },
      setup: {
        carDisplay: 2, // 1: 英文全写, 2: 英文缩写, 3: 中文缩写
        trackDisplay: 2, // 1: 英文全写, 2: 英文缩写, 3: 中文缩写
        setupLabelEn: false,
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
