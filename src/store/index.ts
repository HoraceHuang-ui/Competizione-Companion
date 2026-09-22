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
      firstSetupFlag: false,
      aiModel: 'deepseek-v4-pro',
    },
    servers: {
      listView: false,
    },
    presets: {
      serverExePath: '',
    },
    // ACC 直连（ACC Connector）注入历史记录：最新在前，最多 20 条，按 hostname+port 去重
    serverHistory: [] as Array<{
      name: string
      hostname: string
      port: number
    }>,
    settings: {
      general: {
        lang: 'zh_CN',
        darkMode: '2',
        minToTray: false,
        themeColor: '#785abf',
        customBgThemeColor: '#785abf',
        bgType: 'hime',
        bgImg: '',
        bgImgPath: '',
        bgOpacity: 0.75,
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
    messages: [] as Array<{
      role: string
      content: string
      reasoning?: string
    }>,
    tokenUsage: {
      pro: { date: '', token: 0 },
      flash: { date: '', token: 0 },
    },
  }),
  actions: {
    clear() {
      // this.$state = { ...initState }
      this.$reset()
    },
    addMessage(msg: { role: string; content: string; reasoning?: string }) {
      this.messages.push(msg)
    },
    newConversation() {
      this.messages = []
    },
    // 注入（直连）一个服务器：去重后置顶，最多保留 20 条历史
    addServerHistory(item: { name: string; hostname: string; port: number }) {
      const idx = this.serverHistory.findIndex(
        s => s.hostname === item.hostname && s.port === item.port,
      )
      if (idx !== -1) {
        this.serverHistory.splice(idx, 1)
      }
      this.serverHistory.unshift({
        name: item.name,
        hostname: item.hostname,
        port: item.port,
      })
      if (this.serverHistory.length > 20) {
        this.serverHistory.length = 20
      }
    },
    removeServerHistory(hostname: string, port: number) {
      const idx = this.serverHistory.findIndex(
        s => s.hostname === hostname && s.port === port,
      )
      if (idx !== -1) {
        this.serverHistory.splice(idx, 1)
      }
    },
  },
  persist: true,
})
